"""Estimation des traits à partir des réponses (formes fixes du MVP).

Chaque trait est retourné avec une erreur standard (SE) sur l'échelle 0–1.
Au MVP, les SE sont des approximations issues de la théorie classique des
tests (SEM = σ·√(1 − fidélité), fidélité estimée par Spearman-Brown) ; elles
seront remplacées par les SE IRT après calibration (V1). Une dimension sans
réponse reçoit 0,5 avec une SE élevée (0,25) : l'incertitude est propagée
au lieu d'être masquée.
"""
from __future__ import annotations

import math
from typing import Any

from .instruments import (ADAPTABILITY_ITEMS, AI_CRITICAL_ITEMS, APTITUDE_ITEMS, RIASEC_ITEMS, SELF_EFFICACY_ITEMS,
                          SJT_ITEMS, TOLERANCE_ITEMS, VALUE_CARDS)

ITEM_RELIABILITY = 0.45  # fidélité d'un item isolé (hypothèse à recalibrer)
MISSING_SE = 0.25
SJT_WEIGHT = 0.15  # part du jugement situationnel dans le score d'intérêts


def _sb_reliability(n: int) -> float:
    if n <= 0:
        return 0.0
    r = ITEM_RELIABILITY
    return n * r / (1 + (n - 1) * r)


def _likert_trait(values: list[int]) -> tuple[float, float]:
    vals = [v for v in values if isinstance(v, (int, float)) and 1 <= v <= 5]
    if not vals:
        return 0.5, MISSING_SE
    mean = sum((v - 1) / 4 for v in vals) / len(vals)
    sigma = 0.25  # écart-type de population attendu sur l'échelle 0–1
    se = sigma * math.sqrt(1 - _sb_reliability(len(vals)))
    return round(mean, 4), round(max(se, 0.05), 4)


def _proportion(correct: int, n: int) -> tuple[float, float]:
    if n == 0:
        return 0.5, MISSING_SE
    p = (correct + 0.5) / (n + 1)  # lissage pour éviter 0 et 1
    return round(p, 4), round(math.sqrt(p * (1 - p) / n), 4)


def score_assessment(responses: dict[str, Any]) -> dict[str, Any]:
    """responses = {
        "riasec": {item_id: 1..5}, "values": [value_id ordonnés], "self_efficacy": {...},
        "adaptability": {...}, "tolerance": {...}, "aptitude": {item_id: option_index},
        "ai_critical": {item_id: option_index}, "sjt": {item_id: option_index}
    }"""
    out: dict[str, Any] = {}

    # Intérêts RIASEC (Likert) + jugement situationnel (choix comportementaux)
    ria = responses.get("riasec", {}) or {}
    sjt = responses.get("sjt", {}) or {}
    sjt_counts = {d: 0 for d in "RIASEC"}
    n_sjt = 0
    for item in SJT_ITEMS:
        idx = sjt.get(item["id"])
        if isinstance(idx, int) and 0 <= idx < len(item["options"]):
            sjt_counts[item["options"][idx]["riasec"]] += 1
            n_sjt += 1
    riasec: dict[str, dict[str, float]] = {}
    for dim in "RIASEC":
        vals = [ria.get(it["id"]) for it in RIASEC_ITEMS if it["dimension"] == dim]
        mean, se = _likert_trait([v for v in vals if v is not None])
        if n_sjt:
            mean = (1 - SJT_WEIGHT) * mean + SJT_WEIGHT * (sjt_counts[dim] / n_sjt)
        riasec[dim] = {"value": round(mean, 4), "se": se}
    out["riasec"] = riasec
    ordered = sorted("RIASEC", key=lambda d: -riasec[d]["value"])
    out["holland_code"] = "".join(ordered[:3])

    # Valeurs : rang 1 → poids 1, rang 7 → poids 0
    ranking = [v for v in (responses.get("values") or []) if v in {c["id"] for c in VALUE_CARDS}]
    values: dict[str, float] = {}
    n = len(VALUE_CARDS)
    for c in VALUE_CARDS:
        values[c["id"]] = round((n - 1 - ranking.index(c["id"])) / (n - 1), 4) if c["id"] in ranking else 0.5
    out["values"] = values
    out["values_ranked"] = bool(ranking)

    def grouped(items, key, answers):
        groups: dict[str, list[int]] = {}
        for it in items:
            v = (answers or {}).get(it["id"])
            if v is not None:
                groups.setdefault(it[key], []).append(v)
        res = {}
        for g in {it[key] for it in items}:
            m, s = _likert_trait(groups.get(g, []))
            res[g] = {"value": m, "se": s}
        return res

    out["self_efficacy"] = grouped(SELF_EFFICACY_ITEMS, "domain", responses.get("self_efficacy"))
    ad_vals = [v for it in ADAPTABILITY_ITEMS if (v := (responses.get("adaptability") or {}).get(it["id"])) is not None]
    m, s = _likert_trait(ad_vals)
    out["adaptability"] = {"value": m, "se": s}
    out["tolerance"] = grouped(TOLERANCE_ITEMS, "facet", responses.get("tolerance"))

    def correct_count(items, answers):
        answered = [(it, answers.get(it["id"])) for it in items if (answers or {}).get(it["id"]) is not None]
        return sum(1 for it, a in answered if a == it["answer"]), len(answered)

    k, n_apt = correct_count(APTITUDE_ITEMS, responses.get("aptitude") or {})
    p, s = _proportion(k, n_apt)
    out["aptitude"] = {"value": p, "se": s, "correct": k, "answered": n_apt}
    k, n_ai = correct_count(AI_CRITICAL_ITEMS, responses.get("ai_critical") or {})
    p, s = _proportion(k, n_ai)
    out["ai_critical"] = {"value": p, "se": s, "correct": k, "answered": n_ai}
    out["ai_feedback"] = [
        {"id": it["id"], "correct": (responses.get("ai_critical") or {}).get(it["id"]) == it["answer"], "feedback": it["feedback"]}
        for it in AI_CRITICAL_ITEMS if (responses.get("ai_critical") or {}).get(it["id"]) is not None
    ]
    return out
