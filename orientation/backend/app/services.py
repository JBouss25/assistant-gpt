"""Services métier : référentiel actif, construction du profil moteur, recommandations, alertes."""
from __future__ import annotations

import datetime as dt
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import (Alert, AssessmentSession, EvidenceItem, GradeRecord, LLMTrace, RecommendationRun, ReferentialVersion,
                 StudentProfile, TraitEstimate, User, Wishlist, utcnow)
from .engine import config as cfg
from .engine.model import StudentInput
from .engine.recommend import Engine, balance_check
from .engine.texts import elide
from .genai.gateway import explain
from .referential.store import Referential, load_seed
from .security import decrypt, student_establishment
from .settings import settings

PERIOD_ORDER = {"T1": 1, "S1": 1, "T2": 2, "T3": 3, "S2": 3, "examen_regional": 4, "brevet": 4, "bac_blanc": 4}

_cache: dict[str, Referential] = {}


# -- Référentiel ---------------------------------------------------------------------
def ensure_seed_referential(db: Session) -> None:
    if db.scalars(select(ReferentialVersion)).first() is None:
        seed = load_seed()
        db.add(ReferentialVersion(version=seed["meta"]["version"], status="published", content=seed,
                                  history=[{"at": utcnow().isoformat(), "to": "published", "by": "seed"}]))
        db.commit()


def active_referential(db: Session) -> Referential:
    row = db.scalars(select(ReferentialVersion).where(ReferentialVersion.status == "published")
                     .order_by(ReferentialVersion.created_at.desc())).first()
    if row is None:
        ensure_seed_referential(db)
        return active_referential(db)
    return referential_by_version(db, row.version)


def referential_by_version(db: Session, version: str) -> Referential:
    if version not in _cache:
        row = db.scalars(select(ReferentialVersion).where(ReferentialVersion.version == version)).one()
        _cache[version] = Referential.from_document(row.content)
    return _cache[version]


def invalidate_referential_cache() -> None:
    _cache.clear()


# -- Profil moteur -------------------------------------------------------------------
def latest_traits(db: Session, student_id: int) -> dict[str, Any] | None:
    te = db.scalars(select(TraitEstimate).where(TraitEstimate.student_id == student_id)
                    .order_by(TraitEstimate.created_at.desc(), TraitEstimate.id.desc())).first()
    return decrypt(te.traits_enc) if te else None


def grades_by_subject(db: Session, student_id: int) -> dict[str, list[float]]:
    rows = db.scalars(select(GradeRecord).where(GradeRecord.student_id == student_id)).all()
    by: dict[str, list[tuple[int, float]]] = {}
    for r in rows:
        by.setdefault(r.subject, []).append((PERIOD_ORDER.get(r.period, 2), r.value))
    return {s: [v for _, v in sorted(vals)] for s, vals in by.items()}


def build_student_input(db: Session, user: User) -> StudentInput:
    """Construit l'entrée du moteur. Le genre n'est jamais lu ici (exclu par construction)."""
    prof = db.get(StudentProfile, user.id)
    if prof is None or not prof.level:
        raise ValueError("profil incomplet : terminer l'onboarding")
    traits = latest_traits(db, user.id)
    if traits is None:
        raise ValueError("évaluation non terminée")
    ev = db.scalars(select(EvidenceItem).where(EvidenceItem.student_id == user.id)).all()
    c = prof.constraints or {}
    return StudentInput.from_dict({
        "student_ref": user.pseudo,
        "system": prof.system, "level": prof.level, "stream": prof.stream,
        "fr_specialties": prof.fr_specialties or [],
        "grades": grades_by_subject(db, user.id),
        "riasec": traits["riasec"], "values": traits["values"],
        "aptitude": {"value": traits["aptitude"]["value"], "se": traits["aptitude"]["se"]},
        "ai_critical": {"value": traits["ai_critical"]["value"], "se": traits["ai_critical"]["se"]},
        "self_efficacy": traits["self_efficacy"],
        "constraints": {"budget_annual_mad": c.get("budget_annual_mad"), "mobility": c.get("mobility", "national"),
                        "city": prof.city, "excluded_domains": c.get("excluded_domains", [])},
        "evidence": [{"title": e.title, "type": e.type, "domains": e.domains or [], "verified": e.verified} for e in ev],
    })


# -- Recommandations -----------------------------------------------------------------
def compute_recommendation(db: Session, user: User) -> RecommendationRun:
    ref = active_referential(db)
    student = build_student_input(db, user)
    result = Engine(ref).recommend(student)
    final, trace = explain(result, ref, settings.llm_provider)
    run = RecommendationRun(student_id=user.id, model_version=result["model_version"], weights_version=result["weights_version"],
                            referential_version=result["referential_version"], seed=str(result["seed"]),
                            input_snapshot=student.to_dict(), output=final)
    db.add(run)
    db.flush()
    db.add(LLMTrace(run_id=run.id, data=trace))
    refresh_alerts(db, user, final)
    db.commit()
    return run


def replay(db: Session, run: RecommendationRun) -> dict[str, Any]:
    """Rejoue une recommandation à l'identique à partir des versions enregistrées (critère 10.2)."""
    if run.model_version != cfg.MODEL_VERSION or run.weights_version != cfg.WEIGHTS_VERSION:
        return {"identical": False, "reason": "version du modèle ou des pondérations non disponible dans ce déploiement"}
    ref = referential_by_version(db, run.referential_version)
    student = StudentInput.from_dict(run.input_snapshot)
    again = Engine(ref).recommend(student)
    # On compare les sorties du moteur (pistes, scores, fourchettes, catégories, contributions…).
    # Les champs rédigés peuvent avoir été reformulés par un LLM : ils sont exclus de la comparaison.
    text_fields = {"reasons", "counterfactual", "roadmap_6_12m"}
    strip = lambda items: [{k: v for k, v in i.items() if k not in text_fields} for i in items]  # noqa: E731
    identical = (strip(again["items"]) == strip(run.output["items"])
                 and all(again[k] == run.output[k] for k in ("blocked", "signals", "warnings", "seed")))
    return {"identical": identical, "run_id": run.id, "model_version": run.model_version,
            "weights_version": run.weights_version, "referential_version": run.referential_version}


def simulate(db: Session, user: User, grade_overrides: dict[str, float], budget: float | None, mobility: str | None,
             baseline: dict[str, Any] | None) -> dict[str, Any]:
    ref = active_referential(db)
    student = build_student_input(db, user)
    if budget is not None:
        student.constraints.budget_annual_mad = budget
    if mobility:
        student.constraints.mobility = mobility
    # Fourchettes conservées mais avec moins de tirages pour tenir le budget de latence (< 1,5 s p95).
    result = Engine(ref, n_draws=300).recommend(student, grade_overrides=grade_overrides)
    changes = []
    if baseline:
        before = {i["program_id"]: i for i in baseline.get("items", [])}
        for i in result["items"]:
            b = before.get(i["program_id"])
            if b and b["category"] != i["category"]:
                changes.append({"program_id": i["program_id"], "short": i["short"], "from": b["category"], "to": i["category"],
                                "explanation": f"« {i['short']} » passe {elide(cfg.CATEGORY_LABELS[b['category']])} "
                                               f"à {cfg.CATEGORY_LABELS[i['category']]}."})
            elif b is None:
                changes.append({"program_id": i["program_id"], "short": i["short"], "from": None, "to": i["category"],
                                "explanation": f"« {i['short']} » entre dans tes pistes."})
        for pid, b in before.items():
            if pid not in {i["program_id"] for i in result["items"]}:
                changes.append({"program_id": pid, "short": b["short"], "from": b["category"], "to": None,
                                "explanation": f"« {b['short']} » sort de la sélection (elle reste consultable dans l'explorateur)."})
    result["changes"] = changes
    return result


def latest_run(db: Session, student_id: int) -> RecommendationRun | None:
    return db.scalars(select(RecommendationRun).where(RecommendationRun.student_id == student_id)
                      .order_by(RecommendationRun.created_at.desc(), RecommendationRun.id.desc())).first()


# -- Alertes conseiller (section 5.4) -----------------------------------------------------
ALERT_ACTIONS = {
    "autocensure": "Entretien individuel pour explorer les pistes écartées",
    "indecision": "Proposer un atelier d'exploration des métiers",
    "ecart_ambition": "Entretien sur la stratégie de vœux A / B / C",
    "motivation": "Point rapide avec le professeur principal",
    "sans_preuve": "Rappeler le carnet de preuves et proposer une activité",
}


def refresh_alerts(db: Session, user: User, output: dict[str, Any] | None = None) -> None:
    """Recalcule les alertes automatiques ouvertes d'un élève (les alertes traitées sont conservées)."""
    sid = user.id
    est = student_establishment(db, sid)
    prof = db.get(StudentProfile, sid)
    wanted: dict[str, tuple[int, str, dict[str, Any]]] = {}
    if output is None:
        run = latest_run(db, sid)
        output = run.output if run else None
    if output:
        for s in output.get("signals", []):
            if s["type"] == "autocensure":
                wanted["autocensure"] = (1, "Autocensure probable : " + s["message"], {"program_id": s.get("program_id")})
                break
    hist = (prof.certainty_history if prof else None) or []
    if hist:
        last = hist[-1]["value"]
        if last <= 3:
            wanted["indecision"] = (2, f"Indécision persistante : certitude du projet déclarée à {last}/10.", {"certainty": last})
        if len(hist) >= 2 and hist[-2]["value"] - last >= 3:
            wanted["motivation"] = (2, f"Baisse marquée de la certitude du projet ({hist[-2]['value']} → {last}/10).",
                                    {"from": hist[-2]["value"], "to": last})
    wl = db.get(Wishlist, sid)
    if wl and output:
        cats = [c for c, ids in (wl.columns or {}).items() if ids]
        msgs = balance_check(cats)
        if any("sécurisée" in m for m in msgs):
            wanted["ecart_ambition"] = (1, "Écart ambitions / résultats : aucune piste sécurisée dans la liste de vœux.", {"columns": wl.columns})
    acct_age = utcnow() - user.created_at
    last_ev = db.scalars(select(EvidenceItem).where(EvidenceItem.student_id == sid).order_by(EvidenceItem.created_at.desc())).first()
    ref_date = last_ev.created_at if last_ev else user.created_at
    if acct_age > dt.timedelta(days=60) and utcnow() - ref_date > dt.timedelta(days=60):
        wanted["sans_preuve"] = (3, "Aucune preuve déposée depuis plus de 60 jours.", {"last_evidence": ref_date.isoformat()})

    open_alerts = db.scalars(select(Alert).where(Alert.student_id == sid, Alert.status == "open")).all()
    by_type = {a.type: a for a in open_alerts}
    for t, a in by_type.items():
        if t not in wanted and t in ALERT_ACTIONS:
            a.status = "closed"
            a.data = {**(a.data or {}), "closed_reason": "condition levée automatiquement"}
    for t, (prio, msg, data) in wanted.items():
        if t in by_type:
            by_type[t].message, by_type[t].data, by_type[t].priority = msg, data, prio
        else:
            db.add(Alert(student_id=sid, establishment_id=est, type=t, priority=prio, message=msg, data=data,
                         suggested_action=ALERT_ACTIONS[t]))


def assessment_completed(db: Session, student_id: int) -> bool:
    return db.scalars(select(AssessmentSession).where(AssessmentSession.student_id == student_id,
                                                      AssessmentSession.status == "completed")).first() is not None
