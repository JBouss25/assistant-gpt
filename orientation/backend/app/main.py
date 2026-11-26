"""API Orientation 4.0 — monolithe modulaire (section 8)."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .db import SessionLocal, init_db
from .engine import config as cfg
from .routers import auth, backoffice, counselor, explorer, meta, parent, student
from .services import active_referential, ensure_seed_referential
from .settings import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    with SessionLocal() as db:
        ensure_seed_referential(db)
    yield


app = FastAPI(title="Orientation 4.0 — API", version="1.0.0", lifespan=lifespan,
              description="Plateforme d'aide à l'orientation (Maroc & mission française). Le moteur propose, l'élève décide.")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=False,
                   allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"], allow_headers=["Authorization", "Content-Type"])


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Cache-Control"] = "no-store"
    return response


API = "/api/v1"
for r in (auth.router, meta.router, student.router, explorer.router, parent.router, counselor.router, backoffice.router):
    app.include_router(r, prefix=API)


@app.get(API + "/health")
def health():
    with SessionLocal() as db:
        ref = active_referential(db)
    return {"status": "ok", "model_version": cfg.MODEL_VERSION, "weights_version": cfg.WEIGHTS_VERSION,
            "referential_version": ref.version, "llm_provider": settings.llm_provider}
