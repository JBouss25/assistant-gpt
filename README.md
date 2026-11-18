# assistant-gpt

Assistant IA pour la physique-chimie (Terminale, France). L'assistant guide l'élève par des questions et des indices, sans donner directement les réponses aux exercices.

Déploiement visé : https://iaoosted.oostudy.ma

## Plan Node / React / Express (architecture cible)

```
Moodle (SSO, émet un JWT HS256)
   │  lien ?token=...
   ▼
frontend/  React + TypeScript + Vite   ── iaoosted.oostudy.ma
   │  POST /api/chat  (Authorization: Bearer <JWT>)
   ▼
backend/   Node.js + Express           ── api.iaoosted.oostudy.ma
   ├── OpenAI (Chat Completions)
   └── Supabase (PostgreSQL : conversations, messages)
```

- `backend/` : API Express. Vérifie le JWT, limite le débit (`/api`), filtre les origines (CORS), appelle OpenAI et enregistre les échanges. `backend/sql/schema.sql` crée les tables Supabase.
- `frontend/` : interface de chat. Lit le jeton dans l'URL, sans le stocker dans le navigateur.
- `backend/Dockerfile` : image de l'API.

### Lancer en local

Backend :

```bash
cd backend
cp .env.example .env        # renseigner OPENAI_API_KEY et JWT_SECRET (openssl rand -base64 32)
npm install
npm run dev                 # http://localhost:3001
```

Frontend (dans un autre terminal) :

```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173, /api relayé vers le backend
```

Ouvrir `http://localhost:5173/?token=<JWT signé avec JWT_SECRET>`.

Sans `SUPABASE_URL` et `SUPABASE_SERVICE_KEY`, les messages restent en mémoire et sont perdus au redémarrage.

### Vérifications de base

- `GET /health` renvoie `{"status":"ok"}`.
- `POST /api/chat` sans jeton renvoie 401, avec un jeton invalide 401, avec un message vide 400.

## Application Streamlit (prototype)

Le dossier `prototype/` contient une version Streamlit simple, destinée aux démos rapides. Ce n'est pas la version de production.

```bash
cd prototype
pip install -r requirements.txt
export OPENAI_API_KEY=sk-...   # ou .streamlit/secrets.toml
streamlit run app.py
```

Variable optionnelle : `OPENAI_MODEL` (défaut `gpt-4o-mini`).

## Sécurité

Ne jamais committer de clé : `.env`, `.env.local` et `.streamlit/secrets.toml` sont dans `.gitignore`. Le secret `JWT_SECRET` doit être identique côté Moodle et côté API. La clé `SUPABASE_SERVICE_KEY` n'est utilisée que par le backend.
