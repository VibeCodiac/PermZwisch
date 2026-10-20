import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import SqliteStoreFactory from 'better-sqlite3-session-store';
import { config } from './config.js';
import { db, getSettings } from './db.js';
import { securityHeaders, generalLimiter, loadUser, csrfToken } from './lib/security.js';
import { viewHelpers } from './lib/helpers.js';
import { sections } from './lib/queries.js';
import { UserError } from './lib/images.js';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SqliteStore = SqliteStoreFactory(session);

export function createApp() {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(root, 'views'));
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  app.use(securityHeaders);
  app.use(generalLimiter);

  app.use(
    '/static',
    express.static(path.join(root, 'public'), { maxAge: config.isProd ? '7d' : 0, index: false })
  );
  app.use(
    '/uploads',
    express.static(config.uploadDir, {
      maxAge: '30d',
      immutable: true,
      index: false,
      dotfiles: 'deny',
      setHeaders: (res) => res.setHeader('Content-Security-Policy', "default-src 'none'"),
    })
  );

  app.use((req, res, next) => {
    res.locals.h = viewHelpers;
    res.locals.site = getSettings();
    res.locals.navSections = sections();
    res.locals.path = req.path;
    res.locals.query = req.query;
    res.locals.baseUrl = config.baseUrl;
    res.locals.mode = req.path.startsWith('/podcasts') ? 'podcasts' : 'magazin';
    res.locals.csrf = () => csrfToken(req);
    next();
  });

  app.use(express.urlencoded({ extended: false, limit: '1mb', parameterLimit: 500 }));
  app.use(express.json({ limit: '100kb' }));

  // Sitzungen nur für den Redaktionsbereich – öffentliche Besucher bekommen kein Cookie.
  const sessionMiddleware = session({
    name: config.isProd ? '__Host-sid' : 'sid',
    secret: config.sessionSecret,
    store: new SqliteStore({ client: db, expired: { clear: true, intervalMs: 15 * 60 * 1000 } }),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: config.isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 8 * 60 * 60 * 1000,
    },
  });
  app.use('/admin', sessionMiddleware, loadUser);

  app.use('/admin', adminRoutes);
  app.use('/', publicRoutes);

  app.use((req, res) => {
    res.status(404).render('errors/error', { title: 'Seite nicht gefunden', status: 404, message: 'Diese Seite gibt es leider nicht (mehr).' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    let status = err.status || err.statusCode || 500;
    let message = 'Da ist etwas schiefgelaufen. Bitte versuche es später erneut.';
    if (err instanceof UserError || err.code?.startsWith?.('LIMIT_')) {
      status = 400;
      message = err.code === 'LIMIT_FILE_SIZE' ? 'Die Datei ist zu groß (max. 15 MB).' : err.message;
    } else if (status < 500) {
      message = err.expose === false ? message : err.message;
    } else {
      console.error(err);
    }
    if (req.accepts(['html', 'json']) === 'json' || req.xhr) {
      return res.status(status).json({ error: message });
    }
    res.status(status).render('errors/error', { title: 'Fehler', status, message });
  });

  return app;
}
