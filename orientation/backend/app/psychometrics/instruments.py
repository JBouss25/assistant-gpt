"""Banque d'items du MVP — formes courtes fixes (section 6.1 / 6.2).

Tous les items sont des rédactions originales de l'agence (aucun item sous
licence propriétaire). Les paramètres IRT (a, b) sont des valeurs
provisoires : ils seront estimés lors du pilote de calibration (≥ 500 élèves
par niveau et par langue) avant l'activation du CAT en V1.
"""
from __future__ import annotations

INSTRUMENT_VERSION = "forms-1.0.0"

LIKERT5 = [
    {"value": 1, "label": "Pas du tout"},
    {"value": 2, "label": "Plutôt non"},
    {"value": 3, "label": "Bof / je ne sais pas"},
    {"value": 4, "label": "Plutôt oui"},
    {"value": 5, "label": "Tout à fait"},
]
# Collège : 3 choix (balayage de cartes), recodés 1 / 3 / 5.
LIKERT3 = [
    {"value": 5, "label": "J'aime"},
    {"value": 3, "label": "Bof"},
    {"value": 1, "label": "Pas du tout"},
]

RIASEC_LABELS = {
    "R": "Réaliste (concret, technique)",
    "I": "Investigateur (comprendre, chercher)",
    "A": "Artistique (créer, imaginer)",
    "S": "Social (aider, transmettre)",
    "E": "Entreprenant (convaincre, organiser)",
    "C": "Conventionnel (organiser, vérifier)",
}
RIASEC_SHORT = {"R": "Réaliste", "I": "Investigateur", "A": "Artistique", "S": "Social", "E": "Entreprenant", "C": "Conventionnel"}

_RIASEC_TEXT = {
    "R": ["Réparer un vélo ou un appareil électrique", "Construire une maquette ou un objet", "Travailler en plein air, sur un chantier ou dans un champ",
          "Utiliser des outils ou des machines", "Installer et tester des panneaux solaires"],
    "I": ["Comprendre pourquoi une expérience fonctionne", "Résoudre une énigme de logique", "Observer des cellules au microscope",
          "Chercher l'origine d'une maladie ou d'une panne", "Analyser des données pour trouver une explication"],
    "A": ["Dessiner, créer une affiche ou un logo", "Écrire une histoire ou un scénario", "Imaginer l'écran d'une application",
          "Faire de la musique ou monter une vidéo", "Décorer ou aménager un espace"],
    "S": ["Aider un camarade à comprendre une leçon", "Écouter et conseiller quelqu'un qui a un souci", "M'occuper d'enfants ou de personnes âgées",
          "Participer à une action bénévole", "Prendre soin d'une personne blessée"],
    "E": ["Organiser un événement au collège ou au lycée", "Convaincre un groupe d'adopter mon idée", "Créer et gérer un petit commerce",
          "Diriger une équipe pour un projet", "Négocier un prix ou un accord"],
    "C": ["Classer et ranger des documents ou des fichiers", "Tenir les comptes d'un club", "Vérifier qu'un travail ne contient pas d'erreurs",
          "Remplir un tableau de données avec précision", "Suivre une procédure étape par étape"],
}

RIASEC_ITEMS = [
    {"id": f"RIA-{dim}-{i + 1:02d}", "dimension": dim, "text": text, "irt": {"model": "grm", "a": 1.2, "b": [-1.5, -0.5, 0.5, 1.5]}}
    for dim, texts in _RIASEC_TEXT.items() for i, text in enumerate(texts)
]
# Ordre de présentation entrelacé (R, I, A, S, E, C, R, ...) pour limiter les effets de série.
RIASEC_ITEMS.sort(key=lambda it: (int(it["id"][-2:]), "RIASEC".index(it["dimension"])))

VALUE_CARDS = [
    {"id": "utilite_sociale", "label": "Être utile aux autres", "icon": "🤝"},
    {"id": "securite", "label": "Avoir un emploi stable", "icon": "🛡️"},
    {"id": "autonomie", "label": "Être libre d'organiser mon travail", "icon": "🧭"},
    {"id": "revenu", "label": "Bien gagner ma vie", "icon": "💰"},
    {"id": "creativite", "label": "Créer, inventer", "icon": "🎨"},
    {"id": "prestige", "label": "Être reconnu·e", "icon": "🏅"},
    {"id": "equilibre", "label": "Avoir du temps pour ma vie perso", "icon": "⚖️"},
]

SELF_EFFICACY_ITEMS = [
    {"id": "SE-MS-01", "domain": "maths_sciences", "text": "Si je m'y mets, je peux réussir un exercice de maths difficile."},
    {"id": "SE-MS-02", "domain": "maths_sciences", "text": "Je me sens capable de suivre des études scientifiques exigeantes."},
    {"id": "SE-LL-01", "domain": "lettres_langues", "text": "Je peux rédiger un texte clair et argumenté."},
    {"id": "SE-LL-02", "domain": "lettres_langues", "text": "Je me sens capable d'étudier dans une autre langue que la mienne."},
    {"id": "SE-TE-01", "domain": "technique", "text": "Je peux comprendre comment fonctionne une machine ou un logiciel."},
    {"id": "SE-TE-02", "domain": "technique", "text": "Je suis capable de mener un projet concret jusqu'au bout."},
    {"id": "SE-RE-01", "domain": "relationnel", "text": "Je sais mettre les autres à l'aise et les écouter."},
    {"id": "SE-RE-02", "domain": "relationnel", "text": "Je peux prendre la parole devant un groupe."},
]

ADAPTABILITY_ITEMS = [
    {"id": "AD-CON-01", "facet": "preoccupation", "text": "Je pense déjà à ce que je voudrais faire après le lycée."},
    {"id": "AD-CTR-01", "facet": "controle", "text": "Je sens que mes choix d'avenir dépendent surtout de moi."},
    {"id": "AD-CUR-01", "facet": "curiosite", "text": "J'aime découvrir des métiers que je ne connais pas."},
    {"id": "AD-CNF-01", "facet": "confiance", "text": "Quand un obstacle se présente, je trouve des solutions."},
]

TOLERANCE_ITEMS = [
    {"id": "TU-01", "facet": "incertitude", "text": "Ça ne me dérange pas de ne pas savoir exactement où mènent mes études."},
    {"id": "TU-02", "facet": "incertitude", "text": "Je suis prêt·e à faire des études longues si le projet me plaît."},
    {"id": "TU-03", "facet": "autonomie", "text": "Je préfère m'organiser seul·e plutôt qu'être guidé·e pas à pas."},
]

APTITUDE_ITEMS = [
    {"id": "APT-LOG-01", "kind": "logique", "title": "Défi logique",
     "text": "Tous les membres du club robotique savent coder. Sara ne sait pas coder. Que peut-on en conclure ?",
     "options": ["Sara n'est pas membre du club robotique", "Sara est membre du club robotique", "On ne peut rien conclure"], "answer": 0,
     "irt": {"model": "2pl", "a": 1.1, "b": -0.5}},
    {"id": "APT-GRA-01", "kind": "graphique", "title": "Lire un graphique",
     "text": "Production d'une centrale solaire (MWh) : janvier 40, avril 70, juillet 90, octobre 60. Entre quels relevés la hausse est-elle la plus forte ?",
     "options": ["De janvier à avril", "D'avril à juillet", "De juillet à octobre"], "answer": 0,
     "irt": {"model": "2pl", "a": 1.0, "b": 0.0}},
    {"id": "APT-EST-01", "kind": "estimation", "title": "Estimation",
     "text": "Un panneau solaire produit environ 1,5 kWh par jour. Combien de panneaux faut-il au minimum pour produire 10 kWh par jour ?",
     "options": ["5", "6", "7", "10"], "answer": 2,
     "irt": {"model": "2pl", "a": 1.2, "b": 0.3}},
    {"id": "APT-MOD-01", "kind": "modelisation", "title": "Modéliser",
     "text": "Un forfait coûte 50 DH plus 2 DH par Go consommé. Quelle formule donne le prix P pour x Go ?",
     "options": ["P = 52x", "P = 50 + 2x", "P = 2 + 50x", "P = 50x + 2x"], "answer": 1,
     "irt": {"model": "2pl", "a": 1.3, "b": 0.2}},
    {"id": "APT-SEQ-01", "kind": "logique", "title": "Suite logique",
     "text": "Quel nombre continue la suite : 2, 6, 12, 20, 30, … ?",
     "options": ["36", "40", "42", "48"], "answer": 2,
     "irt": {"model": "2pl", "a": 1.1, "b": 0.6}},
    {"id": "APT-PRO-01", "kind": "estimation", "title": "Proportions",
     "text": "Dans une classe de 30 élèves, 40 % font du sport en club. Combien d'élèves cela représente-t-il ?",
     "options": ["10", "12", "14", "16"], "answer": 1,
     "irt": {"model": "2pl", "a": 1.0, "b": -0.8}},
]

AI_CRITICAL_ITEMS = [
    {"id": "IAC-FAIT-01", "kind": "erreur_factuelle", "title": "L'IA s'est-elle trompée ?",
     "text": "Une IA affirme : « Le Maroc compte 12 régions, et la plus peuplée est Rabat-Salé-Kénitra. » Que faut-il vérifier ?",
     "options": ["Le nombre de régions", "Le nom de la région la plus peuplée", "Rien, tout est juste"], "answer": 1,
     "feedback": "Le Maroc compte bien 12 régions, mais la plus peuplée est Casablanca-Settat. Une réponse sûre d'elle peut contenir une erreur."},
    {"id": "IAC-SRC-01", "kind": "source_inventee", "title": "Une source fiable ?",
     "text": "Pour appuyer sa réponse, une IA cite « une étude de l'université de Fès publiée en 2031 ». Que fais-tu ?",
     "options": ["Je lui fais confiance, elle cite une université", "Je me méfie : la date est impossible, la source est sans doute inventée", "Je recopie la référence dans mon exposé"], "answer": 1,
     "feedback": "Une date dans le futur est un signal clair de source inventée. Il faut toujours retrouver la source originale."},
    {"id": "IAC-BIA-01", "kind": "biais", "title": "Repérer un biais",
     "text": "Tu demandes à une IA de décrire « un ingénieur et une infirmière ». Elle décrit automatiquement un homme et une femme. Qu'en penses-tu ?",
     "options": ["C'est normal, c'est la réalité", "C'est un stéréotype : ces deux métiers sont exercés par des femmes et des hommes", "Ce n'est pas important"], "answer": 1,
     "feedback": "Les IA reproduisent les stéréotypes présents dans leurs données. Les métiers n'ont pas de genre."},
    {"id": "IAC-CAL-01", "kind": "erreur_calcul", "title": "Vérifier un calcul",
     "text": "Une IA écrit : « 15 % de 200, cela fait 35. » Est-ce juste ?",
     "options": ["Oui", "Non, cela fait 30", "Non, cela fait 15"], "answer": 1,
     "feedback": "15 % de 200 = 0,15 × 200 = 30. Les IA peuvent se tromper même sur des calculs simples."},
]

SJT_ITEMS = [
    {"id": "SJT-01", "title": "Journée portes ouvertes",
     "text": "Ton établissement organise une journée portes ouvertes. Quel rôle choisis-tu en premier ?",
     "options": [
         {"label": "Installer le matériel et les stands", "riasec": "R"},
         {"label": "Préparer une expérience à montrer aux visiteurs", "riasec": "I"},
         {"label": "Concevoir les affiches et la décoration", "riasec": "A"},
         {"label": "Accueillir et guider les familles", "riasec": "S"},
         {"label": "Trouver des partenaires et sponsors", "riasec": "E"},
         {"label": "Gérer les inscriptions et le planning", "riasec": "C"}]},
    {"id": "SJT-02", "title": "Projet de classe",
     "text": "Ta classe veut réduire le gaspillage d'eau au lycée. Que proposes-tu de faire ?",
     "options": [
         {"label": "Réparer les robinets qui fuient", "riasec": "R"},
         {"label": "Mesurer la consommation et analyser les chiffres", "riasec": "I"},
         {"label": "Créer une campagne vidéo", "riasec": "A"},
         {"label": "Sensibiliser les plus jeunes", "riasec": "S"},
         {"label": "Convaincre la direction de financer le projet", "riasec": "E"},
         {"label": "Organiser un suivi précis des actions", "riasec": "C"}]},
    {"id": "SJT-03", "title": "Un ami en difficulté",
     "text": "Un ami a raté son contrôle et veut tout abandonner. Que fais-tu d'abord ?",
     "options": [
         {"label": "Je l'aide à refaire les exercices concrètement", "riasec": "R"},
         {"label": "Je cherche avec lui d'où viennent ses erreurs", "riasec": "I"},
         {"label": "Je lui propose une façon originale de réviser", "riasec": "A"},
         {"label": "Je l'écoute et je le rassure", "riasec": "S"},
         {"label": "Je le motive avec un objectif ambitieux", "riasec": "E"},
         {"label": "Je l'aide à faire un planning de révisions", "riasec": "C"}]},
]

SUBJECT_LABELS = {
    "maths": "maths", "pc": "physique-chimie", "svt": "SVT", "francais": "français", "arabe": "arabe", "anglais": "anglais",
    "histgeo": "histoire-géographie", "philo": "philosophie", "nsi": "NSI", "ses": "SES", "eco": "économie", "techno": "technologie",
}


def form_for(level: str) -> dict:
    """Forme adaptée au niveau : collège → cartes 3 choix et 4 mini-défis (logique,
    graphique, estimation, « l'IA s'est-elle trompée ? ») ; lycée → Likert 5 points."""
    college = level in ("MA_3AC", "FR_3E")
    return {
        "version": INSTRUMENT_VERSION,
        "audience": "college" if college else "lycee",
        "riasec": {"scale": LIKERT3 if college else LIKERT5, "items": [{k: v for k, v in it.items() if k != "irt"} for it in RIASEC_ITEMS]},
        "values": {"cards": VALUE_CARDS},
        "self_efficacy": {"scale": LIKERT5, "items": SELF_EFFICACY_ITEMS},
        "adaptability": {"scale": LIKERT5, "items": ADAPTABILITY_ITEMS},
        "tolerance": {"scale": LIKERT5, "items": TOLERANCE_ITEMS},
        "aptitude": {"items": [{k: v for k, v in it.items() if k not in ("answer", "irt")} for it in (APTITUDE_ITEMS[:3] if college else APTITUDE_ITEMS)]},
        "ai_critical": {"items": [{k: v for k, v in it.items() if k not in ("answer", "feedback")} for it in (AI_CRITICAL_ITEMS[:1] if college else AI_CRITICAL_ITEMS)]},
        "sjt": {"items": SJT_ITEMS},
    }
