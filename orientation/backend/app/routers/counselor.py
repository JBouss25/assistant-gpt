"""Espace conseiller et administrateur d'établissement (M9)."""
from __future__ import annotations

import csv
import io
import secrets
from collections import Counter, defaultdict
from typing import Any, Literal

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import (Alert, AuditLog, ClassGroup, CounselorNote, EvidenceItem, Milestone, RecommendationRun, StudentProfile, User,
                  get_db)
from ..engine import config as cfg
from ..engine.texts import DOMAIN_LABELS
from ..security import (DEFAULT_COUNSELOR_SCOPES, audit, can_access_student, decrypt, encrypt, ensure_access, hash_password,
                        require_roles)
from ..services import assessment_completed, grades_by_subject, latest_run, latest_traits, refresh_alerts
from ..settings import settings
from .auth import new_pseudo

router = APIRouter(tags=["conseiller"])
Staff = require_roles("counselor", "school_admin")
Admin = require_roles("school_admin")


def _students(db: Session, establishment_id: int, level: str = "", class_id: int | None = None, gender: str = "") -> list[tuple[User, StudentProfile, ClassGroup | None]]:
    q = (select(User, StudentProfile, ClassGroup).join(StudentProfile, StudentProfile.user_id == User.id)
         .outerjoin(ClassGroup, ClassGroup.id == StudentProfile.class_group_id)
         .where(User.role == "student", User.establishment_id == establishment_id))
    if level:
        q = q.where(StudentProfile.level == level)
    if class_id:
        q = q.where(StudentProfile.class_group_id == class_id)
    if gender:
        q = q.where(StudentProfile.gender == gender)
    return list(db.execute(q).all())


@router.get("/counselor/cohort")
def cohort(level: str = "", class_id: int | None = None, gender: str = "", user: User = Depends(Staff), db: Session = Depends(get_db)):
    rows = _students(db, user.establishment_id, level, class_id, gender)
    students = []
    heat: dict[str, Counter] = defaultdict(Counter)
    sectors: Counter = Counter()
    first_c, last_c = [], []
    completed = 0
    for u, prof, cg in rows:
        done = assessment_completed(db, u.id)
        completed += done
        run = latest_run(db, u.id) if can_access_student(db, user, u.id, "pistes") else None
        top = run.output["items"][:3] if run else []
        if top:
            heat[cg.name if cg else "Sans classe"][top[0]["sector"]] += 1
            sectors[top[0]["sector"]] += 1
        hist = prof.certainty_history or []
        if hist:
            first_c.append(hist[0]["value"])
            last_c.append(hist[-1]["value"])
        n_alerts = len(db.scalars(select(Alert).where(Alert.student_id == u.id, Alert.status == "open")).all())
        students.append({
            "student_id": u.id, "display_name": u.display_name, "class": cg.name if cg else None, "level": prof.level,
            "completed": done, "certainty": hist[-1]["value"] if hist else None, "open_alerts": n_alerts,
            "pistes_shared": can_access_student(db, user, u.id, "pistes"),
            "top": [{"short": i["short"], "category": i["category"]} for i in top],
        })
    n = len(rows)
    open_alerts = db.scalars(select(Alert).where(Alert.establishment_id == user.establishment_id, Alert.status == "open")).all()
    return {
        "kpis": {"students": n, "completion_rate": round(completed / n, 2) if n else 0.0,
                 "undecided": sum(1 for s in students if s["certainty"] is not None and s["certainty"] <= 3),
                 "open_alerts": len(open_alerts),
                 "certainty_first_avg": round(sum(first_c) / len(first_c), 1) if first_c else None,
                 "certainty_last_avg": round(sum(last_c) / len(last_c), 1) if last_c else None},
        "sector_distribution": [{"sector": s, "label": DOMAIN_LABELS.get(s, s), "count": c} for s, c in sectors.most_common()],
        "heatmap": {"rows": sorted(heat), "columns": sorted(sectors), "values": {r: dict(c) for r, c in heat.items()}},
        "students": students,
    }


@router.get("/counselor/classes")
def classes(user: User = Depends(Staff), db: Session = Depends(get_db)):
    return [{"id": c.id, "name": c.name, "level": c.level}
            for c in db.scalars(select(ClassGroup).where(ClassGroup.establishment_id == user.establishment_id)).all()]


@router.get("/counselor/alerts")
def alerts(status: str = "open", user: User = Depends(Staff), db: Session = Depends(get_db)):
    q = select(Alert).where(Alert.establishment_id == user.establishment_id)
    if status:
        q = q.where(Alert.status == status)
    out = []
    for a in db.scalars(q.order_by(Alert.priority, Alert.created_at.desc())).all():
        s = db.get(User, a.student_id)
        out.append({"id": a.id, "student_id": a.student_id, "display_name": s.display_name, "type": a.type, "priority": a.priority,
                    "message": a.message, "data": a.data, "suggested_action": a.suggested_action, "status": a.status,
                    "created_at": a.created_at.isoformat()})
    return out


class AlertPatch(BaseModel):
    status: Literal["open", "in_progress", "closed"]


@router.patch("/counselor/alerts/{aid}")
def patch_alert(aid: int, body: AlertPatch, user: User = Depends(Staff), db: Session = Depends(get_db)):
    a = db.get(Alert, aid)
    if a is None or a.establishment_id != user.establishment_id:
        raise HTTPException(404, "Alerte introuvable")
    a.status = body.status
    audit(db, user, "alert_status", target=f"alert:{aid}", detail={"status": body.status})
    db.commit()
    return {"ok": True}


@router.get("/counselor/students/{sid}")
def student_file(sid: int, user: User = Depends(Staff), db: Session = Depends(get_db)):
    """Fiche élève (écran 9.5 §3) — exportable pour le conseil de classe."""
    ensure_access(db, user, sid, "cohort")
    s = db.get(User, sid)
    prof = db.get(StudentProfile, sid)
    cg = db.get(ClassGroup, prof.class_group_id) if prof.class_group_id else None
    out: dict[str, Any] = {"student_id": sid, "display_name": s.display_name, "class": cg.name if cg else None, "level": prof.level,
                           "stream": prof.stream, "fr_specialties": prof.fr_specialties, "certainty_history": prof.certainty_history,
                           "shared": {sc: can_access_student(db, user, sid, sc) for sc in DEFAULT_COUNSELOR_SCOPES + ["assessment"]}}
    if out["shared"]["assessment"]:
        out["traits"] = latest_traits(db, sid)
    if out["shared"]["grades"]:
        out["grades"] = grades_by_subject(db, sid)
    if out["shared"]["pistes"]:
        runs = db.scalars(select(RecommendationRun).where(RecommendationRun.student_id == sid).order_by(RecommendationRun.created_at.desc())).all()
        out["runs"] = [{"run_id": r.id, "created_at": r.created_at.isoformat(), "referential_version": r.referential_version,
                        "items": [{"short": i["short"], "category": i["category"], "fit_score": i["fit_score"]} for i in r.output["items"]]}
                       for r in runs]
        out["latest"] = runs[0].output if runs else None
    if out["shared"]["evidence"]:
        out["evidence"] = [{"id": e.id, "title": e.title, "type": e.type, "verified": e.verified, "created_at": e.created_at.isoformat()}
                           for e in db.scalars(select(EvidenceItem).where(EvidenceItem.student_id == sid)).all()]
    if out["shared"]["roadmap"]:
        out["milestones"] = [{"label": m.label, "status": m.status} for m in db.scalars(select(Milestone).where(Milestone.student_id == sid)).all()]
    out["notes"] = [{"id": n.id, "text": decrypt(n.text_enc), "visibility": n.visibility, "created_at": n.created_at.isoformat(),
                     "author": db.get(User, n.counselor_id).display_name}
                    for n in db.scalars(select(CounselorNote).where(CounselorNote.student_id == sid).order_by(CounselorNote.created_at)).all()]
    out["alerts"] = [{"id": a.id, "type": a.type, "message": a.message, "status": a.status}
                     for a in db.scalars(select(Alert).where(Alert.student_id == sid)).all()]
    audit(db, user, "counselor_viewed_student", target=f"student:{sid}")
    db.commit()
    return out


class NoteIn(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    visibility: Literal["counselor", "student", "parent"] = "counselor"


@router.post("/counselor/students/{sid}/notes")
def add_note(sid: int, body: NoteIn, user: User = Depends(Staff), db: Session = Depends(get_db)):
    ensure_access(db, user, sid, "cohort")
    db.add(CounselorNote(student_id=sid, counselor_id=user.id, text_enc=encrypt(body.text), visibility=body.visibility))
    audit(db, user, "counselor_note_added", target=f"student:{sid}")
    db.commit()
    return {"ok": True}


@router.post("/counselor/students/{sid}/evidence/{eid}/verify")
def verify_evidence(sid: int, eid: int, user: User = Depends(Staff), db: Session = Depends(get_db)):
    ensure_access(db, user, sid, "evidence")
    e = db.get(EvidenceItem, eid)
    if e is None or e.student_id != sid:
        raise HTTPException(404, "Preuve introuvable")
    e.verified, e.verified_by = True, user.id
    audit(db, user, "evidence_verified", target=f"evidence:{eid}")
    db.commit()
    return {"ok": True}


@router.get("/counselor/workshops")
def workshops(user: User = Depends(Staff), db: Session = Depends(get_db)):
    """Besoins agrégés pour planifier des ateliers (écran 9.5 §4) : élèves hésitant entre deux familles de pistes."""
    pairs: Counter = Counter()
    for u, _, _ in _students(db, user.establishment_id):
        if not can_access_student(db, user, u.id, "pistes"):
            continue
        run = latest_run(db, u.id)
        if not run or len(run.output["items"]) < 2:
            continue
        ranked = sorted(run.output["items"], key=lambda i: -i["fit_score"]["value"])
        a, b = ranked[0], ranked[1]
        if a["sector"] != b["sector"] and abs(a["fit_score"]["value"] - b["fit_score"]["value"]) < 8:
            pairs[tuple(sorted((a["sector"], b["sector"])))] += 1
    return [{"sectors": list(p), "labels": [DOMAIN_LABELS.get(x, x) for x in p], "students": n,
             "suggestion": f"Atelier « {DOMAIN_LABELS.get(p[0], p[0])} ou {DOMAIN_LABELS.get(p[1], p[1])} ? » : rencontres de professionnels et mises en situation"}
            for p, n in pairs.most_common()]


# -- Administration de l'établissement ----------------------------------------------------------
@router.post("/admin/students/import")
def import_students(csv_text: str = Body(..., media_type="text/plain"), user: User = Depends(Admin), db: Session = Depends(get_db)):
    """CSV : email;display_name;class_name;level;system[;gender]. Mots de passe provisoires renvoyés une seule fois."""
    reader = csv.DictReader(io.StringIO(csv_text), delimiter=";")
    required = {"email", "display_name", "class_name", "level", "system"}
    if not reader.fieldnames or not required <= set(reader.fieldnames):
        raise HTTPException(422, f"Colonnes attendues : {';'.join(sorted(required))}[;gender]")
    created, errors = [], []
    for n, row in enumerate(reader, start=2):
        email = (row["email"] or "").strip().lower()
        if row["level"] not in cfg.LEVELS or cfg.LEVELS[row["level"]]["system"] != row["system"]:
            errors.append({"line": n, "error": "niveau ou système invalide"})
            continue
        if not email or db.scalars(select(User).where(User.email == email)).first():
            errors.append({"line": n, "error": "e-mail manquant ou déjà utilisé"})
            continue
        cg = db.scalars(select(ClassGroup).where(ClassGroup.establishment_id == user.establishment_id, ClassGroup.name == row["class_name"])).first()
        if cg is None:
            cg = ClassGroup(establishment_id=user.establishment_id, name=row["class_name"], level=row["level"])
            db.add(cg)
            db.flush()
        pw = secrets.token_urlsafe(8)
        u = User(email=email, password_hash=hash_password(pw), role="student", display_name=row["display_name"].strip(),
                 establishment_id=user.establishment_id, pseudo=new_pseudo())
        db.add(u)
        db.flush()
        db.add(StudentProfile(user_id=u.id, system=row["system"], level=row["level"], class_group_id=cg.id,
                              gender=(row.get("gender") or None)))
        created.append({"email": email, "temporary_password": pw})
    audit(db, user, "students_imported", detail={"created": len(created), "errors": len(errors)})
    db.commit()
    return {"created": created, "errors": errors}


class StaffIn(BaseModel):
    email: str
    display_name: str
    role: Literal["counselor", "school_admin"]


@router.post("/admin/staff")
def create_staff(body: StaffIn, user: User = Depends(Admin), db: Session = Depends(get_db)):
    if db.scalars(select(User).where(User.email == body.email.lower())).first():
        raise HTTPException(409, "E-mail déjà utilisé")
    pw = secrets.token_urlsafe(10)
    db.add(User(email=body.email.lower(), password_hash=hash_password(pw), role=body.role, display_name=body.display_name,
                establishment_id=user.establishment_id, pseudo=new_pseudo()))
    audit(db, user, "staff_created", detail={"role": body.role})
    db.commit()
    return {"email": body.email.lower(), "temporary_password": pw}


@router.get("/admin/stats")
def stats(user: User = Depends(Admin), db: Session = Depends(get_db)):
    """Statistiques anonymisées pour la direction : tout groupe de moins de k élèves est masqué (k ≥ 10)."""
    k = settings.k_anonymity
    rows = _students(db, user.establishment_id)
    groups: dict[str, dict[str, Any]] = {}

    def add(key: str, completed: bool, selective_sci: bool | None):
        g = groups.setdefault(key, {"n": 0, "completed": 0, "with_reco": 0, "selective_sci": 0})
        g["n"] += 1
        g["completed"] += completed
        if selective_sci is not None:
            g["with_reco"] += 1
            g["selective_sci"] += selective_sci

    for u, prof, cg in rows:
        run = latest_run(db, u.id)
        sel = None
        if run:
            sel = any(i["admission_probability"]["selective"] and i["sector"] in ("numerique", "energie", "industrie", "sante", "eau")
                      for i in run.output["items"])
        done = assessment_completed(db, u.id)
        add(f"niveau:{prof.level}", done, sel)
        add(f"genre:{prof.gender or 'non_renseigne'}", done, sel)
    out = []
    for key, g in sorted(groups.items()):
        if g["n"] < k:
            out.append({"group": key, "suppressed": True, "reason": f"effectif < {k}"})
        else:
            out.append({"group": key, "n": g["n"], "completion_rate": round(g["completed"] / g["n"], 2),
                        "selective_science_rate": round(g["selective_sci"] / g["with_reco"], 2) if g["with_reco"] else None})
    return {"k": k, "groups": out}


@router.get("/admin/audit")
def audit_log(limit: int = 100, user: User = Depends(Admin), db: Session = Depends(get_db)):
    rows = db.scalars(select(AuditLog).where(AuditLog.establishment_id == user.establishment_id)
                      .order_by(AuditLog.at.desc()).limit(min(limit, 500))).all()
    return [{"at": r.at.isoformat(), "actor_id": r.actor_id, "actor_role": r.actor_role, "action": r.action, "target": r.target} for r in rows]


@router.post("/counselor/refresh-alerts")
def refresh_all(user: User = Depends(Staff), db: Session = Depends(get_db)):
    for u, _, _ in _students(db, user.establishment_id):
        refresh_alerts(db, u)
    db.commit()
    return {"ok": True}
