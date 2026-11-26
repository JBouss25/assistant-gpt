# Orientation 4.0 — plateforme d'orientation (Maroc & mission française)

MVP local de la plateforme décrite dans le prompt maître : moteur de recommandation transparent,
référentiel métiers / formations versionné, pipeline d'IA générative encadré, espaces élève, parent,
conseiller, direction et back-office.

> ⚠️ **Données de démonstration.** Les établissements et les élèves sont fictifs. Les indicateurs D / A / M,
> les seuils d'admission, les coûts et les villes du référentiel sont des **valeurs de démonstration** marquées
> comme telles (sources `SRC-DEMO-*`). Ils doivent être remplacés par des valeurs sourcées et validées par le
> comité scientifique avant tout pilote.

## Lancer en local

Prérequis : Python 3.11+ et Node.js 20+.

```bash
# 1. API (FastAPI) — port 8000
cd orientation/backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
python -m app.seed_demo          # crée orientation.db avec les comptes de démonstration
uvicorn app.main:app --reload --port 8000

# 2. Front (Next.js) — port 3000, dans un autre terminal
cd orientation/frontend
npm install
npm run dev                      # ou : npm run build && npm start
```

Ouvrir http://localhost:3000. Tous les comptes de démo ont le mot de passe `demo1234` ; la page d'accueil
propose un bouton par compte. Documentation de l'API : http://localhost:8000/docs.

| Compte | Ce qu'il permet de tester |
| --- | --- |
| `sami@demo.ma` | Élève de 3e sans évaluation : onboarding → consentement → invitation parent → évaluation → 3 voies de lycée |
| `yasmine@demo.ma` | Cas 2.3 : Tronc commun sciences, Casablanca |
| `adam@demo.ma` | Cas 2.3 : 2e Bac PC, Meknès, budget contraint (pistes A/B/C, simulateur, vœux) |
| `lea@demo.fr` | Cas 2.3 : Terminale mission française, Maths + NSI, Rabat |
| `parent.yasmine@demo.ma` | Espace parent avec partage actif |
| `conseiller.casa@demo.ma` | Cohorte, carte de chaleur, alertes, ateliers, fiche élève imprimable |
| `admin.casa@demo.ma` | Statistiques anonymisées (k ≥ 10), import CSV, journal d'audit |
| `editeur@demo.ma` / `comite@demo.ma` | Back-office du référentiel : brouillon → relecture → validation → publication |

## Tests

```bash
cd orientation/backend && python -m pytest -q        # 41 tests : moteur, banc de 300 cas, API, critères 10.2
python -m app.eval_bench                              # rapport du banc d'évaluation
cd orientation/frontend && npm run typecheck && npm run lint && npm run build
```

## Architecture

```
orientation/
├── backend/                     FastAPI · SQLAlchemy (SQLite en local, PostgreSQL en cible)
│   ├── app/referential/         référentiel versionné (JSON) + validation + indice Avenir +5
│   ├── app/psychometrics/       banque d'items (formes fixes MVP) + estimation des traits avec erreur standard
│   ├── app/engine/              moteur : contraintes dures, score additif, Monte-Carlo, A/B/C, MMR, contrefactuels
│   ├── app/genai/               passerelle LLM multi-fournisseurs + validation automatique + repli gabarits
│   ├── app/routers/             API /api/v1 (auth, élève, parent, conseiller, admin, explorateur, back-office)
│   ├── app/security.py          JWT, RBAC + contrôle par établissement, consentements, chiffrement, audit
│   └── tests/                   pytest
├── frontend/                    Next.js 16 · React 19 · Tailwind · PWA · FR/AR (RTL)/EN
└── docs/                        hypothèses, questions ouvertes, écarts au cahier des charges
```

Variables d'environnement utiles (backend) : `DATABASE_URL`, `JWT_SECRET`, `FIELD_ENCRYPTION_KEY`
(obligatoires en production), `LLM_PROVIDER` (défaut `template`), `PARENTAL_CONSENT_REQUIRED` (défaut `true`),
`K_ANONYMITY` (défaut 10). Front : `API_URL` (défaut `http://127.0.0.1:8000`).

Voir [`docs/hypotheses-et-questions.md`](docs/hypotheses-et-questions.md) pour les hypothèses retenues et ce qui reste à faire.
