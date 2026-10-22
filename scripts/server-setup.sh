#!/usr/bin/env bash
# Erstinstallation auf dem Server: legt .env an (mit zufälligem Geheimnis) und startet den Blog.
# Aufruf: ./scripts/server-setup.sh meine-domain.de
set -euo pipefail
cd "$(dirname "$0")/.."

DOMAIN="${1:-}"
DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN#www.}"; DOMAIN="${DOMAIN%%/*}"
if [[ -z "$DOMAIN" || "$DOMAIN" == "DEINE-DOMAIN.de" ]]; then
  echo "Bitte die Domain angeben, z. B.: ./scripts/server-setup.sh meine-domain.de" >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  umask 077
  cat > .env <<ENV
NODE_ENV=production
DOMAIN=${DOMAIN}
BASE_URL=https://${DOMAIN}
SESSION_SECRET=$(openssl rand -hex 48)
TRUST_PROXY=1
ENV
  echo ".env für ${DOMAIN} angelegt."
else
  echo ".env existiert bereits – wird nicht verändert."
fi

docker compose up -d --build
echo "Fertig. Der Blog läuft gleich unter https://${DOMAIN} (sobald die DNS-Einträge auf diesen Server zeigen)."
