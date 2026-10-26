import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-test-'));
process.env.DATA_DRIVER = 'memory';

const { default: request } = await import('supertest');
const { default: sharp } = await import('sharp');
const { default: bcrypt } = await import('bcryptjs');
const { createApp } = await import('../src/app.js');
const { create, snapshot, update } = await import('../src/data.js');
const { parseSpotifyUrl, parseAppleUrl } = await import('../src/lib/podcast.js');
const { isPrivateAddress } = await import('../src/lib/safe-fetch.js');
const { renderMarkdown } = await import('../src/lib/markdown.js');

const app = createApp();
const PASSWORD = 'richtig-gutes-passwort-1';
let png;

before(async () => {
  const hash = bcrypt.hashSync(PASSWORD, 4);
  const base = { active: 1, bio: '', password_hash: hash, failed_logins: 0, locked_until: null, session_version: 0 };
  await create('users', { ...base, email: 'admin@test.de', name: 'Ada Admin', slug: 'ada-admin', role: 'admin' });
  await create('users', { ...base, email: 'autor@test.de', name: 'Bo Autor', slug: 'bo-autor', role: 'author' });
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
  await update('users', 2, { locked_until: null, failed_logins: 0 });
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

  const s = await snapshot({ fresh: true });
  const post = s.posts.find((p) => p.slug === 'ueber-groesse-mass');
  assert.ok(post, 'Slug mit Umlauten');
  assert.doesNotMatch(post.body_html, /<script|javascript:/);
  assert.equal(post.images.length, 2);

  // Bild ist neu kodiert (WebP, ohne EXIF)
  const file = s.mediaById.get(post.cover_id).file;
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
  const post = (await snapshot({ fresh: true })).posts.find((p) => p.slug === 'ueber-groesse-mass');
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
  const review = (await snapshot({ fresh: true })).reviews.find((r) => r.slug === 'hoerenswert');
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

test('Sitzung steckt in genau einem signierten Cookie „__session“ (Firebase Hosting)', async () => {
  const agent = request.agent(app);
  const page = await agent.get('/admin/login');
  const res = await agent.post('/admin/login').type('form')
    .send({ email: 'admin@test.de', password: PASSWORD, _csrf: csrfFrom(page.text) }).expect(302);
  const cookies = res.headers['set-cookie'];
  assert.equal(cookies.length, 1);
  assert.match(cookies[0], /^__session=[^;]+\.[^;]+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=28800/);

  // Manipuliertes Cookie wird verworfen
  const value = cookies[0].split(';')[0].slice('__session='.length);
  const [body, sig] = value.split('.');
  const forged = Buffer.from(JSON.stringify({ d: { userId: 1, sv: 0 }, iat: Date.now(), exp: Date.now() + 1e6 })).toString('base64url');
  await request(app).get('/admin').set('Cookie', `__session=${forged}.${sig}`).expect(302).expect('location', '/admin/login');
  await request(app).get('/admin').set('Cookie', `__session=${body}.${sig}`).expect(200);

  // Abmelden löscht das Cookie
  const dash = await agent.get('/admin');
  const out = await agent.post('/admin/logout').type('form').send({ _csrf: csrfFrom(dash.text) }).expect(302);
  assert.match(out.headers['set-cookie'][0], /^__session=; .*Max-Age=0/);
  await agent.get('/admin').expect(302);
});

test('Passwortänderung beendet andere Sitzungen, die eigene bleibt', async () => {
  const first = await login('autor@test.de');
  const second = await login('autor@test.de');
  const NEW = 'ein-neues-passwort-42';
  await first.agent.post('/admin/profil/passwort').type('form')
    .send({ _csrf: first.csrf, current: PASSWORD, password: NEW, password2: NEW }).expect(302);
  await first.agent.get('/admin').expect(200);
  await second.agent.get('/admin').expect(302).expect('location', '/admin/login');
  // zurücksetzen für andere Tests
  const hash = bcrypt.hashSync(PASSWORD, 4);
  await update('users', 2, { password_hash: hash });
});

test('Öffentliche Seiten sind im CDN cachebar, Redaktion nie', async () => {
  const home = await request(app).get('/').expect(200);
  assert.match(home.headers['cache-control'], /public.*s-maxage=\d+/);
  const login = await request(app).get('/admin/login').expect(200);
  assert.equal(login.headers['cache-control'], 'no-store');
});

test('Rubrik löschen lässt Beiträge bestehen', async () => {
  const { agent, csrf } = await login('admin@test.de');
  await agent.post('/admin/rubriken/2/loeschen').type('form').send({ _csrf: csrf }).expect(302);
  const s = await snapshot({ fresh: true });
  assert.equal(s.sectionsById.has(2), false);
  const post = s.posts.find((p) => p.slug === 'ueber-groesse-mass');
  assert.equal(post.section_id, null);
  await request(app).get('/artikel/ueber-groesse-mass').expect(200);
});
