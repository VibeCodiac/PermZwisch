import crypto from 'node:crypto';
import helmet from 'helmet';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { getUser } from '../data.js';
import { config } from '../config.js';

// ---- HTTP-Sicherheitsheader ----
export const securityHeaders = [
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'"],
        'img-src': ["'self'", 'data:'],
        'font-src': ["'self'"],
        'connect-src': ["'self'"],
        // Nur für Podcast-Player nach Einwilligung
        'frame-src': ['https://open.spotify.com', 'https://embed.podcasts.apple.com'],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
        ...(config.isProd ? { 'upgrade-insecure-requests': [] } : {}),
      },
    },
    strictTransportSecurity: config.isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginEmbedderPolicy: false,
  }),
  (req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=()');
    next();
  },
];

// ---- Rate Limiting ----
// Auf Firebase kommt die Anfrage über Proxys; ohne erkennbare Adresse zählt ein gemeinsamer Topf.
// Der eigentliche Schutz vor Passwort-Raten ist die Kontosperre (siehe Login).
const limiterDefaults = {
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip || req.socket?.remoteAddress || '0.0.0.0'),
  validate: { ip: false, trustProxy: false },
};

export const generalLimiter = rateLimit({
  ...limiterDefaults,
  windowMs: 60 * 1000,
  limit: 300,
});

export const loginLimiter = rateLimit({
  ...limiterDefaults,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    res.status(429).render('admin/login', {
      title: 'Anmelden',
      error: 'Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.',
      email: '',
    });
  },
});

export const fetchLimiter = rateLimit({ ...limiterDefaults, windowMs: 60 * 1000, limit: 20 });

// ---- CSRF-Schutz (Synchronizer-Token in der Sitzung) ----
export function csrfToken(req) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(32).toString('hex');
  return req.session.csrf;
}

export function verifyCsrf(req, res, next) {
  const expected = req.session?.csrf;
  const given = req.get('x-csrf-token') || req.body?._csrf || '';
  if (
    !expected ||
    typeof given !== 'string' ||
    given.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))
  ) {
    const err = new Error('Ungültiges oder abgelaufenes Formular. Bitte die Seite neu laden und erneut versuchen.');
    err.status = 403;
    return next(err);
  }
  next();
}

/** Prüft CSRF für alle verändernden Anfragen; Multipart-Formulare prüfen selbst nach dem Upload-Parsing. */
export function csrfForMutations(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.is('multipart/form-data')) return next();
  return verifyCsrf(req, res, next);
}

// ---- Authentifizierung & Rechte ----
export async function loadUser(req, res, next) {
  const id = req.session?.userId;
  if (id) {
    const user = await getUser(id);
    // Sitzungsversion: wird bei Passwortänderung/Deaktivierung erhöht und beendet alte Sitzungen
    if (user && user.active && (user.session_version || 0) === (req.session.sv || 0)) {
      req.user = {
        id: user.id, email: user.email, name: user.name, slug: user.slug,
        role: user.role, bio: user.bio || '', avatar_id: user.avatar_id ?? null, active: user.active,
      };
      res.locals.currentUser = req.user;
    } else {
      delete req.session.userId;
      delete req.session.sv;
    }
  }
  next();
}

export function requireAuth(req, res, next) {
  if (req.user) return next();
  if (req.method === 'GET') req.session.returnTo = req.originalUrl;
  return res.redirect('/admin/login');
}

export function requireAdmin(req, res, next) {
  if (req.user?.role === 'admin') return next();
  const err = new Error('Dafür fehlen dir die Berechtigungen.');
  err.status = 403;
  next(err);
}

/** Autor*innen dürfen nur eigene Inhalte bearbeiten, Admins alle. */
export function canEdit(user, item) {
  return !!user && !!item && (user.role === 'admin' || item.author_id === user.id);
}

export function noStore(req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
}
