"""Espace élève : onboarding, consentements, évaluation, recommandations, simulateur, vœux, preuves, feuille de route."""
from __future__ import annotations

import datetime as dt
import secrets
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import (AssessmentSession, Consent, CounselorNote, EvidenceItem, GradeRecord, GuardianLink, Milestone,
                  RecommendationRun, StudentProfile, TraitEstimate, User, Wishlist, get_db, utcnow)
from ..engine import config as cfg
from ..engine.recommend import balance_check
from ..psychometrics.instruments import INSTRUMENT_VERSION, SUBJECT_LABELS, form_for
from ..psychometrics.scoring import score_assessment
from ..security import (CONSENT_TEXT_VERSION, DEFAULT_COUNSELOR_SCOPES, SHARE_SCOPES, active_consent, audit, decrypt,
                        encrypt, require_roles)
from ..services import (active_referential, compute_recommendation, latest_run, latest_traits, refresh_alerts, replay,
                        simulate)
from ..settings import settings

router = APIRouter(prefix="/students/me", tags=["élève"])
Student = require_roles("student")

EVIDENCE_TYPES = list(cfg.EVIDENCE_WEIGHTS)


# -- Profil / onboarding (M1) -----------------------------------------------------------
class ProfileIn(BaseModel):
    system: Literal["MA", "FR"]
    level: str
    stream: str | None = None
    fr_specialties: list[str] = []
    language: Literal["fr", "ar", "en"] = "fr"
    city: str | None = Field(default=None, max_length=100)
    budget_annual_mad: float | None = Field(default=None, ge=0)
    mobility: Literal["local", "national", "international"] = "national"
    excluded_domains: list[str] = []
    certainty: int | None = Field(default=None, ge=0, le=10)

    @field_validator("level")
    @classmethod
    def _level(cls, v: str) -> str:
        if v not in cfg.LEVELS:
            raise ValueError("niveau inconnu")
        return v


def profile_out(p: StudentProfile) -> dict[str, Any]:
    c = p.constraints or {}
    return {"system": p.system, "level": p.level, "stream": p.stream, "fr_specialties": p.fr_specialties or [], "language": p.language,
            "city": p.city, "budget_annual_mad": c.get("budget_annual_mad"), "mobility": c.get("mobility", "national"),
            "excluded_domains": c.get("excluded_domains", []), "certainty_history": p.certainty_history or [], "onboarded": p.onboarded}


@router.get("/profile")
def get_profile(user: User = Depends(Student), db: Session = Depends(get_db)):
    p = db.get(StudentProfile, user.id)
    return profile_out(p) | {"display_name": user.display_name}


@router.put("/profile")
def put_profile(body: ProfileIn, user: User = Depends(Student), db: Session = Depends(get_db)):
    if cfg.LEVELS[body.level]["system"] != body.system:
        raise HTTPException(422, "Le niveau ne correspond pas au système scolaire choisi")
    if body.level in cfg.STREAMS and body.stream not in cfg.STREAMS[body.level]:
        raise HTTPException(422, "Filière obligatoire pour ce niveau")
    if any(s not in cfg.FR_SPECIALTIES for s in body.fr_specialties):
        raise HTTPException(422, "Spécialité inconnue")
    p = db.get(StudentProfile, user.id)
    p.system, p.level, p.language, p.city = body.system, body.level, body.language, body.city
    p.stream = body.stream if body.level in cfg.STREAMS else None
    p.fr_specialties = body.fr_specialties if body.system == "FR" else []
    p.constraints = {"budget_annual_mad": body.budget_annual_mad, "mobility": body.mobility, "excluded_domains": body.excluded_domains}
    if body.certainty is not None:
        hist = list(p.certainty_history or [])
        if not hist or hist[-1]["value"] != body.certainty:
            hist.append({"at": utcnow().isoformat(), "value": body.certainty})
        p.certainty_history = hist
    p.onboarded = True
    refresh_alerts(db, user)
    audit(db, user, "profile_updated")
    db.commit()
    return profile_out(p)


# -- Consentements ---------------------------------------------------------------------
class ConsentIn(BaseModel):
    kind: Literal["student_terms", "share_parent", "share_counselor"]
    scopes: list[str] = []


@router.get("/consents")
def get_consents(user: User = Depends(Student), db: Session = Depends(get_db)):
    out = {}
    for kind in ("student_terms", "parent_legal", "share_parent", "share_counselor"):
        c = active_consent(db, user.id, kind)
        out[kind] = {"granted": c is not None, "scopes": c.scopes if c else [], "granted_at": c.granted_at.isoformat() if c else None,
                     "text_version": c.text_version if c else None}
    out["parental_consent_required"] = settings.parental_consent_required
    links = db.scalars(select(GuardianLink).where(GuardianLink.student_id == user.id)).all()
    out["guardians"] = [{"status": l.status, "contact": l.invite_contact,
                         "invite_code": l.invite_code if (settings.expose_dev_codes and l.status == "pending") else None} for l in links]
    out["default_counselor_scopes"] = DEFAULT_COUNSELOR_SCOPES
    out["available_scopes"] = SHARE_SCOPES
    return out


@router.post("/consents")
def grant_consent(body: ConsentIn, user: User = Depends(Student), db: Session = Depends(get_db)):
    if any(s not in SHARE_SCOPES for s in body.scopes):
        raise HTTPException(422, "Portée de partage inconnue")
    prev = active_consent(db, user.id, body.kind)
    if prev:
        prev.revoked_at = utcnow()
    scopes = body.scopes if body.kind != "student_terms" else ["processing"]
    db.add(Consent(student_id=user.id, kind=body.kind, scopes=scopes, text_version=CONSENT_TEXT_VERSION, granted_by=user.id))
    audit(db, user, "consent_granted", target=body.kind, detail={"scopes": scopes})
    db.commit()
    return {"ok": True}


@router.delete("/consents/{kind}")
def revoke_consent(kind: Literal["share_parent", "share_counselor", "student_terms"], user: User = Depends(Student), db: Session = Depends(get_db)):
    c = active_consent(db, user.id, kind)
    if c:
        c.revoked_at = utcnow()  # effet immédiat : chaque requête relit le consentement
    audit(db, user, "consent_revoked", target=kind)
    db.commit()
    return {"ok": True}


class InviteIn(BaseModel):
    contact: str = Field(min_length=3, max_length=200)  # e-mail ou téléphone


@router.post("/parent-invite")
def invite_parent(body: InviteIn, user: User = Depends(Student), db: Session = Depends(get_db)):
    code = secrets.token_urlsafe(9)
    db.add(GuardianLink(student_id=user.id, invite_code=code, invite_contact=body.contact, status="pending"))
    audit(db, user, "parent_invited")
    db.commit()
    # En production : envoi par SMS / e-mail via un fournisseur ; le code n'est jamais renvoyé à l'élève.
    return {"sent_to": body.contact, "invite_code": code if settings.expose_dev_codes else None}


# -- Notes -------------------------------------------------------------------------------
class GradeIn(BaseModel):
    subject: str
    period: str = Field(max_length=20)
    value: float = Field(ge=0, le=20)


@router.get("/grades")
def get_grades(user: User = Depends(Student), db: Session = Depends(get_db)):
    rows = db.scalars(select(GradeRecord).where(GradeRecord.student_id == user.id)).all()
    return [{"subject": r.subject, "period": r.period, "value": r.value, "verified": r.verified, "source": r.source} for r in rows]


@router.put("/grades")
def put_grades(body: list[GradeIn], user: User = Depends(Student), db: Session = Depends(get_db)):
    if any(g.subject not in SUBJECT_LABELS for g in body):
        raise HTTPException(422, "Matière inconnue")
    existing = db.scalars(select(GradeRecord).where(GradeRecord.student_id == user.id)).all()
    official = {(r.subject, r.period) for r in existing if r.source != "eleve"}
    for r in existing:
        if r.source == "eleve":
            db.delete(r)
    # Une note importée / vérifiée par l'établissement prime toujours sur la saisie de l'élève.
    kept = [g for g in body if (g.subject, g.period) not in official]
    for g in kept:
        db.add(GradeRecord(student_id=user.id, subject=g.subject, period=g.period, value=g.value, source="eleve", verified=False))
    audit(db, user, "grades_updated", detail={"count": len(kept)})
    db.commit()
    return {"ok": True, "count": len(kept), "ignored_official": len(body) - len(kept)}


# -- Évaluation (M2) ------------------------------------------------------------------------
@router.get("/assessment/form")
def assessment_form(user: User = Depends(Student), db: Session = Depends(get_db)):
    p = db.get(StudentProfile, user.id)
    if not p.level:
        raise HTTPException(409, "Termine d'abord l'onboarding")
    return form_for(p.level)


def _draft(db: Session, user: User) -> AssessmentSession | None:
    return db.scalars(select(AssessmentSession).where(AssessmentSession.student_id == user.id, AssessmentSession.status == "draft")
                      .order_by(AssessmentSession.started_at.desc())).first()


@router.get("/assessment/draft")
def get_draft(user: User = Depends(Student), db: Session = Depends(get_db)):
    d = _draft(db, user)
    return {"responses": decrypt(d.responses_enc) if d else {}}


@router.put("/assessment/draft")
def save_draft(responses: dict[str, Any], user: User = Depends(Student), db: Session = Depends(get_db)):
    """Sauvegarde partielle : le parcours est découpable en 3 sessions."""
    d = _draft(db, user)
    if d is None:
        d = AssessmentSession(student_id=user.id, instrument_version=INSTRUMENT_VERSION, responses_enc=encrypt(responses))
        db.add(d)
    else:
        d.responses_enc = encrypt(responses)
    db.commit()
    return {"ok": True}


@router.post("/assessment/submit")
def submit_assessment(responses: dict[str, Any], user: User = Depends(Student), db: Session = Depends(get_db)):
    if active_consent(db, user.id, "student_terms") is None:
        raise HTTPException(403, "Consentement requis avant l'évaluation")
    d = _draft(db, user) or AssessmentSession(student_id=user.id, instrument_version=INSTRUMENT_VERSION, responses_enc="")
    d.responses_enc = encrypt(responses)
    d.status, d.completed_at = "completed", utcnow()
    db.add(d)
    db.flush()
    traits = score_assessment(responses)
    db.add(TraitEstimate(session_id=d.id, student_id=user.id, traits_enc=encrypt(traits)))
    audit(db, user, "assessment_completed")
    db.commit()
    return {"traits": traits}


@router.get("/traits")
def get_traits(user: User = Depends(Student), db: Session = Depends(get_db)):
    return latest_traits(db, user.id) or {}


# -- Recommandations (M3) -------------------------------------------------------------------
def _check_processing_consents(db: Session, user: User) -> None:
    if active_consent(db, user.id, "student_terms") is None:
        raise HTTPException(403, "Consentement de l'élève requis")
    if settings.parental_consent_required and active_consent(db, user.id, "parent_legal") is None:
        raise HTTPException(403, "En attente de la validation de ton parent ou représentant légal")


def run_out(run: RecommendationRun) -> dict[str, Any]:
    return {"run_id": run.id, "created_at": run.created_at.isoformat(), **run.output}


@router.post("/recommendations")
def create_recommendation(user: User = Depends(Student), db: Session = Depends(get_db)):
    _check_processing_consents(db, user)
    try:
        run = compute_recommendation(db, user)
    except ValueError as exc:
        raise HTTPException(409, str(exc))
    audit(db, user, "recommendation_computed", target=f"run:{run.id}")
    db.commit()
    return run_out(run)


@router.get("/recommendations/latest")
def get_latest(user: User = Depends(Student), db: Session = Depends(get_db)):
    run = latest_run(db, user.id)
    if run is None:
        raise HTTPException(404, "Aucun bilan pour l'instant")
    return run_out(run)


@router.get("/recommendations")
def history(user: User = Depends(Student), db: Session = Depends(get_db)):
    runs = db.scalars(select(RecommendationRun).where(RecommendationRun.student_id == user.id).order_by(RecommendationRun.created_at.desc())).all()
    return [{"run_id": r.id, "created_at": r.created_at.isoformat(), "referential_version": r.referential_version,
             "model_version": r.model_version, "items": [{"program_id": i["program_id"], "short": i["short"], "category": i["category"],
                                                         "fit_score": i["fit_score"]} for i in r.output["items"]]} for r in runs]


@router.get("/recommendations/{run_id}/replay")
def replay_run(run_id: int, user: User = Depends(Student), db: Session = Depends(get_db)):
    run = db.get(RecommendationRun, run_id)
    if run is None or run.student_id != user.id:
        raise HTTPException(404, "Bilan introuvable")
    return replay(db, run)


class SimulateIn(BaseModel):
    grades: dict[str, float] = {}
    budget_annual_mad: float | None = Field(default=None, ge=0)
    mobility: Literal["local", "national", "international"] | None = None

    @field_validator("grades")
    @classmethod
    def _grades(cls, v: dict[str, float]) -> dict[str, float]:
        for s, g in v.items():
            if s not in SUBJECT_LABELS or not 0 <= g <= 20:
                raise ValueError(f"note invalide : {s}")
        return v


@router.post("/simulate")
def simulate_route(body: SimulateIn, user: User = Depends(Student), db: Session = Depends(get_db)):
    _check_processing_consents(db, user)
    base = latest_run(db, user.id)
    try:
        return simulate(db, user, body.grades, body.budget_annual_mad, body.mobility, base.output if base else None)
    except ValueError as exc:
        raise HTTPException(409, str(exc))


# -- Constructeur de vœux ----------------------------------------------------------------------
class WishlistIn(BaseModel):
    A: list[str] = []
    B: list[str] = []
    C: list[str] = []


@router.get("/wishlist")
def get_wishlist(user: User = Depends(Student), db: Session = Depends(get_db)):
    wl = db.get(Wishlist, user.id)
    cols = wl.columns if wl else {"A": [], "B": [], "C": []}
    return {"columns": cols, "warnings": balance_check([c for c, ids in cols.items() if ids])}


@router.put("/wishlist")
def put_wishlist(body: WishlistIn, user: User = Depends(Student), db: Session = Depends(get_db)):
    ref = active_referential(db)
    cols = body.model_dump()
    for ids in cols.values():
        for pid in ids:
            if pid not in ref.programs:
                raise HTTPException(422, f"Formation inconnue : {pid}")
    wl = db.get(Wishlist, user.id) or Wishlist(student_id=user.id)
    wl.columns, wl.updated_at = cols, utcnow()
    db.add(wl)
    db.flush()
    refresh_alerts(db, user)
    db.commit()
    return {"columns": cols, "warnings": balance_check([c for c, ids in cols.items() if ids])}


# -- Carnet de preuves et feuille de route (M5) ---------------------------------------------------
class EvidenceIn(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    type: str
    domains: list[str] = []
    description: str | None = Field(default=None, max_length=2000)
    url: str | None = Field(default=None, max_length=500)

    @field_validator("type")
    @classmethod
    def _type(cls, v: str) -> str:
        if v not in EVIDENCE_TYPES:
            raise ValueError("type de preuve inconnu")
        return v


def evidence_out(e: EvidenceItem) -> dict[str, Any]:
    return {"id": e.id, "title": e.title, "type": e.type, "domains": e.domains, "description": e.description, "url": e.url,
            "verified": e.verified, "created_at": e.created_at.isoformat()}


@router.get("/evidence")
def list_evidence(user: User = Depends(Student), db: Session = Depends(get_db)):
    return [evidence_out(e) for e in db.scalars(select(EvidenceItem).where(EvidenceItem.student_id == user.id)
                                                .order_by(EvidenceItem.created_at.desc())).all()]


@router.post("/evidence")
def add_evidence(body: EvidenceIn, user: User = Depends(Student), db: Session = Depends(get_db)):
    e = EvidenceItem(student_id=user.id, **body.model_dump())
    db.add(e)
    db.flush()
    refresh_alerts(db, user)
    audit(db, user, "evidence_added", target=f"evidence:{e.id}")
    db.commit()
    return evidence_out(e)


@router.delete("/evidence/{eid}")
def delete_evidence(eid: int, user: User = Depends(Student), db: Session = Depends(get_db)):
    e = db.get(EvidenceItem, eid)
    if e is None or e.student_id != user.id:
        raise HTTPException(404, "Preuve introuvable")
    db.delete(e)
    db.commit()
    return {"ok": True}


class MilestoneIn(BaseModel):
    label: str = Field(min_length=2, max_length=300)
    program_id: str | None = None
    due_date: dt.date | None = None
    status: Literal["todo", "doing", "done"] = "todo"


def milestone_out(m: Milestone) -> dict[str, Any]:
    return {"id": m.id, "label": m.label, "program_id": m.program_id, "due_date": m.due_date.isoformat() if m.due_date else None,
            "status": m.status}


@router.get("/milestones")
def list_milestones(user: User = Depends(Student), db: Session = Depends(get_db)):
    return [milestone_out(m) for m in db.scalars(select(Milestone).where(Milestone.student_id == user.id).order_by(Milestone.id)).all()]


@router.post("/milestones")
def add_milestone(body: MilestoneIn, user: User = Depends(Student), db: Session = Depends(get_db)):
    m = Milestone(student_id=user.id, **body.model_dump())
    db.add(m)
    db.commit()
    return milestone_out(m)


@router.patch("/milestones/{mid}")
def update_milestone(mid: int, body: MilestoneIn, user: User = Depends(Student), db: Session = Depends(get_db)):
    m = db.get(Milestone, mid)
    if m is None or m.student_id != user.id:
        raise HTTPException(404, "Jalon introuvable")
    for k, v in body.model_dump().items():
        setattr(m, k, v)
    db.commit()
    return milestone_out(m)


@router.get("/notes")
def my_notes(user: User = Depends(Student), db: Session = Depends(get_db)):
    """Notes d'entretien que le conseiller a rendues visibles à l'élève."""
    notes = db.scalars(select(CounselorNote).where(CounselorNote.student_id == user.id, CounselorNote.visibility.in_(["student", "parent"]))).all()
    return [{"id": n.id, "text": decrypt(n.text_enc), "created_at": n.created_at.isoformat()} for n in notes]
