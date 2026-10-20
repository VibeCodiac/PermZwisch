import { Router } from 'express';
import { db } from '../../db.js';
import { renderMarkdown } from '../../lib/markdown.js';
import { uniqueSlug } from '../../lib/slug.js';
import { storeImage } from '../../lib/images.js';
import { canEdit, fetchLimiter } from '../../lib/security.js';
import { fetchPodcastMeta, downloadArtwork, parseSpotifyUrl, parseAppleUrl } from '../../lib/podcast.js';
import { reviewById } from '../../lib/queries.js';
import { str, intOrNull, publishFields, multipart, forbidden } from './form.js';

const router = Router();

async function importArtwork(artworkUrl, user, alt) {
  const buffer = await downloadArtwork(artworkUrl);
  return storeImage(buffer, { uploaderId: user.id, alt });
}

router.get('/', (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const reviews = db
    .prepare(`SELECT r.id, r.title, r.podcast_name, r.rating, r.status, r.published_at, r.updated_at,
                     u.name AS author_name, m.file AS artwork_file
              FROM reviews r JOIN users u ON u.id = r.author_id LEFT JOIN media m ON m.id = r.artwork_id
              ${isAdmin ? '' : 'WHERE r.author_id = ?'} ORDER BY r.updated_at DESC`)
    .all(...(isAdmin ? [] : [req.user.id]));
  res.render('admin/reviews', { title: 'Podcast-Reviews', reviews });
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
      artwork = { id, url: `/uploads/${db.prepare('SELECT file FROM media WHERE id = ?').get(id).file}-sm.webp` };
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

function renderForm(res, review, { error = null, status = 200 } = {}) {
  let artworkFile = review.artwork_file;
  if (review.artwork_id && !artworkFile) artworkFile = db.prepare('SELECT file FROM media WHERE id = ?').get(review.artwork_id)?.file;
  res.status(status).render('admin/review-form', {
    title: review.id ? 'Review bearbeiten' : 'Neues Podcast-Review',
    review: { ...review, artwork_file: artworkFile },
    error,
  });
}

router.get('/neu', (req, res) => renderForm(res, { status: 'draft', rating: 0 }));

router.get('/:id', (req, res, next) => {
  const review = reviewById(intOrNull(req.params.id));
  if (!review) return next();
  if (!canEdit(req.user, review)) return next(forbidden());
  renderForm(res, review);
});

const uploads = multipart([{ name: 'artwork', maxCount: 1 }]);

async function save(req, res, existing) {
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
  if (data.artwork_id && !db.prepare('SELECT 1 FROM media WHERE id = ?').get(data.artwork_id)) data.artwork_id = null;
  if (error) return renderForm(res, formState, { error, status: 400 });

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

  const slug = uniqueSlug(db, 'reviews', formState.slug || data.title, existing?.id ?? null);
  const values = [
    data.title, slug, data.podcast_name, data.episode_title, data.publisher, data.artwork_id,
    spotify?.url ?? null, apple?.url ?? null, data.rating, data.excerpt, data.body_md, renderMarkdown(data.body_md),
    status, publishedAt,
  ];
  let id = existing?.id;
  if (id) {
    db.prepare(`UPDATE reviews SET title=?, slug=?, podcast_name=?, episode_title=?, publisher=?, artwork_id=?,
                spotify_url=?, apple_url=?, rating=?, excerpt=?, body_md=?, body_html=?, status=?, published_at=?,
                updated_at=datetime('now') WHERE id=?`).run(...values, id);
  } else {
    id = db.prepare(`INSERT INTO reviews (title, slug, podcast_name, episode_title, publisher, artwork_id, spotify_url,
                     apple_url, rating, excerpt, body_md, body_html, status, published_at, author_id)
                     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...values, req.user.id).lastInsertRowid;
  }
  res.redirect(`/admin/podcasts/${id}?gespeichert=1`);
}

router.post('/', uploads, (req, res) => save(req, res, null));

router.post('/:id', uploads, (req, res, next) => {
  const existing = db.prepare('SELECT * FROM reviews WHERE id = ?').get(intOrNull(req.params.id));
  if (!existing) return next();
  if (!canEdit(req.user, existing)) return next(forbidden());
  return save(req, res, existing);
});

router.post('/:id/loeschen', (req, res, next) => {
  const review = db.prepare('SELECT id, author_id FROM reviews WHERE id = ?').get(intOrNull(req.params.id));
  if (!review) return next();
  if (!canEdit(req.user, review)) return next(forbidden());
  db.prepare('DELETE FROM reviews WHERE id = ?').run(review.id);
  res.redirect('/admin/podcasts');
});

export default router;
