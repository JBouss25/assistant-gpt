"""Authentification, RBAC + contrôle par attributs, consentements, chiffrement, audit (sections 8.3, 10.2)."""
from __future__ import annotations

import base64
import datetime as dt
import hashlib
import hmac
import json
import os
import secrets
from pathlib import Path
from typing import Any

import jwt
from cryptography.fernet import Fernet
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import AuditLog, ClassGroup, Consent, GuardianLink, StudentProfile, User, get_db, utcnow
from .settings import settings

CONSENT_TEXT_VERSION = "2026-11-v1"
SHARE_SCOPES = ["profile", "pistes", "roadmap", "evidence", "grades", "assessment", "notes"]
DEFAULT_COUNSELOR_SCOPES = ["profile", "pistes", "roadmap", "evidence", "grades"]

# -- Secrets de développement persistés localement (jamais en production) ----------
_DEV_FILE = Path(__file__).resolve().parent.parent / ".dev_secrets.json"


def _dev_secret(name: str, factory) -> str:
    data = json.loads(_DEV_FILE.read_text()) if _DEV_FILE.exists() else {}
    if name not in data:
        data[name] = factory()
        _DEV_FILE.write_text(json.dumps(data))
        os.chmod(_DEV_FILE, 0o600)
    return data[name]


JWT_SECRET = os.getenv("JWT_SECRET") or (settings.jwt_secret if settings.env == "production"
                                          else _dev_secret("jwt", lambda: secrets.token_urlsafe(32)))
_FIELD_KEY = settings.field_key or (_dev_secret("field", lambda: Fernet.generate_key().decode()) if settings.env != "production" else "")
if not _FIELD_KEY:
    raise RuntimeError("FIELD_ENCRYPTION_KEY est obligatoire en production")
_fernet = Fernet(_FIELD_KEY.encode())


def encrypt(obj: Any) -> str:
    return _fernet.encrypt(json.dumps(obj, ensure_ascii=False).encode()).decode()


def decrypt(token: str) -> Any:
    return json.loads(_fernet.decrypt(token.encode()).decode())


# -- Mots de passe et jetons ---------------------------------------------------
PBKDF2_ITERATIONS = int(os.getenv("PBKDF2_ITERATIONS", "310000"))  # abaissé uniquement dans les tests


def hash_password(pw: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2${PBKDF2_ITERATIONS}$" + base64.b64encode(salt).decode() + "$" + base64.b64encode(digest).decode()


def verify_password(pw: str, stored: str) -> bool:
    try:
        _, iters, salt_b64, digest_b64 = stored.split("$")
        digest = hashlib.pbkdf2_hmac("sha256", pw.encode(), base64.b64decode(salt_b64), int(iters))
        return hmac.compare_digest(digest, base64.b64decode(digest_b64))
    except ValueError:
        return False


def create_token(user: User) -> str:
    now = dt.datetime.now(dt.timezone.utc)
    payload = {"sub": str(user.id), "role": user.role, "iat": now, "exp": now + dt.timedelta(minutes=settings.jwt_ttl_minutes)}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


_bearer = HTTPBearer(auto_error=False)


def current_user(creds: HTTPAuthorizationCredentials | None = Depends(_bearer), db: Session = Depends(get_db)) -> User:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentification requise")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Jeton invalide ou expiré")
    user = db.get(User, int(payload["sub"]))
    if user is None or not user.active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Compte inactif")
    return user


def require_roles(*roles: str):
    def dep(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Accès refusé pour ce rôle")
        return user
    return dep


# -- Consentements ---------------------------------------------------------------
def active_consent(db: Session, student_id: int, kind: str) -> Consent | None:
    return db.scalars(select(Consent).where(Consent.student_id == student_id, Consent.kind == kind, Consent.revoked_at.is_(None))
                      .order_by(Consent.granted_at.desc())).first()


def student_establishment(db: Session, student_id: int) -> int | None:
    prof = db.get(StudentProfile, student_id)
    if prof and prof.class_group_id:
        cg = db.get(ClassGroup, prof.class_group_id)
        return cg.establishment_id if cg else None
    u = db.get(User, student_id)
    return u.establishment_id if u else None


def can_access_student(db: Session, user: User, student_id: int, scope: str) -> bool:
    """Moindre privilège : l'élève lui-même ; le parent selon les scopes partagés ;
    le conseiller / l'admin uniquement pour les élèves de son établissement et selon les scopes."""
    student = db.get(User, student_id)
    if student is None or student.role != "student":
        return False
    if user.role == "student":
        return user.id == student_id
    if user.role == "parent":
        link = db.scalars(select(GuardianLink).where(GuardianLink.guardian_id == user.id, GuardianLink.student_id == student_id,
                                                     GuardianLink.status == "active")).first()
        if link is None:
            return False
        if settings.parental_consent_required and active_consent(db, student_id, "parent_legal") is None:
            return False
        share = active_consent(db, student_id, "share_parent")
        return share is not None and scope in share.scopes
    if user.role in ("counselor", "school_admin"):
        if user.establishment_id is None or student_establishment(db, student_id) != user.establishment_id:
            return False
        if scope == "cohort":
            return True
        share = active_consent(db, student_id, "share_counselor")
        scopes = share.scopes if share else []
        return scope in scopes
    return False


def ensure_access(db: Session, user: User, student_id: int, scope: str) -> None:
    if not can_access_student(db, user, student_id, scope):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Accès non autorisé à ces données")


# -- Audit -------------------------------------------------------------------------
def audit(db: Session, user: User | None, action: str, target: str | None = None, detail: dict[str, Any] | None = None,
          establishment_id: int | None = None) -> None:
    db.add(AuditLog(at=utcnow(), actor_id=user.id if user else None, actor_role=user.role if user else None, action=action,
                    target=target, detail=detail or {}, establishment_id=establishment_id if establishment_id is not None
                    else (user.establishment_id if user else None)))


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "?"
