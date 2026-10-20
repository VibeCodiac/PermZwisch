/** Hilfsfunktionen, die in allen Templates verfügbar sind. */

export function parseDbDate(value) {
  if (!value) return null;
  // SQLite speichert UTC als "YYYY-MM-DD HH:MM:SS"
  return new Date(String(value).replace(' ', 'T') + (String(value).endsWith('Z') ? '' : 'Z'));
}

export function toDbDate(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/** Wert für <input type="datetime-local"> in Serverzeit (TZ=Europe/Berlin empfohlen). */
export function toLocalInput(value) {
  const d = parseDbDate(value);
  if (!d) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const dateFmt = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' });

export const viewHelpers = {
  formatDate(value) {
    const d = parseDbDate(value);
    return d ? dateFmt.format(d) : '';
  },
  formatDateTime(value) {
    const d = parseDbDate(value);
    return d ? dateTimeFmt.format(d) : '';
  },
  isoDate(value) {
    const d = parseDbDate(value);
    return d ? d.toISOString() : '';
  },
  img(file, size) {
    return file ? `/uploads/${file}${size === 'sm' ? '-sm' : ''}.webp` : '';
  },
  srcset(file) {
    return file ? `/uploads/${file}-sm.webp 800w, /uploads/${file}.webp 2000w` : '';
  },
  hostOf(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  },
  stars(rating) {
    const r = Math.max(0, Math.min(5, Number(rating) || 0));
    return '★'.repeat(r) + '☆'.repeat(5 - r);
  },
  readingTime(text) {
    const words = String(text || '').split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 220));
  },
  toLocalInput,
};
