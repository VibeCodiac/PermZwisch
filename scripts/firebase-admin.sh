#!/usr/bin/env bash
# Legt in der Firebase-Datenbank ein Admin-Konto an (oder setzt dessen Passwort neu).
# In der Google Cloud Shell ausführen, nachdem firebase-setup.sh gelaufen ist.
set -euo pipefail
cd "$(dirname "$0")/.."
PROJECT="$(node -p "require('./.firebaserc').projects.default" 2>/dev/null || true)"
if [[ -z "$PROJECT" ]]; then
  echo "Bitte zuerst ./scripts/firebase-setup.sh PROJEKT-ID ausführen." >&2
  exit 1
fi
if ! gcloud auth application-default print-access-token >/dev/null 2>&1; then
  echo "Einmalige Anmeldung für den Datenbank-Zugriff: Link öffnen, anmelden, Code einfügen."
  gcloud auth application-default login --no-launch-browser
fi
DATA_DRIVER=firestore GOOGLE_CLOUD_PROJECT="$PROJECT" GCLOUD_PROJECT="$PROJECT" \
  UPLOAD_BUCKET="${PROJECT}-blog-bilder" node scripts/create-admin.js "$@"
