"""Orchestrateur du moteur de recommandation (section 6.3, étapes 1 à 5).

1. Contraintes dures → pistes « non accessibles » conservées avec passerelles.
2. Score additif S_p = Σ w_k · composante_k.
3. Incertitude par Monte-Carlo (1 000 tirages, graine dérivée des entrées).
4. Diversification : A / B / C + exploratoire, puis MMR.
5. Explication : contributions exactes, raisons, contrefactuels actionnables.
"""
from __future__ import annotations

import hashlib
import math
from dataclasses import replace
from typing import Any

import numpy as np

from ..referential.store import RIASEC, Referential
from . import components as C
from . import config as cfg
from . import texts as T
from .model import Evidence, StudentInput


def _seed(student: StudentInput) -> int:
    h = hashlib.sha256((student.fingerprint() + cfg.MODEL_VERSION + cfg.WEIGHTS_VERSION).encode()).hexdigest()
    return int(h[:15], 16)


def category_of(p: float) -> str:
    if p < cfg.CAT_A_MAX:
        return "A"
    if p < cfg.CAT_B_MAX:
        return "B"
    return "C"


def label_of(score: float) -> str:
    for threshold, label in cfg.LABEL_THRESHOLDS:
        if score >= threshold:
            return label
    return cfg.LABEL_THRESHOLDS[-1][1]


def _cos(a: list[float], b: list[float]) -> float:
    na, nb = math.sqrt(sum(x * x for x in a)), math.sqrt(sum(x * x for x in b))
    return sum(x * y for x, y in zip(a, b)) / (na * nb) if na and nb else 0.0


def similarity(p1: dict[str, Any], p2: dict[str, Any]) -> float:
    d1, d2 = set(p1.get("domains", [])), set(p2.get("domains", []))
    jac = len(d1 & d2) / len(d1 | d2) if d1 | d2 else 0.0
    return 0.5 * _cos(p1["holland_vec"], p2["holland_vec"]) + 0.5 * jac


class Engine:
    def __init__(self, ref: Referential, n_draws: int = cfg.MC_DRAWS):
        self.ref = ref
        self.n_draws = n_draws

    # ------------------------------------------------------------------
    def evaluate(self, student: StudentInput, program: dict[str, Any], point: C.Draws, mc: C.Draws | None,
                 weights: dict[str, float]) -> dict[str, Any]:
        res = C.compute(student, program, point)
        comps = {k: float(v[0]) for k, v in res["components"].items()}
        s_point = float(C.total(res["components"], weights)[0])
        p_point = float(res["p_adm"][0])
        out = {
            "program": program, "S": s_point, "components": comps, "p": p_point, "flags": res["flags"],
            "evidence_used": res["evidence_used"], "category": category_of(p_point),
        }
        if mc is not None:
            r = C.compute(student, program, mc)
            s_mc = C.total(r["components"], weights)
            lo, hi = np.percentile(s_mc, [cfg.MC_LOW_Q, cfg.MC_HIGH_Q])
            plo, phi = np.percentile(r["p_adm"], [cfg.MC_LOW_Q, cfg.MC_HIGH_Q])
            out["S_range"] = (min(float(lo), s_point), max(float(hi), s_point))
            out["p_range"] = (min(float(plo), p_point), max(float(phi), p_point))
        else:
            out["S_range"] = (s_point, s_point)
            out["p_range"] = (p_point, p_point)
        return out

    # ------------------------------------------------------------------
    def recommend(self, student: StudentInput, grade_overrides: dict[str, float] | None = None,
                  with_mc: bool = True) -> dict[str, Any]:
        if student.level not in cfg.LEVEL_GROUP:
            raise ValueError(f"niveau inconnu : {student.level}")
        group = cfg.LEVEL_GROUP[student.level]
        weights = cfg.WEIGHTS[group]
        seed = _seed(student)
        point = C.make_draws(student, 1, None, grade_overrides)
        mc = C.make_draws(student, self.n_draws, np.random.default_rng(seed), grade_overrides) if with_mc else None

        eligible: list[dict[str, Any]] = []
        blocked: list[dict[str, Any]] = []
        set_aside: list[dict[str, Any]] = []
        excluded = set(student.constraints.excluded_domains)
        for prog in self.ref.candidates_for(student.level):
            reason = C.hard_constraint(student, prog)
            if reason:
                blocked.append({"program": prog, "reason": reason})
                continue
            ev = self.evaluate(student, prog, point, mc, weights)
            if prog["sector"] in excluded:
                set_aside.append(ev)
            else:
                eligible.append(ev)

        top2 = sorted(RIASEC, key=lambda d: -(student.riasec[d].value if d in student.riasec else 0.5))[:2]
        selected = self._select(eligible, group, top2)
        if group == "terminale":
            order = {"A": 0, "B": 1, "C": 2}
            selected.sort(key=lambda e: (order[e["category"]], -e["S"]))
        else:
            selected.sort(key=lambda e: (e.get("exploratory", False), -e["S"]))

        items = [self._build_item(student, e, weights, top2, grade_overrides) for e in selected]
        cats = {i["category"] for i in items}
        warnings = []
        if group == "terminale":
            for cat in "ABC":
                if cat not in cats:
                    warnings.append({"type": "equilibre", "category": cat,
                                     "message": f"Aucune piste {cfg.CATEGORY_LABELS[cat]} trouvée parmi les formations accessibles du référentiel."})
        return {
            "student_ref": student.student_ref,
            "system": student.system,
            "level": student.level + (f"_{student.stream}" if student.stream else ""),
            "model_version": cfg.MODEL_VERSION,
            "weights_version": cfg.WEIGHTS_VERSION,
            "referential_version": self.ref.version,
            "seed": seed,
            "input_fingerprint": student.fingerprint(),
            "weights": weights,
            "items": items,
            "blocked": [self._blocked_item(b, eligible) for b in blocked],
            "signals": self._signals(student, set_aside),
            "warnings": warnings,
            "disclaimer": T.DISCLAIMER,
        }

    # ------------------------------------------------------------------
    def _select(self, pool: list[dict[str, Any]], group: str, top2: list[str]) -> list[dict[str, Any]]:
        """Étape 4 : A / B / C garantis (terminale), une piste exploratoire, puis MMR.

        Le remplissage MMR ne retient que des pistes dont la composante intérêts
        dépasse le plancher (sauf s'il n'en reste aucune) et, en terminale,
        plafonne chaque catégorie à 2 pistes pour garder une stratégie équilibrée.
        """
        k = min(cfg.N_ITEMS[group], len(pool))
        selected: list[dict[str, Any]] = []
        remaining = sorted(pool, key=lambda e: -e["S"])

        def take(e: dict[str, Any]) -> None:
            selected.append(e)
            remaining.remove(e)

        def mmr(e: dict[str, Any]) -> float:
            sim = max((similarity(e["program"], s["program"]) for s in selected), default=0.0)
            return cfg.MMR_LAMBDA * e["S"] / 100 - (1 - cfg.MMR_LAMBDA) * sim

        def interesting(cands: list[dict[str, Any]]) -> list[dict[str, Any]]:
            return [e for e in cands if e["components"]["interests"] >= cfg.INTEREST_FLOOR] or cands

        def fill_candidates() -> list[dict[str, Any]]:
            cands = interesting(remaining)
            if group == "terminale":
                counts = {c: sum(1 for x in selected if x["category"] == c) for c in "ABC"}
                cands = [e for e in cands if counts[e["category"]] < 2] or cands
            return cands

        if group == "terminale":
            for cat in "ABC":
                cands = interesting([e for e in remaining if e["category"] == cat])
                if cands and len(selected) < k:
                    take(cands[0])  # meilleure adéquation de la catégorie
        explore_slot = k >= 3
        while remaining and len(selected) < (k - 1 if explore_slot else k):
            take(max(fill_candidates(), key=mmr))
        if explore_slot and remaining and len(selected) < k:
            if not any(e["program"]["holland"][0] not in top2 for e in selected):
                cands = [e for e in remaining if e["program"]["holland"][0] not in top2]
                if cands:
                    cands[0]["exploratory"] = True
                    take(cands[0])
        while remaining and len(selected) < k:
            take(max(fill_candidates(), key=mmr))
        return selected

    # ------------------------------------------------------------------
    def _build_item(self, student: StudentInput, e: dict[str, Any], weights: dict[str, float], top2: list[str],
                    overrides: dict[str, float] | None) -> dict[str, Any]:
        prog = e["program"]
        comps = e["components"]
        points = {k: weights[k] * comps[k] for k in cfg.COMPONENTS}
        s = e["S"]
        shares = {k: (points[k] / s if s > 0 else 0.0) for k in cfg.COMPONENTS}

        # Raisons : les 3 composantes qui contribuent le plus
        best_subject = None
        known = [(spec["w"] * C.subject_fit(student_grade, spec["rec"]), sub)
                 for sub, spec in prog["subjects"].items()
                 if (student_grade := (overrides or {}).get(sub, student.grade(sub))) is not None]
        if known:
            best_subject = max(known)[1]
        matching_values = sorted((v for v, w in student.values.items() if w >= 0.66 and prog["values"].get(v, 0) >= 0.6),
                                 key=lambda v: -student.values[v])
        ctx = {
            "student_top": top2, "best_subject": best_subject, "matching_values": matching_values,
            "selective": bool(prog.get("admission") and prog["admission"].get("selective")),
            "category_label": cfg.CATEGORY_LABELS[e["category"]], "avenir": prog["avenir"] or 0,
            "evidence_used": e["evidence_used"],
        }
        ctx["components"] = comps
        ctx["best_subject_fit"] = float(max(known)[0] / prog["subjects"][best_subject]["w"]) if known else None
        ranked = sorted(cfg.COMPONENTS, key=lambda k: -points[k])
        reasons = [r for k in ranked if (r := T.reason_for(k, ctx))][:3]

        # Impact de l'IA : métier le plus proche des intérêts de l'élève
        stud_vec = [student.riasec[d].value if d in student.riasec else 0.5 for d in RIASEC]
        occs = [self.ref.occupation(o) for o in prog["occupations"]]
        main = max(occs, key=lambda o: _cos([x - sum(stud_vec) / 6 for x in stud_vec],
                                            [x - sum(o["holland_vec"]) / 6 for x in o["holland_vec"]]))
        ai_impact = {
            "occupation_id": main["id"], "occupation_name": main["name"],
            "automated": [t["label"] for t in main["tasks"] if t["cat"] == "a"],
            "augmented": [t["label"] for t in main["tasks"] if t["cat"] == "b"],
            "human_core": [t["label"] for t in main["tasks"] if t["cat"] == "c"],
            "transformation": main["outlook"]["transformation"],
        }

        adm = prog.get("admission")
        citations: list[str] = []
        if adm:
            citations.append(adm["source_id"])
        if prog.get("cost"):
            citations.append(prog["cost"]["source_id"])
        for o in occs:
            citations.extend(o["outlook"]["source_ids"])
        citations = list(dict.fromkeys(citations))

        lo, hi = e["S_range"]
        plo, phi = e["p_range"]
        item = {
            "program_id": prog["id"],
            "name": prog["name"],
            "short": prog["short"],
            "type": prog["type"],
            "sector": prog["sector"],
            "category": e["category"],
            "category_label": cfg.CATEGORY_LABELS[e["category"]],
            "exploratory": bool(e.get("exploratory")),
            "fit_score": {"low": int(math.floor(lo)), "high": int(math.ceil(hi)), "value": round(s, 1), "label": label_of(s)},
            "admission_probability": {
                "low": round(plo, 2), "high": round(phi, 2), "value": round(e["p"], 2),
                "selective": bool(adm and adm.get("selective")),
                "source_id": adm["source_id"] if adm else None, "as_of": adm["as_of"] if adm else None,
                "exam": adm.get("exam") if adm else None, "open_access": adm is None,
            },
            "contributions": {k: round(v, 2) for k, v in shares.items()},
            "contribution_points": {k: round(v, 1) for k, v in points.items()},
            "components": {k: round(v, 1) for k, v in comps.items()},
            "reasons": reasons,
            "ai_impact": ai_impact,
            "occupations": [{
                "id": o["id"], "name": o["name"], "family": o["family"], "avenir": o["outlook"]["avenir"],
                "D": o["outlook"]["D"], "H": o["outlook"]["H"], "A": o["outlook"]["A"], "M": o["outlook"]["M"],
                "as_of": o["outlook"]["as_of"], "source_ids": o["outlook"]["source_ids"]} for o in occs],
            "avenir": prog["avenir"],
            "prerequisites": prog.get("prerequisites", []),
            "bridges": prog["bridges"],
            "leads_to": prog["leads_to"],
            "bridges_details": [self._ref_summary(x) for x in prog["bridges"]],
            "leads_to_details": [self._ref_summary(x) for x in prog["leads_to"]],
            "cost": prog.get("cost"),
            "duration_years": prog.get("duration_years"),
            "cities": prog.get("cities", []),
            "flags": e["flags"],
            "evidence_used": e["evidence_used"],
            "citations": citations,
        }
        cf = self._counterfactual(student, e, weights, overrides)
        item["counterfactual"] = cf["text"]
        item["counterfactual_detail"] = cf
        item["roadmap_6_12m"] = self._roadmap(student, prog, overrides)
        return item

    # ------------------------------------------------------------------
    def _counterfactual(self, student: StudentInput, e: dict[str, Any], weights: dict[str, float],
                        overrides: dict[str, float] | None) -> dict[str, Any]:
        prog = e["program"]
        overrides = dict(overrides or {})
        base_grades = {s: overrides.get(s, student.grade(s)) for s in prog["subjects"]}
        general = student.general_average() or C.DEFAULT_GRADE
        gaps = []
        for s, spec in prog["subjects"].items():
            g = base_grades[s] if base_grades[s] is not None else general
            gaps.append((spec["w"] * (spec["rec"] - g), spec["w"], s, g))
        gaps.sort(reverse=True)
        grade_cf: dict[str, Any] | None = None
        if gaps:
            _, _, subject, g0 = gaps[0]
            if g0 < 20:
                last = None
                for d in (1, 2, 3, 4):
                    g1 = min(20.0, round(g0 + d, 1))
                    draws = C.make_draws(student, 1, None, {**overrides, subject: g1})
                    r = C.compute(student, prog, draws)
                    s1 = float(C.total(r["components"], weights)[0])
                    cat1 = category_of(float(r["p_adm"][0]))
                    last = (g1, s1, cat1)
                    if cat1 != e["category"] and prog.get("admission"):
                        return {"kind": "category", "subject": subject, "from": g0, "to": g1,
                                "category_from": e["category"], "category_to": cat1, "score_from": round(e["S"], 1), "score_to": round(s1, 1),
                                "text": T.counterfactual_category(subject, g0, g1, cfg.CATEGORY_LABELS[e["category"]], cfg.CATEGORY_LABELS[cat1])}
                    if g1 >= 20:
                        break
                g1, s1, _ = last
                if round(s1) > round(e["S"]):
                    grade_cf = {"kind": "score", "subject": subject, "from": g0, "to": g1, "score_from": round(e["S"], 1),
                                "score_to": round(s1, 1), "text": T.counterfactual_score(subject, g0, g1, e["S"], s1)}
        # Alternative : une preuve vérifiée dans le domaine principal. On garde le levier le plus fort.
        domain = prog["domains"][0] if prog.get("domains") else prog["sector"]
        st2 = replace(student, evidence=student.evidence + [Evidence("projet hypothétique", "projet", [domain], True)])
        draws = C.make_draws(st2, 1, None, overrides)
        s1 = float(C.total(C.compute(st2, prog, draws)["components"], weights)[0])
        ev_cf = {"kind": "evidence", "domain": domain, "score_from": round(e["S"], 1), "score_to": round(s1, 1),
                 "text": T.counterfactual_evidence(domain, e["S"], s1)}
        if grade_cf and (grade_cf["score_to"] >= ev_cf["score_to"] or round(s1) <= round(e["S"])):
            return grade_cf
        return ev_cf

    def _roadmap(self, student: StudentInput, prog: dict[str, Any], overrides: dict[str, float] | None) -> list[str]:
        steps: list[str] = []
        overrides = overrides or {}
        gaps = []
        for s, spec in prog["subjects"].items():
            g = overrides.get(s, student.grade(s))
            if g is not None and g < spec["rec"]:
                gaps.append((spec["w"] * (spec["rec"] - g), s, g, spec["rec"]))
        for _, s, g, rec in sorted(gaps, reverse=True)[:2]:
            target = min(rec, math.floor(g) + 2)
            steps.append(f"Viser {T.fmt(target)} en {T.subject_label(s)} au prochain trimestre (aujourd'hui : {T.fmt(g)})")
        domain = prog["domains"][0] if prog.get("domains") else prog["sector"]
        steps.append(T.EVIDENCE_SUGGESTIONS.get(domain, T.EVIDENCE_SUGGESTIONS["general"]))
        steps.append(f"Échanger avec un·e étudiant·e ou un·e professionnel·le du parcours « {prog['short']} »")
        if student.ai_critical.value < 0.7:
            steps.append("T'entraîner à vérifier les réponses d'une IA (sources, calculs) sur un sujet de " + T.DOMAIN_LABELS.get(domain, domain))
        adm = prog.get("admission")
        if adm and adm.get("selective") and adm.get("exam"):
            steps.append(f"Préparer « {adm['exam']} » : annales, méthode et calendrier")
        return steps[:5]

    def _ref_summary(self, pid: str) -> dict[str, Any]:
        p = self.ref.program(pid)
        return {"id": pid, "short": p["short"], "name": p["name"], "type": p["type"]}

    def _blocked_item(self, b: dict[str, Any], eligible: list[dict[str, Any]]) -> dict[str, Any]:
        prog = b["program"]
        targets = set(prog["bridges"]) | {prog["id"]}
        alternatives = [e["program"]["id"] for e in eligible
                        if targets & set(e["program"]["bridges"]) and e["program"]["id"] != prog["id"]]
        return {"program_id": prog["id"], "name": prog["name"], "short": prog["short"],
                "message": f"Non accessible depuis ta situation actuelle : {b['reason']}. Voici les passerelles possibles.",
                "bridges": prog["bridges"], "alternatives": alternatives[:4],
                "bridges_details": [self._ref_summary(x) for x in prog["bridges"]],
                "alternatives_details": [self._ref_summary(x) for x in alternatives[:4]]}

    def _signals(self, student: StudentInput, set_aside: list[dict[str, Any]]) -> list[dict[str, Any]]:
        signals = []
        for e in sorted(set_aside, key=lambda x: -x["S"]):
            if e["components"]["skills"] >= 65 and e["components"]["interests"] >= 55:
                signals.append({"type": "autocensure", "program_id": e["program"]["id"],
                                "message": (f"Tu as écarté {T.DOMAIN_LABELS.get(e['program']['sector'], e['program']['sector'])}, "
                                            f"pourtant tes résultats et tes intérêts montrent un vrai potentiel pour « {e['program']['short']} ». "
                                            "Cela vaut peut-être la peine d'en parler avec ton conseiller.")})
                break
        se = student.self_efficacy.get("maths_sciences")
        maths = student.grade("maths")
        if se is not None and maths is not None and se.value < 0.45 and maths >= 14:
            signals.append({"type": "autocensure", "program_id": None,
                            "message": (f"Tu sembles douter de toi en maths alors que ta moyenne est de {T.fmt(maths)}. "
                                        "Les filières scientifiques exigeantes restent ouvertes pour toi.")})
        return signals


def balance_check(categories: list[str]) -> list[str]:
    """Contrôle d'équilibre du constructeur de vœux (écran 9.3 §5)."""
    msgs = []
    if categories and "C" not in categories:
        msgs.append("Aucune piste sécurisée : risque élevé, ajoute au moins une voie sécurisée avec passerelle.")
    if categories and "A" not in categories:
        msgs.append("Aucune piste ambitieuse : tu peux te permettre au moins un vœu ambitieux.")
    if categories and "B" not in categories:
        msgs.append("Aucune piste réaliste : ajoute une cible qui correspond à ton dossier actuel.")
    return msgs
