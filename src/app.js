import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { config } from './config.js';
import { snapshot } from './data.js';
import { defaultSettings } from './store/defaults.js';
import { getFiles } from './store/files.js';
import { securityHeaders, generalLimiter, loadUser, csrfToken } from './lib/security.js';
import { sessionMiddleware } from './lib/session.js';
import { viewHelpers } from './lib/helpers.js';
import { UserError } from './lib/images.js';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function createApp() {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(root, 'views'));
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  app.use(securityHeaders);
  app.use(generalLimiter);

  // Auf Firebase liefert Hosting /static direkt aus; lokal übernimmt das Express.
  app.use('/static', express.static(path.join(root, 'web', 'static'), { maxAge: config.isProd ? '7d' : 0, index: false }));

  // Bilder aus der Mediathek (lokaler Ordner bzw. Cloud Storage)
  app.get('/uploads/:name', async (req, res, next) => {
    const file = await (await getFiles()).open(req.params.name);
    if (!file) return next();
    res.set({
      'Content-Type': 'image/webp',
      'Content-Length': String(file.size),
      'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
      'Content-Security-Policy': "default-src 'none'",
    });
    file.stream.on('error', next).pipe(res);
  });

  app.use(async (req, res, next) => {
    const s = await snapshot();
    res.locals.h = viewHelpers;
    res.locals.site = s.settings;
    res.locals.navSections = s.sections;
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
  app.use('/admin', sessionMiddleware, loadUser);
  app.use('/admin', adminRoutes);

  // Öffentliche Seiten sind für alle gleich: kurz im CDN von Firebase Hosting zwischenspeichern
  app.use((req, res, next) => {
    if (req.method === 'GET') res.set('Cache-Control', 'public, max-age=0, s-maxage=120');
    next();
  });
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
    res.set('Cache-Control', 'no-store');
    if (req.accepts(['html', 'json']) === 'json' || req.xhr) {
      return res.status(status).json({ error: message });
    }
    // Falls schon das Laden der Inhalte fehlschlug: mit Grundwerten rendern
    res.locals.site ??= defaultSettings;
    res.locals.navSections ??= [];
    res.locals.h ??= viewHelpers;
    res.locals.path ??= req.path;
    res.locals.baseUrl ??= config.baseUrl;
    res.locals.mode ??= 'magazin';
    res.locals.csrf ??= () => '';
    res.status(status).render('errors/error', { title: 'Fehler', status, message });
  });

  return app;
}
