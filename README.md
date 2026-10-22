# Permanente Zwischenlagerung

Ein schlichter, moderner Blog mit zwei Bereichen:

- **Magazin**: Rubriken *Politik*, *Kultur* und *Gesellschaft* (in den Einstellungen erweiterbar). Es gibt drei Beitragsarten:
  - **Artikel**: Text in Markdown, Titelbild und optional ein Verweis auf einen externen Artikel.
  - **Link-Empfehlung**: verweist auf einen Artikel einer anderen Seite. Titel, Beschreibung, Quelle und Vorschaubild werden automatisch abgerufen.
  - **Fotostrecke**: mehrere Fotos mit Bildunterschriften und Lightbox.
- **Apocalypse Podcast Review** (Podcast-Besprechungen; Name in den Einstellungen änderbar): Spotify- und/oder Apple-Podcasts-Link einfügen. Podcast-Name, Folge, Herausgeber und das **Original-Cover** werden automatisch geholt. Dazu kommen eine Sternebewertung, Buttons „Auf Spotify hören“ und „In Apple Podcasts öffnen“ sowie der eingebettete Player (lädt erst nach Einwilligung).

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

## Online stellen

Schritt-für-Schritt-Anleitung (Hetzner-Server, eigene Domain, automatisches HTTPS): **[HOSTING.md](HOSTING.md)**

Kurzfassung für Technikerfahrene: Auf einem Server mit Docker reicht `./scripts/server-setup.sh meine-domain.de`. Das erzeugt die `.env` und startet App und Caddy (`docker-compose.yml`, `deploy/Caddyfile`). Updates gehen mit `./scripts/update.sh`.

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
- Es werden keine externen Schriftarten oder CDNs geladen. Schrift ist **Aptos**, sofern auf dem Gerät installiert (Windows 11, Microsoft 365); sonst das ähnliche, lokal gehostete **Figtree** (SIL Open Font License, `public/fonts/`).
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
