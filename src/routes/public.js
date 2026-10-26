import { Router } from 'express';
import { snapshot } from '../data.js';
import { config } from '../config.js';
import {
  latestPosts, countPosts, postBySlug, postImages,
  latestReviews, countReviews, reviewBySlug, search, isPublished,
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
router.get('/', async (req, res) => {
  const s = await snapshot();
  const latest = latestPosts(s, { limit: 7 });
  const bySection = s.sections
    .map((sec) => ({ section: sec, posts: latestPosts(s, { sectionId: sec.id, limit: 3 }) }))
    .filter((g) => g.posts.length);
  const reviews = latestReviews(s, { limit: 4 });
  res.render('home', { title: null, lead: latest[0], latest: latest.slice(1), bySection, reviews });
});

router.get('/rubrik/:slug', async (req, res, next) => {
  const s = await snapshot();
  const section = s.sections.find((x) => x.slug === req.params.slug);
  if (!section) return next();
  const page = pageNumber(req);
  const total = countPosts(s, { sectionId: section.id });
  const posts = latestPosts(s, { sectionId: section.id, limit: PER_PAGE, offset: (page - 1) * PER_PAGE });
  res.render('section', { title: section.name, section, posts, page, pages: Math.ceil(total / PER_PAGE) });
});

router.get('/artikel/:slug', async (req, res, next) => {
  const s = await snapshot();
  const post = postBySlug(s, req.params.slug);
  if (!post) return next();
  const images = post.kind === 'gallery' ? postImages(s, post) : [];
  const related = post.section_id
    ? latestPosts(s, { sectionId: post.section_id, limit: 4 }).filter((p) => p.id !== post.id).slice(0, 3)
    : [];
  res.render('post', { title: post.title, description: post.excerpt, post, images, related, ogImage: post.cover_file });
});

// ---- Podcast-Reviews ----
router.get('/podcasts', async (req, res) => {
  const s = await snapshot();
  const page = pageNumber(req);
  const total = countReviews(s);
  const reviews = latestReviews(s, { limit: PER_PAGE, offset: (page - 1) * PER_PAGE });
  res.render('podcasts', { title: res.locals.site.podcast_title, reviews, page, pages: Math.ceil(total / PER_PAGE) });
});

router.get('/podcasts/:slug', async (req, res, next) => {
  const s = await snapshot();
  const review = reviewBySlug(s, req.params.slug);
  if (!review) return next();
  const spotify = review.spotify_url ? parseSpotifyUrl(review.spotify_url) : null;
  const apple = review.apple_url ? parseAppleUrl(review.apple_url) : null;
  const more = latestReviews(s, { limit: 4 }).filter((r) => r.id !== review.id).slice(0, 3);
  res.render('review', {
    title: review.title, description: review.excerpt, review, spotify, apple, more, ogImage: review.artwork_file,
  });
});

// ---- Autor*innen ----
router.get('/autor/:slug', async (req, res, next) => {
  const s = await snapshot();
  const user = s.users.find((u) => u.slug === req.params.slug);
  if (!user) return next();
  const author = { id: user.id, name: user.name, slug: user.slug, bio: user.bio || '', avatar: user.avatar_file };
  const posts = latestPosts(s, { authorId: author.id, limit: 50 });
  const reviews = latestReviews(s, { authorId: author.id, limit: 50 });
  if (!posts.length && !reviews.length && !user.active) return next();
  res.render('author', { title: author.name, author, posts, reviews });
});

router.get('/autoren', async (req, res) => {
  const s = await snapshot();
  const authors = s.users
    .filter((u) => u.active)
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
    .map((u) => ({ name: u.name, slug: u.slug, bio: u.bio || '', avatar: u.avatar_file }));
  res.render('authors', { title: 'Autorinnen & Autoren', authors });
});

// ---- Suche ----
router.get('/suche', async (req, res) => {
  const s = await snapshot();
  const q = String(req.query.q || '').trim().slice(0, 100);
  const results = q.length >= 2 ? search(s, q) : { posts: [], reviews: [] };
  res.render('search', { title: 'Suche', q, results });
});

// ---- Statische Seiten ----
for (const slug of ['impressum', 'datenschutz', 'ueber']) {
  router.get(`/${slug}`, async (req, res) => {
  const s = await snapshot();
    const page = s.pages.get(slug);
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

router.get('/feed.xml', async (req, res) => {
  const s = await snapshot();
  const site = res.locals.site;
  rss(res, {
    title: site.site_title,
    link: config.baseUrl,
    description: site.site_tagline,
    items: latestPosts(s, { limit: 30 }).map((p) => ({
      title: p.title, url: `${config.baseUrl}/artikel/${p.slug}`, date: p.published_at, author: p.author_name, description: p.excerpt,
    })),
  });
});

router.get('/podcasts/feed.xml', async (req, res) => {
  const s = await snapshot();
  const site = res.locals.site;
  rss(res, {
    title: `${site.site_title} – ${site.podcast_title}`,
    link: `${config.baseUrl}/podcasts`,
    description: 'Besprechungen von Podcasts',
    items: latestReviews(s, { limit: 30 }).map((r) => ({
      title: r.title, url: `${config.baseUrl}/podcasts/${r.slug}`, date: r.published_at, author: r.author_name, description: r.excerpt,
    })),
  });
});

router.get('/sitemap.xml', async (req, res) => {
  const s = await snapshot();
  const urls = ['/', '/podcasts', '/autoren', '/ueber', '/impressum', '/datenschutz']
    .concat(s.sections.map((sec) => `/rubrik/${sec.slug}`))
    .map((u) => ({ loc: config.baseUrl + u }));
  for (const p of s.posts.filter(isPublished)) {
    urls.push({ loc: `${config.baseUrl}/artikel/${p.slug}`, lastmod: p.updated_at || p.published_at });
  }
  for (const r of s.reviews.filter(isPublished)) {
    urls.push({ loc: `${config.baseUrl}/podcasts/${r.slug}`, lastmod: r.updated_at || r.published_at });
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
