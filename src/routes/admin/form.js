import { toDbDate } from '../../lib/helpers.js';
import { upload } from '../../lib/images.js';
import { verifyCsrf } from '../../lib/security.js';

/** String aus dem Formular holen, trimmen und kürzen. */
export function str(value, max = 500) {
  if (Array.isArray(value)) value = value[0];
  return String(value ?? '').trim().slice(0, max);
}

export function list(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export function intOrNull(value) {
  const n = Number.parseInt(str(value, 20), 10);
  return Number.isInteger(n) ? n : null;
}

/** Status und Veröffentlichungsdatum (datetime-local in Serverzeit) auswerten. */
export function publishFields(body, existing) {
  const status = str(body.status) === 'published' ? 'published' : 'draft';
  const raw = str(body.published_at, 30);
  let publishedAt = existing?.published_at || null;
  if (raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) publishedAt = toDbDate(d);
  } else if (status === 'published') {
    publishedAt = toDbDate(new Date());
  }
  if (status === 'published' && !publishedAt) publishedAt = toDbDate(new Date());
  return { status, publishedAt };
}

/** Multipart-Upload parsen und danach CSRF prüfen. */
export function multipart(fields) {
  return [upload.fields(fields), verifyCsrf];
}

export function forbidden() {
  const err = new Error('Dafür fehlen dir die Berechtigungen.');
  err.status = 403;
  return err;
}
