"""Espace parent (M8) : accès uniquement après consentement, selon les portées partagées par l'élève."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import CounselorNote, EvidenceItem, GuardianLink, Milestone, User, get_db
from ..engine.texts import fmt
from ..security import active_consent, audit, can_access_student, decrypt, ensure_access, require_roles
from ..services import latest_run, latest_traits
from .auth import activate_guardian

router = APIRouter(prefix="/parent", tags=["parent"])
Parent = require_roles("parent")

TALK_GUIDE = {
    "questions": [
        "Qu'est-ce qui t'a surpris·e dans tes résultats ?",
        "Parmi ces pistes, laquelle aimerais-tu découvrir de plus près ? Pourquoi ?",
        "Qu'est-ce qui compte le plus pour toi dans un futur métier ?",
        "Quelle petite action pourrais-tu faire ce mois-ci pour en savoir plus ?",
        "Comment puis-je t'aider concrètement (visite, rencontre, budget) ?",
    ],
    "avoid": [
        "Comparer avec un frère, une sœur ou un cousin.",
        "Présenter une voie comme « la seule bonne » ou une autre comme « un échec ».",
        "Décider à la place de votre enfant : la plateforme éclaire, la décision se construit ensemble.",
    ],
    "short_paths": "Les voies courtes (BTS, DUT/EST, OFPPT) ne sont pas des impasses : elles offrent des passerelles "
                   "vers une licence professionnelle puis un cycle ingénieur sur titre.",
}


class AcceptIn(BaseModel):
    invite_code: str


@router.post("/accept")
def accept(body: AcceptIn, user: User = Depends(Parent), db: Session = Depends(get_db)):
    link = db.scalars(select(GuardianLink).where(GuardianLink.invite_code == body.invite_code, GuardianLink.status == "pending")).first()
    if link is None:
        raise HTTPException(404, "Code d'invitation invalide ou déjà utilisé")
    activate_guardian(db, link, user)
    db.commit()
    return {"ok": True}


@router.get("/children")
def children(user: User = Depends(Parent), db: Session = Depends(get_db)):
    links = db.scalars(select(GuardianLink).where(GuardianLink.guardian_id == user.id, GuardianLink.status == "active")).all()
    out = []
    for l in links:
        child = db.get(User, l.student_id)
        share = active_consent(db, l.student_id, "share_parent")
        out.append({"student_id": child.id, "display_name": child.display_name, "shared_scopes": share.scopes if share else []})
    return out


@router.get("/children/{sid}/summary")
def summary(sid: int, user: User = Depends(Parent), db: Session = Depends(get_db)):
    """Synthèse une page (écran 9.4) — chaque bloc n'apparaît que si sa portée est partagée."""
    ensure_access(db, user, sid, "profile")
    child = db.get(User, sid)
    out: dict = {"student_id": sid, "display_name": child.display_name, "talk_guide": TALK_GUIDE, "blocks": []}
    traits = latest_traits(db, sid) if can_access_student(db, user, sid, "assessment") else None
    if traits:
        out["strengths"] = {"holland_code": traits["holland_code"], "riasec": traits["riasec"]}
    if can_access_student(db, user, sid, "pistes"):
        run = latest_run(db, sid)
        if run:
            out["pistes"] = [{
                "program_id": i["program_id"], "name": i["name"], "short": i["short"], "category": i["category"],
                "category_label": i["category_label"], "fit_score": i["fit_score"], "duration_years": i["duration_years"],
                "cost": i["cost"], "occupations": [o["name"] for o in i["occupations"]], "prerequisites": i["prerequisites"],
                "bridges": i.get("bridges_details", []),
                "vigilance": [f["message"] for f in i["flags"]] or ([f"Formation sélective : probabilité d'admission estimée entre "
                                                                      f"{fmt(round(i['admission_probability']['low'] * 100))} et "
                                                                      f"{fmt(round(i['admission_probability']['high'] * 100))} %. Prévoir aussi une voie sécurisée."]
                                                                    if i["category"] == "A" else []),
            } for i in run.output["items"][:3]]
            out["bilan"] = {"run_id": run.id, "created_at": run.created_at.isoformat(), "referential_version": run.referential_version}
            out["disclaimer"] = run.output["disclaimer"]
    if can_access_student(db, user, sid, "roadmap"):
        out["milestones"] = [{"label": m.label, "status": m.status} for m in db.scalars(select(Milestone).where(Milestone.student_id == sid)).all()]
    if can_access_student(db, user, sid, "evidence"):
        out["evidence"] = [{"title": e.title, "type": e.type, "verified": e.verified}
                           for e in db.scalars(select(EvidenceItem).where(EvidenceItem.student_id == sid)).all()]
    notes = db.scalars(select(CounselorNote).where(CounselorNote.student_id == sid, CounselorNote.visibility == "parent")).all()
    out["counselor_notes"] = [{"text": decrypt(n.text_enc), "created_at": n.created_at.isoformat()} for n in notes]
    audit(db, user, "parent_viewed_summary", target=f"student:{sid}")
    db.commit()
    return out
