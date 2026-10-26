import { Router } from 'express';
import { snapshot, create, update, remove, saveSettings, savePage } from '../../data.js';
import { renderMarkdown } from '../../lib/markdown.js';
import { slugify } from '../../lib/slug.js';
import { requireAdmin } from '../../lib/security.js';
import { str, intOrNull } from './form.js';

const router = Router();
router.use(['/einstellungen', '/rubriken', '/seiten'], requireAdmin);

router.get('/einstellungen', async (req, res) => {
  const s = await snapshot({ fresh: true });
  const pages = [...s.pages.values()].sort((a, b) => a.title.localeCompare(b.title, 'de'));
  const sectionRows = s.sections.map((sec) => ({ ...sec, posts: s.posts.filter((p) => p.section_id === sec.id).length }));
  res.render('admin/settings', { title: 'Einstellungen', pages, sectionRows, saved: !!req.query.ok });
});

router.post('/einstellungen', async (req, res) => {
  await saveSettings({
    site_title: str(req.body.site_title, 100) || 'Blog',
    site_tagline: str(req.body.site_tagline, 200),
    podcast_title: str(req.body.podcast_title, 60) || 'Podcasts',
  });
  res.redirect('/admin/einstellungen?ok=1');
});

// ---- Rubriken ----
router.post('/rubriken', async (req, res) => {
  const name = str(req.body.name, 60);
  const s = await snapshot({ fresh: true });
  const slug = slugify(name);
  if (name && !s.sections.some((sec) => sec.slug === slug)) {
    const position = s.sections.reduce((m, sec) => Math.max(m, sec.position ?? 0), 0) + 1;
    await create('sections', { slug, name, description: str(req.body.description, 300), position });
  }
  res.redirect('/admin/einstellungen?ok=1');
});

router.post('/rubriken/:id', async (req, res) => {
  const id = intOrNull(req.params.id);
  const name = str(req.body.name, 60);
  const s = await snapshot({ fresh: true });
  if (name && s.sectionsById.has(id)) {
    await update('sections', id, { name, description: str(req.body.description, 300), position: intOrNull(req.body.position) ?? 0 });
  }
  res.redirect('/admin/einstellungen?ok=1');
});

router.post('/rubriken/:id/loeschen', async (req, res) => {
  const id = intOrNull(req.params.id);
  const s = await snapshot({ fresh: true });
  if (s.sectionsById.has(id)) {
    // Beiträge bleiben erhalten und verlieren nur ihre Rubrik
    for (const p of s.posts.filter((x) => x.section_id === id)) await update('posts', p.id, { section_id: null });
    await remove('sections', id);
  }
  res.redirect('/admin/einstellungen?ok=1');
});

// ---- Seiten (Impressum, Datenschutz, Über) ----
router.get('/seiten/:slug', async (req, res, next) => {
  const page = (await snapshot({ fresh: true })).pages.get(req.params.slug);
  if (!page) return next();
  res.render('admin/page-form', { title: `${page.title} bearbeiten`, page, saved: !!req.query.ok });
});

router.post('/seiten/:slug', async (req, res, next) => {
  const page = (await snapshot({ fresh: true })).pages.get(req.params.slug);
  if (!page) return next();
  const md = str(req.body.body_md, 200_000);
  await savePage(page.slug, { title: str(req.body.title, 120) || page.title, body_md: md, body_html: renderMarkdown(md) });
  res.redirect(`/admin/seiten/${page.slug}?ok=1`);
});

export default router;
