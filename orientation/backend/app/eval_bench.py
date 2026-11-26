"""Banc d'évaluation (section 7.3) : 300 cas, dont les 3 cas de la section 2.3.

Au MVP les 297 cas complémentaires sont synthétiques et générés de façon
déterministe ; ils seront remplacés par des cas annotés par des conseillers.
Usage : python -m app.eval_bench [fournisseur]
"""
from __future__ import annotations

import random
import sys
from typing import Any

from .engine import config as cfg
from .engine.model import StudentInput
from .engine.recommend import Engine
from .genai.gateway import explain
from .genai.validator import forbidden_hits, item_texts, validate_recommendation
from .personas import ADAM, LEA, YASMINE
from .referential.store import Referential, seed_referential

LEVEL_SUBJECTS = {
    "MA": ["maths", "pc", "svt", "francais", "anglais", "arabe", "techno", "eco"],
    "FR": ["maths", "pc", "svt", "nsi", "ses", "francais", "anglais", "histgeo"],
}
DOMAINS = ["sante", "numerique", "energie", "industrie", "finance", "education", "culture", "eau", "agriculture"]


def synthetic_case(rng: random.Random, i: int) -> dict[str, Any]:
    level = rng.choice(list(cfg.LEVEL_GROUP))
    system = cfg.LEVELS[level]["system"]
    base = rng.uniform(8, 17.5)
    case: dict[str, Any] = {
        "student_ref": f"bench_{i:03d}", "system": system, "level": level,
        "stream": rng.choice(cfg.STREAMS[level]) if level in cfg.STREAMS else None,
        "fr_specialties": rng.sample(["maths", "pc", "svt", "nsi", "ses", "hggsp"], 2) if level == "FR_TLE" else [],
        "grades": {s: [round(min(20, max(3, rng.gauss(base, 2))), 1) for _ in range(3)] for s in LEVEL_SUBJECTS[system]},
        "riasec": {d: {"value": round(rng.random(), 2), "se": round(rng.uniform(0.05, 0.25), 2)} for d in "RIASEC"},
        "values": {k: round(rng.random(), 2) for k in ["utilite_sociale", "securite", "autonomie", "revenu", "creativite", "prestige", "equilibre"]},
        "aptitude": {"value": round(rng.random(), 2), "se": 0.15},
        "ai_critical": {"value": round(rng.random(), 2), "se": 0.2},
        "self_efficacy": {"maths_sciences": {"value": round(rng.random(), 2), "se": 0.15}},
        "constraints": {"budget_annual_mad": rng.choice([None, 0, 5000, 30000, 100000]), "mobility": rng.choice(["local", "national", "international"]),
                        "city": rng.choice(["Casablanca", "Meknès", "Rabat", "Ouarzazate"]),
                        "excluded_domains": rng.sample(DOMAINS, rng.choice([0, 0, 1]))},
        "evidence": [{"title": "Projet personnel", "type": rng.choice(list(cfg.EVIDENCE_WEIGHTS)), "domains": [rng.choice(DOMAINS)],
                      "verified": rng.random() < 0.5} for _ in range(rng.choice([0, 1, 2]))],
    }
    return case


def bench_cases(n: int = 300, seed: int = 42) -> list[dict[str, Any]]:
    rng = random.Random(seed)
    return [YASMINE, ADAM, LEA] + [synthetic_case(rng, i) for i in range(n - 3)]


def run(provider: str = "template", ref: Referential | None = None, n_draws: int = 200) -> dict[str, Any]:
    ref = ref or seed_referential()
    engine = Engine(ref, n_draws=n_draws)
    stats = {"cases": 0, "items": 0, "forbidden": 0, "validation_errors": 0, "fallbacks": 0, "factual_mismatch": 0}
    for case in bench_cases():
        result = engine.recommend(StudentInput.from_dict(case))
        final, trace = explain(result, ref, provider)
        stats["cases"] += 1
        stats["fallbacks"] += trace["status"] != "ok"
        stats["validation_errors"] += len(validate_recommendation(final, result, ref))
        for item in final["items"]:
            stats["items"] += 1
            stats["forbidden"] += sum(len(forbidden_hits(t)) for t in item_texts(item))
            prog = ref.program(item["program_id"])
            adm = prog.get("admission")
            if adm and (item["admission_probability"]["source_id"] != adm["source_id"] or item["admission_probability"]["as_of"] != adm["as_of"]):
                stats["factual_mismatch"] += 1
            if prog.get("cost") != item["cost"]:
                stats["factual_mismatch"] += 1
    stats["hallucination_rate"] = stats["factual_mismatch"] / max(1, stats["items"])
    return stats


if __name__ == "__main__":
    print(run(sys.argv[1] if len(sys.argv) > 1 else "template"))
