import { Router } from 'express';
import { db } from '../../db.js';
import { storeImage, deleteMedia } from '../../lib/images.js';
import { str, intOrNull, multipart, forbidden } from './form.js';

const router = Router();
const PER_PAGE = 48;

router.get('/', (req, res) => {
  const page = Math.max(1, intOrNull(req.query.seite) || 1);
  const total = db.prepare('SELECT COUNT(*) n FROM media').get().n;
  const media = db
    .prepare(`SELECT m.*, u.name AS uploader_name FROM media m LEFT JOIN users u ON u.id = m.uploader_id
              ORDER BY m.id DESC LIMIT ? OFFSET ?`)
    .all(PER_PAGE, (page - 1) * PER_PAGE);
  res.render('admin/media', { title: 'Mediathek', media, page, pages: Math.ceil(total / PER_PAGE) });
});

router.post('/', multipart([{ name: 'files', maxCount: 30 }]), async (req, res) => {
  for (const f of req.files?.files || []) {
    await storeImage(f.buffer, { uploaderId: req.user.id, alt: str(req.body.alt, 300) });
  }
  res.redirect('/admin/medien');
});

function mayChange(user, media) {
  return user.role === 'admin' || media.uploader_id === user.id;
}

router.post('/:id', (req, res, next) => {
  const m = db.prepare('SELECT * FROM media WHERE id = ?').get(intOrNull(req.params.id));
  if (!m) return next();
  if (!mayChange(req.user, m)) return next(forbidden());
  db.prepare('UPDATE media SET alt = ? WHERE id = ?').run(str(req.body.alt, 300), m.id);
  res.redirect('/admin/medien');
});

router.post('/:id/loeschen', async (req, res, next) => {
  const m = db.prepare('SELECT * FROM media WHERE id = ?').get(intOrNull(req.params.id));
  if (!m) return next();
  if (!mayChange(req.user, m)) return next(forbidden());
  await deleteMedia(m.id);
  res.redirect('/admin/medien');
});

export default router;
