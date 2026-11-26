"""Configuration par variables d'environnement (aucun secret dans le code)."""
from __future__ import annotations

import os
import secrets
from pathlib import Path


class Settings:
    def __init__(self) -> None:
        self.env = os.getenv("APP_ENV", "dev")
        self.database_url = os.getenv("DATABASE_URL", f"sqlite:///{Path(__file__).resolve().parent.parent / 'orientation.db'}")
        # En dev, un secret éphémère est généré ; en production il est obligatoire.
        self.jwt_secret = os.getenv("JWT_SECRET") or (secrets.token_urlsafe(32) if self.env != "production" else "")
        if self.env == "production" and not self.jwt_secret:
            raise RuntimeError("JWT_SECRET est obligatoire en production")
        self.jwt_ttl_minutes = int(os.getenv("JWT_TTL_MINUTES", "120"))
        # Clé de chiffrement applicatif des champs sensibles (notes d'entretien, résultats psychométriques).
        self.field_key = os.getenv("FIELD_ENCRYPTION_KEY", "")
        self.llm_provider = os.getenv("LLM_PROVIDER", "template")
        self.parental_consent_required = os.getenv("PARENTAL_CONSENT_REQUIRED", "true").lower() == "true"
        self.cors_origins = [o for o in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if o]
        self.k_anonymity = int(os.getenv("K_ANONYMITY", "10"))
        self.expose_dev_codes = self.env != "production"
        # En PostgreSQL le schéma est géré par les migrations Alembic (alembic upgrade head).
        default_auto = "true" if self.database_url.startswith("sqlite") else "false"
        self.auto_create_schema = os.getenv("AUTO_CREATE_SCHEMA", default_auto).lower() == "true"  # affiche les codes d'invitation parent en local


settings = Settings()
