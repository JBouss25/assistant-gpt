from __future__ import annotations

import secrets
import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import Consent, GuardianLink, StudentProfile, User, get_db, utcnow
from ..security import CONSENT_TEXT_VERSION, audit, create_token, current_user, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginIn(BaseModel):
    email: str
    password: str


class RegisterStudentIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    display_name: str = Field(min_length=1, max_length=100)


class RegisterParentIn(RegisterStudentIn):
    invite_code: str


def user_out(u: User, db: Session) -> dict:
    out = {"id": u.id, "email": u.email, "role": u.role, "display_name": u.display_name, "establishment_id": u.establishment_id}
    if u.role == "student":
        prof = db.get(StudentProfile, u.id)
        out["onboarded"] = bool(prof and prof.onboarded)
    return out


def new_pseudo() -> str:
    return "pseudo_" + secrets.token_hex(4)


# Limitation des tentatives (en mémoire, par IP + e-mail). En production multi-instances : Redis.
MAX_FAILURES, WINDOW_S = 10, 15 * 60
_failures: dict[str, list[float]] = defaultdict(list)


def _throttle_key(request: Request, email: str) -> str:
    return f"{request.client.host if request.client else '?'}|{email}"


@router.post("/login")
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    email = body.email.lower().strip()
    key = _throttle_key(request, email)
    now = time.monotonic()
    _failures[key] = [t for t in _failures[key] if now - t < WINDOW_S]
    if len(_failures[key]) >= MAX_FAILURES:
        raise HTTPException(429, "Trop de tentatives : réessayez dans quelques minutes")
    user = db.scalars(select(User).where(User.email == email)).first()
    if user is None or not verify_password(body.password, user.password_hash) or not user.active:
        _failures[key].append(now)
        audit(db, None, "login_failed")
        db.commit()
        raise HTTPException(401, "Identifiants incorrects")
    _failures.pop(key, None)
    audit(db, user, "login")
    db.commit()
    return {"token": create_token(user), "user": user_out(user, db)}


@router.post("/register")
def register_student(body: RegisterStudentIn, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.scalars(select(User).where(User.email == email)).first():
        raise HTTPException(409, "Un compte existe déjà avec cet e-mail")
    user = User(email=email, password_hash=hash_password(body.password), role="student", display_name=body.display_name, pseudo=new_pseudo())
    db.add(user)
    db.flush()
    db.add(StudentProfile(user_id=user.id))
    audit(db, user, "register_student")
    db.commit()
    return {"token": create_token(user), "user": user_out(user, db)}


@router.post("/register-parent")
def register_parent(body: RegisterParentIn, db: Session = Depends(get_db)):
    link = db.scalars(select(GuardianLink).where(GuardianLink.invite_code == body.invite_code, GuardianLink.status == "pending")).first()
    if link is None:
        raise HTTPException(404, "Code d'invitation invalide ou déjà utilisé")
    email = body.email.lower()
    if db.scalars(select(User).where(User.email == email)).first():
        raise HTTPException(409, "Un compte existe déjà : connectez-vous puis saisissez le code dans votre espace")
    parent = User(email=email, password_hash=hash_password(body.password), role="parent", display_name=body.display_name, pseudo=new_pseudo())
    db.add(parent)
    db.flush()
    activate_guardian(db, link, parent)
    db.commit()
    return {"token": create_token(parent), "user": user_out(parent, db)}


def activate_guardian(db: Session, link: GuardianLink, parent: User) -> None:
    link.guardian_id = parent.id
    link.status = "active"
    db.add(Consent(student_id=link.student_id, kind="parent_legal", scopes=["processing"], text_version=CONSENT_TEXT_VERSION,
                   granted_by=parent.id, granted_at=utcnow()))
    audit(db, parent, "parent_consent_granted", target=f"student:{link.student_id}")


@router.get("/me")
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return user_out(user, db)
