#!/usr/bin/env bash
# Neueste Version von GitHub holen und auf Firebase veröffentlichen. Inhalte bleiben erhalten.
# In der Google Cloud Shell ausführen.
set -euo pipefail
cd "$(dirname "$0")/.."
PROJECT="$(node -p "require('./.firebaserc').projects.default" 2>/dev/null || true)"
if [[ -z "$PROJECT" ]]; then
  echo "Bitte zuerst ./scripts/firebase-setup.sh PROJEKT-ID ausführen." >&2
  exit 1
fi
git pull --ff-only
npm ci --no-audit --no-fund
npx firebase deploy --only functions,hosting,firestore:rules --project "$PROJECT" --force
echo "Update veröffentlicht: https://${PROJECT}.web.app"
