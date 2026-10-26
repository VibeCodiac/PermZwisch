import { Router } from 'express';
import { snapshot, create, update, remove, now, uniqueSlugIn } from '../../data.js';
import { renderMarkdown } from '../../lib/markdown.js';
import { slugify } from '../../lib/slug.js';
import { storeImage } from '../../lib/images.js';
import { canEdit, fetchLimiter } from '../../lib/security.js';
import { parseHttpUrl, safeFetch } from '../../lib/safe-fetch.js';
import { fetchLinkPreview } from '../../lib/link-preview.js';
import { postImages } from '../../lib/queries.js';
import { str, list, intOrNull, publishFields, multipart, forbidden } from './form.js';

const router = Router();
const KINDS = ['article', 'link', 'gallery'];

router.get('/', async (req, res) => {
  const s = await snapshot({ fresh: true });
  const posts = s.posts
    .filter((p) => req.user.role === 'admin' || p.author_id === req.user.id)
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  res.render('admin/posts', { title: 'Beiträge', posts });
});

function renderForm(res, s, post, { error = null, status = 200 } = {}) {
  res.status(status).render('admin/post-form', {
    title: post.id ? 'Beitrag bearbeiten' : 'Neuer Beitrag',
    post,
    images: post.id ? postImages(s, post) : [],
    sections: s.sections,
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
      const file = (await snapshot({ fresh: true })).mediaById.get(id).file;
      image = { id, url: `/uploads/${file}-sm.webp` };
    } catch {
      image = null; // Vorschaubild ist optional
    }
  }
  res.json({ url: preview.url, title: preview.title, description: preview.description, source: preview.source, image });
});

router.get('/neu', async (req, res) => {
  const s = await snapshot({ fresh: true });
  renderForm(res, s, { kind: ['link', 'gallery'].includes(req.query.art) ? req.query.art : 'article', status: 'draft' });
});

router.get('/:id', async (req, res, next) => {
  const s = await snapshot({ fresh: true });
  const post = s.postsById.get(intOrNull(req.params.id));
  if (!post) return next();
  if (!canEdit(req.user, post)) return next(forbidden());
  renderForm(res, s, post);
});

const uploads = multipart([{ name: 'cover', maxCount: 1 }, { name: 'gallery', maxCount: 30 }]);

async function save(req, res, s, existing) {
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
  else if (data.section_id && !s.sectionsById.has(data.section_id)) error = 'Unbekannte Rubrik.';
  else if (data.link_url && !parseHttpUrl(data.link_url)) error = 'Der externe Link muss mit http:// oder https:// beginnen.';
  else if (data.kind === 'link' && !data.link_url) error = 'Für einen Link-Beitrag wird die URL des Artikels benötigt.';
  if (data.link_image_id && !s.mediaById.has(data.link_image_id)) data.link_image_id = null;
  if (error) return renderForm(res, s, formState, { error, status: 400 });

  // Bilder verarbeiten
  const files = req.files || {};
  if (str(b.remove_cover) === '1') data.cover_id = null;
  if (files.cover?.[0]) {
    data.cover_id = await storeImage(files.cover[0].buffer, { uploaderId: req.user.id, alt: str(b.cover_alt, 300) });
  } else if (data.cover_id && b.cover_alt !== undefined && s.mediaById.has(data.cover_id)) {
    await update('media', data.cover_id, { alt: str(b.cover_alt, 300) });
  }
  const newGallery = [];
  for (const f of files.gallery || []) newGallery.push(await storeImage(f.buffer, { uploaderId: req.user.id }));

  // Galerie: Bildunterschriften, Reihenfolge, Entfernen, neue Bilder anhängen
  const removeIds = new Set(list(b.remove_gallery).map(Number));
  const images = (existing?.images || [])
    .filter((img) => !removeIds.has(img.media_id))
    .map((img) => ({
      media_id: img.media_id,
      caption: b[`caption_${img.media_id}`] !== undefined ? str(b[`caption_${img.media_id}`], 300) : img.caption || '',
      position: intOrNull(b[`position_${img.media_id}`]) ?? img.position ?? 0,
    }));
  const maxPos = images.reduce((m, img) => Math.max(m, img.position), 0);
  newGallery.forEach((mediaId, i) => images.push({ media_id: mediaId, caption: '', position: maxPos + i + 1 }));

  const record = {
    ...data,
    slug: uniqueSlugIn(s.posts, slugify(formState.slug || data.title), existing?.id ?? null),
    body_html: renderMarkdown(data.body_md),
    status,
    published_at: publishedAt,
    images,
    updated_at: now(),
  };

  let id = existing?.id;
  if (id) await update('posts', id, record);
  else id = await create('posts', { ...record, author_id: req.user.id });
  res.redirect(`/admin/beitraege/${id}?gespeichert=1`);
}

router.post('/', uploads, async (req, res) => save(req, res, await snapshot({ fresh: true }), null));

router.post('/:id', uploads, async (req, res, next) => {
  const s = await snapshot({ fresh: true });
  const existing = s.postsById.get(intOrNull(req.params.id));
  if (!existing) return next();
  if (!canEdit(req.user, existing)) return next(forbidden());
  return save(req, res, s, existing);
});

router.post('/:id/loeschen', async (req, res, next) => {
  const s = await snapshot({ fresh: true });
  const post = s.postsById.get(intOrNull(req.params.id));
  if (!post) return next();
  if (!canEdit(req.user, post)) return next(forbidden());
  await remove('posts', post.id);
  res.redirect('/admin/beitraege');
});

export default router;
