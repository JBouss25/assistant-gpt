"""Configuration par variables d'environnement (aucun secret dans le code).

APP_ENV :
- dev / test : secrets générés localement si absents, codes d'invitation affichés, jeu de démo autorisé ;
- demo       : démonstration en ligne avec données fictives — secrets obligatoires, codes affichés, jeu de démo autorisé ;
- production : secrets obligatoires, codes jamais affichés (envoi par e-mail), jeu de démo interdit.
"""
from __future__ import annotations

import os
from pathlib import Path

ENVIRONMENTS = {"dev", "test", "demo", "production"}


class Settings:
    def __init__(self) -> None:
        self.env = os.getenv("APP_ENV", "dev")
        if self.env not in ENVIRONMENTS:
            raise RuntimeError(f"APP_ENV invalide : {self.env} (attendu : {', '.join(sorted(ENVIRONMENTS))})")
        self.secrets_required = self.env in ("demo", "production")
        self.database_url = os.getenv("DATABASE_URL", f"sqlite:///{Path(__file__).resolve().parent.parent / 'orientation.db'}")
        self.jwt_secret = os.getenv("JWT_SECRET", "")
        # Clé de chiffrement applicatif des champs sensibles (notes d'entretien, résultats psychométriques).
        self.field_key = os.getenv("FIELD_ENCRYPTION_KEY", "")
        if self.secrets_required and (len(self.jwt_secret) < 32 or not self.field_key):
            raise RuntimeError("JWT_SECRET (≥ 32 caractères) et FIELD_ENCRYPTION_KEY sont obligatoires en démo en ligne et en production")
        self.jwt_ttl_minutes = int(os.getenv("JWT_TTL_MINUTES", "120"))
        self.llm_provider = os.getenv("LLM_PROVIDER", "template")
        self.parental_consent_required = os.getenv("PARENTAL_CONSENT_REQUIRED", "true").lower() == "true"
        self.cors_origins = [o for o in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if o]
        self.k_anonymity = int(os.getenv("K_ANONYMITY", "10"))
        # Codes d'invitation parent affichés à l'écran : jamais en production.
        self.expose_dev_codes = self.env != "production"
        self.demo_seed_allowed = self.env != "production"
        # En PostgreSQL le schéma est géré par les migrations Alembic (alembic upgrade head).
        default_auto = "true" if self.database_url.startswith("sqlite") else "false"
        self.auto_create_schema = os.getenv("AUTO_CREATE_SCHEMA", default_auto).lower() == "true"
        # Envoi des invitations parent par e-mail (SMTP).
        self.public_url = os.getenv("PUBLIC_URL", "http://localhost:3000").rstrip("/")
        self.smtp_host = os.getenv("SMTP_HOST", "")
        self.smtp_port = int(os.getenv("SMTP_PORT", "587"))
        self.smtp_user = os.getenv("SMTP_USER", "")
        self.smtp_password = os.getenv("SMTP_PASSWORD", "")
        self.smtp_starttls = os.getenv("SMTP_STARTTLS", "true").lower() == "true"
        self.mail_from = os.getenv("MAIL_FROM", self.smtp_user)


settings = Settings()
