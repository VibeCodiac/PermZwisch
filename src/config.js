import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

// In Firebase/Cloud Functions ist K_SERVICE gesetzt
const onFirebase = Boolean(process.env.K_SERVICE || process.env.FUNCTION_TARGET);
const env = process.env.NODE_ENV || (onFirebase ? 'production' : 'development');
const isProd = env === 'production';

function parseTrustProxy(value, fallback) {
  if (value === undefined || value === '') return fallback;
  if (value === 'false') return false;
  if (value === 'true') return true;
  const n = Number(value);
  return Number.isInteger(n) ? n : value;
}

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (isProd) throw new Error('SESSION_SECRET muss in Produktion gesetzt sein (mindestens 32 Zeichen).');
  return crypto.randomBytes(48).toString('hex');
}

const dataDir = path.resolve(process.env.DATA_DIR || 'data');

export const config = {
  env,
  isProd,
  onFirebase,
  port: Number(process.env.PORT) || 3000,
  baseUrl: (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  // Wird erst beim ersten Zugriff gelesen: Auf Firebase steht das Secret erst zur Laufzeit bereit.
  get sessionSecret() {
    const value = sessionSecret();
    Object.defineProperty(this, 'sessionSecret', { value });
    return value;
  },
  // Firebase Hosting → Cloud Run: mehrere Google-Proxys davor, die Besucheradresse steht vorne in X-Forwarded-For
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY, onFirebase ? true : false),
  // Datenablage: "firestore" (Firebase), "file" (lokale Entwicklung) oder "memory" (Tests)
  dataDriver: process.env.DATA_DRIVER || (onFirebase ? 'firestore' : 'file'),
  dataDir,
  dataFile: path.join(dataDir, 'blog.json'),
  uploadDir: path.join(dataDir, 'uploads'),
  // Cloud-Storage-Bucket für Bilder (nur bei DATA_DRIVER=firestore)
  uploadBucket: process.env.UPLOAD_BUCKET || '',
  // Wie lange Inhalte im Speicher zwischengespeichert werden (Sekunden)
  cacheSeconds: Number(process.env.CACHE_SECONDS ?? 30),
  // Login-Schutz
  maxFailedLogins: 5,
  lockMinutes: 15,
  minPasswordLength: 12,
};
