#!/usr/bin/env bash
# Einmalige Einrichtung des Blogs auf Firebase – in der Google Cloud Shell ausführen.
# Aufruf: ./scripts/firebase-setup.sh PROJEKT-ID [DOMAIN]
# Das Skript kann gefahrlos mehrfach laufen; Vorhandenes bleibt unverändert.
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT="${1:-}"
DOMAIN="${2:-permanent-blog.de}"
REGION="europe-west3" # Frankfurt
if [[ -z "$PROJECT" ]]; then
  echo "Bitte die Projekt-ID angeben, z. B.: ./scripts/firebase-setup.sh permanent-blog-1a2b3" >&2
  exit 1
fi
BUCKET="${PROJECT}-blog-bilder"

step() { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }

step "Projekt $PROJECT auswählen"
gcloud config set project "$PROJECT" --quiet

step "Abrechnung prüfen (Blaze-Tarif)"
gcloud services enable cloudbilling.googleapis.com --quiet
if [[ "$(gcloud billing projects describe "$PROJECT" --format='value(billingEnabled)' 2>/dev/null)" != "True" ]]; then
  echo "Für dieses Projekt ist noch kein Blaze-Tarif aktiv." >&2
  echo "Firebase Console → Zahnrad → Nutzung und Abrechnung → Tarif ändern → Blaze. Danach das Skript erneut starten." >&2
  exit 1
fi

step "Google-Dienste aktivieren (dauert 1–2 Minuten)"
gcloud services enable \
  compute.googleapis.com firestore.googleapis.com storage.googleapis.com \
  cloudfunctions.googleapis.com run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com eventarc.googleapis.com \
  pubsub.googleapis.com firebase.googleapis.com firebasehosting.googleapis.com --quiet

step "Datenbank anlegen (Firestore, Frankfurt)"
if gcloud firestore databases describe --database='(default)' >/dev/null 2>&1; then
  echo "Datenbank existiert bereits."
else
  gcloud firestore databases create --database='(default)' --location="$REGION" --type=firestore-native --quiet
fi

step "Speicher für Fotos anlegen (Cloud Storage, Frankfurt)"
if gcloud storage buckets describe "gs://$BUCKET" >/dev/null 2>&1; then
  echo "Speicher existiert bereits."
else
  gcloud storage buckets create "gs://$BUCKET" --location="$REGION" \
    --uniform-bucket-level-access --public-access-prevention --quiet
fi

step "Geheimen Schlüssel für Anmeldungen erzeugen"
if gcloud secrets describe SESSION_SECRET >/dev/null 2>&1; then
  echo "Schlüssel existiert bereits."
else
  openssl rand -hex 48 | tr -d '\n' | gcloud secrets create SESSION_SECRET --data-file=- \
    --replication-policy=user-managed --locations="$REGION" --quiet
fi

step "Berechtigungen für den Blog-Dienst setzen"
NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
SA="${NUMBER}-compute@developer.gserviceaccount.com"
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member="serviceAccount:$SA" --role=roles/storage.objectAdmin --quiet >/dev/null
for role in roles/datastore.user roles/secretmanager.secretAccessor roles/cloudbuild.builds.builder \
  roles/logging.logWriter roles/artifactregistry.writer; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$SA" \
    --role="$role" --condition=None --quiet >/dev/null
done
echo "Erledigt."

step "Einstellungen schreiben"
printf '{\n  "projects": { "default": "%s" }\n}\n' "$PROJECT" > .firebaserc
cat > ".env.$PROJECT" <<ENV
BASE_URL=https://$DOMAIN
UPLOAD_BUCKET=$BUCKET
ENV
echo "Domain: $DOMAIN · Fotos: gs://$BUCKET"

step "Programmpakete installieren"
npm ci --no-audit --no-fund

step "Bei Firebase anmelden"
if ! npx firebase projects:list >/dev/null 2>&1; then
  echo "Gleich erscheint ein Link: öffnen, mit deinem Google-Konto anmelden, den Code kopieren und hier einfügen."
  npx firebase login --no-localhost
fi

step "Hosting-Bereich prüfen"
if ! npx firebase hosting:sites:get "$PROJECT" --project "$PROJECT" >/dev/null 2>&1; then
  npx firebase hosting:sites:create "$PROJECT" --project "$PROJECT" || true
fi

step "Blog hochladen (beim ersten Mal 3–6 Minuten)"
npx firebase deploy --only functions,hosting,firestore:rules --project "$PROJECT" --force

printf '\n\033[1;32m✔ Fertig!\033[0m Der Blog läuft unter https://%s.web.app\n' "$PROJECT"
echo "Nächster Schritt – Admin-Konto anlegen:  ./scripts/firebase-admin.sh"
