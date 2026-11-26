"""Validation automatique avant affichage (section 7.1 §4).

Aucun texte n'est affiché s'il ne passe pas ces contrôles :
- identifiants cités présents dans le référentiel ;
- scores, probabilités et contributions identiques à ceux du moteur ;
- aucun nombre absent des faits fournis (pas de chiffre généré) ;
- aucune formulation déterministe, stéréotypée ou culpabilisante ;
- lisibilité adaptée à l'âge.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any

from ..referential.store import Referential

# Liste testée automatiquement (critère 10.2 « Non-déterminisme »).
FORBIDDEN_PATTERNS = [
    r"\btu es fait(e)? pour\b", r"\btu ne r[ée]ussiras (pas|jamais)\b", r"\btu n'?y arriveras (pas|jamais)\b",
    r"\baucune chance\b", r"\bimpossible pour toi\b", r"\btu n'?es pas capable\b", r"\bpas fait[e]? pour toi\b",
    r"\btrop (dur|difficile) pour toi\b", r"\btu dois absolument\b", r"\btu es nul(le)?\b", r"\bc'?est perdu\b",
    r"\bpas (un m[ée]tier|une fili[èe]re) pour (les )?(filles|gar[çc]ons|femmes|hommes)\b",
    r"\b(m[ée]tiers?|fili[èe]res?|[ée]tudes) (de|pour) (les )?(filles|gar[çc]ons|femmes|hommes)\b",
    r"\bcomme (toutes|tous) les (filles|gar[çc]ons)\b", r"\btu as rat[ée] ta vie\b", r"\bc'?est ta faute\b",
    r"\btu devrais avoir honte\b", r"\bseule voie possible\b", r"\bta seule option\b", r"\bgaranti[e]?s? (d'?[êe]tre )?admis\b",
]
_FORBIDDEN_RE = [re.compile(p, re.IGNORECASE) for p in FORBIDDEN_PATTERNS]
_NUM_RE = re.compile(r"(?<![\w-])(\d+(?:[.,]\d+)?)(?![\w-])")

MAX_WORDS_PER_SENTENCE = 30


def _norm(text: str) -> str:
    return unicodedata.normalize("NFC", text).replace("’", "'")


def forbidden_hits(text: str) -> list[str]:
    t = _norm(text)
    return [p.pattern for p in _FORBIDDEN_RE if p.search(t)]


def numbers_in(text: str) -> set[str]:
    return {m.replace(",", ".").rstrip("0").rstrip(".") if "." in m.replace(",", ".") else m
            for m in _NUM_RE.findall(_norm(text))}


def readability_issues(text: str) -> list[str]:
    issues = []
    for sentence in re.split(r"[.!?]\s+", text):
        n = len(sentence.split())
        if n > MAX_WORDS_PER_SENTENCE:
            issues.append(f"phrase trop longue ({n} mots)")
    return issues


def item_texts(item: dict[str, Any]) -> list[str]:
    return [*item.get("reasons", []), item.get("counterfactual", ""), *item.get("roadmap_6_12m", [])]


def validate_item_texts(candidate: dict[str, Any], reference: dict[str, Any]) -> list[str]:
    """Compare les textes proposés (LLM) aux faits de l'item calculé par le moteur."""
    errors: list[str] = []
    allowed = set()
    for t in item_texts(reference) + reference.get("prerequisites", []):
        allowed |= numbers_in(t)
    for t in item_texts(candidate):
        if not isinstance(t, str) or not t.strip():
            errors.append("texte vide")
            continue
        for hit in forbidden_hits(t):
            errors.append(f"formulation proscrite : {hit}")
        extra = numbers_in(t) - allowed
        if extra:
            errors.append(f"nombres absents des faits sources : {sorted(extra)}")
        errors.extend(readability_issues(t))
    if not 1 <= len(candidate.get("reasons", [])) <= 3:
        errors.append("il faut 1 à 3 raisons")
    return errors


def validate_recommendation(output: dict[str, Any], engine_result: dict[str, Any], ref: Referential) -> list[str]:
    errors: list[str] = []
    if output.get("referential_version") != ref.version:
        errors.append("version de référentiel incohérente")
    eng_items = {i["program_id"]: i for i in engine_result["items"]}
    out_ids = [i.get("program_id") for i in output.get("items", [])]
    if sorted(out_ids) != sorted(eng_items):
        errors.append("la liste des pistes diffère de celle du moteur")
    for item in output.get("items", []):
        pid = item.get("program_id")
        if pid not in ref.programs:
            errors.append(f"{pid} : formation absente du référentiel")
            continue
        ref_item = eng_items.get(pid)
        if ref_item is None:
            continue
        for key in ("fit_score", "admission_probability", "contributions", "category"):
            if item.get(key) != ref_item.get(key):
                errors.append(f"{pid} : {key} différent du moteur")
        occ = (item.get("ai_impact") or {}).get("occupation_id")
        if occ and occ not in ref.occupations:
            errors.append(f"{pid} : métier {occ} absent du référentiel")
        for b in item.get("bridges", []):
            if b not in ref.programs:
                errors.append(f"{pid} : passerelle {b} absente du référentiel")
        for c in item.get("citations", []):
            if c not in ref.sources:
                errors.append(f"{pid} : source {c} absente du référentiel")
        errors.extend(f"{pid} : {e}" for e in validate_item_texts(item, ref_item))
    for t in [output.get("disclaimer", "")] + [s["message"] for s in output.get("signals", [])]:
        errors.extend(f"formulation proscrite : {h}" for h in forbidden_hits(t))
    return errors
