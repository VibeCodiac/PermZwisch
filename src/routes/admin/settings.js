import { Router } from 'express';
import { db } from '../../db.js';
import { renderMarkdown } from '../../lib/markdown.js';
import { slugify } from '../../lib/slug.js';
import { requireAdmin } from '../../lib/security.js';
import { str, intOrNull } from './form.js';

const router = Router();
router.use(['/einstellungen', '/rubriken', '/seiten'], requireAdmin);

router.get('/einstellungen', (req, res) => {
  const pages = db.prepare('SELECT slug, title, updated_at FROM pages ORDER BY title').all();
  const sectionRows = db
    .prepare('SELECT s.*, (SELECT COUNT(*) FROM posts WHERE section_id = s.id) AS posts FROM sections s ORDER BY position, name')
    .all();
  res.render('admin/settings', { title: 'Einstellungen', pages, sectionRows, saved: !!req.query.ok });
});

router.post('/einstellungen', (req, res) => {
  const set = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  set.run('site_title', str(req.body.site_title, 100) || 'Blog');
  set.run('site_tagline', str(req.body.site_tagline, 200));
  set.run('podcast_title', str(req.body.podcast_title, 60) || 'Podcasts');
  res.redirect('/admin/einstellungen?ok=1');
});

// ---- Rubriken ----
router.post('/rubriken', (req, res) => {
  const name = str(req.body.name, 60);
  if (name) {
    const pos = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM sections').get().p;
    db.prepare('INSERT OR IGNORE INTO sections (slug, name, description, position) VALUES (?, ?, ?, ?)')
      .run(slugify(name), name, str(req.body.description, 300), pos);
  }
  res.redirect('/admin/einstellungen?ok=1');
});

router.post('/rubriken/:id', (req, res) => {
  const id = intOrNull(req.params.id);
  const name = str(req.body.name, 60);
  if (name) {
    db.prepare('UPDATE sections SET name = ?, description = ?, position = ? WHERE id = ?')
      .run(name, str(req.body.description, 300), intOrNull(req.body.position) ?? 0, id);
  }
  res.redirect('/admin/einstellungen?ok=1');
});

router.post('/rubriken/:id/loeschen', (req, res) => {
  db.prepare('DELETE FROM sections WHERE id = ?').run(intOrNull(req.params.id));
  res.redirect('/admin/einstellungen?ok=1');
});

// ---- Seiten (Impressum, Datenschutz, Über) ----
router.get('/seiten/:slug', (req, res, next) => {
  const page = db.prepare('SELECT * FROM pages WHERE slug = ?').get(req.params.slug);
  if (!page) return next();
  res.render('admin/page-form', { title: `${page.title} bearbeiten`, page, saved: !!req.query.ok });
});

router.post('/seiten/:slug', (req, res, next) => {
  const page = db.prepare('SELECT slug FROM pages WHERE slug = ?').get(req.params.slug);
  if (!page) return next();
  const md = str(req.body.body_md, 200_000);
  db.prepare("UPDATE pages SET title = ?, body_md = ?, body_html = ?, updated_at = datetime('now') WHERE slug = ?")
    .run(str(req.body.title, 120) || page.slug, md, renderMarkdown(md), page.slug);
  res.redirect(`/admin/seiten/${page.slug}?ok=1`);
});

export default router;
