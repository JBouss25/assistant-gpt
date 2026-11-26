#!/bin/sh
# Sauvegarde quotidienne chiffrée de PostgreSQL (exécutée par le service « backup »).
# Fichiers : /backups/orientation-AAAAMMJJ-HHMMSS.dump.enc — AES-256, clé dérivée de BACKUP_PASSPHRASE.
set -eu
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE manquant}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"

backup_once() {
  stamp=$(date -u +%Y%m%d-%H%M%S)
  target="/backups/orientation-$stamp.dump.enc"
  pg_dump -h db -U "$PGUSER" -d "$PGDATABASE" -Fc \
    | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$target.tmp"
  mv "$target.tmp" "$target"
  find /backups -name 'orientation-*.dump.enc' -mtime +"$RETENTION_DAYS" -delete
  echo "$(date -u +%FT%TZ) sauvegarde OK : $target ($(du -h "$target" | cut -f1))"
}

if [ "${1:-}" = "once" ]; then
  backup_once
  exit 0
fi
while true; do
  backup_once || echo "$(date -u +%FT%TZ) ÉCHEC de la sauvegarde" >&2
  sleep "$INTERVAL"
done
