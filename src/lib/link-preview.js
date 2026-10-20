import { safeFetch } from './safe-fetch.js';

const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decode(s) {
  return String(s || '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') {
        const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
      }
      return entities[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function parseAttrs(tag) {
  const attrs = {};
  for (const m of tag.matchAll(/([a-zA-Z_:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return attrs;
}

/** Liest OpenGraph-/Meta-Angaben einer Artikel-URL (Titel, Beschreibung, Quelle, Bild). */
export async function fetchLinkPreview(rawUrl) {
  const { buffer, url } = await safeFetch(rawUrl, { accept: 'text/html,application/xhtml+xml', maxBytes: 1_500_000 });
  const html = buffer.toString('utf8');
  const meta = {};
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = parseAttrs(m[0]);
    const key = (a.property || a.name || '').toLowerCase();
    if (key && a.content && !(key in meta)) meta[key] = a.content;
  }
  const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
  let image = meta['og:image'] || meta['twitter:image'] || null;
  if (image) {
    try { image = new URL(decode(image), url).href; } catch { image = null; }
  }
  return {
    url,
    title: decode(meta['og:title'] || meta['twitter:title'] || titleTag).slice(0, 300),
    description: decode(meta['og:description'] || meta['description'] || meta['twitter:description']).slice(0, 600),
    source: decode(meta['og:site_name']) || new URL(url).hostname.replace(/^www\./, ''),
    image,
  };
}
