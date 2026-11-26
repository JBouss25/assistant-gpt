"""Paramètres versionnés du moteur (pondérations par défaut, section 6.3)."""
from __future__ import annotations

MODEL_VERSION = "reco-1.0.0"
WEIGHTS_VERSION = "weights-1.0.0"

COMPONENTS = ["interests", "skills", "values", "feasibility", "outlook", "evidence"]

WEIGHTS = {
    "3e": {"interests": 0.35, "skills": 0.20, "values": 0.15, "feasibility": 0.05, "outlook": 0.15, "evidence": 0.10},
    "tc": {"interests": 0.30, "skills": 0.25, "values": 0.10, "feasibility": 0.15, "outlook": 0.10, "evidence": 0.10},
    "terminale": {"interests": 0.25, "skills": 0.20, "values": 0.10, "feasibility": 0.25, "outlook": 0.10, "evidence": 0.10},
}

# Hypothèse H-07 : 1re Bac / Première utilise la colonne Tronc commun / Seconde
LEVEL_GROUP = {
    "MA_3AC": "3e", "FR_3E": "3e",
    "MA_TC_SCI": "tc", "FR_2NDE": "tc", "MA_1BAC": "tc", "FR_1RE": "tc",
    "MA_2BAC": "terminale", "FR_TLE": "terminale",
}

LEVELS = {
    "MA_3AC": {"system": "MA", "label": "3e année collège (3AC)"},
    "MA_TC_SCI": {"system": "MA", "label": "Tronc commun sciences"},
    "MA_1BAC": {"system": "MA", "label": "1re année Bac"},
    "MA_2BAC": {"system": "MA", "label": "2e année Bac"},
    "FR_3E": {"system": "FR", "label": "3e (mission française)"},
    "FR_2NDE": {"system": "FR", "label": "Seconde"},
    "FR_1RE": {"system": "FR", "label": "Première"},
    "FR_TLE": {"system": "FR", "label": "Terminale"},
}

STREAMS = {
    "MA_1BAC": ["SE", "SM", "ST", "SEG"],
    "MA_2BAC": ["PC", "SVT", "SAGRO", "SM_A", "SM_B", "STE", "STM", "SEG", "LET"],
}
FR_SPECIALTIES = ["maths", "pc", "svt", "nsi", "ses", "hggsp", "hlp", "llcer", "si", "arts"]

# Nombre de pistes affichées
N_ITEMS = {"3e": 3, "tc": 4, "terminale": 6}

# Catégories A / B / C à partir de la probabilité d'admission (point central)
CAT_A_MAX = 0.45   # p < 0,45 → ambitieuse
CAT_B_MAX = 0.80   # 0,45 ≤ p < 0,80 → réaliste ; p ≥ 0,80 → sécurisée
CATEGORY_LABELS = {"A": "ambitieuse", "B": "réaliste", "C": "sécurisée"}

OPEN_ACCESS_P = 0.95
LOGISTIC_K = 1.7

MC_DRAWS = 1000
MC_LOW_Q, MC_HIGH_Q = 10, 90
GRADE_NOISE = 0.6          # bruit de mesure d'une moyenne trimestrielle (points /20)
VALUE_NOISE = 0.08
MMR_LAMBDA = 0.75
INTEREST_FLOOR = 50.0      # 50 = profil orthogonal (ni proche ni opposé)

# Contraintes souples (jamais d'exclusion silencieuse)
BUDGET_OVER_MIN = 0.5      # coût minimal au-dessus du budget
BUDGET_OVER_MAX = 0.85     # fourchette de coût qui chevauche le budget
MOBILITY_PENALTY = 0.7
EUR_TO_MAD_DEMO = 10.8     # taux de démonstration, à rendre administrable

EVIDENCE_WEIGHTS = {"projet": 1.0, "stage": 1.0, "concours": 0.8, "mooc": 0.7, "club": 0.5, "benevolat": 0.6, "declaratif": 0.2}

LABEL_THRESHOLDS = [(70, "forte"), (55, "bonne"), (0, "à explorer")]
