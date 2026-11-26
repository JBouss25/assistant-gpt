#!/bin/sh
# Applique les migrations avant de démarrer l'API (idempotent).
set -e
alembic upgrade head
exec "$@"
