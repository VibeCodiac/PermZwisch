// Abfragen auf dem geladenen Inhalts-Snapshot (siehe data.js).
import { now } from '../data.js';

export const isPublished = (x) => x.status === 'published' && Boolean(x.published_at) && x.published_at <= now();

const newestFirst = (a, b) => (b.published_at || '').localeCompare(a.published_at || '') || b.id - a.id;

export function latestPosts(s, { limit = 10, offset = 0, sectionId = null, authorId = null } = {}) {
  return s.posts
    .filter((p) => isPublished(p) && (!sectionId || p.section_id === sectionId) && (!authorId || p.author_id === authorId))
    .sort(newestFirst)
    .slice(offset, offset + limit);
}

export function countPosts(s, { sectionId = null } = {}) {
  return s.posts.filter((p) => isPublished(p) && (!sectionId || p.section_id === sectionId)).length;
}

export function postBySlug(s, slug) {
  const p = s.posts.find((x) => x.slug === slug);
  return p && isPublished(p) ? p : null;
}

export function postImages(s, post) {
  return (post.images || [])
    .map((img) => {
      const m = s.mediaById.get(img.media_id);
      return m && { id: m.id, file: m.file, width: m.width, height: m.height, alt: m.alt, caption: img.caption || '', position: img.position ?? 0 };
    })
    .filter(Boolean)
    .sort((a, b) => a.position - b.position || a.id - b.id);
}

export function latestReviews(s, { limit = 12, offset = 0, authorId = null } = {}) {
  return s.reviews
    .filter((r) => isPublished(r) && (!authorId || r.author_id === authorId))
    .sort(newestFirst)
    .slice(offset, offset + limit);
}

export function countReviews(s) {
  return s.reviews.filter(isPublished).length;
}

export function reviewBySlug(s, slug) {
  const r = s.reviews.find((x) => x.slug === slug);
  return r && isPublished(r) ? r : null;
}

export function search(s, q, limit = 30) {
  const needle = q.toLocaleLowerCase('de');
  const hit = (...fields) => fields.some((f) => String(f || '').toLocaleLowerCase('de').includes(needle));
  return {
    posts: s.posts.filter((p) => isPublished(p) && hit(p.title, p.excerpt, p.body_md)).sort(newestFirst).slice(0, limit),
    reviews: s.reviews
      .filter((r) => isPublished(r) && hit(r.title, r.podcast_name, r.episode_title, r.body_md))
      .sort(newestFirst)
      .slice(0, limit),
  };
}
