import { Router } from 'express';
import { snapshot, update } from '../../data.js';
import { storeImage, deleteMedia } from '../../lib/images.js';
import { str, intOrNull, multipart, forbidden } from './form.js';

const router = Router();
const PER_PAGE = 48;

router.get('/', async (req, res) => {
  const s = await snapshot({ fresh: true });
  const page = Math.max(1, intOrNull(req.query.seite) || 1);
  const media = s.media
    .slice((page - 1) * PER_PAGE, page * PER_PAGE)
    .map((m) => ({ ...m, uploader_name: s.usersById.get(m.uploader_id)?.name ?? null }));
  res.render('admin/media', { title: 'Mediathek', media, page, pages: Math.ceil(s.media.length / PER_PAGE) });
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

async function findMedia(req) {
  return (await snapshot({ fresh: true })).mediaById.get(intOrNull(req.params.id));
}

router.post('/:id', async (req, res, next) => {
  const m = await findMedia(req);
  if (!m) return next();
  if (!mayChange(req.user, m)) return next(forbidden());
  await update('media', m.id, { alt: str(req.body.alt, 300) });
  res.redirect('/admin/medien');
});

router.post('/:id/loeschen', async (req, res, next) => {
  const m = await findMedia(req);
  if (!m) return next();
  if (!mayChange(req.user, m)) return next(forbidden());
  await deleteMedia(m.id);
  res.redirect('/admin/medien');
});

export default router;
