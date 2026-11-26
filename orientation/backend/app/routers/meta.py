from __future__ import annotations

from fastapi import APIRouter

from ..engine import config as cfg
from ..engine.texts import DOMAIN_LABELS
from ..psychometrics.instruments import SUBJECT_LABELS

router = APIRouter(prefix="/meta", tags=["meta"])

STREAM_LABELS = {
    "SE": "Sciences expérimentales", "SM": "Sciences mathématiques", "ST": "Sciences et technologies", "SEG": "Sciences économiques et gestion",
    "PC": "Sciences physiques (PC)", "SVT": "Sciences de la vie et de la Terre (SVT)", "SAGRO": "Sciences agronomiques",
    "SM_A": "Sciences mathématiques A", "SM_B": "Sciences mathématiques B", "STE": "Sciences et technologies électriques",
    "STM": "Sciences et technologies mécaniques", "LET": "Lettres et sciences humaines",
}
SPECIALTY_LABELS = {"maths": "Mathématiques", "pc": "Physique-chimie", "svt": "SVT", "nsi": "NSI", "ses": "SES", "hggsp": "HGGSP",
                    "hlp": "HLP", "llcer": "LLCER", "si": "Sciences de l'ingénieur", "arts": "Arts"}
LEVEL_SUBJECTS = {
    "MA_3AC": ["maths", "pc", "svt", "francais", "arabe", "anglais", "histgeo", "techno"],
    "MA_TC_SCI": ["maths", "pc", "svt", "francais", "arabe", "anglais", "histgeo"],
    "MA_1BAC": ["maths", "pc", "svt", "francais", "arabe", "anglais", "histgeo", "techno", "eco"],
    "MA_2BAC": ["maths", "pc", "svt", "francais", "anglais", "philo", "techno", "eco"],
    "FR_3E": ["maths", "francais", "pc", "svt", "anglais", "histgeo", "techno"],
    "FR_2NDE": ["maths", "francais", "pc", "svt", "anglais", "histgeo", "ses", "nsi"],
    "FR_1RE": ["maths", "francais", "pc", "svt", "anglais", "histgeo", "ses", "nsi"],
    "FR_TLE": ["maths", "pc", "svt", "nsi", "ses", "francais", "philo", "anglais", "histgeo"],
}

FAQ = [
    {"q": "Est-ce que la plateforme décide de mon orientation ?",
     "a": "Non. Elle propose des pistes argumentées. La décision reste la tienne, avec ta famille et l'équipe éducative (conseil de classe, conseiller d'orientation)."},
    {"q": "Pourquoi mon score est-il une fourchette ?",
     "a": "Toute mesure comporte une part d'incertitude. Plutôt qu'un chiffre trompeur, on affiche l'intervalle dans lequel ton adéquation se situe le plus probablement."},
    {"q": "Que veulent dire A, B et C ?",
     "a": "A = piste ambitieuse, B = cible réaliste, C = voie sécurisée avec des passerelles pour remonter ensuite. Une bonne stratégie combine les trois."},
    {"q": "Mon genre ou ma ville changent-ils mes résultats ?",
     "a": "Non. Le genre, la région d'origine et le revenu ne sont jamais utilisés dans le calcul. Seules tes contraintes déclarées (budget, mobilité) servent à te prévenir, sans jamais retirer de piste."},
    {"q": "D'où viennent les informations sur les métiers et l'IA ?",
     "a": "D'un référentiel vérifié, daté et sourcé, relu par un comité scientifique. Chaque fiche affiche sa date et ses sources."},
    {"q": "Qui voit mes résultats ?",
     "a": "Toi. Tes parents et ton conseiller voient uniquement ce que tu choisis de partager, et tu peux retirer ce partage à tout moment."},
    {"q": "Je ne sais pas du tout ce que je veux faire, c'est grave ?",
     "a": "Pas du tout, c'est très fréquent. L'orientation se construit petit à petit : explore, essaie, dépose des preuves, et ton projet se précisera."},
]


@router.get("/levels")
def levels():
    return {
        "levels": cfg.LEVELS,
        "streams": {lvl: [{"id": s, "label": STREAM_LABELS[s]} for s in ss] for lvl, ss in cfg.STREAMS.items()},
        "fr_specialties": [{"id": s, "label": SPECIALTY_LABELS[s]} for s in cfg.FR_SPECIALTIES],
        "subjects": SUBJECT_LABELS,
        "level_subjects": LEVEL_SUBJECTS,
        "domains": DOMAIN_LABELS,
        "mvp_levels": ["MA_3AC", "FR_3E", "MA_2BAC", "FR_TLE"],
    }


@router.get("/faq")
def faq():
    return FAQ
