"""Référentiel versionné Compétences ↔ Tâches ↔ Métiers ↔ Formations (section 4).

Le référentiel est un document JSON versionné. Le back-office (M10) crée des
brouillons, les fait valider, puis publie une version ; le moteur charge
toujours la version publiée active et enregistre son identifiant dans chaque
recommandation (rejouabilité, critère 10.2 « Traçabilité »).
"""
from __future__ import annotations

import copy
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

SEED_DIR = Path(__file__).parent / "seed"

RIASEC = "RIASEC"
VALUE_KEYS = ["utilite_sociale", "securite", "autonomie", "revenu", "creativite", "prestige", "equilibre"]
TASK_CATS = {"a", "b", "c"}


class ReferentialError(ValueError):
    pass


def load_seed() -> dict[str, Any]:
    meta = json.loads((SEED_DIR / "meta.json").read_text(encoding="utf-8"))
    return {
        "meta": meta,
        "occupations": json.loads((SEED_DIR / "occupations.json").read_text(encoding="utf-8")),
        "programs": json.loads((SEED_DIR / "programs.json").read_text(encoding="utf-8")),
    }


def validate_document(doc: dict[str, Any]) -> list[str]:
    """Contrôles bloquants avant publication. Retourne la liste des erreurs."""
    errors: list[str] = []
    meta = doc.get("meta", {})
    source_ids = {s["id"] for s in meta.get("sources", [])}
    occ_ids: set[str] = set()
    for occ in doc.get("occupations", []):
        oid = occ.get("id", "?")
        if oid in occ_ids:
            errors.append(f"{oid}: identifiant dupliqué")
        occ_ids.add(oid)
        if len(occ.get("holland", "")) < 2 or any(c not in RIASEC for c in occ.get("holland", "")):
            errors.append(f"{oid}: code Holland invalide")
        tasks = occ.get("tasks", [])
        if not tasks:
            errors.append(f"{oid}: aucune tâche")
        total = sum(t.get("share", 0) for t in tasks)
        if abs(total - 1.0) > 0.01:
            errors.append(f"{oid}: la somme des parts de temps des tâches vaut {total:.2f} (attendu 1,00)")
        for t in tasks:
            if t.get("cat") not in TASK_CATS:
                errors.append(f"{oid}: catégorie de tâche invalide « {t.get('cat')} »")
        out = occ.get("outlook", {})
        for k in ("D", "A", "M"):
            v = out.get(k)
            if not isinstance(v, (int, float)) or not 0 <= v <= 100:
                errors.append(f"{oid}: indicateur {k} manquant ou hors [0, 100]")
        for sid in out.get("source_ids", meta.get("defaults", {}).get("outlook", {}).get("source_ids", [])):
            if sid not in source_ids:
                errors.append(f"{oid}: source {sid} inconnue")
    prg_ids: set[str] = set()
    for p in doc.get("programs", []):
        pid = p.get("id", "?")
        if pid in prg_ids:
            errors.append(f"{pid}: identifiant dupliqué")
        prg_ids.add(pid)
    for p in doc.get("programs", []):
        pid = p["id"]
        for oid in p.get("occupations", []):
            if oid not in occ_ids:
                errors.append(f"{pid}: métier {oid} inconnu")
        for ref in p.get("bridges", []) + p.get("leads_to", []):
            if ref not in prg_ids:
                errors.append(f"{pid}: passerelle / débouché {ref} inconnu")
        if p.get("type") != "bridge":
            w = sum(s["w"] for s in p.get("subjects", {}).values())
            if abs(w - 1.0) > 0.01:
                errors.append(f"{pid}: la somme des poids matières vaut {w:.2f} (attendu 1,00)")
            if p.get("type") == "program" and len(p.get("occupations", [])) == 0:
                errors.append(f"{pid}: aucun métier relié")
    for ev in meta.get("calendar_events", []):
        if ev.get("source_id") not in source_ids:
            errors.append(f"{ev.get('id')}: source {ev.get('source_id')} inconnue")
    return errors


def holland_vector(code: str) -> list[float]:
    """Code Holland (ex. « IRS ») → vecteur RIASEC pondéré 1 / 0,6 / 0,3."""
    weights = [1.0, 0.6, 0.3]
    vec = [0.0] * 6
    for i, letter in enumerate(code[:3]):
        vec[RIASEC.index(letter)] = weights[i]
    return vec


@dataclass
class Referential:
    version: str
    doc: dict[str, Any]
    occupations: dict[str, dict[str, Any]] = field(default_factory=dict)
    programs: dict[str, dict[str, Any]] = field(default_factory=dict)
    sources: dict[str, dict[str, Any]] = field(default_factory=dict)

    @classmethod
    def from_document(cls, doc: dict[str, Any]) -> "Referential":
        errors = validate_document(doc)
        if errors:
            raise ReferentialError("; ".join(errors[:20]))
        doc = copy.deepcopy(doc)
        meta = doc["meta"]
        ref = cls(version=meta["version"], doc=doc)
        ref.sources = {s["id"]: s for s in meta["sources"]}
        aw = meta["avenir_weights"]
        hw = meta["h_weights"]
        out_defaults = meta["defaults"]["outlook"]
        for occ in doc["occupations"]:
            shares = {"a": 0.0, "b": 0.0, "c": 0.0}
            for t in occ["tasks"]:
                shares[t["cat"]] += t["share"]
            h = 100.0 * sum(hw[k] * v for k, v in shares.items())
            out = occ["outlook"]
            out.setdefault("as_of", out_defaults["as_of"])
            out.setdefault("source_ids", list(out_defaults["source_ids"]))
            out["H"] = round(h, 1)
            out["transformation"] = {k: round(v, 3) for k, v in shares.items()}
            out["avenir"] = round(aw["D"] * out["D"] + aw["H"] * h + aw["A"] * out["A"] + aw["M"] * out["M"], 1)
            out["weights"] = aw
            occ["holland_vec"] = holland_vector(occ["holland"])
            ref.occupations[occ["id"]] = occ
        adm_d = meta["defaults"]["admission"]
        cost_d = meta["defaults"]["cost"]
        for p in doc["programs"]:
            p["holland_vec"] = holland_vector(p["holland"])
            if p.get("admission"):
                for k, v in adm_d.items():
                    p["admission"].setdefault(k, v)
            if p.get("cost"):
                for k, v in cost_d.items():
                    p["cost"].setdefault(k, v)
            occs = [ref.occupations[o] for o in p.get("occupations", [])]
            p["avenir"] = round(sum(o["outlook"]["avenir"] for o in occs) / len(occs), 1) if occs else None
            p.setdefault("bridges", [])
            p.setdefault("leads_to", [])
            p.setdefault("access", None)
            ref.programs[p["id"]] = p
        return ref

    # -- requêtes -------------------------------------------------------
    def candidates_for(self, level: str) -> list[dict[str, Any]]:
        return [p for p in self.programs.values() if level in p["from_levels"] and p["type"] != "bridge"]

    def program(self, pid: str) -> dict[str, Any]:
        return self.programs[pid]

    def occupation(self, oid: str) -> dict[str, Any]:
        return self.occupations[oid]

    def exists(self, any_id: str) -> bool:
        return any_id in self.programs or any_id in self.occupations or any_id in self.sources

    def calendar(self, system: str, level: str | None = None) -> list[dict[str, Any]]:
        evs = [e for e in self.doc["meta"]["calendar_events"] if e["system"] == system]
        if level:
            evs = [e for e in evs if level in e["levels"]]
        return sorted(evs, key=lambda e: e["date"])

    def graph_neighbors(self, pid: str, depth: int = 2) -> dict[str, Any]:
        """Traversée du graphe formation → (mène à / passerelle) → métiers, ≤ depth sauts."""
        seen: set[str] = {pid}
        frontier = [pid]
        edges: list[dict[str, str]] = []
        for _ in range(depth):
            nxt: list[str] = []
            for node in frontier:
                p = self.programs.get(node)
                if not p:
                    continue
                for o in p.get("occupations", []):
                    edges.append({"from": node, "to": o, "type": "mene_a_metier"})
                for t, kind in [(x, "mene_a") for x in p["leads_to"]] + [(x, "passerelle_vers") for x in p["bridges"]]:
                    edges.append({"from": node, "to": t, "type": kind})
                    if t not in seen:
                        seen.add(t)
                        nxt.append(t)
            frontier = nxt
        return {"root": pid, "edges": edges}


_seed_ref: Referential | None = None


def seed_referential() -> Referential:
    global _seed_ref
    if _seed_ref is None:
        _seed_ref = Referential.from_document(load_seed())
    return _seed_ref
