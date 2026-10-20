import { Router } from 'express';
import { db } from '../db.js';
import { config } from '../config.js';
import {
  sections, latestPosts, countPosts, postBySlug, postImages,
  latestReviews, countReviews, reviewBySlug, search,
} from '../lib/queries.js';
import { parseSpotifyUrl, parseAppleUrl } from '../lib/podcast.js';
import { parseDbDate } from '../lib/helpers.js';

const router = Router();
const PER_PAGE = 12;

function pageNumber(req) {
  const n = Number.parseInt(req.query.seite, 10);
  return Number.isInteger(n) && n > 0 && n < 10000 ? n : 1;
}

// ---- Magazin ----
router.get('/', (req, res) => {
  const latest = latestPosts({ limit: 7 });
  const bySection = sections()
    .map((s) => ({ section: s, posts: latestPosts({ sectionId: s.id, limit: 3 }) }))
    .filter((g) => g.posts.length);
  const reviews = latestReviews({ limit: 4 });
  res.render('home', { title: null, lead: latest[0], latest: latest.slice(1), bySection, reviews });
});

router.get('/rubrik/:slug', (req, res, next) => {
  const section = db.prepare('SELECT * FROM sections WHERE slug = ?').get(req.params.slug);
  if (!section) return next();
  const page = pageNumber(req);
  const total = countPosts({ sectionId: section.id });
  const posts = latestPosts({ sectionId: section.id, limit: PER_PAGE, offset: (page - 1) * PER_PAGE });
  res.render('section', { title: section.name, section, posts, page, pages: Math.ceil(total / PER_PAGE) });
});

router.get('/artikel/:slug', (req, res, next) => {
  const post = postBySlug(req.params.slug);
  if (!post) return next();
  const images = post.kind === 'gallery' ? postImages(post.id) : [];
  const related = post.section_id
    ? latestPosts({ sectionId: post.section_id, limit: 4 }).filter((p) => p.id !== post.id).slice(0, 3)
    : [];
  res.render('post', { title: post.title, description: post.excerpt, post, images, related, ogImage: post.cover_file });
});

// ---- Podcast-Reviews ----
router.get('/podcasts', (req, res) => {
  const page = pageNumber(req);
  const total = countReviews();
  const reviews = latestReviews({ limit: PER_PAGE, offset: (page - 1) * PER_PAGE });
  res.render('podcasts', { title: 'Podcast-Reviews', reviews, page, pages: Math.ceil(total / PER_PAGE) });
});

router.get('/podcasts/:slug', (req, res, next) => {
  const review = reviewBySlug(req.params.slug);
  if (!review) return next();
  const spotify = review.spotify_url ? parseSpotifyUrl(review.spotify_url) : null;
  const apple = review.apple_url ? parseAppleUrl(review.apple_url) : null;
  const more = latestReviews({ limit: 4 }).filter((r) => r.id !== review.id).slice(0, 3);
  res.render('review', {
    title: review.title, description: review.excerpt, review, spotify, apple, more, ogImage: review.artwork_file,
  });
});

// ---- Autor*innen ----
router.get('/autor/:slug', (req, res, next) => {
  const author = db
    .prepare('SELECT u.id, u.name, u.slug, u.bio, m.file AS avatar FROM users u LEFT JOIN media m ON m.id = u.avatar_id WHERE u.slug = ?')
    .get(req.params.slug);
  if (!author) return next();
  const posts = latestPosts({ authorId: author.id, limit: 50 });
  const reviews = latestReviews({ authorId: author.id, limit: 50 });
  if (!posts.length && !reviews.length && !db.prepare('SELECT active FROM users WHERE id = ?').get(author.id).active) return next();
  res.render('author', { title: author.name, author, posts, reviews });
});

router.get('/autoren', (req, res) => {
  const authors = db
    .prepare(`SELECT u.name, u.slug, u.bio, m.file AS avatar FROM users u LEFT JOIN media m ON m.id = u.avatar_id
              WHERE u.active = 1 ORDER BY u.name`)
    .all();
  res.render('authors', { title: 'Autorinnen & Autoren', authors });
});

// ---- Suche ----
router.get('/suche', (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  const results = q.length >= 2 ? search(q) : { posts: [], reviews: [] };
  res.render('search', { title: 'Suche', q, results });
});

// ---- Statische Seiten ----
for (const slug of ['impressum', 'datenschutz', 'ueber']) {
  router.get(`/${slug}`, (req, res) => {
    const page = db.prepare('SELECT * FROM pages WHERE slug = ?').get(slug);
    res.render('page', { title: page.title, page });
  });
}

// ---- Feeds, Sitemap & Co. ----
const xml = (s) =>
  String(s ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);

function rss(res, { title, link, description, items }) {
  res.type('application/rss+xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${xml(title)}</title>
<link>${xml(link)}</link>
<description>${xml(description)}</description>
<language>de-de</language>
<atom:link href="${xml(link)}/feed.xml" rel="self" type="application/rss+xml"/>
${items
  .map(
    (i) => `<item>
<title>${xml(i.title)}</title>
<link>${xml(i.url)}</link>
<guid isPermaLink="true">${xml(i.url)}</guid>
<pubDate>${parseDbDate(i.date).toUTCString()}</pubDate>
<dc:creator xmlns:dc="http://purl.org/dc/elements/1.1/">${xml(i.author)}</dc:creator>
<description>${xml(i.description)}</description>
</item>`
  )
  .join('\n')}
</channel>
</rss>`);
}

router.get('/feed.xml', (req, res) => {
  const site = res.locals.site;
  rss(res, {
    title: site.site_title,
    link: config.baseUrl,
    description: site.site_tagline,
    items: latestPosts({ limit: 30 }).map((p) => ({
      title: p.title, url: `${config.baseUrl}/artikel/${p.slug}`, date: p.published_at, author: p.author_name, description: p.excerpt,
    })),
  });
});

router.get('/podcasts/feed.xml', (req, res) => {
  const site = res.locals.site;
  rss(res, {
    title: `${site.site_title} – Podcast-Reviews`,
    link: `${config.baseUrl}/podcasts`,
    description: 'Besprechungen von Podcasts',
    items: latestReviews({ limit: 30 }).map((r) => ({
      title: r.title, url: `${config.baseUrl}/podcasts/${r.slug}`, date: r.published_at, author: r.author_name, description: r.excerpt,
    })),
  });
});

router.get('/sitemap.xml', (req, res) => {
  const urls = ['/', '/podcasts', '/autoren', '/ueber', '/impressum', '/datenschutz']
    .concat(sections().map((s) => `/rubrik/${s.slug}`))
    .map((u) => ({ loc: config.baseUrl + u }));
  for (const p of db.prepare("SELECT slug, updated_at FROM posts WHERE status = 'published' AND published_at <= datetime('now')").all()) {
    urls.push({ loc: `${config.baseUrl}/artikel/${p.slug}`, lastmod: p.updated_at });
  }
  for (const r of db.prepare("SELECT slug, updated_at FROM reviews WHERE status = 'published' AND published_at <= datetime('now')").all()) {
    urls.push({ loc: `${config.baseUrl}/podcasts/${r.slug}`, lastmod: r.updated_at });
  }
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `<url><loc>${xml(u.loc)}</loc>${u.lastmod ? `<lastmod>${parseDbDate(u.lastmod).toISOString()}</lastmod>` : ''}</url>`).join('\n')}
</urlset>`);
});

router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nDisallow: /admin\n\nSitemap: ${config.baseUrl}/sitemap.xml\n`);
});

router.get('/.well-known/security.txt', (req, res) => {
  const expires = new Date(Date.now() + 365 * 864e5).toISOString();
  res.type('text/plain').send(`Contact: ${config.baseUrl}/impressum\nExpires: ${expires}\nPreferred-Languages: de, en\n`);
});

export default router;
