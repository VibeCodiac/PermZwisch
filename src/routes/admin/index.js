import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../../db.js';
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
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12);

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
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const fail = (msg = 'E-Mail-Adresse oder Passwort ist falsch.') =>
    res.status(401).render('admin/login', { title: 'Anmelden', error: msg, email });

  if (user?.locked_until && user.locked_until > Date.now()) {
    await bcrypt.compare(password, DUMMY_HASH);
    return fail('Das Konto ist wegen zu vieler Fehlversuche vorübergehend gesperrt. Bitte später erneut versuchen.');
  }
  const ok = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);
  if (!user || !ok || !user.active) {
    if (user) {
      const failed = user.failed_logins + 1;
      const lock = failed >= config.maxFailedLogins ? Date.now() + config.lockMinutes * 60_000 : null;
      db.prepare('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?')
        .run(lock ? 0 : failed, lock, user.id);
    }
    return fail();
  }

  db.prepare('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?').run(user.id);
  const returnTo = req.session.returnTo;
  // Neue Sitzungs-ID nach dem Login (Schutz vor Session Fixation)
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.userId = user.id;
    req.session.save((err2) => {
      if (err2) return next(err2);
      const safe = typeof returnTo === 'string' && /^\/admin(\/|$)/.test(returnTo) ? returnTo : '/admin';
      res.redirect(safe);
    });
  });
});

router.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie(config.isProd ? '__Host-sid' : 'sid', { path: '/', secure: config.isProd, httpOnly: true, sameSite: 'lax' });
    res.redirect('/admin/login');
  });
});

// ---- Ab hier nur für angemeldete Nutzer*innen ----
router.use(requireAuth);

router.get('/', (req, res) => {
  const own = req.user.role === 'admin' ? '' : 'WHERE author_id = ?';
  const args = req.user.role === 'admin' ? [] : [req.user.id];
  const stats = {
    posts: db.prepare(`SELECT COUNT(*) n FROM posts ${own}`).get(...args).n,
    reviews: db.prepare(`SELECT COUNT(*) n FROM reviews ${own}`).get(...args).n,
    drafts:
      db.prepare(`SELECT COUNT(*) n FROM posts ${own ? own + ' AND' : 'WHERE'} status = 'draft'`).get(...args).n +
      db.prepare(`SELECT COUNT(*) n FROM reviews ${own ? own + ' AND' : 'WHERE'} status = 'draft'`).get(...args).n,
    media: db.prepare('SELECT COUNT(*) n FROM media').get().n,
  };
  const recent = db
    .prepare(`SELECT 'post' AS type, id, title, status, updated_at FROM posts ${own}
              UNION ALL
              SELECT 'review', id, title, status, updated_at FROM reviews ${own}
              ORDER BY updated_at DESC LIMIT 10`)
    .all(...args, ...args);
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
