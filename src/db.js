import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from './config.js';
import { renderMarkdown } from './lib/markdown.js';

if (config.dbPath !== ':memory:') fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
fs.mkdirSync(config.uploadDir, { recursive: true });

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'author' CHECK (role IN ('admin', 'author')),
  bio TEXT NOT NULL DEFAULT '',
  avatar_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
  active INTEGER NOT NULL DEFAULT 1,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY,
  file TEXT NOT NULL UNIQUE,
  width INTEGER,
  height INTEGER,
  alt TEXT NOT NULL DEFAULT '',
  uploader_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sections (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'article' CHECK (kind IN ('article', 'link', 'gallery')),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  excerpt TEXT NOT NULL DEFAULT '',
  body_md TEXT NOT NULL DEFAULT '',
  body_html TEXT NOT NULL DEFAULT '',
  cover_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
  section_id INTEGER REFERENCES sections(id) ON DELETE SET NULL,
  author_id INTEGER NOT NULL REFERENCES users(id),
  link_url TEXT,
  link_title TEXT,
  link_source TEXT,
  link_description TEXT,
  link_image_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS posts_published ON posts(status, published_at);

CREATE TABLE IF NOT EXISTS post_images (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  caption TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, media_id)
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  podcast_name TEXT NOT NULL DEFAULT '',
  episode_title TEXT NOT NULL DEFAULT '',
  publisher TEXT NOT NULL DEFAULT '',
  artwork_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
  spotify_url TEXT,
  apple_url TEXT,
  rating INTEGER NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
  excerpt TEXT NOT NULL DEFAULT '',
  body_md TEXT NOT NULL DEFAULT '',
  body_html TEXT NOT NULL DEFAULT '',
  author_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS reviews_published ON reviews(status, published_at);

CREATE TABLE IF NOT EXISTS pages (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body_md TEXT NOT NULL DEFAULT '',
  body_html TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

// ---- Grunddaten anlegen (nur wenn noch nicht vorhanden) ----

const seedSections = [
  ['politik', 'Politik', 'Analysen und Kommentare zum politischen Geschehen.'],
  ['kultur', 'Kultur', 'Literatur, Film, Musik, Kunst und alles dazwischen.'],
  ['gesellschaft', 'Gesellschaft', 'Wie wir leben, streiten und zusammenhalten.'],
];
const insertSection = db.prepare(
  'INSERT OR IGNORE INTO sections (slug, name, description, position) VALUES (?, ?, ?, ?)'
);
seedSections.forEach(([slug, name, desc], i) => insertSection.run(slug, name, desc, i));

const seedSettings = {
  site_title: 'Permanente Zwischenlagerung',
  site_tagline: 'Texte über Politik, Kultur und Gesellschaft.',
  podcast_title: 'Apocalypse Podcast Review',
};
const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(seedSettings)) insertSetting.run(k, v);
// Umbenennung des Podcast-Bereichs (nur, wenn der alte Standardname noch gesetzt ist)
db.prepare("UPDATE settings SET value = 'Apocalypse Podcast Review' WHERE key = 'podcast_title' AND value = 'Apocalypse Podcasts'").run();

const impressumMd = `## Angaben gemäß § 5 DDG

[Vorname Nachname]
[Straße Hausnummer]
[PLZ Ort]

## Kontakt

E-Mail: [ihre@adresse.de]
Telefon: [optional]

## Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV

[Vorname Nachname]
[Anschrift wie oben]

## Haftung für Links

Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber verantwortlich. Bei Bekanntwerden von Rechtsverletzungen werden wir derartige Links umgehend entfernen.

## Urheberrecht

Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen dem deutschen Urheberrecht. Podcast-Cover und Logos sind Eigentum der jeweiligen Rechteinhaber und werden ausschließlich zur Kennzeichnung der besprochenen Inhalte verwendet.

> **Hinweis:** Bitte ersetzen Sie alle Angaben in eckigen Klammern. Diese Vorlage ersetzt keine Rechtsberatung.`;

const datenschutzMd = `## 1. Verantwortlicher

[Vorname Nachname, Anschrift, E-Mail] – siehe [Impressum](/impressum).

## 2. Hosting und Server-Logfiles

Beim Aufruf dieser Website verarbeitet unser Hosting-Anbieter [Name, Anschrift] technisch notwendige Daten (IP-Adresse, Datum und Uhrzeit, aufgerufene Seite, Browser-Kennung). Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; unser berechtigtes Interesse liegt im sicheren und stabilen Betrieb der Website. Logfiles werden nach [7] Tagen gelöscht.

## 3. Cookies und lokale Speicherung

Für normale Besucherinnen und Besucher setzen wir **keine Tracking- oder Analyse-Cookies**. Wir verwenden lediglich:

- **consent** – speichert Ihre Entscheidung zu externen Medien (Laufzeit 12 Monate). Rechtsgrundlage: § 25 Abs. 2 Nr. 2 TDDDG.
- **Sitzungs-Cookie** – nur für angemeldete Autorinnen und Autoren im Redaktionsbereich, technisch notwendig, wird beim Abmelden gelöscht.

Sie können Ihre Einstellungen jederzeit über den Link „Cookie-Einstellungen“ im Fußbereich ändern.

## 4. Externe Medien (Spotify, Apple Podcasts)

In Podcast-Besprechungen können Player von Spotify (Spotify AB, Schweden) und Apple Podcasts (Apple Distribution International Ltd., Irland) eingebunden werden. Diese werden **erst geladen, wenn Sie aktiv zustimmen**. Erst dann wird eine Verbindung zu den Servern des jeweiligen Anbieters hergestellt, wobei u. a. Ihre IP-Adresse übertragen wird und der Anbieter ggf. Cookies setzt. Rechtsgrundlage ist Ihre Einwilligung (Art. 6 Abs. 1 lit. a DSGVO, § 25 Abs. 1 TDDDG), die Sie jederzeit widerrufen können. Cover-Bilder werden von uns lokal gespeichert und ohne Verbindung zu Dritten ausgeliefert.

## 5. Externe Links

Verlinkte Artikel anderer Websites öffnen sich erst nach einem Klick. Für die Datenverarbeitung auf diesen Seiten ist der jeweilige Anbieter verantwortlich.

## 6. Ihre Rechte

Sie haben das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21 DSGVO). Zudem können Sie sich bei einer Datenschutz-Aufsichtsbehörde beschweren.

> **Hinweis:** Bitte ergänzen Sie die Angaben in eckigen Klammern. Diese Vorlage ersetzt keine Rechtsberatung.`;

const aboutMd = `Dieser Blog sammelt Texte über Politik, Kultur und Gesellschaft – und Besprechungen von Podcasts, die sich lohnen.

Die Beiträge stammen von mehreren Autorinnen und Autoren. Mehr über sie erfahren Sie jeweils über einen Klick auf ihren Namen.`;

const insertPage = db.prepare(
  'INSERT OR IGNORE INTO pages (slug, title, body_md, body_html) VALUES (?, ?, ?, ?)'
);
insertPage.run('impressum', 'Impressum', impressumMd, renderMarkdown(impressumMd));
insertPage.run('datenschutz', 'Datenschutzerklärung', datenschutzMd, renderMarkdown(datenschutzMd));
insertPage.run('ueber', 'Über diesen Blog', aboutMd, renderMarkdown(aboutMd));

export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
