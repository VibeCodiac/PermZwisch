import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { snapshot, findUserByEmail, update } from '../../data.js';
import { config } from '../../config.js';
import { renderMarkdown } from '../../lib/markdown.js';
import { csrfForMutations, loginLimiter, noStore, requireAuth } from '../../lib/security.js';
import postRoutes from './posts.js';
import reviewRoutes from './reviews.js';
import mediaRoutes from './media.js';
import userRoutes from './users.js';
import settingsRoutes from './settings.js';

const router = Router();
// Vergleichs-Hash, damit unbekannte E-Mail-Adressen gleich lange brauchen wie falsche Passwörter
let dummyHash;
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync('dummy-password-for-timing', 12));

router.use(noStore);
router.use(csrfForMutations);
router.use((req, res, next) => {
  res.locals.adminArea = true;
  res.locals.path = req.path;
  next();
});

// ---- Anmeldung ----
router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/admin');
  res.render('admin/login', { title: 'Anmelden', error: null, email: '' });
});

router.post('/login', loginLimiter, async (req, res, next) => {
  const email = String(req.body.email || '').trim().slice(0, 200);
  const password = String(req.body.password || '').slice(0, 200);
  const user = await findUserByEmail(email);
  const fail = (msg = 'E-Mail-Adresse oder Passwort ist falsch.') =>
    res.status(401).render('admin/login', { title: 'Anmelden', error: msg, email });

  if (user?.locked_until && user.locked_until > Date.now()) {
    await bcrypt.compare(password, getDummyHash());
    return fail('Das Konto ist wegen zu vieler Fehlversuche vorübergehend gesperrt. Bitte später erneut versuchen.');
  }
  const ok = await bcrypt.compare(password, user?.password_hash || getDummyHash());
  if (!user || !ok || !user.active) {
    if (user) {
      const failed = (user.failed_logins || 0) + 1;
      const lock = failed >= config.maxFailedLogins ? Date.now() + config.lockMinutes * 60_000 : null;
      await update('users', user.id, { failed_logins: lock ? 0 : failed, locked_until: lock });
    }
    return fail();
  }

  if (user.failed_logins || user.locked_until) await update('users', user.id, { failed_logins: 0, locked_until: null });
  const returnTo = req.session.returnTo;
  // Neue Sitzung nach dem Login (Schutz vor Session Fixation): alter Inhalt wird verworfen
  req.session = { userId: user.id, sv: user.session_version || 0 };
  const safe = typeof returnTo === 'string' && /^\/admin(\/|$)/.test(returnTo) ? returnTo : '/admin';
  res.redirect(safe);
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.redirect('/admin/login');
});

// ---- Ab hier nur für angemeldete Nutzer*innen ----
router.use(requireAuth);

router.get('/', async (req, res) => {
  const s = await snapshot({ fresh: true });
  const mine = (x) => req.user.role === 'admin' || x.author_id === req.user.id;
  const posts = s.posts.filter(mine);
  const reviews = s.reviews.filter(mine);
  const stats = {
    posts: posts.length,
    reviews: reviews.length,
    drafts: [...posts, ...reviews].filter((x) => x.status === 'draft').length,
    media: s.media.length,
  };
  const recent = [
    ...posts.map((p) => ({ type: 'post', id: p.id, title: p.title, status: p.status, updated_at: p.updated_at })),
    ...reviews.map((r) => ({ type: 'review', id: r.id, title: r.title, status: r.status, updated_at: r.updated_at })),
  ]
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
    .slice(0, 10);
  res.render('admin/dashboard', { title: 'Übersicht', stats, recent });
});

router.post('/vorschau', (req, res) => {
  res.json({ html: renderMarkdown(String(req.body.markdown || '').slice(0, 200_000)) });
});

router.use('/beitraege', postRoutes);
router.use('/podcasts', reviewRoutes);
router.use('/medien', mediaRoutes);
router.use('/', userRoutes);
router.use('/', settingsRoutes);

export default router;
