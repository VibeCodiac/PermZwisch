#!/usr/bin/env bash
# Holt die neueste Version aus GitHub und startet den Blog neu. Daten bleiben erhalten.
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
docker compose up -d --build
docker image prune -f >/dev/null
echo "Update abgeschlossen."
