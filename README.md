# Permanente Zwischenlagerung

Ein schlichter, moderner Blog mit zwei Bereichen:

- **Magazin**: Rubriken *Politik*, *Kultur* und *Gesellschaft* (in den Einstellungen erweiterbar). Es gibt drei Beitragsarten:
  - **Artikel**: Text in Markdown, Titelbild und optional ein Verweis auf einen externen Artikel.
  - **Link-Empfehlung**: verweist auf einen Artikel einer anderen Seite. Titel, Beschreibung, Quelle und Vorschaubild werden automatisch abgerufen.
  - **Fotostrecke**: mehrere Fotos mit Bildunterschriften und Lightbox.
- **Apocalypse Podcast Review** (Podcast-Besprechungen; Name in den Einstellungen änderbar): Spotify- und/oder Apple-Podcasts-Link einfügen. Podcast-Name, Folge, Herausgeber und das **Original-Cover** werden automatisch geholt. Dazu kommen eine Sternebewertung, Buttons „Auf Spotify hören“ und „In Apple Podcasts öffnen“ sowie der eingebettete Player (lädt erst nach Einwilligung).

Weitere Funktionen:

- Redaktionsbereich unter `/admin` für **mehrere Autor\*innen** mit zwei Rollen: Admin und Autor\*in.
- Mediathek, Autorenseiten, Suche, RSS-Feeds und Sitemap.
- Fotos werden schon im Browser auf Webgröße verkleinert, das spart Datenvolumen beim Hochladen vom Handy.
- Geplante Veröffentlichungen: Ein Datum in der Zukunft wird erst zu diesem Zeitpunkt sichtbar.
- Impressum, Datenschutzerklärung und „Über uns“ lassen sich im Admin-Bereich bearbeiten (Vorlagen sind vorhanden).

## Technik

Node.js 22, Express, EJS-Templates und `sharp` für die Bildverarbeitung. Online läuft der Blog auf **Firebase** in Frankfurt (`europe-west3`):

| Teil | Firebase/Google-Dienst |
|---|---|
| Statische Dateien (CSS, Schriften, Skripte) und Zwischenspeicher (CDN) | Firebase Hosting |
| Die App selbst | Cloud Functions (2. Generation, `src/index.js`) |
| Beiträge, Reviews, Nutzer*innen, Einstellungen | Firestore |
| Fotos und Cover | Cloud Storage (eigener, nicht öffentlicher Bucket) |
| Sitzungsschlüssel | Secret Manager |

Lokal und in den Tests ersetzt eine JSON-Datei (`data/blog.json`) bzw. der Arbeitsspeicher die Datenbank, Bilder liegen dann in `data/uploads/`. Umschalten lässt sich das mit `DATA_DRIVER` (`firestore`, `file` oder `memory`).

## Schnellstart (lokal)

```bash
npm install
npm run create-admin -- --email du@example.de --name "Dein Name"
npm run dev
```

Dann <http://localhost:3000> öffnen. Der Login liegt unter <http://localhost:3000/admin>. Weitere Autor\*innen legst du als Admin unter *Nutzer\*innen* an.

Tests: `npm test`

## Online stellen (Firebase)

Schritt-für-Schritt-Anleitung, auch vom iPad aus machbar: **[HOSTING.md](HOSTING.md)**

Kurzfassung: Firebase-Projekt mit Blaze-Tarif anlegen, dann in der Google Cloud Shell:

```bash
git clone https://github.com/VibeCodiac/PermZwisch.git && cd PermZwisch
./scripts/firebase-setup.sh PROJEKT-ID permanent-blog.de   # einmalig: Dienste, Datenbank, Speicher, Upload
./scripts/firebase-admin.sh                                 # Admin-Konto anlegen
./scripts/firebase-deploy.sh                                # später: Updates veröffentlichen
```

## Sicherheit

- **HTTP-Header** über Helmet: strikte Content-Security-Policy (nur eigene Skripte, keine Inline-Skripte), HSTS, `frame-ancestors 'none'`, `nosniff`, Referrer-Policy und Permissions-Policy.
- **Login**:
  - Passwörter werden mit bcrypt (Kostenfaktor 12) gespeichert.
  - Rate-Limiting pro IP, Kontosperre für 15 Minuten nach 5 Fehlversuchen.
  - Gleiche Antwortzeit für unbekannte E-Mail-Adressen.
  - Neue Sitzung nach dem Login.
- **Sitzungen**:
  - Ein einziges, mit HMAC-SHA256 signiertes Cookie `__session` (Firebase Hosting reicht nur dieses Cookie weiter): `HttpOnly`, `Secure`, `SameSite=Lax`.
  - Laufzeit 8 Stunden, verlängert sich bei Aktivität.
  - Bei Passwortänderung oder Deaktivierung werden alle Sitzungen beendet.
- **CSRF-Token** für alle Formulare und AJAX-Aufrufe.
- **Rechte**: Autor\*innen bearbeiten nur eigene Beiträge. Nutzerverwaltung, Rubriken und Rechtstexte bleiben Admins vorbehalten.
- **Uploads**:
  - Nur Bilder, max. 15 MB pro Datei; der Browser verkleinert Fotos vorab auf max. 2400 px.
  - Jedes Bild wird neu kodiert (WebP), dabei werden EXIF- und GPS-Daten entfernt.
  - Zufällige Dateinamen, eigene restriktive CSP für `/uploads`.
- **Inhalte**: Markdown wird serverseitig bereinigt (kein HTML/JS, keine `javascript:`-Links, Bilder nur aus der eigenen Mediathek).
- **Datenbank**: Firestore-Regeln sperren jeden direkten Zugriff aus dem Browser; nur die App selbst liest und schreibt.
- **SSRF-Schutz** beim Abrufen von Link-Vorschauen und Podcast-Daten:
  - Private und interne IP-Adressen sind blockiert.
  - Jede Weiterleitung wird einzeln geprüft.
  - Größen- und Zeitlimits.
  - Für Podcast-Daten gilt zusätzlich eine Host-Allowlist.
- **Sonstiges**: allgemeines Rate-Limiting, Redaktionsbereich mit `noindex` und `no-store`, `robots.txt`, `security.txt`.

## Datenschutz & Cookies

- Öffentliche Besucher\*innen erhalten **keine** Cookies außer der eigenen Cookie-Entscheidung, und es gibt kein Tracking.
- Es werden keine externen Schriftarten oder CDNs geladen. Schrift ist **Aptos**, sofern auf dem Gerät installiert (Windows 11, Microsoft 365); sonst das ähnliche, lokal gehostete **Figtree** (SIL Open Font License, `web/static/fonts/`).
- Podcast-Cover und Vorschaubilder werden **im eigenen Speicher abgelegt**, Besucher\*innen kontaktieren also weder Spotify noch Apple.
- Spotify- und Apple-Player laden nur nach Einwilligung („Zwei-Klick-Lösung“ plus Cookie-Banner). Die Einstellung lässt sich im Footer jederzeit ändern.

> ⚠️ Impressum und Datenschutzerklärung sind **Vorlagen**. Bitte alle Platzhalter in `[eckigen Klammern]` ersetzen (Admin → Einstellungen → Rechtliche Seiten) und im Zweifel rechtlich prüfen lassen.

## Projektstruktur

```
src/
  index.js       Einstieg für Firebase (Cloud Function)
  server.js      lokaler Entwicklungsserver
  app.js, config.js, data.js (Datenzugriff mit Zwischenspeicher)
  store/         Firestore-, Datei- und Speicher-Treiber, Grundinhalte
  lib/           Sicherheit, Sitzung, Uploads, Markdown, Bilder, Podcast-/Link-Abruf, Abfragen
  routes/        public.js, admin/ (Beiträge, Podcasts, Medien, Nutzer, Einstellungen)
views/           EJS-Templates (öffentlich + admin/)
web/static/      CSS, Schriften, JS, Favicon (liefert Firebase Hosting direkt aus)
scripts/         create-admin.js, firebase-setup.sh, firebase-admin.sh, firebase-deploy.sh
firebase.json, firestore.rules
test/            Integrationstests
```
