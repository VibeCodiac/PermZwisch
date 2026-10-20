import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const env = process.env.NODE_ENV || 'development';
const isProd = env === 'production';

function parseTrustProxy(value) {
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  const n = Number(value);
  return Number.isInteger(n) ? n : value;
}

let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret.length < 32) {
  if (isProd) {
    throw new Error('SESSION_SECRET muss in Produktion gesetzt sein (mindestens 32 Zeichen).');
  }
  sessionSecret = crypto.randomBytes(48).toString('hex');
}

const dataDir = path.resolve(process.env.DATA_DIR || 'data');

export const config = {
  env,
  isProd,
  port: Number(process.env.PORT) || 3000,
  baseUrl: (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  sessionSecret,
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  dataDir,
  dbPath: process.env.DB_PATH || path.join(dataDir, 'blog.db'),
  uploadDir: path.join(dataDir, 'uploads'),
  // Login-Schutz
  maxFailedLogins: 5,
  lockMinutes: 15,
  minPasswordLength: 12,
};
