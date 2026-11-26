"""Gabarits déterministes pré-rédigés (repli garanti du pipeline IA, section 7.1 §5).

Règles de rédaction : tutoiement, aucune formulation déterministe, aucun
chiffre qui ne provienne du moteur ou du référentiel.
"""
from __future__ import annotations

from typing import Any

from ..psychometrics.instruments import RIASEC_SHORT, SUBJECT_LABELS, VALUE_CARDS

DOMAIN_LABELS = {
    "sante": "la santé", "numerique": "le numérique", "energie": "l'énergie", "eau": "l'eau et l'environnement",
    "industrie": "l'industrie", "chimie": "la chimie", "agriculture": "l'agriculture", "btp": "le BTP et la ville durable",
    "logistique": "la logistique", "finance": "la gestion et le commerce", "education": "l'éducation", "culture": "la création",
    "sciences": "les sciences", "lettres": "les lettres", "general": "plusieurs domaines",
}

EVIDENCE_SUGGESTIONS = {
    "sante": "Faire un stage d'observation ou du bénévolat dans une structure de santé",
    "numerique": "Réaliser un mini-projet de programmation (site, appli ou jeu) et le déposer dans ton carnet",
    "energie": "Terminer un MOOC d'initiation au photovoltaïque",
    "eau": "Mener un mini-projet de mesure de la consommation d'eau dans ton établissement",
    "industrie": "Visiter une entreprise industrielle ou rejoindre un club de robotique",
    "chimie": "Participer à un projet expérimental ou à un concours de chimie",
    "agriculture": "Faire un stage d'observation dans une exploitation ou une coopérative agricole",
    "btp": "Réaliser une maquette ou découvrir un logiciel de modélisation 3D",
    "logistique": "Organiser la logistique d'un projet collectif (événement, collecte)",
    "finance": "Gérer le budget d'un club ou participer à un concours d'entrepreneuriat",
    "education": "Faire du tutorat auprès d'élèves plus jeunes",
    "culture": "Constituer un portfolio de cinq créations",
    "sciences": "Participer à un club ou à un concours scientifique",
    "lettres": "Participer à un concours d'écriture ou d'éloquence",
    "general": "Participer à un club ou à un projet qui te tient à cœur",
}

VALUE_LABELS = {c["id"]: c["label"].lower() for c in VALUE_CARDS}

DISCLAIMER = "Ces pistes sont des propositions à discuter avec ta famille et ton conseiller, pas une décision."


def subject_label(s: str) -> str:
    return SUBJECT_LABELS.get(s, s)


def fmt(x: float) -> str:
    """Note au format français, sans décimale inutile."""
    return (f"{x:.1f}".rstrip("0").rstrip(".")).replace(".", ",")


def elide(word: str) -> str:
    """« de » + mot, avec élision devant voyelle ou h muet."""
    return ("d'" if word[:1].lower() in "aeéèêiîoôuh" else "de ") + word


def reason_for(component: str, ctx: dict[str, Any]) -> str | None:
    """Raison rédigée pour une composante, ou None si l'affirmation ne serait pas vraie.

    Chaque formulation est conditionnée à la valeur réelle de la composante :
    on n'écrit jamais « proche » si la similarité est faible.
    """
    c = ctx["components"]
    if component == "interests":
        letters = " et ".join(RIASEC_SHORT[d] for d in ctx["student_top"])
        if c["interests"] >= 65:
            return f"Ton profil d'intérêts ({letters}) est proche de celui de cette piste."
        if c["interests"] >= 55:
            return f"Cette piste rejoint en partie ton profil d'intérêts ({letters})."
        return None
    if component == "skills":
        best, fit = ctx.get("best_subject"), ctx.get("best_subject_fit")
        if best and fit is not None and fit >= 0.75:
            return f"Tes résultats en {subject_label(best)} correspondent au niveau attendu."
        if best and fit is not None and fit >= 0.5:
            return f"Tes résultats en {subject_label(best)} sont proches du niveau attendu."
        if c["skills"] >= 60:
            return "Tes réponses aux mini-défis montrent des aptitudes utiles pour cette piste."
        return None
    if component == "values":
        vals = ctx.get("matching_values") or []
        if vals:
            return "Elle rejoint ce qui compte pour toi : " + " et ".join(VALUE_LABELS[v] for v in vals[:2]) + "."
        if c["values"] >= 60:
            return "Elle est cohérente avec ce qui compte pour toi."
        return None
    if component == "feasibility":
        if ctx.get("selective"):
            return f"Ton dossier actuel te place dans une zone d'admission {ctx['category_label']} pour cette formation."
        return "Cette piste est accessible depuis ta situation actuelle."
    if component == "outlook":
        return f"Les métiers visés ont un indice Avenir +5 de {fmt(ctx['avenir'])}/100 (données datées et sourcées)."
    if component == "evidence":
        used = ctx.get("evidence_used") or []
        if used:
            return f"Tu as déjà déposé une preuve en lien avec cette piste : « {used[0]} »."
        return None
    raise ValueError(component)


def counterfactual_category(subject: str, g_from: float, g_to: float, cat_from: str, cat_to: str) -> str:
    return (f"Si ta moyenne {elide(subject_label(subject))} passe de {fmt(g_from)} à {fmt(g_to)}, "
            f"cette piste passe {elide(cat_from)} à {cat_to}.")


def counterfactual_score(subject: str, g_from: float, g_to: float, s_from: float, s_to: float) -> str:
    return (f"Si ta moyenne {elide(subject_label(subject))} passe de {fmt(g_from)} à {fmt(g_to)}, "
            f"ton score d'adéquation passe d'environ {fmt(round(s_from))} à {fmt(round(s_to))}.")


def counterfactual_evidence(domain: str, s_from: float, s_to: float) -> str:
    return (f"Si tu déposes une preuve vérifiée (projet, stage) en lien avec {DOMAIN_LABELS.get(domain, domain)}, "
            f"ton score d'adéquation passe d'environ {fmt(round(s_from))} à {fmt(round(s_to))}.")
