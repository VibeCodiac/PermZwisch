import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-test-'));
process.env.DB_PATH = ':memory:';

const { default: request } = await import('supertest');
const { default: sharp } = await import('sharp');
const { default: bcrypt } = await import('bcryptjs');
const { createApp } = await import('../src/app.js');
const { db } = await import('../src/db.js');
const { parseSpotifyUrl, parseAppleUrl } = await import('../src/lib/podcast.js');
const { isPrivateAddress } = await import('../src/lib/safe-fetch.js');
const { renderMarkdown } = await import('../src/lib/markdown.js');

const app = createApp();
const PASSWORD = 'richtig-gutes-passwort-1';
let png;

before(async () => {
  const hash = bcrypt.hashSync(PASSWORD, 4);
  db.prepare("INSERT INTO users (email, name, slug, role, password_hash) VALUES ('admin@test.de', 'Ada Admin', 'ada-admin', 'admin', ?)").run(hash);
  db.prepare("INSERT INTO users (email, name, slug, role, password_hash) VALUES ('autor@test.de', 'Bo Autor', 'bo-autor', 'author', ?)").run(hash);
  png = await sharp({ create: { width: 640, height: 400, channels: 3, background: '#c2522c' } })
    .withMetadata({ exif: { IFD0: { Copyright: 'geheim' } } })
    .jpeg()
    .toBuffer();
});

const csrfFrom = (html) => html.match(/name="_csrf" value="([a-f0-9]+)"/)[1];

async function login(email) {
  const agent = request.agent(app);
  const page = await agent.get('/admin/login').expect(200);
  await agent
    .post('/admin/login')
    .type('form')
    .send({ email, password: PASSWORD, _csrf: csrfFrom(page.text) })
    .expect(302)
    .expect('location', '/admin');
  const dash = await agent.get('/admin').expect(200);
  return { agent, csrf: csrfFrom(dash.text) };
}

test('öffentliche Seiten funktionieren und setzen keine Cookies', async () => {
  for (const url of ['/', '/podcasts', '/impressum', '/datenschutz', '/ueber', '/autoren', '/suche?q=test', '/rubrik/politik']) {
    const res = await request(app).get(url).expect(200);
    assert.equal(res.headers['set-cookie'], undefined, url);
    assert.match(res.headers['content-security-policy'], /script-src 'self'/);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-powered-by'], undefined);
  }
  await request(app).get('/feed.xml').expect(200).expect('content-type', /rss/);
  await request(app).get('/sitemap.xml').expect(200);
  await request(app).get('/robots.txt').expect(200).expect(/Disallow: \/admin/);
  await request(app).get('/gibts-nicht').expect(404);
});

test('Redaktion erfordert Anmeldung', async () => {
  await request(app).get('/admin/beitraege').expect(302).expect('location', '/admin/login');
});

test('Login ohne CSRF-Token wird abgelehnt', async () => {
  await request(app).post('/admin/login').type('form').send({ email: 'admin@test.de', password: PASSWORD }).expect(403);
});

test('falsches Passwort und Kontosperre nach 5 Fehlversuchen', async () => {
  const agent = request.agent(app);
  const token = csrfFrom((await agent.get('/admin/login')).text);
  for (let i = 0; i < 5; i++) {
    await agent.post('/admin/login').type('form').send({ email: 'autor@test.de', password: 'falsch', _csrf: token }).expect(401);
  }
  const res = await agent.post('/admin/login').type('form').send({ email: 'autor@test.de', password: PASSWORD, _csrf: token }).expect(401);
  assert.match(res.text, /vorübergehend gesperrt/);
  db.prepare("UPDATE users SET locked_until = NULL, failed_logins = 0 WHERE email = 'autor@test.de'").run();
});

test('Beitrag mit Bildern anlegen, veröffentlichen und anzeigen', async () => {
  const { agent, csrf } = await login('admin@test.de');
  const res = await agent
    .post('/admin/beitraege')
    .field('_csrf', csrf)
    .field('kind', 'gallery')
    .field('title', 'Über Größe & Maß')
    .field('excerpt', 'Ein Teaser')
    .field('body_md', 'Hallo **Welt** <script>alert(1)</script> [x](javascript:alert(1))')
    .field('section_id', '2')
    .field('status', 'published')
    .attach('cover', png, 'cover.jpg')
    .attach('gallery', png, 'a.jpg')
    .attach('gallery', png, 'b.jpg')
    .expect(302);
  assert.match(res.headers.location, /^\/admin\/beitraege\/\d+\?gespeichert=1$/);

  const post = db.prepare("SELECT * FROM posts WHERE slug = 'ueber-groesse-mass'").get();
  assert.ok(post, 'Slug mit Umlauten');
  assert.doesNotMatch(post.body_html, /<script|javascript:/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM post_images WHERE post_id = ?').get(post.id).n, 2);

  // Bild ist neu kodiert (WebP, ohne EXIF)
  const file = db.prepare('SELECT file FROM media WHERE id = ?').get(post.cover_id).file;
  const meta = await sharp(path.join(process.env.DATA_DIR, 'uploads', `${file}.webp`)).metadata();
  assert.equal(meta.format, 'webp');
  assert.equal(meta.exif, undefined);

  const page = await request(app).get('/artikel/ueber-groesse-mass').expect(200);
  assert.match(page.text, /Über Größe &amp; Maß/);
  assert.match(page.text, /data-lightbox/);
  const home = await request(app).get('/').expect(200);
  assert.match(home.text, /ueber-groesse-mass/);
  await request(app).get(`/uploads/${file}.webp`).expect(200).expect('content-type', 'image/webp');
});

test('Link-Beitrag braucht gültige http(s)-URL', async () => {
  const { agent, csrf } = await login('admin@test.de');
  const bad = await agent.post('/admin/beitraege').field('_csrf', csrf).field('kind', 'link').field('title', 'Link')
    .field('link_url', 'javascript:alert(1)').expect(400);
  assert.match(bad.text, /http:\/\/ oder https:\/\//);
  await agent.post('/admin/beitraege').field('_csrf', csrf).field('kind', 'link').field('title', 'Lesenswert')
    .field('link_url', 'https://example.org/artikel').field('link_source', 'Example').field('status', 'published').expect(302);
  const page = await request(app).get('/artikel/lesenswert').expect(200);
  assert.match(page.text, /href="https:\/\/example.org\/artikel"/);
  assert.match(page.text, /rel="noopener noreferrer nofollow"/);
});

test('Autor*innen dürfen fremde Beiträge nicht bearbeiten und keine Nutzer verwalten', async () => {
  const { agent, csrf } = await login('autor@test.de');
  const post = db.prepare("SELECT id FROM posts WHERE slug = 'ueber-groesse-mass'").get();
  await agent.get(`/admin/beitraege/${post.id}`).expect(403);
  await agent.post(`/admin/beitraege/${post.id}/loeschen`).type('form').send({ _csrf: csrf }).expect(403);
  await agent.get('/admin/nutzer').expect(403);
  await agent.get('/admin/einstellungen').expect(403);
  // CSRF-Token ist pflicht
  await agent.post('/admin/profil/passwort').type('form').send({ current: PASSWORD }).expect(403);
});

test('Podcast-Review mit eigenem Cover, Sternen und Zwei-Klick-Player', async () => {
  const { agent, csrf } = await login('autor@test.de');
  await agent
    .post('/admin/podcasts')
    .field('_csrf', csrf)
    .field('title', 'Hörenswert!')
    .field('podcast_name', 'Testcast')
    .field('episode_title', 'Folge 1')
    .field('spotify_url', 'https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk?si=abc')
    .field('apple_url', 'https://podcasts.apple.com/de/podcast/testcast/id1200361736?i=1000600000000')
    .field('rating', '4')
    .field('status', 'published')
    .attach('artwork', png, 'art.jpg')
    .expect(302);
  const review = db.prepare("SELECT * FROM reviews WHERE slug = 'hoerenswert'").get();
  assert.equal(review.spotify_url, 'https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk');
  const page = await request(app).get('/podcasts/hoerenswert').expect(200);
  assert.match(page.text, /★★★★☆/);
  assert.match(page.text, /data-embed-src="https:\/\/open.spotify.com\/embed\/episode\/4rOoJ6Egrf8K2IrywzwOMk"/);
  assert.match(page.text, /data-embed-src="https:\/\/embed.podcasts.apple.com\/de\/podcast\/testcast\/id1200361736\?i=1000600000000"/);
  assert.doesNotMatch(page.text, /<iframe/); // erst nach Einwilligung
});

test('Podcast-Links werden erkannt und Fremd-URLs abgelehnt', () => {
  assert.equal(parseSpotifyUrl('https://open.spotify.com/intl-de/show/2MAi0BvDc6GTFvKFPXnkCL').type, 'show');
  assert.equal(parseSpotifyUrl('https://evil.com/show/2MAi0BvDc6GTFvKFPXnkCL'), null);
  assert.equal(parseAppleUrl('https://podcasts.apple.com/de/podcast/x/id123?i=456').episodeId, '456');
  assert.equal(parseAppleUrl('https://podcasts.apple.com.evil.com/de/podcast/x/id123'), null);
});

test('SSRF-Schutz erkennt private Adressen', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.1', '169.254.169.254', '::1', '::ffff:127.0.0.1', 'fd00::1']) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  assert.equal(isPrivateAddress('93.184.216.34'), false);
});

test('Markdown erlaubt keine fremden Bilder oder Event-Handler', () => {
  const html = renderMarkdown('![x](https://tracker.example/p.gif) ![ok](/uploads/abc.webp) <a href="#" onclick="x()">a</a>');
  assert.doesNotMatch(html, /tracker|onclick/);
  assert.match(html, /\/uploads\/abc.webp/);
});
