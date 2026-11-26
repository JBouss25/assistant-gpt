"""Modèle de données (section 8.2) — SQLAlchemy 2, compatible PostgreSQL et SQLite (tests locaux)."""
from __future__ import annotations

import datetime as dt
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from .settings import settings


def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)


class Base(DeclarativeBase):
    type_annotation_map = {dict[str, Any]: JSON, list[Any]: JSON}


# -- Identité et organisation ---------------------------------------------
class Establishment(Base):
    __tablename__ = "establishment"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    system: Mapped[str] = mapped_column(String(2))           # MA | FR
    city: Mapped[str] = mapped_column(String(100))
    aref: Mapped[str | None] = mapped_column(String(100))    # AREF ou académie


class ClassGroup(Base):
    __tablename__ = "class_group"
    id: Mapped[int] = mapped_column(primary_key=True)
    establishment_id: Mapped[int] = mapped_column(ForeignKey("establishment.id"))
    name: Mapped[str] = mapped_column(String(100))
    level: Mapped[str] = mapped_column(String(20))


class User(Base):
    __tablename__ = "user_account"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(300))
    role: Mapped[str] = mapped_column(String(20))            # student, parent, counselor, school_admin, editor, committee
    display_name: Mapped[str] = mapped_column(String(200))
    establishment_id: Mapped[int | None] = mapped_column(ForeignKey("establishment.id"))
    pseudo: Mapped[str] = mapped_column(String(40), unique=True)  # identifiant pseudonyme transmis au moteur / LLM
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class GuardianLink(Base):
    __tablename__ = "guardian_link"
    id: Mapped[int] = mapped_column(primary_key=True)
    guardian_id: Mapped[int | None] = mapped_column(ForeignKey("user_account.id"))
    student_id: Mapped[int] = mapped_column(ForeignKey("user_account.id"))
    invite_code: Mapped[str] = mapped_column(String(40), unique=True)
    invite_contact: Mapped[str | None] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | active | revoked
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow)


class Consent(Base):
    """Consentements versionnés et révocables.

    kind : student_terms (élève), parent_legal (représentant légal d'un mineur),
           share_parent / share_counselor (partage granulaire, scopes).
    """
    __tablename__ = "consent"
    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("user_account.id"), index=True)
    kind: Mapped[str] = mapped_column(String(30))
    scopes: Mapped[list[Any]] = mapped_column(JSON, default=list)
    text_version: Mapped[str] = mapped_column(String(20))
    granted_by: Mapped[int] = mapped_column(ForeignKey("user_account.id"))
    granted_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow)
    revoked_at: Mapped[dt.datetime | None] = mapped_column(DateTime)


# -- Profil élève -----------------------------------------------------------
class StudentProfile(Base):
    __tablename__ = "student_profile"
    user_id: Mapped[int] = mapped_column(ForeignKey("user_account.id"), primary_key=True)
    system: Mapped[str | None] = mapped_column(String(2))
    level: Mapped[str | None] = mapped_column(String(20))
    stream: Mapped[str | None] = mapped_column(String(20))
    fr_specialties: Mapped[list[Any]] = mapped_column(JSON, default=list)
    language: Mapped[str] = mapped_column(String(5), default="fr")
    class_group_id: Mapped[int | None] = mapped_column(ForeignKey("class_group.id"))
    city: Mapped[str | None] = mapped_column(String(100))
    # Variables sensibles : audits d'équité et information sur les aides UNIQUEMENT, jamais transmises au moteur.
    gender: Mapped[str | None] = mapped_column(String(10))
    constraints: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    certainty_history: Mapped[list[Any]] = mapped_column(JSON, default=list)  # [{"at": iso, "value": 0..10}]
    onboarded: Mapped[bool] = mapped_column(Boolean, default=False)


class GradeRecord(Base):
    __tablename__ = "grade_record"
    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("user_account.id"), index=True)
    subject: Mapped[str] = mapped_column(String(20))
    period: Mapped[str] = mapped_column(String(20))   # T1, T2, T3, S1, examen_regional, brevet…
    value: Mapped[float] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(20), default="eleve")   # eleve | import | etablissement
    verified: Mapped[bool] = mapped_column(Boolean, default=False)


# -- Psychométrie -------------------------------------------------------------
class AssessmentSession(Base):
    __tablename__ = "assessment_session"
    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("user_account.id"), index=True)
    instrument_version: Mapped[str] = mapped_column(String(30))
    responses_enc: Mapped[str] = mapped_column(Text)         # chiffré (champ sensible)
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft | completed
    started_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow)
    completed_at: Mapped[dt.datetime | None] = mapped_column(DateTime)


class TraitEstimate(Base):
    __tablename__ = "trait_estimate"
    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("assessment_session.id"))
    student_id: Mapped[int] = mapped_column(ForeignKey("user_account.id"), index=True)
    traits_enc: Mapped[str] = mapped_column(Text)            # chiffré (valeurs + erreurs standard)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow)


# -- Recommandation ---------------------------------------------------------
class RecommendationRun(Base):
    __tablename__ = "recommendation_run"
    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("user_account.id"), index=True)
    model_version: Mapped[str] = mapped_column(String(30))
    weights_version: Mapped[str] = mapped_column(String(30))
    referential_version: Mapped[str] = mapped_column(String(30))
    seed: Mapped[str] = mapped_column(String(30))
    input_snapshot: Mapped[dict[str, Any]] = mapped_column(JSON)
    output: Mapped[dict[str, Any]] = mapped_column(JSON)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow)


class LLMTrace(Base):
    __tablename__ = "llm_trace"
    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("recommendation_run.id"))
    data: Mapped[dict[str, Any]] = mapped_column(JSON)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow)


# -- Progression ------------------------------------------------------------
class Milestone(Base):
    __tablename__ = "milestone"
    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("user_account.id"), index=True)
    label: Mapped[str] = mapped_column(String(300))
    program_id: Mapped[str | None] = mapped_column(String(40))
    due_date: Mapped[dt.date | None] = mapped_column()
    status: Mapped[str] = mapped_column(String(20), default="todo")  # todo | doing | done
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow)


class EvidenceItem(Base):
    __tablename__ = "evidence"
    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("user_account.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    type: Mapped[str] = mapped_column(String(20))
    domains: Mapped[list[Any]] = mapped_column(JSON, default=list)
    description: Mapped[str | None] = mapped_column(Text)
    url: Mapped[str | None] = mapped_column(String(500))
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    verified_by: Mapped[int | None] = mapped_column(ForeignKey("user_account.id"))
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow)


class Wishlist(Base):
    __tablename__ = "wishlist"
    student_id: Mapped[int] = mapped_column(ForeignKey("user_account.id"), primary_key=True)
    columns: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)   # {"A": [...], "B": [...], "C": [...]}
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow)


class CounselorNote(Base):
    __tablename__ = "counselor_note"
    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("user_account.id"), index=True)
    counselor_id: Mapped[int] = mapped_column(ForeignKey("user_account.id"))
    text_enc: Mapped[str] = mapped_column(Text)              # chiffré
    visibility: Mapped[str] = mapped_column(String(20), default="counselor")  # counselor | student | parent
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow)


class Alert(Base):
    __tablename__ = "alert"
    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("user_account.id"), index=True)
    establishment_id: Mapped[int | None] = mapped_column(ForeignKey("establishment.id"), index=True)
    type: Mapped[str] = mapped_column(String(30))
    priority: Mapped[int] = mapped_column(Integer, default=2)   # 1 haute, 2 moyenne, 3 basse
    message: Mapped[str] = mapped_column(String(500))
    data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    suggested_action: Mapped[str | None] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), default="open")   # open | in_progress | closed
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow)


# -- Référentiel versionné et traçabilité ---------------------------------------
class ReferentialVersion(Base):
    __tablename__ = "referential_version"
    id: Mapped[int] = mapped_column(primary_key=True)
    version: Mapped[str] = mapped_column(String(30), unique=True)
    status: Mapped[str] = mapped_column(String(20))   # draft | review | validated | published | archived
    content: Mapped[dict[str, Any]] = mapped_column(JSON)
    history: Mapped[list[Any]] = mapped_column(JSON, default=list)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("user_account.id"))
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow)


class AuditLog(Base):
    """Journal immuable : aucune route ne permet de le modifier ; les UPDATE / DELETE sont refusés."""
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow, index=True)
    actor_id: Mapped[int | None] = mapped_column(Integer)
    actor_role: Mapped[str | None] = mapped_column(String(20))
    action: Mapped[str] = mapped_column(String(60))
    target: Mapped[str | None] = mapped_column(String(100))
    establishment_id: Mapped[int | None] = mapped_column(Integer, index=True)
    detail: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


@event.listens_for(AuditLog, "before_update")
@event.listens_for(AuditLog, "before_delete")
def _audit_immutable(mapper, connection, target):  # pragma: no cover - garde-fou
    raise RuntimeError("audit_log est en écriture seule")


# -- Session ----------------------------------------------------------------
_connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=_connect_args, future=True, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def init_db(bind=None) -> None:
    Base.metadata.create_all(bind or engine)


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
