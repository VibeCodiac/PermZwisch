# Permanente Zwischenlagerung

Ein schlichter, moderner Blog mit zwei Bereichen:

- **Magazin**: Rubriken *Politik*, *Kultur* und *Gesellschaft* (in den Einstellungen erweiterbar). Es gibt drei Beitragsarten:
  - **Artikel**: Text in Markdown, Titelbild und optional ein Verweis auf einen externen Artikel.
  - **Link-Empfehlung**: verweist auf einen Artikel einer anderen Seite. Titel, Beschreibung, Quelle und Vorschaubild werden automatisch abgerufen.
  - **Fotostrecke**: mehrere Fotos mit Bildunterschriften und Lightbox.
- **Apocalypse Podcasts** (Podcast-Reviews; Name in den Einstellungen änderbar): Spotify- und/oder Apple-Podcasts-Link einfügen. Podcast-Name, Folge, Herausgeber und das **Original-Cover** werden automatisch geholt. Dazu kommen eine Sternebewertung, Buttons „Auf Spotify hören“ und „In Apple Podcasts öffnen“ sowie der eingebettete Player (lädt erst nach Einwilligung).

Weitere Funktionen:

- Redaktionsbereich unter `/admin` für **mehrere Autor\*innen** mit zwei Rollen: Admin und Autor\*in.
- Mediathek, Autorenseiten, Suche, RSS-Feeds, Sitemap und Dark Mode.
- Geplante Veröffentlichungen: Ein Datum in der Zukunft wird erst zu diesem Zeitpunkt sichtbar.
- Impressum, Datenschutzerklärung und „Über uns“ lassen sich im Admin-Bereich bearbeiten (Vorlagen sind vorhanden).

## Technik

Node.js (≥ 20), Express, SQLite (`better-sqlite3`), EJS-Templates und `sharp` für die Bildverarbeitung. Es braucht keinen separaten Datenbankserver: Alles liegt im Ordner `data/` (Datenbank und Uploads).

## Schnellstart (lokal)

```bash
npm install
npm run create-admin -- --email du@example.de --name "Dein Name"
npm run dev
```

Dann <http://localhost:3000> öffnen. Der Login liegt unter <http://localhost:3000/admin>. Weitere Autor\*innen legst du als Admin unter *Nutzer\*innen* an.

Tests: `npm test`

## Betrieb (Produktion)

1. `.env.example` nach `.env` kopieren und ausfüllen. Pflicht sind `SESSION_SECRET` (lang und zufällig) und `BASE_URL`.
2. Die App hinter einem Reverse-Proxy mit HTTPS betreiben (z. B. Caddy oder nginx) und `TRUST_PROXY=1` setzen. In Produktion ist HTTPS Pflicht, sonst funktionieren die Login-Cookies nicht.
3. Zeitzone `TZ=Europe/Berlin` setzen, damit die Veröffentlichungszeiten stimmen. Im Docker-Image ist das bereits eingestellt.
4. **Backups**: den Ordner `data/` regelmäßig sichern.

Mit Docker:

```bash
docker build -t blog .
docker run -d --name blog -p 3000:3000 --env-file .env -v blog-data:/data blog
docker exec -it blog node scripts/create-admin.js
```

Beispiel für Caddy (HTTPS automatisch):

```
www.example.de {
    reverse_proxy localhost:3000
}
```

## Sicherheit

- **HTTP-Header** über Helmet: strikte Content-Security-Policy (nur eigene Skripte, keine Inline-Skripte), HSTS, `frame-ancestors 'none'`, `nosniff`, Referrer-Policy und Permissions-Policy.
- **Login**:
  - Passwörter werden mit bcrypt (Kostenfaktor 12) gespeichert.
  - Rate-Limiting pro IP, Kontosperre für 15 Minuten nach 5 Fehlversuchen.
  - Gleiche Antwortzeit für unbekannte E-Mail-Adressen.
  - Neue Session-ID nach dem Login.
- **Sitzungen**:
  - Cookies sind `HttpOnly`, `Secure` und `SameSite=Lax`; in Produktion mit `__Host-`-Präfix.
  - Laufzeit 8 Stunden.
  - Bei Passwortänderung oder Deaktivierung werden alle Sitzungen beendet.
- **CSRF-Token** für alle Formulare und AJAX-Aufrufe.
- **Rechte**: Autor\*innen bearbeiten nur eigene Beiträge. Nutzerverwaltung, Rubriken und Rechtstexte bleiben Admins vorbehalten.
- **Uploads**:
  - Nur Bilder, max. 15 MB.
  - Jedes Bild wird neu kodiert (WebP), dabei werden EXIF- und GPS-Daten entfernt.
  - Zufällige Dateinamen, eigene restriktive CSP für `/uploads`.
- **Inhalte**: Markdown wird serverseitig bereinigt (kein HTML/JS, keine `javascript:`-Links, Bilder nur aus der eigenen Mediathek). SQL läuft ausschließlich über Prepared Statements.
- **SSRF-Schutz** beim Abrufen von Link-Vorschauen und Podcast-Daten:
  - Private und interne IP-Adressen sind blockiert.
  - Jede Weiterleitung wird einzeln geprüft.
  - Größen- und Zeitlimits.
  - Für Podcast-Daten gilt zusätzlich eine Host-Allowlist.
- **Sonstiges**: allgemeines Rate-Limiting, Redaktionsbereich mit `noindex` und `no-store`, `robots.txt`, `security.txt`.

## Datenschutz & Cookies

- Öffentliche Besucher\*innen erhalten **keine** Cookies außer der eigenen Cookie-Entscheidung, und es gibt kein Tracking.
- Es werden keine externen Schriftarten oder CDNs geladen, sondern nur System-Schriften.
- Podcast-Cover und Vorschaubilder werden **lokal gespeichert**, Besucher\*innen kontaktieren also keine Drittanbieter.
- Spotify- und Apple-Player laden nur nach Einwilligung („Zwei-Klick-Lösung“ plus Cookie-Banner). Die Einstellung lässt sich im Footer jederzeit ändern.

> ⚠️ Impressum und Datenschutzerklärung sind **Vorlagen**. Bitte alle Platzhalter in `[eckigen Klammern]` ersetzen (Admin → Einstellungen → Rechtliche Seiten) und im Zweifel rechtlich prüfen lassen.

## Projektstruktur

```
src/
  app.js, server.js, config.js, db.js
  lib/       Sicherheit, Markdown, Bilder, Podcast-/Link-Abruf, Abfragen
  routes/    public.js, admin/ (Beiträge, Podcasts, Medien, Nutzer, Einstellungen)
views/       EJS-Templates (öffentlich + admin/)
public/      CSS, JS, Favicon
scripts/     create-admin.js
test/        Integrationstests
```
