import pytest
import numpy as np

from src.models.dropout_predictor import (
    DropoutPredictor,
    StudentFeatures,
    _risk_level,
    _top_factors,
)


def make_features(**kwargs):
    defaults = dict(
        absences_30j=0,
        retards_30j=0,
        moyenne_generale=14.0,
        devoirs_non_rendus=0,
        factures_impayees=0,
        progression_lms=80.0,
    )
    defaults.update(kwargs)
    return StudentFeatures(**defaults)


# ── _risk_level ───────────────────────────────────────────────────────────────

def test_risk_level_faible():
    assert _risk_level(0.2, 0.7, 0.4) == "FAIBLE"


def test_risk_level_moyen():
    assert _risk_level(0.5, 0.7, 0.4) == "MOYEN"


def test_risk_level_eleve():
    assert _risk_level(0.8, 0.7, 0.4) == "ELEVE"


def test_risk_level_boundary_medium():
    assert _risk_level(0.4, 0.7, 0.4) == "MOYEN"


def test_risk_level_boundary_high():
    assert _risk_level(0.7, 0.7, 0.4) == "ELEVE"


# ── _top_factors ──────────────────────────────────────────────────────────────

def test_top_factors_all_good():
    f = make_features()
    factors = _top_factors(f, 0.1)
    assert factors == []


def test_top_factors_absences():
    f = make_features(absences_30j=7)
    factors = _top_factors(f, 0.4)
    assert any("absences" in factor for factor in factors)


def test_top_factors_low_grade():
    f = make_features(moyenne_generale=7.0)
    factors = _top_factors(f, 0.5)
    assert any("Moyenne" in factor for factor in factors)


def test_top_factors_max_three():
    f = make_features(
        absences_30j=10,
        moyenne_generale=5.0,
        devoirs_non_rendus=5,
        factures_impayees=3,
        progression_lms=10.0,
    )
    factors = _top_factors(f, 0.9)
    assert len(factors) <= 3


# ── StudentFeatures.to_array ──────────────────────────────────────────────────

def test_to_array_shape():
    f = make_features(absences_30j=3, moyenne_generale=12.5)
    arr = f.to_array()
    assert arr.shape == (1, 6)
    assert arr[0, 0] == pytest.approx(3.0)
    assert arr[0, 2] == pytest.approx(12.5)


# ── DropoutPredictor heuristic ────────────────────────────────────────────────

@pytest.fixture
def predictor(tmp_path):
    p = DropoutPredictor(
        model_path=str(tmp_path / "nonexistent_model.joblib"),
        threshold_high=0.7,
        threshold_medium=0.4,
    )
    p.load()  # falls back to heuristic
    return p


def test_heuristic_low_risk(predictor):
    f = make_features()
    result = predictor.predict("eleve-001", f)
    assert result.risk_score < 0.4
    assert result.risk_level == "FAIBLE"


def test_heuristic_high_risk(predictor):
    f = make_features(
        absences_30j=15,
        retards_30j=10,
        moyenne_generale=5.0,
        devoirs_non_rendus=8,
        factures_impayees=4,
        progression_lms=5.0,
    )
    result = predictor.predict("eleve-002", f)
    assert result.risk_score >= 0.7
    assert result.risk_level == "ELEVE"


def test_heuristic_score_bounded(predictor):
    f = make_features(
        absences_30j=100,
        retards_30j=100,
        moyenne_generale=0.0,
        devoirs_non_rendus=100,
        factures_impayees=100,
        progression_lms=0.0,
    )
    result = predictor.predict("eleve-003", f)
    assert 0.0 <= result.risk_score <= 1.0


def test_predict_batch(predictor):
    items = [
        ("eleve-A", make_features()),
        ("eleve-B", make_features(absences_30j=12, moyenne_generale=6.0)),
    ]
    results = predictor.predict_batch(items)
    assert len(results) == 2
    assert results[0].risk_score < results[1].risk_score


# ── Train and predict ─────────────────────────────────────────────────────────

def test_train_and_predict(tmp_path):
    model_path = str(tmp_path / "model.joblib")
    predictor = DropoutPredictor(model_path=model_path)

    # Synthetic training data
    rng = np.random.default_rng(42)
    n = 200
    X = rng.uniform([0, 0, 0, 0, 0, 0], [20, 15, 20, 10, 5, 100], size=(n, 6)).astype(np.float32)
    y = (X[:, 0] > 10).astype(int)  # high absences → dropout

    predictor.train_and_save(X, y)
    predictor.load()

    f = make_features(absences_30j=15)
    result = predictor.predict("eleve-trained", f)
    assert result.eleve_id == "eleve-trained"
    assert 0.0 <= result.risk_score <= 1.0
