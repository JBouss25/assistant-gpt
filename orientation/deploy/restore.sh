#!/bin/sh
# Restauration d'une sauvegarde chiffrée. À lancer depuis le dossier orientation/ :
#   ./deploy/restore.sh backups/orientation-AAAAMMJJ-HHMMSS.dump.enc
# ATTENTION : remplace le contenu actuel de la base.
set -eu
file="${1:?Usage : ./deploy/restore.sh backups/<fichier>.dump.enc}"
[ -f "$file" ] || { echo "Fichier introuvable : $file" >&2; exit 1; }
printf "La base actuelle va être remplacée par %s. Taper RESTAURER pour confirmer : " "$file"
read -r answer
[ "$answer" = "RESTAURER" ] || { echo "Annulé."; exit 1; }
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
$COMPOSE stop api web
name=$(basename "$file")
$COMPOSE run --rm --no-deps --entrypoint sh backup -c \
  "openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in /backups/$name \
   | pg_restore -h db -U \"\$PGUSER\" -d \"\$PGDATABASE\" --clean --if-exists --no-owner"
$COMPOSE up -d --wait api web
echo "Restauration terminée."
