// Grundinhalte, die beim ersten Start angelegt werden (Rubriken, Einstellungen, Rechtstexte).
import { renderMarkdown } from '../lib/markdown.js';

export const defaultSections = [
  { slug: 'politik', name: 'Politik', description: 'Analysen und Kommentare zum politischen Geschehen.' },
  { slug: 'kultur', name: 'Kultur', description: 'Literatur, Film, Musik, Kunst und alles dazwischen.' },
  { slug: 'gesellschaft', name: 'Gesellschaft', description: 'Wie wir leben, streiten und zusammenhalten.' },
];

export const defaultSettings = {
  site_title: 'Permanente Zwischenlagerung',
  site_tagline: 'Texte über Politik, Kultur und Gesellschaft.',
  podcast_title: 'Apocalypse Podcast Review',
};

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

Beim Aufruf dieser Website verarbeitet unser Hosting-Anbieter Google Cloud EMEA Limited (Velasco, Clanwilliam Place, Dublin 2, Irland; Dienst „Firebase“, Serverstandort Frankfurt am Main) technisch notwendige Daten (IP-Adresse, Datum und Uhrzeit, aufgerufene Seite, Browser-Kennung). Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; unser berechtigtes Interesse liegt im sicheren und stabilen Betrieb der Website. Logfiles werden nach [30] Tagen gelöscht. Mit Google besteht ein Vertrag zur Auftragsverarbeitung; für eine mögliche Übermittlung in die USA stützt sich Google auf das EU-US Data Privacy Framework und Standardvertragsklauseln.

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

export const defaultPages = {
  impressum: { title: 'Impressum', body_md: impressumMd },
  datenschutz: { title: 'Datenschutzerklärung', body_md: datenschutzMd },
  ueber: { title: 'Über diesen Blog', body_md: aboutMd },
};
for (const page of Object.values(defaultPages)) page.body_html = renderMarkdown(page.body_md);
