import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import multer from 'multer';
import { db } from '../db.js';
import { config } from '../config.js';

const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/tiff',
]);

/** Multer: Dateien im Speicher halten, Typ und Größe begrenzen. Der Inhalt wird später von sharp geprüft. */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 30, fields: 200 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_TYPES.has(file.mimetype)) cb(null, true);
    else cb(new UserError('Nur Bilddateien (JPG, PNG, WebP, GIF, AVIF) sind erlaubt.'));
  },
});

export class UserError extends Error {}

/**
 * Bild neu kodieren (entfernt EXIF/GPS-Daten und schädliche Inhalte), in zwei Größen
 * als WebP speichern und in der Mediathek eintragen. Gibt die Media-ID zurück.
 */
export async function storeImage(buffer, { uploaderId = null, alt = '' } = {}) {
  let input;
  try {
    input = sharp(buffer, { failOn: 'error', limitInputPixels: 60_000_000 }).rotate();
    await input.metadata();
  } catch {
    throw new UserError('Die Datei ist kein gültiges Bild.');
  }
  const base = crypto.randomBytes(12).toString('hex');
  const large = await input
    .clone()
    .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(path.join(config.uploadDir, `${base}.webp`));
  await input
    .clone()
    .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78 })
    .toFile(path.join(config.uploadDir, `${base}-sm.webp`));

  const info = db
    .prepare('INSERT INTO media (file, width, height, alt, uploader_id) VALUES (?, ?, ?, ?, ?)')
    .run(base, large.width, large.height, String(alt).slice(0, 300), uploaderId);
  return Number(info.lastInsertRowid);
}

export async function deleteMedia(id) {
  const m = db.prepare('SELECT file FROM media WHERE id = ?').get(id);
  if (!m) return;
  db.prepare('DELETE FROM media WHERE id = ?').run(id);
  for (const suffix of ['.webp', '-sm.webp']) {
    await fs.rm(path.join(config.uploadDir, m.file + suffix), { force: true });
  }
}
