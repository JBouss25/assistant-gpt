"""Back-office du référentiel (M10) : brouillon → relecture → validation comité → publication versionnée."""
from __future__ import annotations

import copy
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import ReferentialVersion, User, get_db, utcnow
from ..referential.store import validate_document
from ..security import audit, require_roles
from ..services import invalidate_referential_cache

router = APIRouter(prefix="/referential", tags=["back-office"])
Editor = require_roles("editor", "committee")

# Transitions autorisées et rôle requis
TRANSITIONS = {
    ("draft", "review"): "editor",
    ("review", "draft"): "editor",
    ("review", "validated"): "committee",
    ("review", "draft_rejected"): "committee",
    ("validated", "published"): "committee",
}


def version_out(v: ReferentialVersion, with_content: bool = False) -> dict[str, Any]:
    out = {"version": v.version, "status": v.status, "created_at": v.created_at.isoformat(), "history": v.history,
           "counts": {"occupations": len(v.content.get("occupations", [])), "programs": len(v.content.get("programs", []))}}
    if with_content:
        out["content"] = v.content
        out["validation_errors"] = validate_document(v.content)
    return out


def _get(db: Session, version: str) -> ReferentialVersion:
    v = db.scalars(select(ReferentialVersion).where(ReferentialVersion.version == version)).first()
    if v is None:
        raise HTTPException(404, "Version introuvable")
    return v


@router.get("/versions")
def versions(user: User = Depends(Editor), db: Session = Depends(get_db)):
    return [version_out(v) for v in db.scalars(select(ReferentialVersion).order_by(ReferentialVersion.created_at.desc())).all()]


@router.get("/versions/{version}")
def get_version(version: str, user: User = Depends(Editor), db: Session = Depends(get_db)):
    return version_out(_get(db, version), with_content=True)


class DraftIn(BaseModel):
    version: str = Field(pattern=r"^[0-9]{4}\.[0-9]+[a-z0-9.-]*$")


@router.post("/drafts")
def create_draft(body: DraftIn, user: User = Depends(require_roles("editor")), db: Session = Depends(get_db)):
    if db.scalars(select(ReferentialVersion).where(ReferentialVersion.version == body.version)).first():
        raise HTTPException(409, "Cette version existe déjà")
    pub = db.scalars(select(ReferentialVersion).where(ReferentialVersion.status == "published").order_by(ReferentialVersion.created_at.desc())).first()
    content = copy.deepcopy(pub.content)
    content["meta"]["version"], content["meta"]["status"] = body.version, "draft"
    v = ReferentialVersion(version=body.version, status="draft", content=content, created_by=user.id,
                           history=[{"at": utcnow().isoformat(), "to": "draft", "by": user.id, "from_version": pub.version}])
    db.add(v)
    audit(db, user, "referential_draft_created", target=body.version)
    db.commit()
    return version_out(v)


@router.put("/versions/{version}/{collection}/{item_id}")
def upsert_item(version: str, collection: Literal["occupations", "programs"], item_id: str, item: dict[str, Any],
                user: User = Depends(require_roles("editor")), db: Session = Depends(get_db)):
    v = _get(db, version)
    if v.status != "draft":
        raise HTTPException(409, "Seul un brouillon est modifiable")
    if item.get("id") != item_id:
        raise HTTPException(422, "L'identifiant du corps doit correspondre à l'URL")
    content = copy.deepcopy(v.content)
    items = content[collection]
    idx = next((i for i, x in enumerate(items) if x["id"] == item_id), None)
    if idx is None:
        items.append(item)
    else:
        items[idx] = item
    v.content = content  # réaffectation pour que le JSON soit bien persisté
    audit(db, user, "referential_item_upserted", target=f"{version}:{collection}:{item_id}")
    db.commit()
    return {"ok": True, "validation_errors": validate_document(content)}


class TransitionIn(BaseModel):
    to: Literal["review", "draft", "validated", "published", "draft_rejected"]
    comment: str | None = None


@router.post("/versions/{version}/transition")
def transition(version: str, body: TransitionIn, user: User = Depends(Editor), db: Session = Depends(get_db)):
    v = _get(db, version)
    needed = TRANSITIONS.get((v.status, body.to))
    if needed is None:
        raise HTTPException(409, f"Transition {v.status} → {body.to} non autorisée")
    if user.role != needed:
        raise HTTPException(403, f"Cette étape est réservée au rôle « {needed} »")
    if body.to in ("validated", "published"):
        errors = validate_document(v.content)
        if errors:
            raise HTTPException(422, {"message": "Le référentiel contient des erreurs bloquantes", "errors": errors})
    new_status = "draft" if body.to == "draft_rejected" else body.to
    if new_status == "published":
        for old in db.scalars(select(ReferentialVersion).where(ReferentialVersion.status == "published")).all():
            old.status = "archived"
            old.history = old.history + [{"at": utcnow().isoformat(), "to": "archived", "by": user.id}]
        content = copy.deepcopy(v.content)
        content["meta"]["status"], content["meta"]["published_at"] = "published", utcnow().date().isoformat()
        v.content = content
    v.status = new_status
    v.history = v.history + [{"at": utcnow().isoformat(), "to": new_status, "by": user.id, "comment": body.comment}]
    audit(db, user, "referential_transition", target=version, detail={"to": new_status})
    db.commit()
    invalidate_referential_cache()  # publication effective sans redéploiement
    return version_out(v)
