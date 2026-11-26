"""Composantes du score d'adéquation S_p (section 6.3, étape 2).

Toutes les fonctions sont vectorisées : elles acceptent des tirages de
dimension n (n = 1 pour l'estimation ponctuelle, n = 1000 pour Monte-Carlo),
ce qui garantit que la fourchette et le point central sont calculés par
exactement le même code.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

from ..psychometrics.instruments import SUBJECT_LABELS
from ..referential.store import RIASEC, VALUE_KEYS
from . import config as cfg
from .model import StudentInput

ALL_SUBJECTS = sorted(SUBJECT_LABELS)
DEFAULT_GRADE = 12.0  # hypothèse H-09 : aucune note renseignée


@dataclass
class Draws:
    n: int
    interests: np.ndarray           # (n, 6)
    aptitude: np.ndarray            # (n,)
    values: np.ndarray              # (n, 7) ordre VALUE_KEYS
    grades: dict[str, np.ndarray]   # matière → (n,)
    grades_known: set[str]


def make_draws(student: StudentInput, n: int = 1, rng: np.random.Generator | None = None,
               grade_overrides: dict[str, float] | None = None) -> Draws:
    noisy = rng is not None and n > 1
    z = (lambda *shape: rng.standard_normal(shape)) if noisy else (lambda *shape: np.zeros(shape))

    mu = np.array([student.riasec[d].value if d in student.riasec else 0.5 for d in RIASEC])
    se = np.array([student.riasec[d].se if d in student.riasec else 0.25 for d in RIASEC])
    interests = np.clip(mu + z(n, 6) * se, 0, 1)

    aptitude = np.clip(student.aptitude.value + z(n) * student.aptitude.se, 0, 1)

    v_mu = np.array([student.values.get(k, 0.5) for k in VALUE_KEYS])
    values = np.clip(v_mu + z(n, 7) * cfg.VALUE_NOISE, 0, 1)

    overrides = grade_overrides or {}
    general = student.general_average()
    if general is None:
        general = DEFAULT_GRADE
    known: set[str] = set()
    grades: dict[str, np.ndarray] = {}
    noise = z(n, len(ALL_SUBJECTS)) * cfg.GRADE_NOISE  # tirage commun à toutes les pistes
    for i, s in enumerate(ALL_SUBJECTS):
        g = overrides.get(s, student.grade(s))
        if g is not None:
            known.add(s)
        base = g if g is not None else general
        grades[s] = np.clip(base + noise[:, i], 0, 20)
    return Draws(n=n, interests=interests, aptitude=aptitude, values=values, grades=grades, grades_known=known)


# ---------------------------------------------------------------------------
def hard_constraint(student: StudentInput, program: dict[str, Any]) -> str | None:
    """Étape 1 : prérequis réglementaires uniquement. Retourne le motif d'exclusion ou None."""
    access = program.get("access") or {}
    if student.system == "MA" and access.get("streams") and student.level in ("MA_1BAC", "MA_2BAC"):
        if student.stream not in access["streams"]:
            return f"non accessible depuis ta filière actuelle ({student.stream or 'non renseignée'})"
    if student.system == "FR" and access.get("fr_requires_any"):
        if not set(access["fr_requires_any"]) & set(student.fr_specialties):
            req = " ou ".join(SUBJECT_LABELS.get(s, s) for s in access["fr_requires_any"])
            return f"spécialité requise : {req}"
    return None


def interests(draws: Draws, program: dict[str, Any]) -> np.ndarray:
    """Similarité cosinus sur profils centrés, ramenée sur 0–100."""
    s = draws.interests - draws.interests.mean(axis=1, keepdims=True)
    p = np.array(program["holland_vec"]) - np.mean(program["holland_vec"])
    s_norm = np.linalg.norm(s, axis=1)
    p_norm = np.linalg.norm(p)
    with np.errstate(invalid="ignore", divide="ignore"):
        cos = np.where(s_norm > 1e-9, (s @ p) / (s_norm * p_norm), 0.0)
    return 100 * (cos + 1) / 2


def subject_fit(grade: np.ndarray | float, rec: float) -> np.ndarray:
    """0 à (rec − 6), 1 à (rec + 2), linéaire entre les deux."""
    return np.clip((np.asarray(grade) - (rec - 6)) / 8, 0, 1)


def skills(draws: Draws, program: dict[str, Any]) -> np.ndarray:
    fit = np.zeros(draws.n)
    for s, spec in program["subjects"].items():
        fit += spec["w"] * subject_fit(draws.grades[s], spec["rec"])
    return 100 * (0.75 * fit + 0.25 * draws.aptitude)


def values(draws: Draws, program: dict[str, Any]) -> np.ndarray:
    prof = np.array([program["values"].get(k, 0.5) for k in VALUE_KEYS])
    denom = draws.values.sum(axis=1)
    with np.errstate(invalid="ignore", divide="ignore"):
        v = np.where(denom > 1e-9, (draws.values @ prof) / denom, 0.5)
    return 100 * v


def admission_index(draws: Draws, program: dict[str, Any]) -> np.ndarray:
    idx = np.zeros(draws.n)
    for s, spec in program["subjects"].items():
        idx += spec["w"] * draws.grades[s]
    return idx


def admission_probability(draws: Draws, program: dict[str, Any]) -> np.ndarray:
    """Régression logistique sur seuils historiques : p = σ(k·(indice − seuil)/échelle)."""
    adm = program.get("admission")
    if not adm:
        return np.full(draws.n, cfg.OPEN_ACCESS_P)
    x = cfg.LOGISTIC_K * (admission_index(draws, program) - adm["threshold"]) / adm["scale"]
    return np.clip(1 / (1 + np.exp(-x)), 0.01, 0.99)


def soft_factors(student: StudentInput, program: dict[str, Any]) -> tuple[float, list[dict[str, str]]]:
    """Budget et mobilité : facteurs multiplicatifs + messages. Jamais d'exclusion."""
    factor = 1.0
    flags: list[dict[str, str]] = []
    c = student.constraints
    cost = program.get("cost")
    if cost and c.budget_annual_mad is not None:
        rate = cfg.EUR_TO_MAD_DEMO if cost.get("currency") == "EUR" else 1.0
        cmin, cmax = cost["annual_min"] * rate, cost["annual_max"] * rate
        if cmin > c.budget_annual_mad:
            factor *= cfg.BUDGET_OVER_MIN
            flags.append({"type": "budget", "message": "Le coût dépasse le budget indiqué : renseigne-toi sur les bourses et aides."})
        elif cmax > c.budget_annual_mad:
            factor *= cfg.BUDGET_OVER_MAX
            flags.append({"type": "budget", "message": "Selon l'établissement choisi, le coût peut dépasser le budget indiqué."})
    country = "FR" if program["system"] == "FR" else "MA"
    if country == "FR" and c.mobility != "international":
        factor *= cfg.MOBILITY_PENALTY
        flags.append({"type": "mobilite", "message": "Formation en France : elle demande une mobilité internationale."})
    elif c.mobility == "local" and c.city and program.get("cities") and c.city not in program["cities"]:
        factor *= cfg.MOBILITY_PENALTY
        flags.append({"type": "mobilite", "message": f"Pas d'établissement à {c.city} : un déménagement serait nécessaire."})
    return factor, flags


def evidence(student: StudentInput, program: dict[str, Any]) -> tuple[float, list[str]]:
    total = 0.0
    used: list[str] = []
    domains = set(program.get("domains", []))
    for e in student.evidence:
        if set(e.domains) & domains:
            total += cfg.EVIDENCE_WEIGHTS.get(e.type, 0.2) * (1.0 if e.verified else 0.5)
            used.append(e.title)
    return min(100.0, 100 * total / 2.0), used


def compute(student: StudentInput, program: dict[str, Any], draws: Draws) -> dict[str, Any]:
    p_adm = admission_probability(draws, program)
    factor, flags = soft_factors(student, program)
    e_score, e_used = evidence(student, program)
    comps = {
        "interests": interests(draws, program),
        "skills": skills(draws, program),
        "values": values(draws, program),
        "feasibility": 100 * p_adm * factor,
        "outlook": np.full(draws.n, program["avenir"] if program["avenir"] is not None else 50.0),
        "evidence": np.full(draws.n, e_score),
    }
    return {"components": comps, "p_adm": p_adm, "flags": flags, "evidence_used": e_used}


def total(comps: dict[str, np.ndarray], weights: dict[str, float]) -> np.ndarray:
    return sum(weights[k] * comps[k] for k in cfg.COMPONENTS)
