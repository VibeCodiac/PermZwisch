import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../../db.js';
import { config } from '../../config.js';
import { uniqueSlug } from '../../lib/slug.js';
import { storeImage } from '../../lib/images.js';
import { requireAdmin } from '../../lib/security.js';
import { str, intOrNull, multipart } from './form.js';

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function passwordProblem(pw) {
  if (pw.length < config.minPasswordLength) return `Das Passwort muss mindestens ${config.minPasswordLength} Zeichen lang sein.`;
  if (pw.length > 128) return 'Das Passwort ist zu lang (max. 128 Zeichen).';
  if (!/[a-zA-ZäöüÄÖÜß]/.test(pw) || !/[^a-zA-ZäöüÄÖÜß]/.test(pw)) return 'Bitte Buchstaben und mindestens eine Ziffer oder ein Sonderzeichen verwenden.';
  return null;
}

// ---- Eigenes Profil ----
router.get('/profil', (req, res) => {
  const avatar = req.user.avatar_id ? db.prepare('SELECT file FROM media WHERE id = ?').get(req.user.avatar_id)?.file : null;
  res.render('admin/profile', { title: 'Mein Profil', avatar, message: req.query.ok ? 'Gespeichert.' : null, error: null });
});

router.post('/profil', multipart([{ name: 'avatar', maxCount: 1 }]), async (req, res) => {
  const name = str(req.body.name, 100) || req.user.name;
  const bio = str(req.body.bio, 2000);
  let avatarId = req.user.avatar_id;
  if (str(req.body.remove_avatar) === '1') avatarId = null;
  const file = req.files?.avatar?.[0];
  if (file) avatarId = await storeImage(file.buffer, { uploaderId: req.user.id, alt: name });
  const slug = name !== req.user.name ? uniqueSlug(db, 'users', name, req.user.id) : req.user.slug;
  db.prepare('UPDATE users SET name = ?, slug = ?, bio = ?, avatar_id = ? WHERE id = ?').run(name, slug, bio, avatarId, req.user.id);
  res.redirect('/admin/profil?ok=1');
});

router.post('/profil/passwort', async (req, res, next) => {
  const current = String(req.body.current || '');
  const next1 = String(req.body.password || '');
  const next2 = String(req.body.password2 || '');
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  const avatar = req.user.avatar_id ? db.prepare('SELECT file FROM media WHERE id = ?').get(req.user.avatar_id)?.file : null;
  const fail = (error) => res.status(400).render('admin/profile', { title: 'Mein Profil', avatar, message: null, error });

  if (!(await bcrypt.compare(current, user.password_hash))) return fail('Das aktuelle Passwort ist falsch.');
  if (next1 !== next2) return fail('Die neuen Passwörter stimmen nicht überein.');
  const problem = passwordProblem(next1);
  if (problem) return fail(problem);

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await bcrypt.hash(next1, 12), req.user.id);
  // Alle anderen Sitzungen dieses Kontos beenden, aktuelle Sitzung erneuern
  db.prepare("DELETE FROM sessions WHERE json_extract(sess, '$.userId') = ?").run(req.user.id);
  const userId = req.user.id;
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.userId = userId;
    req.session.save(() => res.redirect('/admin/profil?ok=1'));
  });
});

// ---- Nutzerverwaltung (nur Admins) ----
router.get('/nutzer', requireAdmin, (req, res) => {
  const users = db
    .prepare(`SELECT u.id, u.name, u.email, u.role, u.active, u.created_at,
                     (SELECT COUNT(*) FROM posts WHERE author_id = u.id) AS posts,
                     (SELECT COUNT(*) FROM reviews WHERE author_id = u.id) AS reviews
              FROM users u ORDER BY u.name`)
    .all();
  res.render('admin/users', { title: 'Nutzer*innen', users });
});

function renderUserForm(res, user, error = null, status = 200) {
  res.status(status).render('admin/user-form', { title: user.id ? 'Nutzer*in bearbeiten' : 'Neue*r Autor*in', user, error });
}

router.get('/nutzer/neu', requireAdmin, (req, res) => renderUserForm(res, { role: 'author', active: 1 }));

router.get('/nutzer/:id', requireAdmin, (req, res, next) => {
  const user = db.prepare('SELECT id, name, email, role, active FROM users WHERE id = ?').get(intOrNull(req.params.id));
  if (!user) return next();
  renderUserForm(res, user);
});

async function saveUser(req, res, existing) {
  const b = req.body;
  const data = {
    name: str(b.name, 100),
    email: str(b.email, 200).toLowerCase(),
    role: str(b.role) === 'admin' ? 'admin' : 'author',
    active: str(b.active) === '1' ? 1 : 0,
  };
  const password = String(b.password || '');
  const self = existing && existing.id === req.user.id;
  if (self) {
    // Sich selbst nicht aussperren
    data.role = 'admin';
    data.active = 1;
  }
  const state = { ...existing, ...data };
  if (!data.name) return renderUserForm(res, state, 'Bitte einen Namen angeben.', 400);
  if (!EMAIL_RE.test(data.email)) return renderUserForm(res, state, 'Bitte eine gültige E-Mail-Adresse angeben.', 400);
  const clash = db.prepare('SELECT id FROM users WHERE email = ? AND id IS NOT ?').get(data.email, existing?.id ?? null);
  if (clash) return renderUserForm(res, state, 'Diese E-Mail-Adresse wird bereits verwendet.', 400);
  if (!existing || password) {
    const problem = passwordProblem(password);
    if (problem) return renderUserForm(res, state, problem, 400);
  }

  if (existing) {
    db.prepare('UPDATE users SET name = ?, email = ?, role = ?, active = ? WHERE id = ?')
      .run(data.name, data.email, data.role, data.active, existing.id);
    if (password) {
      db.prepare('UPDATE users SET password_hash = ?, failed_logins = 0, locked_until = NULL WHERE id = ?')
        .run(await bcrypt.hash(password, 12), existing.id);
    }
    if (password || !data.active) {
      db.prepare("DELETE FROM sessions WHERE json_extract(sess, '$.userId') = ?").run(existing.id);
    }
  } else {
    db.prepare('INSERT INTO users (name, email, slug, role, active, password_hash) VALUES (?, ?, ?, ?, ?, ?)')
      .run(data.name, data.email, uniqueSlug(db, 'users', data.name), data.role, data.active, await bcrypt.hash(password, 12));
  }
  res.redirect('/admin/nutzer');
}

router.post('/nutzer', requireAdmin, (req, res) => saveUser(req, res, null));

router.post('/nutzer/:id', requireAdmin, (req, res, next) => {
  const existing = db.prepare('SELECT id, name, email, role, active FROM users WHERE id = ?').get(intOrNull(req.params.id));
  if (!existing) return next();
  return saveUser(req, res, existing);
});

export default router;
