"""Entrées du moteur : profil élève pseudonymisé, sans variable sensible.

Genre, région d'origine et revenu ne figurent volontairement PAS dans cette
structure (section 6.1) : le moteur ne peut donc pas les utiliser. La ville
de résidence n'intervient que comme contrainte de mobilité choisie par
l'élève, jamais comme variable de score.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class Trait:
    value: float
    se: float


@dataclass
class Evidence:
    title: str
    type: str                     # projet, stage, mooc, club, concours, benevolat, declaratif
    domains: list[str]
    verified: bool = False


@dataclass
class Constraints:
    budget_annual_mad: float | None = None    # None = pas de contrainte déclarée
    mobility: str = "national"                # local | national | international
    city: str | None = None
    excluded_domains: list[str] = field(default_factory=list)


@dataclass
class StudentInput:
    student_ref: str
    system: str                      # MA | FR
    level: str                       # MA_3AC, MA_TC_SCI, MA_1BAC, MA_2BAC, FR_3E, FR_2NDE, FR_1RE, FR_TLE
    stream: str | None = None        # MA 1BAC : SE/SM/ST/SEG ; MA 2BAC : PC/SVT/...
    fr_specialties: list[str] = field(default_factory=list)
    grades: dict[str, list[float]] = field(default_factory=dict)   # matière → moyennes chronologiques /20
    riasec: dict[str, Trait] = field(default_factory=dict)
    values: dict[str, float] = field(default_factory=dict)
    aptitude: Trait = field(default_factory=lambda: Trait(0.5, 0.25))
    ai_critical: Trait = field(default_factory=lambda: Trait(0.5, 0.25))
    self_efficacy: dict[str, Trait] = field(default_factory=dict)
    constraints: Constraints = field(default_factory=Constraints)
    evidence: list[Evidence] = field(default_factory=list)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "StudentInput":
        d = dict(d)
        d["riasec"] = {k: Trait(**v) for k, v in d.get("riasec", {}).items()}
        d["self_efficacy"] = {k: Trait(**v) for k, v in d.get("self_efficacy", {}).items()}
        d["aptitude"] = Trait(**d["aptitude"]) if d.get("aptitude") else Trait(0.5, 0.25)
        d["ai_critical"] = Trait(**d["ai_critical"]) if d.get("ai_critical") else Trait(0.5, 0.25)
        d["constraints"] = Constraints(**d.get("constraints", {}))
        d["evidence"] = [Evidence(**e) for e in d.get("evidence", [])]
        allowed = cls.__dataclass_fields__.keys()
        return cls(**{k: v for k, v in d.items() if k in allowed})

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def fingerprint(self) -> str:
        """Empreinte stable des entrées : sert de graine Monte-Carlo (rejouabilité)."""
        payload = json.dumps(self.to_dict(), sort_keys=True, ensure_ascii=False, default=str)
        return hashlib.sha256(payload.encode()).hexdigest()

    # -- notes ----------------------------------------------------------
    def grade(self, subject: str) -> float | None:
        vals = self.grades.get(subject)
        if not vals:
            return None
        if len(vals) == 1:
            return float(vals[0])
        # moyenne récente privilégiée : 60 % dernier trimestre, 40 % moyenne
        return round(0.6 * vals[-1] + 0.4 * sum(vals) / len(vals), 2)

    def general_average(self) -> float | None:
        g = [self.grade(s) for s in self.grades]
        g = [x for x in g if x is not None]
        return round(sum(g) / len(g), 2) if g else None

    def trend(self, subject: str) -> float | None:
        vals = self.grades.get(subject)
        if not vals or len(vals) < 2:
            return None
        return round(vals[-1] - vals[0], 2)
