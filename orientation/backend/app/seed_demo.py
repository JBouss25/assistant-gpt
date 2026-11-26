"""Jeu de données de démonstration — établissements et élèves FICTIFS.

Usage : python -m app.seed_demo  (réinitialise la base locale)
Tous les comptes ont le mot de passe « demo1234 » : réservé au développement local.
"""
from __future__ import annotations

import datetime as dt
import random

from .db import (Base, ClassGroup, Consent, EvidenceItem, GradeRecord, GuardianLink, Milestone, SessionLocal, StudentProfile,
                 TraitEstimate, AssessmentSession, User, engine, utcnow)
from .psychometrics.instruments import (ADAPTABILITY_ITEMS, AI_CRITICAL_ITEMS, APTITUDE_ITEMS, INSTRUMENT_VERSION, RIASEC_ITEMS,
                                        SELF_EFFICACY_ITEMS, SJT_ITEMS, TOLERANCE_ITEMS, VALUE_CARDS)
from .psychometrics.scoring import score_assessment
from .security import CONSENT_TEXT_VERSION, DEFAULT_COUNSELOR_SCOPES, encrypt, hash_password
from .services import compute_recommendation, ensure_seed_referential
from .settings import settings

PASSWORD = "demo1234"
PERIODS = ["T1", "T2", "T3"]


def traits_from_persona(p: dict) -> dict:
    riasec = p["riasec"]
    order = sorted("RIASEC", key=lambda d: -riasec[d]["value"])
    return {
        "riasec": riasec, "holland_code": "".join(order[:3]), "values": p["values"], "values_ranked": True,
        "self_efficacy": p.get("self_efficacy", {d: {"value": 0.6, "se": 0.15} for d in ("maths_sciences", "lettres_langues", "technique", "relationnel")}),
        "adaptability": {"value": 0.6, "se": 0.12}, "tolerance": {"incertitude": {"value": 0.5, "se": 0.15}, "autonomie": {"value": 0.6, "se": 0.2}},
        "aptitude": {**p["aptitude"], "correct": 4, "answered": 6}, "ai_critical": {**p["ai_critical"], "correct": 2, "answered": 4},
        "ai_feedback": [],
    }


def random_responses(rng: random.Random, bias: str) -> dict:
    """Réponses simulées cohérentes avec un profil dominant (pour la cohorte de démonstration)."""
    ria = {}
    for it in RIASEC_ITEMS:
        base = 4.2 if it["dimension"] in bias else 2.4
        ria[it["id"]] = max(1, min(5, round(rng.gauss(base, 0.9))))
    values = [c["id"] for c in VALUE_CARDS]
    rng.shuffle(values)
    return {
        "riasec": ria, "values": values,
        "self_efficacy": {it["id"]: rng.randint(2, 5) for it in SELF_EFFICACY_ITEMS},
        "adaptability": {it["id"]: rng.randint(2, 5) for it in ADAPTABILITY_ITEMS},
        "tolerance": {it["id"]: rng.randint(1, 5) for it in TOLERANCE_ITEMS},
        "aptitude": {it["id"]: (it["answer"] if rng.random() < 0.65 else 0 if it["answer"] else 1) for it in APTITUDE_ITEMS},
        "ai_critical": {it["id"]: (it["answer"] if rng.random() < 0.6 else 0) for it in AI_CRITICAL_ITEMS},
        "sjt": {it["id"]: next(i for i, o in enumerate(it["options"]) if o["riasec"] == bias[0]) for it in SJT_ITEMS},
    }


def main() -> None:
    from .personas import ADAM, LEA, YASMINE  # profils de la section 2.3

    if not settings.demo_seed_allowed:
        raise SystemExit("Refusé : le jeu de démonstration efface la base, il est interdit en production.")
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    rng = random.Random(2027)
    with SessionLocal() as db:
        ensure_seed_referential(db)
        from .db import Establishment
        casa = Establishment(name="Lycée Démo Casablanca", system="MA", city="Casablanca", aref="AREF Casablanca-Settat")
        mek = Establishment(name="Lycée Démo Meknès", system="MA", city="Meknès", aref="AREF Fès-Meknès")
        rabat = Establishment(name="Lycée français Démo Rabat", system="FR", city="Rabat", aref="Réseau AEFE Maroc")
        db.add_all([casa, mek, rabat])
        db.flush()
        classes = {
            "casa_tc": ClassGroup(establishment_id=casa.id, name="TC Sciences 2", level="MA_TC_SCI"),
            "casa_2bac": ClassGroup(establishment_id=casa.id, name="2BAC PC 1", level="MA_2BAC"),
            "casa_3ac": ClassGroup(establishment_id=casa.id, name="3AC 4", level="MA_3AC"),
            "mek_2bac": ClassGroup(establishment_id=mek.id, name="2BAC PC 3", level="MA_2BAC"),
            "rabat_tle": ClassGroup(establishment_id=rabat.id, name="Terminale B", level="FR_TLE"),
        }
        db.add_all(classes.values())
        db.flush()

        def user(email, name, role, est=None, created_days_ago=0):
            u = User(email=email, password_hash=hash_password(PASSWORD), role=role, display_name=name,
                     establishment_id=est.id if est else None, pseudo=f"pseudo_{rng.getrandbits(32):08x}",
                     created_at=utcnow() - dt.timedelta(days=created_days_ago))
            db.add(u)
            db.flush()
            return u

        def consent(student, kind, scopes, by):
            db.add(Consent(student_id=student.id, kind=kind, scopes=scopes, text_version=CONSENT_TEXT_VERSION, granted_by=by.id))

        def grades(student, g):
            for subject, vals in g.items():
                for period, v in zip(PERIODS, vals):
                    db.add(GradeRecord(student_id=student.id, subject=subject, period=period, value=v, source="import", verified=True))

        def persona_student(p, email, name, est, cg, gender, city, certainty, created_days_ago=20):
            s = user(email, name, "student", est, created_days_ago)
            c = p["constraints"]
            db.add(StudentProfile(user_id=s.id, system=p["system"], level=p["level"], stream=p.get("stream"),
                                  fr_specialties=p.get("fr_specialties", []), class_group_id=cg.id, city=city, gender=gender,
                                  constraints={"budget_annual_mad": c.get("budget_annual_mad"), "mobility": c.get("mobility", "national"),
                                               "excluded_domains": c.get("excluded_domains", [])},
                                  certainty_history=[{"at": (utcnow() - dt.timedelta(days=30)).isoformat(), "value": certainty[0]},
                                                     {"at": utcnow().isoformat(), "value": certainty[1]}], onboarded=True))
            grades(s, p["grades"])
            sess = AssessmentSession(student_id=s.id, instrument_version=INSTRUMENT_VERSION, responses_enc=encrypt({}), status="completed",
                                     completed_at=utcnow())
            db.add(sess)
            db.flush()
            db.add(TraitEstimate(session_id=sess.id, student_id=s.id, traits_enc=encrypt(traits_from_persona(p))))
            for e in p.get("evidence", []):
                db.add(EvidenceItem(student_id=s.id, title=e["title"], type=e["type"], domains=e["domains"], verified=e["verified"]))
            consent(s, "student_terms", ["processing"], s)
            consent(s, "share_counselor", DEFAULT_COUNSELOR_SCOPES + ["assessment"], s)
            return s

        yasmine = persona_student(YASMINE, "yasmine@demo.ma", "Yasmine", casa, classes["casa_tc"], "F", "Casablanca", (4, 6))
        adam = persona_student(ADAM, "adam@demo.ma", "Adam", mek, classes["mek_2bac"], "M", "Meknès", (5, 5))
        lea = persona_student(LEA, "lea@demo.fr", "Léa", rabat, classes["rabat_tle"], "F", "Rabat", (6, 7))

        parent_y = user("parent.yasmine@demo.ma", "Mme Benali (parent de Yasmine)", "parent")
        db.add(GuardianLink(guardian_id=parent_y.id, student_id=yasmine.id, invite_code="DEMO-YASMINE", status="active"))
        consent(yasmine, "parent_legal", ["processing"], parent_y)
        consent(yasmine, "share_parent", ["profile", "pistes", "roadmap", "evidence"], yasmine)
        for s in (adam, lea):  # parents ayant validé le traitement, sans partage de résultats
            p = user(f"parent.{s.email.split('@')[0]}@demo.ma", f"Parent de {s.display_name}", "parent")
            db.add(GuardianLink(guardian_id=p.id, student_id=s.id, invite_code=f"DEMO-{s.display_name.upper()}", status="active"))
            consent(s, "parent_legal", ["processing"], p)
        db.add_all([Milestone(student_id=yasmine.id, label="Viser 14 en maths au 2e trimestre", status="doing"),
                    Milestone(student_id=yasmine.id, label="Rencontrer une lycéenne de 1BAC SE", status="todo")])

        # Nouvel élève de 3e, sans évaluation : pour tester l'onboarding de bout en bout
        sami = user("sami@demo.ma", "Sami", "student", casa)
        db.add(StudentProfile(user_id=sami.id, class_group_id=classes["casa_3ac"].id, gender="M"))

        # Cohorte synthétique (Casablanca) pour le tableau de bord conseiller
        cohort_specs = [("casa_2bac", "MA_2BAC", "PC"), ("casa_tc", "MA_TC_SCI", None), ("casa_3ac", "MA_3AC", None)]
        biases = ["IR", "SI", "RI", "IA", "EC", "SA", "IC", "RC"]
        first_names_f = ["Salma", "Imane", "Nour", "Hiba", "Rim", "Aya", "Sara", "Ghita"]
        first_names_m = ["Youssef", "Omar", "Mehdi", "Anas", "Hamza", "Ilyas", "Karim", "Reda"]
        cohort = []
        for i in range(16):
            key, level, stream = cohort_specs[i % 3]
            gender = "F" if i % 2 == 0 else "M"
            name = (first_names_f if gender == "F" else first_names_m)[i // 2]
            old = i in (3, 7)  # comptes anciens sans preuve → alerte « 60 jours »
            s = user(f"eleve{i + 1:02d}@demo.ma", name, "student", casa, created_days_ago=90 if old else 15)
            certainty = [rng.randint(3, 8), rng.choice([2, 3, 5, 6, 7, 8])]
            budget = rng.choice([None, 5000, 20000, 80000])
            db.add(StudentProfile(user_id=s.id, system="MA", level=level, stream=stream, class_group_id=classes[key].id, city="Casablanca",
                                  gender=gender, constraints={"budget_annual_mad": budget, "mobility": rng.choice(["local", "national"]),
                                                              "excluded_domains": ["sante"] if i == 4 else []},
                                  certainty_history=[{"at": (utcnow() - dt.timedelta(days=40)).isoformat(), "value": certainty[0]},
                                                     {"at": utcnow().isoformat(), "value": certainty[1]}], onboarded=True))
            subjects = ["maths", "pc", "svt", "francais", "anglais", "arabe"]
            base = rng.uniform(10, 16.5)
            grades(s, {sub: [round(min(20, max(5, rng.gauss(base, 1.6))), 1) for _ in PERIODS] for sub in subjects})
            resp = random_responses(rng, biases[i % len(biases)])
            sess = AssessmentSession(student_id=s.id, instrument_version=INSTRUMENT_VERSION, responses_enc=encrypt(resp), status="completed",
                                     completed_at=utcnow())
            db.add(sess)
            db.flush()
            db.add(TraitEstimate(session_id=sess.id, student_id=s.id, traits_enc=encrypt(score_assessment(resp))))
            consent(s, "student_terms", ["processing"], s)
            consent(s, "share_counselor", DEFAULT_COUNSELOR_SCOPES, s)
            consent(s, "parent_legal", ["processing"], s)  # démo : validation parentale simulée
            if not old and rng.random() < 0.6:
                db.add(EvidenceItem(student_id=s.id, title="Club scientifique du lycée", type="club", domains=["sciences", "energie"], verified=False))
            cohort.append(s)

        # Personnel
        user("conseiller.casa@demo.ma", "M. Alaoui (conseiller d'orientation)", "counselor", casa)
        user("admin.casa@demo.ma", "Mme Idrissi (direction)", "school_admin", casa)
        user("conseiller.meknes@demo.ma", "Mme Tazi (conseillère d'orientation)", "counselor", mek)
        user("conseiller.rabat@demo.fr", "Mme Martin (Psy-EN)", "counselor", rabat)
        user("editeur@demo.ma", "Éditeur du référentiel", "editor")
        user("comite@demo.ma", "Comité scientifique", "committee")
        db.commit()

        for s in [yasmine, adam, lea, *cohort]:
            compute_recommendation(db, s)
        db.commit()
    print("Base de démonstration prête. Mot de passe de tous les comptes :", PASSWORD)


if __name__ == "__main__":
    main()
