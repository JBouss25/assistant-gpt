"""
XGBoost dropout risk predictor.

Features:
  absences_30j         — absences last 30 days
  retards_30j          — late arrivals last 30 days
  moyenne_generale     — overall GPA (0–20 scale)
  devoirs_non_rendus   — missing homework count (last 30 days)
  factures_impayees    — unpaid invoices count
  progression_lms      — average LMS completion % (0–100)

Output: risk score 0.0–1.0 (higher = higher dropout risk)
"""

import os
import logging
from dataclasses import dataclass
from typing import Optional

import numpy as np
import joblib
import xgboost as xgb
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

logger = logging.getLogger(__name__)

FEATURE_NAMES = [
    "absences_30j",
    "retards_30j",
    "moyenne_generale",
    "devoirs_non_rendus",
    "factures_impayees",
    "progression_lms",
]


@dataclass
class StudentFeatures:
    absences_30j: int
    retards_30j: int
    moyenne_generale: float
    devoirs_non_rendus: int
    factures_impayees: int
    progression_lms: float

    def to_array(self) -> np.ndarray:
        return np.array(
            [
                self.absences_30j,
                self.retards_30j,
                self.moyenne_generale,
                self.devoirs_non_rendus,
                self.factures_impayees,
                self.progression_lms,
            ],
            dtype=np.float32,
        ).reshape(1, -1)


@dataclass
class PredictionResult:
    eleve_id: str
    risk_score: float
    risk_level: str  # "FAIBLE" | "MOYEN" | "ELEVE"
    top_factors: list[str]


def _risk_level(score: float, threshold_high: float, threshold_medium: float) -> str:
    if score >= threshold_high:
        return "ELEVE"
    if score >= threshold_medium:
        return "MOYEN"
    return "FAIBLE"


def _top_factors(features: StudentFeatures, score: float) -> list[str]:
    """Return the 2–3 most impactful risk factors in plain French."""
    factors = []
    if features.absences_30j >= 5:
        factors.append(f"{features.absences_30j} absences ce mois")
    if features.moyenne_generale < 10:
        factors.append(f"Moyenne générale {features.moyenne_generale:.1f}/20")
    if features.devoirs_non_rendus >= 3:
        factors.append(f"{features.devoirs_non_rendus} devoirs non rendus")
    if features.factures_impayees >= 2:
        factors.append(f"{features.factures_impayees} factures impayées")
    if features.progression_lms < 30:
        factors.append(f"Progression LMS {features.progression_lms:.0f}%")
    if features.retards_30j >= 4:
        factors.append(f"{features.retards_30j} retards ce mois")
    return factors[:3]


class DropoutPredictor:
    def __init__(self, model_path: str, threshold_high: float = 0.7, threshold_medium: float = 0.4):
        self.model_path = model_path
        self.threshold_high = threshold_high
        self.threshold_medium = threshold_medium
        self._pipeline: Optional[Pipeline] = None

    def load(self) -> None:
        if os.path.exists(self.model_path):
            self._pipeline = joblib.load(self.model_path)
            logger.info("Dropout model loaded from %s", self.model_path)
        else:
            logger.warning("Model not found at %s — using heuristic fallback", self.model_path)
            self._pipeline = None

    def _heuristic_score(self, features: StudentFeatures) -> float:
        """Rule-based fallback when no trained model exists."""
        score = 0.0
        score += min(features.absences_30j / 20.0, 0.30)
        score += min(features.retards_30j / 15.0, 0.10)
        score += max(0.0, (10.0 - features.moyenne_generale) / 10.0) * 0.25
        score += min(features.devoirs_non_rendus / 10.0, 0.15)
        score += min(features.factures_impayees / 5.0, 0.10)
        score += max(0.0, (50.0 - features.progression_lms) / 100.0) * 0.10
        return float(np.clip(score, 0.0, 1.0))

    def predict(self, eleve_id: str, features: StudentFeatures) -> PredictionResult:
        if self._pipeline is not None:
            arr = features.to_array()
            prob = float(self._pipeline.predict_proba(arr)[0][1])
        else:
            prob = self._heuristic_score(features)

        return PredictionResult(
            eleve_id=eleve_id,
            risk_score=round(prob, 4),
            risk_level=_risk_level(prob, self.threshold_high, self.threshold_medium),
            top_factors=_top_factors(features, prob),
        )

    def predict_batch(
        self, items: list[tuple[str, StudentFeatures]]
    ) -> list[PredictionResult]:
        return [self.predict(eid, feats) for eid, feats in items]

    def train_and_save(self, X: np.ndarray, y: np.ndarray) -> None:
        """Train on labelled data and persist. Called offline / by a training job."""
        pipeline = Pipeline(
            [
                ("scaler", StandardScaler()),
                (
                    "model",
                    xgb.XGBClassifier(
                        n_estimators=300,
                        max_depth=5,
                        learning_rate=0.05,
                        subsample=0.8,
                        colsample_bytree=0.8,
                        scale_pos_weight=3,  # class imbalance: few dropouts
                        eval_metric="auc",
                        random_state=42,
                        use_label_encoder=False,
                    ),
                ),
            ]
        )
        pipeline.fit(X, y)
        os.makedirs(os.path.dirname(self.model_path), exist_ok=True)
        joblib.dump(pipeline, self.model_path)
        self._pipeline = pipeline
        logger.info("Model trained and saved to %s", self.model_path)
