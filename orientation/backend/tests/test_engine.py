"""Tests du moteur : cas de la section 2.3 et critères d'acceptation 10.2 côté calcul."""
import copy
import random

import pytest

from app import eval_bench
from app.engine.model import StudentInput
from app.engine.recommend import Engine, balance_check
from app.genai.gateway import explain, register_provider
from app.genai.validator import forbidden_hits, validate_recommendation
from app.personas import ADAM, LEA, YASMINE
from app.referential.store import Referential, load_seed, seed_referential, validate_document


@pytest.fixture(scope="module")
def ref():
    return seed_referential()


@pytest.fixture(scope="module")
def engine(ref):
    return Engine(ref)


def reco(engine, persona, **changes):
    d = copy.deepcopy(persona)
    d.update(changes)
    return engine.recommend(StudentInput.from_dict(d))


def by_cat(result):
    out = {"A": [], "B": [], "C": []}
    for i in result["items"]:
        out[i["category"]].append(i["program_id"])
    return out


# -- Cas concrets de la section 2.3 ------------------------------------------------------
def test_yasmine_tronc_commun(engine):
    r = reco(engine, YASMINE)
    first = r["items"][0]
    assert first["program_id"] == "TRK-MA-1BAC-SE"
    assert first["fit_score"]["label"] == "forte"
    # Débouchés affichés : médecine (A), soins infirmiers (B), biologie / bio-informatique (C)
    assert {"PRG-MA-FMP-MED", "PRG-MA-ISPITS-INF", "PRG-MA-FST-BCG-008"} <= set(first["leads_to"])
    assert any("14 en maths" in step for step in first["roadmap_6_12m"]), "plan 6 mois : remonter les maths à 14"
    sm = next(i for i in r["items"] if i["program_id"] == "TRK-MA-1BAC-SM")
    assert sm["category"] == "A" and "maths" in sm["counterfactual"]


def test_adam_2bac_pc(engine):
    r = reco(engine, ADAM)
    cats = by_cat(r)
    assert set(cats["A"]) & {"PRG-MA-ENSAM-011", "PRG-MA-ENSA-021"}
    assert set(cats["B"]) & {"PRG-MA-EST-ENR-014", "PRG-MA-BTS-MI-007"}
    # Voies courtes : aucune impasse, passerelles affichées
    short = [i for i in r["items"] if i["program_id"] in ("PRG-MA-EST-ENR-014", "PRG-MA-BTS-MI-007", "PRG-MA-OFPPT-ENR-003")]
    assert short and all(i["bridges"] for i in short)
    # Métiers +5 ans : technicien solaire, tâches de diagnostic augmentées, intervention terrain humaine
    est = next(i for i in r["items"] if i["program_id"] == "PRG-MA-EST-ENR-014")
    assert est["ai_impact"]["occupation_id"] == "OCC-ENR-TECH-03"
    assert "Diagnostic de pannes assisté par IA" in est["ai_impact"]["augmented"]
    assert "Intervention sur site et sécurité" in est["ai_impact"]["human_core"]


def test_lea_terminale_mission(engine):
    r = reco(engine, LEA)
    cats = by_cat(r)
    assert "PRG-FR-DLID-105" in cats["A"]
    assert "PRG-FR-BUTINFO-104" in cats["B"]
    assert "PRG-FR-MIASHS-106" in cats["C"]
    dlid = next(i for i in r["items"] if i["program_id"] == "PRG-FR-DLID-105")
    assert "Évaluer l'accessibilité et l'éthique d'un service" in dlid["ai_impact"]["human_core"]


# -- Critère « Recommandation complète » -----------------------------------------------------
def test_complete_recommendation_2bac_pc(engine, ref):
    r = reco(engine, ADAM)
    assert 5 <= len(r["items"]) <= 7
    assert {"A", "B", "C"} <= {i["category"] for i in r["items"]}
    for i in r["items"]:
        assert i["fit_score"]["low"] <= i["fit_score"]["value"] <= i["fit_score"]["high"]
        assert len(i["reasons"]) == 3
        assert i["prerequisites"]
        assert i["ai_impact"]["automated"] or i["ai_impact"]["augmented"] or i["ai_impact"]["human_core"]
        assert i["citations"] and all(c in ref.sources and ref.sources[c]["as_of"] for c in i["citations"])
        for o in i["occupations"]:
            assert o["as_of"] and o["source_ids"]


# -- Explicabilité ---------------------------------------------------------------------------
@pytest.mark.parametrize("persona", [YASMINE, ADAM, LEA])
def test_contributions_sum_to_score(engine, persona):
    for i in reco(engine, persona)["items"]:
        assert abs(sum(i["contribution_points"].values()) - i["fit_score"]["value"]) <= 0.5
        assert abs(sum(i["contributions"].values()) - 1.0) <= 0.02
        assert i["counterfactual"]


def test_reasons_are_truthful(engine):
    """Une raison « intérêts proches » n'est jamais affichée si la composante intérêts est faible."""
    for case in eval_bench.bench_cases(120):
        r = engine.recommend(StudentInput.from_dict(case))
        for i in r["items"]:
            if any("est proche de celui de cette piste" in t for t in i["reasons"]):
                assert i["components"]["interests"] >= 65


# -- Incertitude et traçabilité ----------------------------------------------------------------------
def test_monte_carlo_is_reproducible(engine):
    assert reco(engine, ADAM) == reco(engine, ADAM)


def test_uncertainty_widens_with_measurement_error(engine):
    precise = copy.deepcopy(ADAM)
    vague = copy.deepcopy(ADAM)
    for d in "RIASEC":
        precise["riasec"][d]["se"] = 0.02
        vague["riasec"][d]["se"] = 0.3
    width = lambda r: sum(i["fit_score"]["high"] - i["fit_score"]["low"] for i in r["items"])
    assert width(engine.recommend(StudentInput.from_dict(vague))) > width(engine.recommend(StudentInput.from_dict(precise)))


# -- Équité ---------------------------------------------------------------------------------------
def test_sensitive_variables_are_not_inputs():
    fields = set(StudentInput.__dataclass_fields__)
    assert not fields & {"gender", "genre", "sexe", "region_origine", "revenu", "income"}
    # même si un appelant les transmet, elles sont ignorées
    d = copy.deepcopy(ADAM)
    d["gender"] = "F"
    d["income"] = 1000
    assert StudentInput.from_dict(d).to_dict() == StudentInput.from_dict(ADAM).to_dict()


# -- Garde-fous : jamais d'exclusion par les notes ni par le budget ----------------------------------------
def test_no_exclusion_by_grades_or_budget(engine):
    weak = copy.deepcopy(ADAM)
    weak["grades"] = {s: [6, 6, 6] for s in weak["grades"]}
    weak["constraints"] = {"budget_annual_mad": 0, "mobility": "local", "city": "Meknès"}
    r = engine.recommend(StudentInput.from_dict(weak))
    assert all("filière" in b["message"] for b in r["blocked"]), "seuls les prérequis réglementaires excluent"
    assert len(r["items"]) >= 5


def test_blocked_programs_show_bridges(engine):
    r = reco(engine, LEA)
    med = next(b for b in r["blocked"] if b["program_id"] == "PRG-MA-FMP-MED")
    assert "passerelles" in med["message"] and med["bridges"]


def test_autocensure_signal(engine):
    d = copy.deepcopy(ADAM)
    d["constraints"] = {**d["constraints"], "excluded_domains": ["energie"]}
    d["self_efficacy"] = {"maths_sciences": {"value": 0.2, "se": 0.1}}
    d["grades"] = {**d["grades"], "maths": [15, 15, 15]}
    r = engine.recommend(StudentInput.from_dict(d))
    assert all(i["sector"] != "energie" for i in r["items"])
    assert {s["type"] for s in r["signals"]} == {"autocensure"} and len(r["signals"]) == 2


def test_balance_check():
    assert any("sécurisée" in m for m in balance_check(["A", "B"]))
    assert balance_check(["A", "B", "C"]) == []


# -- Pipeline IA : non-déterminisme, fidélité factuelle, repli -----------------------------------------
def test_bench_300_cases():
    stats = eval_bench.run("template", n_draws=50)
    assert stats["cases"] == 300
    assert stats["forbidden"] == 0
    assert stats["validation_errors"] == 0
    assert stats["factual_mismatch"] == 0
    assert stats["fallbacks"] == 0


def test_forbidden_phrases_detected():
    assert forbidden_hits("Franchement, tu es fait pour être ingénieur.")
    assert forbidden_hits("Tu ne réussiras pas en médecine.")
    assert forbidden_hits("C'est un métier pour les garçons.")
    assert not forbidden_hits("Cette piste rejoint ton profil d'intérêts.")


class _Hallucinating:
    name, model = "hallucinating", "test"

    def generate(self, system_prompt, payload, schema):
        return {"items": [{"program_id": i["program_id"], "reasons": ["Le seuil d'admission était de 17,25 l'an dernier."],
                           "counterfactual": i["counterfactual"], "roadmap_6_12m": i["roadmap_6_12m"]} for i in payload["items"]]}


class _Broken:
    name, model = "broken", "test"

    def generate(self, system_prompt, payload, schema):
        raise TimeoutError("fournisseur indisponible")


@pytest.mark.parametrize("provider", [_Hallucinating(), _Broken()])
def test_invalid_llm_output_falls_back_to_templates(engine, ref, provider):
    register_provider(provider)
    result = reco(engine, ADAM)
    final, trace = explain(result, ref, provider.name)
    assert trace["status"] == "fallback_template" and len(trace["attempts"]) == 2
    assert final["items"] == result["items"]
    assert validate_recommendation(final, result, ref) == []


def test_validator_blocks_unknown_ids_and_altered_scores(engine, ref):
    result = reco(engine, ADAM)
    tampered = copy.deepcopy(result)
    tampered["items"][0]["fit_score"]["value"] += 5
    tampered["items"][1]["bridges"] = ["PRG-INVENTE-999"]
    errors = validate_recommendation(tampered, result, ref)
    assert any("fit_score" in e for e in errors) and any("PRG-INVENTE-999" in e for e in errors)


# -- Référentiel -------------------------------------------------------------------------------------
def test_seed_referential_is_valid():
    doc = load_seed()
    assert validate_document(doc) == []
    ref = Referential.from_document(doc)
    for o in ref.occupations.values():
        out = o["outlook"]
        w = out["weights"]
        expected = w["D"] * out["D"] + w["H"] * out["H"] + w["A"] * out["A"] + w["M"] * out["M"]
        assert abs(out["avenir"] - expected) < 0.1


def test_referential_validation_catches_errors():
    doc = load_seed()
    doc["occupations"][0]["tasks"][0]["share"] = 0.9
    doc["programs"][0]["occupations"].append("OCC-INCONNU")
    errors = validate_document(doc)
    assert any("somme des parts" in e for e in errors) and any("OCC-INCONNU" in e for e in errors)


def test_performance_engine(engine):
    import time
    t = time.perf_counter()
    for _ in range(10):
        reco(engine, ADAM)
    assert (time.perf_counter() - t) / 10 < 0.5
