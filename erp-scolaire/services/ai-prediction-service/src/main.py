import logging
from contextlib import asynccontextmanager

import psycopg2
import redis as redis_lib
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from .config import settings
from .models.dropout_predictor import DropoutPredictor
from .routes.predictions import router as predictions_router, set_dependencies
from .services.feature_store import invalidate_features
from .services.kafka_consumer import start_consumer

logging.basicConfig(level=settings.log_level.upper())
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Init predictor
    predictor = DropoutPredictor(
        model_path=settings.model_path,
        threshold_high=settings.risk_threshold_high,
        threshold_medium=settings.risk_threshold_medium,
    )
    predictor.load()

    # Init DB + Redis
    db_conn = psycopg2.connect(settings.database_url)
    redis_client = redis_lib.from_url(settings.redis_url, decode_responses=False)

    set_dependencies(predictor, db_conn, redis_client)

    # Start Kafka consumer (background thread)
    start_consumer(
        bootstrap_servers=settings.kafka_bootstrap_servers,
        group_id=settings.kafka_group_id,
        on_invalidate=lambda eleve_id: invalidate_features(eleve_id, redis_client),
    )

    logger.info("ai-prediction-service ready on port 3008")
    yield

    db_conn.close()
    redis_client.close()


app = FastAPI(
    title="AI Prediction Service",
    description="Dropout risk prediction — ERP Scolaire 360°",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins.split(",") if hasattr(settings, "allowed_origins") else ["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)

Instrumentator().instrument(app).expose(app)

app.include_router(predictions_router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "ai-prediction-service"}
