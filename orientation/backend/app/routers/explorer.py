"""Explorateur métiers et formations (M6) et calendrier (M11) — accessible à tous les rôles connectés."""
from __future__ import annotations

import unicodedata
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import User, get_db
from ..security import current_user
from ..services import active_referential

router = APIRouter(prefix="/explorer", tags=["explorateur"])


def _fold(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")


def occupation_card(o: dict[str, Any]) -> dict[str, Any]:
    out = o["outlook"]
    return {"id": o["id"], "name": o["name"], "sector": o["sector"], "family": o["family"], "holland": o["holland"],
            "avenir": out["avenir"], "transformation": out["transformation"]}


def program_card(p: dict[str, Any]) -> dict[str, Any]:
    return {"id": p["id"], "name": p["name"], "short": p["short"], "type": p["type"], "system": p["system"], "sector": p["sector"],
            "from_levels": p["from_levels"], "duration_years": p.get("duration_years"), "selective": bool(p.get("admission") and p["admission"].get("selective")),
            "avenir": p.get("avenir"), "cities": p.get("cities", [])}


@router.get("/occupations")
def occupations(q: str = "", sector: str = "", user: User = Depends(current_user), db: Session = Depends(get_db)):
    ref = active_referential(db)
    res = [o for o in ref.occupations.values() if (not q or _fold(q) in _fold(o["name"])) and (not sector or o["sector"] == sector)]
    return {"referential_version": ref.version, "items": [occupation_card(o) for o in sorted(res, key=lambda o: o["name"])]}


@router.get("/occupations/{oid}")
def occupation(oid: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ref = active_referential(db)
    if oid not in ref.occupations:
        raise HTTPException(404, "Métier introuvable")
    o = ref.occupation(oid)
    programs = [program_card(p) for p in ref.programs.values() if oid in p.get("occupations", [])]
    return {**{k: v for k, v in o.items() if k != "holland_vec"}, "programs": programs,
            "sources": [ref.sources[s] for s in o["outlook"]["source_ids"]], "referential_version": ref.version,
            "notice": ref.doc["meta"]["notice"]}


@router.get("/programs")
def programs(q: str = "", system: str = "", level: str = "", user: User = Depends(current_user), db: Session = Depends(get_db)):
    ref = active_referential(db)
    res = [p for p in ref.programs.values()
           if (not q or _fold(q) in _fold(p["name"] + " " + p["short"])) and (not system or p["system"] == system)
           and (not level or level in p["from_levels"])]
    return {"referential_version": ref.version, "items": [program_card(p) for p in sorted(res, key=lambda p: p["short"])]}


@router.get("/programs/{pid}")
def program(pid: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ref = active_referential(db)
    if pid not in ref.programs:
        raise HTTPException(404, "Formation introuvable")
    p = ref.program(pid)
    src_ids = [x for x in [(p.get("admission") or {}).get("source_id"), (p.get("cost") or {}).get("source_id")] if x]
    return {**{k: v for k, v in p.items() if k != "holland_vec"},
            "occupations_details": [occupation_card(ref.occupation(o)) for o in p.get("occupations", [])],
            "bridges_details": [program_card(ref.program(b)) for b in p["bridges"]],
            "leads_to_details": [program_card(ref.program(b)) for b in p["leads_to"]],
            "graph": ref.graph_neighbors(pid, depth=2),
            "sources": [ref.sources[s] for s in src_ids], "referential_version": ref.version, "notice": ref.doc["meta"]["notice"]}


@router.get("/calendar")
def calendar(system: str, level: str | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ref = active_referential(db)
    return [{**e, "source": ref.sources[e["source_id"]]} for e in ref.calendar(system, level)]


@router.get("/sources")
def sources(user: User = Depends(current_user), db: Session = Depends(get_db)):
    ref = active_referential(db)
    return {"referential_version": ref.version, "notice": ref.doc["meta"]["notice"], "sources": list(ref.sources.values())}
