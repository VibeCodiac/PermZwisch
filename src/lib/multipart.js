// Formulare mit Datei-Uploads (multipart/form-data) einlesen.
// Cloud Functions liest den Request vorab ein und stellt ihn als req.rawBody bereit –
// darum wird entweder dieser Puffer oder (lokal) der Datenstrom verarbeitet.
import { Readable } from 'node:stream';
import busboy from 'busboy';
import { UserError } from './images.js';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/tiff']);
const LIMITS = { fileSize: 15 * 1024 * 1024, files: 30, fields: 200, fieldSize: 300 * 1024 };

function limitError(code, message) {
  const err = new UserError(message);
  err.code = code;
  return err;
}

/** Middleware: füllt req.body (Felder) und req.files (Name → Liste von { buffer, mimetype, originalname }). */
export function parseMultipart(allowedFields) {
  const allowed = new Map(allowedFields.map((f) => [f.name, f.maxCount]));
  return (req, res, next) => {
    if (!req.is('multipart/form-data')) return next();
    let bb;
    try {
      bb = busboy({ headers: req.headers, limits: LIMITS });
    } catch {
      return next(new UserError('Ungültiges Formular.'));
    }
    const body = {};
    const files = {};
    let failed = null;
    const fail = (err) => {
      failed ??= err;
    };

    bb.on('field', (name, value, info) => {
      if (info.valueTruncated) return fail(limitError('LIMIT_FIELD_VALUE', 'Ein Textfeld ist zu lang.'));
      if (name in body) body[name] = [].concat(body[name], value);
      else body[name] = value;
    });

    bb.on('file', (name, stream, info) => {
      const chunks = [];
      stream.on('data', (c) => chunks.push(c));
      stream.on('limit', () => fail(limitError('LIMIT_FILE_SIZE', 'Die Datei ist zu groß (max. 15 MB).')));
      stream.on('close', () => {
        if (!info.filename) return; // leeres Dateifeld
        if (!allowed.has(name)) return fail(limitError('LIMIT_UNEXPECTED_FILE', 'Unerwartetes Dateifeld.'));
        if (!ALLOWED_TYPES.has(info.mimeType)) return fail(new UserError('Nur Bilddateien (JPG, PNG, WebP, GIF, AVIF) sind erlaubt.'));
        const list = (files[name] ??= []);
        if (list.length >= allowed.get(name)) return fail(limitError('LIMIT_FILE_COUNT', 'Zu viele Dateien auf einmal.'));
        list.push({ buffer: Buffer.concat(chunks), mimetype: info.mimeType, originalname: info.filename });
      });
    });

    bb.on('filesLimit', () => fail(limitError('LIMIT_FILE_COUNT', 'Zu viele Dateien auf einmal.')));
    bb.on('fieldsLimit', () => fail(limitError('LIMIT_FIELD_COUNT', 'Zu viele Formularfelder.')));
    bb.on('error', () => fail(new UserError('Das Formular konnte nicht gelesen werden. Bitte erneut versuchen.')));
    bb.on('close', () => {
      if (failed) return next(failed);
      req.body = body;
      req.files = files;
      next();
    });

    if (req.rawBody) Readable.from([req.rawBody]).pipe(bb);
    else req.pipe(bb);
  };
}
