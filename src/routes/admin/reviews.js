import { Router } from 'express';
import { snapshot, create, update, remove, now, uniqueSlugIn } from '../../data.js';
import { renderMarkdown } from '../../lib/markdown.js';
import { slugify } from '../../lib/slug.js';
import { storeImage } from '../../lib/images.js';
import { canEdit, fetchLimiter } from '../../lib/security.js';
import { fetchPodcastMeta, downloadArtwork, parseSpotifyUrl, parseAppleUrl } from '../../lib/podcast.js';
import { str, intOrNull, publishFields, multipart, forbidden } from './form.js';

const router = Router();

async function importArtwork(artworkUrl, user, alt) {
  const buffer = await downloadArtwork(artworkUrl);
  return storeImage(buffer, { uploaderId: user.id, alt });
}

router.get('/', async (req, res) => {
  const s = await snapshot({ fresh: true });
  const reviews = s.reviews
    .filter((r) => req.user.role === 'admin' || r.author_id === req.user.id)
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  res.render('admin/reviews', { title: res.locals.site.podcast_title, reviews });
});

/** Metadaten + Cover von Spotify/Apple abrufen (AJAX aus dem Formular). */
router.post('/metadaten', fetchLimiter, async (req, res) => {
  const spotifyUrl = str(req.body.spotify_url, 2000);
  const appleUrl = str(req.body.apple_url, 2000);
  const meta = await fetchPodcastMeta({ spotifyUrl, appleUrl });
  let artwork = null;
  if (meta.artworkUrl) {
    try {
      const id = await importArtwork(meta.artworkUrl, req.user, `Cover: ${meta.podcastName || meta.episodeTitle}`);
      const file = (await snapshot({ fresh: true })).mediaById.get(id).file;
      artwork = { id, url: `/uploads/${file}-sm.webp` };
    } catch {
      artwork = null;
    }
  }
  res.json({
    podcastName: meta.podcastName,
    episodeTitle: meta.episodeTitle,
    publisher: meta.publisher,
    description: meta.description,
    artwork,
  });
});

function renderForm(res, s, review, { error = null, status = 200 } = {}) {
  const artworkFile = review.artwork_id ? s.mediaById.get(review.artwork_id)?.file : null;
  res.status(status).render('admin/review-form', {
    title: review.id ? 'Review bearbeiten' : 'Neues Podcast-Review',
    review: { ...review, artwork_file: artworkFile },
    error,
  });
}

router.get('/neu', async (req, res) => renderForm(res, await snapshot({ fresh: true }), { status: 'draft', rating: 0 }));

router.get('/:id', async (req, res, next) => {
  const s = await snapshot({ fresh: true });
  const review = s.reviewsById.get(intOrNull(req.params.id));
  if (!review) return next();
  if (!canEdit(req.user, review)) return next(forbidden());
  renderForm(res, s, review);
});

const uploads = multipart([{ name: 'artwork', maxCount: 1 }]);

async function save(req, res, s, existing) {
  const b = req.body;
  const rating = intOrNull(b.rating);
  const data = {
    title: str(b.title, 200),
    podcast_name: str(b.podcast_name, 200),
    episode_title: str(b.episode_title, 300),
    publisher: str(b.publisher, 200),
    spotify_url: str(b.spotify_url, 2000),
    apple_url: str(b.apple_url, 2000),
    rating: rating >= 0 && rating <= 5 ? rating : 0,
    excerpt: str(b.excerpt, 600),
    body_md: str(b.body_md, 200_000),
    artwork_id: intOrNull(b.artwork_id) ?? existing?.artwork_id ?? null,
  };
  const { status, publishedAt } = publishFields(b, existing);
  const formState = { ...existing, ...data, status, published_at: publishedAt, slug: str(b.slug, 80) };

  const spotify = data.spotify_url ? parseSpotifyUrl(data.spotify_url) : null;
  const apple = data.apple_url ? parseAppleUrl(data.apple_url) : null;
  let error = null;
  if (!data.title) error = 'Bitte einen Titel für das Review angeben.';
  else if (data.spotify_url && !spotify) error = 'Der Spotify-Link wird nicht erkannt (erwartet: https://open.spotify.com/show/… oder /episode/…).';
  else if (data.apple_url && !apple) error = 'Der Apple-Podcasts-Link wird nicht erkannt (erwartet: https://podcasts.apple.com/de/podcast/…/id123…).';
  else if (!data.podcast_name && !data.episode_title) error = 'Bitte den Namen des Podcasts angeben (oder per „Daten abrufen“ laden).';
  if (data.artwork_id && !s.mediaById.has(data.artwork_id)) data.artwork_id = null;
  if (error) return renderForm(res, s, formState, { error, status: 400 });

  if (str(b.remove_artwork) === '1') data.artwork_id = null;
  const file = req.files?.artwork?.[0];
  if (file) {
    data.artwork_id = await storeImage(file.buffer, { uploaderId: req.user.id, alt: `Cover: ${data.podcast_name}` });
  } else if (!data.artwork_id && (spotify || apple) && str(b.remove_artwork) !== '1') {
    // Cover automatisch nachladen, wenn noch keines vorhanden ist
    try {
      const meta = await fetchPodcastMeta({ spotifyUrl: spotify?.url, appleUrl: apple?.url });
      if (meta.artworkUrl) data.artwork_id = await importArtwork(meta.artworkUrl, req.user, `Cover: ${data.podcast_name}`);
    } catch {
      /* ohne Cover speichern */
    }
  }

  const record = {
    ...data,
    spotify_url: spotify?.url ?? null,
    apple_url: apple?.url ?? null,
    slug: uniqueSlugIn(s.reviews, slugify(formState.slug || data.title), existing?.id ?? null),
    body_html: renderMarkdown(data.body_md),
    status,
    published_at: publishedAt,
    updated_at: now(),
  };
  let id = existing?.id;
  if (id) await update('reviews', id, record);
  else id = await create('reviews', { ...record, author_id: req.user.id });
  res.redirect(`/admin/podcasts/${id}?gespeichert=1`);
}

router.post('/', uploads, async (req, res) => save(req, res, await snapshot({ fresh: true }), null));

router.post('/:id', uploads, async (req, res, next) => {
  const s = await snapshot({ fresh: true });
  const existing = s.reviewsById.get(intOrNull(req.params.id));
  if (!existing) return next();
  if (!canEdit(req.user, existing)) return next(forbidden());
  return save(req, res, s, existing);
});

router.post('/:id/loeschen', async (req, res, next) => {
  const s = await snapshot({ fresh: true });
  const review = s.reviewsById.get(intOrNull(req.params.id));
  if (!review) return next();
  if (!canEdit(req.user, review)) return next(forbidden());
  await remove('reviews', review.id);
  res.redirect('/admin/podcasts');
});

export default router;
