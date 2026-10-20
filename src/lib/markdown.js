import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

marked.setOptions({ gfm: true, breaks: true });

const sanitizeOptions = {
  allowedTags: [
    'h2', 'h3', 'h4', 'p', 'br', 'hr', 'blockquote', 'ul', 'ol', 'li',
    'strong', 'em', 'del', 's', 'code', 'pre', 'a', 'img', 'figure', 'figcaption',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'sup', 'sub',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'rel', 'target'],
    img: ['src', 'alt', 'title', 'loading', 'decoding'],
    th: ['align'],
    td: ['align'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  // Bilder nur aus der eigenen Mediathek (relative Pfade) – keine Drittanbieter-Requests
  allowedSchemesByTag: { img: [] },
  allowProtocolRelative: false,
  transformTags: {
    // Überschriften im Fließtext beginnen bei h2 (h1 ist der Titel)
    h1: 'h2',
    a: (tagName, attribs) => {
      const href = attribs.href || '';
      const external = /^https?:\/\//i.test(href);
      const out = { ...attribs };
      if (external) {
        out.rel = 'noopener noreferrer nofollow ugc';
        out.target = '_blank';
      } else {
        delete out.target;
        delete out.rel;
      }
      return { tagName, attribs: out };
    },
    img: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, loading: 'lazy', decoding: 'async' },
    }),
  },
  exclusiveFilter: (frame) =>
    frame.tag === 'img' && !(frame.attribs.src || '').startsWith('/uploads/'),
};

export function renderMarkdown(md) {
  const html = marked.parse(md || '', { async: false });
  return sanitizeHtml(html, sanitizeOptions);
}

export function stripTags(html) {
  return sanitizeHtml(html || '', { allowedTags: [], allowedAttributes: {} });
}
