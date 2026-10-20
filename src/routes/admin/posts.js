import { Router } from 'express';
import { db } from '../../db.js';
import { renderMarkdown } from '../../lib/markdown.js';
import { uniqueSlug } from '../../lib/slug.js';
import { storeImage } from '../../lib/images.js';
import { canEdit, fetchLimiter } from '../../lib/security.js';
import { parseHttpUrl, safeFetch } from '../../lib/safe-fetch.js';
import { fetchLinkPreview } from '../../lib/link-preview.js';
import { sections, postById, postImages } from '../../lib/queries.js';
import { str, list, intOrNull, publishFields, multipart, forbidden } from './form.js';

const router = Router();
const KINDS = ['article', 'link', 'gallery'];

router.get('/', (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const posts = db
    .prepare(`SELECT p.id, p.title, p.slug, p.kind, p.status, p.published_at, p.updated_at,
                     s.name AS section_name, u.name AS author_name
              FROM posts p LEFT JOIN sections s ON s.id = p.section_id JOIN users u ON u.id = p.author_id
              ${isAdmin ? '' : 'WHERE p.author_id = ?'} ORDER BY p.updated_at DESC`)
    .all(...(isAdmin ? [] : [req.user.id]));
  res.render('admin/posts', { title: 'Beiträge', posts });
});

function renderForm(res, post, { error = null, status = 200 } = {}) {
  res.status(status).render('admin/post-form', {
    title: post.id ? 'Beitrag bearbeiten' : 'Neuer Beitrag',
    post,
    images: post.id ? postImages(post.id) : [],
    sections: sections(),
    error,
  });
}

/** Vorschau-Daten (Titel, Beschreibung, Bild) eines externen Artikels abrufen. */
router.post('/link-vorschau', fetchLimiter, async (req, res) => {
  const preview = await fetchLinkPreview(str(req.body.url, 2000));
  let image = null;
  if (preview.image) {
    try {
      const { buffer } = await safeFetch(preview.image, { accept: 'image/*', maxBytes: 8_000_000 });
      const id = await storeImage(buffer, { uploaderId: req.user.id, alt: preview.title });
      image = { id, url: `/uploads/${db.prepare('SELECT file FROM media WHERE id = ?').get(id).file}-sm.webp` };
    } catch {
      image = null; // Vorschaubild ist optional
    }
  }
  res.json({ url: preview.url, title: preview.title, description: preview.description, source: preview.source, image });
});

router.get('/neu', (req, res) => {
  renderForm(res, { kind: ['link', 'gallery'].includes(req.query.art) ? req.query.art : 'article', status: 'draft' });
});

router.get('/:id', (req, res, next) => {
  const post = postById(intOrNull(req.params.id));
  if (!post) return next();
  if (!canEdit(req.user, post)) return next(forbidden());
  renderForm(res, post);
});

const uploads = multipart([{ name: 'cover', maxCount: 1 }, { name: 'gallery', maxCount: 30 }]);

async function save(req, res, existing) {
  const b = req.body;
  const data = {
    kind: KINDS.includes(str(b.kind)) ? str(b.kind) : 'article',
    title: str(b.title, 200),
    excerpt: str(b.excerpt, 600),
    body_md: str(b.body_md, 200_000),
    section_id: intOrNull(b.section_id),
    link_url: str(b.link_url, 2000) || null,
    link_title: str(b.link_title, 300) || null,
    link_source: str(b.link_source, 120) || null,
    link_description: str(b.link_description, 600) || null,
    link_image_id: intOrNull(b.link_image_id),
    cover_id: existing?.cover_id ?? null,
  };
  const { status, publishedAt } = publishFields(b, existing);
  const formState = { ...existing, ...data, status, published_at: publishedAt, slug: str(b.slug, 80) };

  let error = null;
  if (!data.title) error = 'Bitte einen Titel angeben.';
  else if (data.section_id && !db.prepare('SELECT 1 FROM sections WHERE id = ?').get(data.section_id)) error = 'Unbekannte Rubrik.';
  else if (data.link_url && !parseHttpUrl(data.link_url)) error = 'Der externe Link muss mit http:// oder https:// beginnen.';
  else if (data.kind === 'link' && !data.link_url) error = 'Für einen Link-Beitrag wird die URL des Artikels benötigt.';
  if (data.link_image_id && !db.prepare('SELECT 1 FROM media WHERE id = ?').get(data.link_image_id)) data.link_image_id = null;
  if (error) return renderForm(res, formState, { error, status: 400 });

  // Bilder verarbeiten
  const files = req.files || {};
  if (str(b.remove_cover) === '1') data.cover_id = null;
  if (files.cover?.[0]) data.cover_id = await storeImage(files.cover[0].buffer, { uploaderId: req.user.id, alt: str(b.cover_alt, 300) });
  else if (data.cover_id && b.cover_alt !== undefined) {
    db.prepare('UPDATE media SET alt = ? WHERE id = ?').run(str(b.cover_alt, 300), data.cover_id);
  }
  const newGallery = [];
  for (const f of files.gallery || []) newGallery.push(await storeImage(f.buffer, { uploaderId: req.user.id }));

  const slug = uniqueSlug(db, 'posts', formState.slug || data.title, existing?.id ?? null);
  const bodyHtml = renderMarkdown(data.body_md);

  const id = db.transaction(() => {
    let postId = existing?.id;
    const values = [
      data.kind, data.title, slug, data.excerpt, data.body_md, bodyHtml, data.cover_id, data.section_id,
      data.link_url, data.link_title, data.link_source, data.link_description, data.link_image_id, status, publishedAt,
    ];
    if (postId) {
      db.prepare(`UPDATE posts SET kind=?, title=?, slug=?, excerpt=?, body_md=?, body_html=?, cover_id=?, section_id=?,
                  link_url=?, link_title=?, link_source=?, link_description=?, link_image_id=?, status=?, published_at=?,
                  updated_at=datetime('now') WHERE id=?`).run(...values, postId);
    } else {
      postId = Number(
        db.prepare(`INSERT INTO posts (kind, title, slug, excerpt, body_md, body_html, cover_id, section_id, link_url,
                    link_title, link_source, link_description, link_image_id, status, published_at, author_id)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...values, req.user.id).lastInsertRowid
      );
    }
    // Galerie: Bildunterschriften, Reihenfolge, Entfernen
    const remove = new Set(list(b.remove_gallery).map(Number));
    const update = db.prepare('UPDATE post_images SET caption = ?, position = ? WHERE post_id = ? AND media_id = ?');
    for (const img of existing ? postImages(postId) : []) {
      if (remove.has(img.id)) db.prepare('DELETE FROM post_images WHERE post_id = ? AND media_id = ?').run(postId, img.id);
      else update.run(str(b[`caption_${img.id}`], 300), intOrNull(b[`position_${img.id}`]) ?? img.position, postId, img.id);
    }
    const maxPos = db.prepare('SELECT COALESCE(MAX(position), 0) AS m FROM post_images WHERE post_id = ?').get(postId).m;
    const insert = db.prepare('INSERT INTO post_images (post_id, media_id, position) VALUES (?, ?, ?)');
    newGallery.forEach((mediaId, i) => insert.run(postId, mediaId, maxPos + i + 1));
    return postId;
  })();

  res.redirect(`/admin/beitraege/${id}?gespeichert=1`);
}

router.post('/', uploads, (req, res) => save(req, res, null));

router.post('/:id', uploads, (req, res, next) => {
  const existing = db.prepare('SELECT * FROM posts WHERE id = ?').get(intOrNull(req.params.id));
  if (!existing) return next();
  if (!canEdit(req.user, existing)) return next(forbidden());
  return save(req, res, existing);
});

router.post('/:id/loeschen', (req, res, next) => {
  const post = db.prepare('SELECT id, author_id FROM posts WHERE id = ?').get(intOrNull(req.params.id));
  if (!post) return next();
  if (!canEdit(req.user, post)) return next(forbidden());
  db.prepare('DELETE FROM posts WHERE id = ?').run(post.id);
  res.redirect('/admin/beitraege');
});

export default router;
