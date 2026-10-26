import crypto from 'node:crypto';
import { getFiles } from '../store/files.js';
import { create, remove, snapshot } from '../data.js';

export class UserError extends Error {}

/**
 * Bild neu kodieren (entfernt EXIF/GPS-Daten und schädliche Inhalte), in zwei Größen
 * als WebP speichern und in der Mediathek eintragen. Gibt die Media-ID zurück.
 */
export async function storeImage(buffer, { uploaderId = null, alt = '' } = {}) {
  const { default: sharp } = await import('sharp'); // erst bei Bedarf laden (schnellerer Kaltstart)
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
    .toBuffer({ resolveWithObject: true });
  const small = await input
    .clone()
    .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();

  const files = await getFiles();
  await Promise.all([files.save(`${base}.webp`, large.data), files.save(`${base}-sm.webp`, small)]);
  return create('media', {
    file: base,
    width: large.info.width,
    height: large.info.height,
    alt: String(alt).slice(0, 300),
    uploader_id: uploaderId,
  });
}

export async function deleteMedia(id) {
  const m = (await snapshot({ fresh: true })).mediaById.get(id);
  if (!m) return;
  await remove('media', id);
  const files = await getFiles();
  await Promise.all([files.remove(`${m.file}.webp`), files.remove(`${m.file}-sm.webp`)]);
}
