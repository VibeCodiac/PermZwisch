import { db } from '../db.js';

export const PUBLISHED = "status = 'published' AND published_at <= datetime('now')";

const postSelect = `
  SELECT p.*, s.slug AS section_slug, s.name AS section_name,
         u.name AS author_name, u.slug AS author_slug, ua.file AS author_avatar,
         c.file AS cover_file, c.alt AS cover_alt, li.file AS link_image_file
  FROM posts p
  LEFT JOIN sections s ON s.id = p.section_id
  JOIN users u ON u.id = p.author_id
  LEFT JOIN media ua ON ua.id = u.avatar_id
  LEFT JOIN media c ON c.id = p.cover_id
  LEFT JOIN media li ON li.id = p.link_image_id`;

const reviewSelect = `
  SELECT r.*, u.name AS author_name, u.slug AS author_slug, ua.file AS author_avatar,
         a.file AS artwork_file
  FROM reviews r
  JOIN users u ON u.id = r.author_id
  LEFT JOIN media ua ON ua.id = u.avatar_id
  LEFT JOIN media a ON a.id = r.artwork_id`;

const pub = (alias) => `${alias}.status = 'published' AND ${alias}.published_at <= datetime('now')`;

export const sections = () => db.prepare('SELECT * FROM sections ORDER BY position, name').all();

export function latestPosts({ limit = 10, offset = 0, sectionId = null, authorId = null } = {}) {
  const where = [pub('p')];
  const params = [];
  if (sectionId) { where.push('p.section_id = ?'); params.push(sectionId); }
  if (authorId) { where.push('p.author_id = ?'); params.push(authorId); }
  return db
    .prepare(`${postSelect} WHERE ${where.join(' AND ')} ORDER BY p.published_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);
}

export function countPosts({ sectionId = null } = {}) {
  return db
    .prepare(`SELECT COUNT(*) AS n FROM posts p WHERE ${pub('p')} ${sectionId ? 'AND p.section_id = ?' : ''}`)
    .get(...(sectionId ? [sectionId] : [])).n;
}

export function postBySlug(slug, { includeDrafts = false } = {}) {
  return db.prepare(`${postSelect} WHERE p.slug = ? ${includeDrafts ? '' : `AND ${pub('p')}`}`).get(slug);
}

export function postById(id) {
  return db.prepare(`${postSelect} WHERE p.id = ?`).get(id);
}

export function postImages(postId) {
  return db
    .prepare(`SELECT m.id, m.file, m.width, m.height, m.alt, pi.caption, pi.position
              FROM post_images pi JOIN media m ON m.id = pi.media_id
              WHERE pi.post_id = ? ORDER BY pi.position, m.id`)
    .all(postId);
}

export function latestReviews({ limit = 12, offset = 0, authorId = null } = {}) {
  return db
    .prepare(`${reviewSelect} WHERE ${pub('r')} ${authorId ? 'AND r.author_id = ?' : ''}
              ORDER BY r.published_at DESC LIMIT ? OFFSET ?`)
    .all(...(authorId ? [authorId] : []), limit, offset);
}

export function countReviews() {
  return db.prepare(`SELECT COUNT(*) AS n FROM reviews r WHERE ${pub('r')}`).get().n;
}

export function reviewBySlug(slug, { includeDrafts = false } = {}) {
  return db.prepare(`${reviewSelect} WHERE r.slug = ? ${includeDrafts ? '' : `AND ${pub('r')}`}`).get(slug);
}

export function reviewById(id) {
  return db.prepare(`${reviewSelect} WHERE r.id = ?`).get(id);
}

export function search(q, limit = 30) {
  const like = `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
  const posts = db
    .prepare(`${postSelect} WHERE ${pub('p')} AND (p.title LIKE @q ESCAPE '\\' OR p.excerpt LIKE @q ESCAPE '\\' OR p.body_md LIKE @q ESCAPE '\\')
              ORDER BY p.published_at DESC LIMIT @limit`)
    .all({ q: like, limit });
  const reviews = db
    .prepare(`${reviewSelect} WHERE ${pub('r')} AND (r.title LIKE @q ESCAPE '\\' OR r.podcast_name LIKE @q ESCAPE '\\' OR r.episode_title LIKE @q ESCAPE '\\' OR r.body_md LIKE @q ESCAPE '\\')
              ORDER BY r.published_at DESC LIMIT @limit`)
    .all({ q: like, limit });
  return { posts, reviews };
}
