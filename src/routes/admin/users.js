import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { snapshot, create, update, getUser, uniqueSlugIn } from '../../data.js';
import { slugify } from '../../lib/slug.js';
import { storeImage } from '../../lib/images.js';
import { requireAdmin } from '../../lib/security.js';
import { passwordProblem } from '../../lib/passwords.js';
import { str, intOrNull, multipart } from './form.js';

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function avatarFile(user) {
  return user.avatar_id ? (await snapshot({ fresh: true })).mediaById.get(user.avatar_id)?.file ?? null : null;
}

// ---- Eigenes Profil ----
router.get('/profil', async (req, res) => {
  const avatar = await avatarFile(req.user);
  res.render('admin/profile', { title: 'Mein Profil', avatar, message: req.query.ok ? 'Gespeichert.' : null, error: null });
});

router.post('/profil', multipart([{ name: 'avatar', maxCount: 1 }]), async (req, res) => {
  const name = str(req.body.name, 100) || req.user.name;
  const bio = str(req.body.bio, 2000);
  let avatarId = req.user.avatar_id;
  if (str(req.body.remove_avatar) === '1') avatarId = null;
  const file = req.files?.avatar?.[0];
  if (file) avatarId = await storeImage(file.buffer, { uploaderId: req.user.id, alt: name });
  const slug = name !== req.user.name
    ? uniqueSlugIn((await snapshot({ fresh: true })).users, slugify(name), req.user.id)
    : req.user.slug;
  await update('users', req.user.id, { name, slug, bio, avatar_id: avatarId });
  res.redirect('/admin/profil?ok=1');
});

router.post('/profil/passwort', async (req, res) => {
  const current = String(req.body.current || '');
  const next1 = String(req.body.password || '');
  const next2 = String(req.body.password2 || '');
  const user = await getUser(req.user.id);
  const avatar = await avatarFile(req.user);
  const fail = (error) => res.status(400).render('admin/profile', { title: 'Mein Profil', avatar, message: null, error });

  if (!(await bcrypt.compare(current, user.password_hash))) return fail('Das aktuelle Passwort ist falsch.');
  if (next1 !== next2) return fail('Die neuen Passwörter stimmen nicht überein.');
  const problem = passwordProblem(next1);
  if (problem) return fail(problem);

  // Neue Sitzungsversion: alle anderen Sitzungen dieses Kontos werden ungültig
  const sv = (user.session_version || 0) + 1;
  await update('users', user.id, { password_hash: await bcrypt.hash(next1, 12), session_version: sv });
  req.session = { userId: user.id, sv };
  res.redirect('/admin/profil?ok=1');
});

// ---- Nutzerverwaltung (nur Admins) ----
router.get('/nutzer', requireAdmin, async (req, res) => {
  const s = await snapshot({ fresh: true });
  const users = s.users
    .map((u) => ({
      id: u.id, name: u.name, email: u.email, role: u.role, active: u.active, created_at: u.created_at,
      posts: s.posts.filter((p) => p.author_id === u.id).length,
      reviews: s.reviews.filter((r) => r.author_id === u.id).length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  res.render('admin/users', { title: 'Nutzer*innen', users });
});

function renderUserForm(res, user, error = null, status = 200) {
  res.status(status).render('admin/user-form', { title: user.id ? 'Nutzer*in bearbeiten' : 'Neue*r Autor*in', user, error });
}

const publicFields = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active });

router.get('/nutzer/neu', requireAdmin, (req, res) => renderUserForm(res, { role: 'author', active: 1 }));

router.get('/nutzer/:id', requireAdmin, async (req, res, next) => {
  const user = await getUser(intOrNull(req.params.id) ?? 0);
  if (!user) return next();
  renderUserForm(res, publicFields(user));
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
  const state = { ...(existing && publicFields(existing)), ...data };
  if (!data.name) return renderUserForm(res, state, 'Bitte einen Namen angeben.', 400);
  if (!EMAIL_RE.test(data.email)) return renderUserForm(res, state, 'Bitte eine gültige E-Mail-Adresse angeben.', 400);
  const s = await snapshot({ fresh: true });
  if (s.users.some((u) => u.email === data.email && u.id !== existing?.id)) {
    return renderUserForm(res, state, 'Diese E-Mail-Adresse wird bereits verwendet.', 400);
  }
  if (!existing || password) {
    const problem = passwordProblem(password);
    if (problem) return renderUserForm(res, state, problem, 400);
  }

  if (existing) {
    const changes = { ...data };
    if (password) Object.assign(changes, { password_hash: await bcrypt.hash(password, 12), failed_logins: 0, locked_until: null });
    // Neues Passwort oder Deaktivierung beendet alle Sitzungen dieses Kontos
    if (password || !data.active) changes.session_version = (existing.session_version || 0) + 1;
    await update('users', existing.id, changes);
  } else {
    await create('users', {
      ...data,
      slug: uniqueSlugIn(s.users, slugify(data.name)),
      bio: '',
      avatar_id: null,
      password_hash: await bcrypt.hash(password, 12),
      failed_logins: 0,
      locked_until: null,
      session_version: 0,
    });
  }
  res.redirect('/admin/nutzer');
}

router.post('/nutzer', requireAdmin, (req, res) => saveUser(req, res, null));

router.post('/nutzer/:id', requireAdmin, async (req, res, next) => {
  const existing = await getUser(intOrNull(req.params.id) ?? 0);
  if (!existing) return next();
  return saveUser(req, res, existing);
});

export default router;
