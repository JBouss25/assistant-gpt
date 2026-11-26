"""Passerelle LLM multi-fournisseurs (section 7.3) et pipeline d'explication (7.1).

Le LLM rédige, il ne décide pas : il reçoit les faits calculés par le moteur
(profil pseudonymisé, pistes, scores, textes gabarits) et ne peut proposer que
des reformulations des champs textuels. Les scores ne lui sont jamais soumis
à réécriture : ils sont recopiés depuis le moteur puis vérifiés.

Au MVP, le fournisseur par défaut est `template` (déterministe, hors-ligne).
Un fournisseur réel s'ajoute en implémentant `LLMProvider.generate`.
"""
from __future__ import annotations

import copy
import hashlib
import json
from typing import Any, Protocol

from ..referential.store import Referential
from .validator import validate_recommendation

PROMPT_VERSION = "explain-fr-1.0.0"

SYSTEM_PROMPT = """Tu es l'assistant de rédaction d'une plateforme d'orientation pour adolescents.
Tu reformules UNIQUEMENT les champs `reasons`, `counterfactual` et `roadmap_6_12m` de chaque piste,
en tutoyant, avec des phrases courtes (moins de 25 mots), sans aucune formulation déterministe
(« tu es fait pour », « tu ne réussiras pas »...), sans stéréotype, sans culpabiliser.
Tu n'ajoutes AUCUN chiffre, AUCUN établissement, AUCUN métier qui ne figure pas dans les faits fournis.
Réponds strictement au format JSON du schéma fourni."""

OUTPUT_SCHEMA = {
    "type": "object",
    "required": ["items"],
    "properties": {"items": {"type": "array", "items": {
        "type": "object", "required": ["program_id", "reasons", "counterfactual", "roadmap_6_12m"],
        "properties": {
            "program_id": {"type": "string"},
            "reasons": {"type": "array", "items": {"type": "string"}, "minItems": 1, "maxItems": 3},
            "counterfactual": {"type": "string"},
            "roadmap_6_12m": {"type": "array", "items": {"type": "string"}, "maxItems": 5},
        }}}},
}


class LLMProvider(Protocol):
    name: str
    model: str

    def generate(self, system_prompt: str, payload: dict[str, Any], schema: dict[str, Any]) -> dict[str, Any]: ...


class TemplateProvider:
    """Fournisseur déterministe : renvoie les gabarits pré-rédigés du moteur."""
    name = "template"
    model = "gabarits-1.0.0"

    def generate(self, system_prompt: str, payload: dict[str, Any], schema: dict[str, Any]) -> dict[str, Any]:
        return {"items": [{"program_id": i["program_id"], "reasons": i["reasons"], "counterfactual": i["counterfactual"],
                           "roadmap_6_12m": i["roadmap_6_12m"]} for i in payload["items"]]}


_PROVIDERS: dict[str, LLMProvider] = {"template": TemplateProvider()}


def register_provider(provider: LLMProvider) -> None:
    _PROVIDERS[provider.name] = provider


def get_provider(name: str) -> LLMProvider:
    return _PROVIDERS.get(name, _PROVIDERS["template"])


def build_payload(engine_result: dict[str, Any]) -> dict[str, Any]:
    """Faits transmis au LLM : pseudonymisés, sans nom ni identifiant Massar / INE."""
    return {
        "student_ref": engine_result["student_ref"], "system": engine_result["system"], "level": engine_result["level"],
        "items": [{k: i[k] for k in ("program_id", "short", "category_label", "fit_score", "reasons", "counterfactual",
                                      "roadmap_6_12m", "prerequisites", "ai_impact")} for i in engine_result["items"]],
    }


def explain(engine_result: dict[str, Any], ref: Referential, provider_name: str = "template") -> tuple[dict[str, Any], dict[str, Any]]:
    """Retourne (sortie validée, trace). Une régénération, puis repli sur gabarits."""
    provider = get_provider(provider_name)
    payload = build_payload(engine_result)
    attempts: list[dict[str, Any]] = []
    final: dict[str, Any] | None = None
    for attempt in range(2):
        try:
            gen = provider.generate(SYSTEM_PROMPT, payload, OUTPUT_SCHEMA)
            candidate = copy.deepcopy(engine_result)
            by_id = {g["program_id"]: g for g in gen.get("items", [])}
            for item in candidate["items"]:
                g = by_id.get(item["program_id"])
                if g is None:
                    raise ValueError(f"piste manquante dans la sortie : {item['program_id']}")
                item["reasons"], item["counterfactual"], item["roadmap_6_12m"] = g["reasons"], g["counterfactual"], g["roadmap_6_12m"]
            errors = validate_recommendation(candidate, engine_result, ref)
        except Exception as exc:  # sortie non conforme au schéma, erreur réseau…
            candidate, errors = None, [f"erreur de génération : {exc}"]
        attempts.append({"attempt": attempt + 1, "errors": errors})
        if candidate is not None and not errors:
            final = candidate
            break
    status = "ok" if final is not None else "fallback_template"
    if final is None:
        final = copy.deepcopy(engine_result)  # gabarits déterministes, déjà validés par les tests
        fallback_errors = validate_recommendation(final, engine_result, ref)
        if fallback_errors:  # ne devrait jamais arriver : on bloque plutôt que d'afficher
            raise RuntimeError(f"gabarits invalides : {fallback_errors}")
    meta = {"provider": provider.name, "model": provider.model, "prompt_version": PROMPT_VERSION, "status": status, "attempts": attempts}
    final["explanation_meta"] = meta
    trace = {
        **meta,
        "payload_sha256": hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest(),
        "retrieved": sorted({c for i in engine_result["items"] for c in i["citations"]} | {i["program_id"] for i in engine_result["items"]}),
    }
    return final, trace
