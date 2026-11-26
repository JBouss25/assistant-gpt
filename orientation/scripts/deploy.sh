#!/bin/sh
# Installe ou met à jour la plateforme sur le serveur (depuis le dossier orientation/).
#   ./scripts/deploy.sh
set -eu
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "Fichier .env absent : lancez d'abord ./scripts/gen-env.sh"; exit 1; }
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

echo "==> Récupération de la dernière version"
git pull --ff-only

echo "==> Sauvegarde de sécurité avant mise à jour"
if $COMPOSE ps --status running --services 2>/dev/null | grep -qx db; then
  $COMPOSE run --rm --no-deps backup once
fi

echo "==> Construction et redémarrage (migrations appliquées automatiquement)"
mkdir -p backups
$COMPOSE up -d --build --remove-orphans --wait
docker image prune -f >/dev/null

echo "==> État des services"
$COMPOSE ps
