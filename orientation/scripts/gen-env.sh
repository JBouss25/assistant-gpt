#!/bin/sh
# Génère un fichier .env avec des secrets aléatoires (ne jamais le commiter).
set -e
cd "$(dirname "$0")/.."
if [ -f .env ]; then echo ".env existe déjà : rien n'est modifié."; exit 0; fi
rand() { openssl rand -base64 "$1" | tr -d '\n'; }
cat > .env <<ENV
APP_ENV=dev
POSTGRES_DB=orientation
POSTGRES_USER=orientation
POSTGRES_PASSWORD=$(rand 24 | tr '+/' '-_' | tr -d '=')
JWT_SECRET=$(rand 48)
# Clé Fernet : 32 octets en base64 « URL-safe ». La perdre rend illisibles les données chiffrées.
FIELD_ENCRYPTION_KEY=$(openssl rand -base64 32 | tr '+/' '-_')
LLM_PROVIDER=template
PARENTAL_CONSENT_REQUIRED=true
PUBLIC_URL=http://localhost:3000
WEB_PORT=3000
ENV
chmod 600 .env
echo ".env créé. Sauvegardez FIELD_ENCRYPTION_KEY en lieu sûr : sans elle, les données chiffrées sont perdues."
