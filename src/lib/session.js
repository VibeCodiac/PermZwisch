// Sitzung als signiertes Cookie. Firebase Hosting reicht nur das Cookie „__session“ an die App
// weiter – darum steckt alles (Inhalt, Ablaufzeit, Signatur) in genau diesem einen Cookie.
import crypto from 'node:crypto';
import { config } from '../config.js';

export const COOKIE_NAME = '__session';
const MAX_AGE = 8 * 60 * 60; // Sekunden
const REFRESH_AFTER = 5 * 60 * 1000; // Ablaufzeit spätestens alle 5 Minuten verlängern

const b64 = (buf) => Buffer.from(buf).toString('base64url');

function sign(body) {
  return b64(crypto.createHmac('sha256', config.sessionSecret).update(body).digest());
}

function readCookie(header, name) {
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

function decode(raw) {
  const [body, sig] = String(raw).split('.');
  if (!body || !sig) return null;
  const expected = sign(body);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

function cookie(value, maxAge) {
  return [
    `${COOKIE_NAME}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    ...(config.isProd ? ['Secure'] : []),
  ].join('; ');
}

export function sessionMiddleware(req, res, next) {
  const raw = readCookie(req.headers.cookie, COOKIE_NAME);
  const payload = raw ? decode(raw) : null;
  req.session = payload ? payload.d : {};
  const before = JSON.stringify(req.session);

  const writeHead = res.writeHead;
  res.writeHead = function patchedWriteHead(...args) {
    if (req.session === null) {
      if (raw) res.append('Set-Cookie', cookie('', 0));
    } else {
      const changed = JSON.stringify(req.session) !== before;
      const stale = payload && Date.now() - payload.iat > REFRESH_AFTER;
      const empty = Object.keys(req.session).length === 0;
      if ((changed || stale) && !(empty && !raw)) {
        const now = Date.now();
        const body = b64(JSON.stringify({ d: req.session, iat: now, exp: now + MAX_AGE * 1000 }));
        res.append('Set-Cookie', cookie(`${body}.${sign(body)}`, MAX_AGE));
      }
    }
    return writeHead.apply(this, args);
  };
  next();
}
