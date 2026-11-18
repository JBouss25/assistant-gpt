from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..models.dropout_predictor import DropoutPredictor, StudentFeatures, PredictionResult
from ..services.feature_store import get_features, invalidate_features

router = APIRouter(prefix="/api/v1/predictions", tags=["predictions"])


# ── Dependency injection stubs (overridden in main.py lifespan) ──────────────

_predictor: DropoutPredictor | None = None
_db_conn = None
_redis_client = None


def get_predictor() -> DropoutPredictor:
    if _predictor is None:
        raise RuntimeError("Predictor not initialised")
    return _predictor


def get_db():
    return _db_conn


def get_redis():
    return _redis_client


def set_dependencies(predictor, db_conn, redis_client) -> None:
    global _predictor, _db_conn, _redis_client
    _predictor = predictor
    _db_conn = db_conn
    _redis_client = redis_client


# ── Schemas ───────────────────────────────────────────────────────────────────

class RiskResponse(BaseModel):
    eleve_id: str
    risk_score: float = Field(..., ge=0.0, le=1.0)
    risk_level: str
    top_factors: list[str]


class BatchRequest(BaseModel):
    eleve_ids: list[str] = Field(..., min_length=1, max_length=500)


class BatchResponse(BaseModel):
    results: list[RiskResponse]
    total: int


class FeaturesOverride(BaseModel):
    absences_30j: int = Field(..., ge=0)
    retards_30j: int = Field(..., ge=0)
    moyenne_generale: float = Field(..., ge=0.0, le=20.0)
    devoirs_non_rendus: int = Field(..., ge=0)
    factures_impayees: int = Field(..., ge=0)
    progression_lms: float = Field(..., ge=0.0, le=100.0)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/{eleve_id}", response_model=RiskResponse)
async def get_risk(
    eleve_id: str,
    predictor: DropoutPredictor = Depends(get_predictor),
    db=Depends(get_db),
    redis=Depends(get_redis),
):
    features = get_features(eleve_id, db, redis)
    if features is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Élève non trouvé")
    result = predictor.predict(eleve_id, features)
    return RiskResponse(**result.__dict__)


@router.post("/batch", response_model=BatchResponse)
async def batch_predict(
    body: BatchRequest,
    predictor: DropoutPredictor = Depends(get_predictor),
    db=Depends(get_db),
    redis=Depends(get_redis),
):
    results = []
    for eleve_id in body.eleve_ids:
        features = get_features(eleve_id, db, redis)
        if features is None:
            continue
        r = predictor.predict(eleve_id, features)
        results.append(RiskResponse(**r.__dict__))

    return BatchResponse(results=results, total=len(results))


@router.post("/{eleve_id}/simulate", response_model=RiskResponse)
async def simulate(
    eleve_id: str,
    override: FeaturesOverride,
    predictor: DropoutPredictor = Depends(get_predictor),
):
    """Simulate risk with manually provided features (no DB lookup). Useful for what-if scenarios."""
    features = StudentFeatures(**override.model_dump())
    result = predictor.predict(eleve_id, features)
    return RiskResponse(**result.__dict__)


@router.post("/{eleve_id}/invalidate", status_code=204)
async def invalidate_cache(
    eleve_id: str,
    redis=Depends(get_redis),
):
    invalidate_features(eleve_id, redis)
