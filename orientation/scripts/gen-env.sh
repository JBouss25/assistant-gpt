#!/bin/sh
# Génère .env avec des secrets aléatoires (ne jamais le commiter).
# Usage : ./scripts/gen-env.sh [dev|demo|production] [domaine] [email-admin]
#   ex. : ./scripts/gen-env.sh demo ooavenir.oostudy.ma admin@oostudy.ma
set -e
cd "$(dirname "$0")/.."
MODE="${1:-dev}"
DOMAIN="${2:-localhost}"
ADMIN_EMAIL="${3:-admin@example.org}"
case "$MODE" in dev|demo|production) ;; *) echo "Mode invalide : $MODE (dev, demo ou production)"; exit 1;; esac
if [ -f .env ]; then echo ".env existe déjà : rien n'est modifié (supprimez-le d'abord pour le régénérer)."; exit 0; fi
rand() { openssl rand -base64 "$1" | tr -d '\n=' | tr '+/' '-_'; }
if [ "$DOMAIN" = "localhost" ]; then PUBLIC_URL=http://localhost:3000; else PUBLIC_URL="https://$DOMAIN"; fi
umask 077
cat > .env <<ENV
# dev : poste local · demo : démo en ligne (données fictives) · production : vrais élèves
APP_ENV=$MODE
DOMAIN=$DOMAIN
ACME_EMAIL=$ADMIN_EMAIL
PUBLIC_URL=$PUBLIC_URL
WEB_PORT=3000

POSTGRES_DB=orientation
POSTGRES_USER=orientation
POSTGRES_PASSWORD=$(rand 24)

# Secrets applicatifs. Perdre FIELD_ENCRYPTION_KEY rend illisibles les données chiffrées : sauvegardez-la hors du serveur.
JWT_SECRET=$(rand 48)
FIELD_ENCRYPTION_KEY=$(openssl rand -base64 32 | tr '+/' '-_')
# Phrase de chiffrement des sauvegardes : indispensable pour restaurer, à conserver hors du serveur.
BACKUP_PASSPHRASE=$(rand 32)
BACKUP_RETENTION_DAYS=14

# Envoi des invitations parent par e-mail (obligatoire en production). Ex. boîte OVH : ssl0.ovh.net, port 465.
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
MAIL_FROM=

LLM_PROVIDER=template
PARENTAL_CONSENT_REQUIRED=true
ENV
echo ".env créé en mode $MODE pour $PUBLIC_URL."
echo "Copiez FIELD_ENCRYPTION_KEY et BACKUP_PASSPHRASE dans un gestionnaire de mots de passe."
