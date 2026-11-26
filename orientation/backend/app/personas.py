"""Les trois cas concrets de la section 2.3, encodés comme profils de test."""
from .engine.model import StudentInput


def _t(**kw):
    return {d: {"value": kw.get(d, 0.3), "se": 0.1} for d in "RIASEC"}


YASMINE = {  # Tronc commun sciences, Casablanca
    "student_ref": "pseudo_yasmine", "system": "MA", "level": "MA_TC_SCI",
    "grades": {"svt": [14.5, 15, 15.5], "maths": [12, 11.5, 12.5], "pc": [13, 13, 13.5], "francais": [13, 14, 14], "anglais": [14]},
    "riasec": _t(R=0.30, I=0.80, A=0.40, S=0.85, E=0.35, C=0.40),
    "values": {"utilite_sociale": 1.0, "securite": 0.83, "equilibre": 0.5, "autonomie": 0.67, "creativite": 0.33, "revenu": 0.17, "prestige": 0.0},
    "aptitude": {"value": 0.65, "se": 0.15}, "ai_critical": {"value": 0.6, "se": 0.2},
    "constraints": {"budget_annual_mad": 20000, "mobility": "national", "city": "Casablanca"},
    "evidence": [{"title": "Bénévolat associatif (soutien scolaire et collecte)", "type": "benevolat", "domains": ["education", "sante"], "verified": True}],
}

ADAM = {  # 2e Bac PC, Meknès, budget contraint
    "student_ref": "pseudo_adam", "system": "MA", "level": "MA_2BAC", "stream": "PC",
    "grades": {"pc": [16, 15.5, 16.5], "maths": [13, 11, 12.5], "svt": [13, 13], "francais": [12, 12.5], "anglais": [12]},
    "riasec": _t(R=0.85, I=0.75, A=0.25, S=0.35, E=0.30, C=0.45),
    "values": {"securite": 1.0, "revenu": 0.83, "utilite_sociale": 0.67, "autonomie": 0.5, "equilibre": 0.33, "prestige": 0.17, "creativite": 0.0},
    "aptitude": {"value": 0.7, "se": 0.15}, "ai_critical": {"value": 0.55, "se": 0.2},
    "constraints": {"budget_annual_mad": 5000, "mobility": "national", "city": "Meknès"},
    "evidence": [{"title": "Projet de montage solaire", "type": "projet", "domains": ["energie"], "verified": True}],
}

LEA = {  # Terminale mission française, Maths + NSI, Rabat
    "student_ref": "pseudo_lea", "system": "FR", "level": "FR_TLE", "fr_specialties": ["maths", "nsi"],
    "grades": {"maths": [14, 14.5, 15], "nsi": [15, 15.5, 16], "francais": [14, 14], "anglais": [15, 15.5], "pc": [12]},
    "riasec": _t(R=0.30, I=0.75, A=0.85, S=0.70, E=0.40, C=0.30),
    "values": {"creativite": 1.0, "utilite_sociale": 0.83, "autonomie": 0.67, "equilibre": 0.5, "revenu": 0.33, "securite": 0.17, "prestige": 0.0},
    "aptitude": {"value": 0.8, "se": 0.12}, "ai_critical": {"value": 0.85, "se": 0.12},
    "constraints": {"budget_annual_mad": 60000, "mobility": "international", "city": "Rabat"},
    "evidence": [{"title": "Maquette d'une appli d'entraide pour une association", "type": "projet", "domains": ["numerique", "culture"], "verified": False}],
}


def student(d):
    return StudentInput.from_dict(d)
