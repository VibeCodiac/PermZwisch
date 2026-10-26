// Datenzugriff für den ganzen Blog.
// Alle Inhalte (ein Blog hat einige hundert Dokumente) werden gesammelt geladen und kurz
// zwischengespeichert. Lesende Abfragen laufen dann im Speicher – schnell und günstig bei Firestore.
import { getDriver } from './store/drivers.js';
import { defaultSections, defaultSettings, defaultPages } from './store/defaults.js';
import { toDbDate } from './lib/helpers.js';
import { config } from './config.js';

export const now = () => toDbDate(new Date());

// ---- Grundinhalte beim ersten Start ----
let seeding = null;

export function ensureDefaults() {
  seeding ??= seed().catch((err) => {
    seeding = null;
    throw err;
  });
  return seeding;
}

async function seed() {
  const d = await getDriver();
  if (!(await d.get('_meta', 'seed'))) {
    if (!(await d.list('sections')).length) {
      await Promise.all(defaultSections.map((s, i) => d.set('sections', i + 1, { ...s, position: i })));
      await d.ensureCounterAtLeast('sections', defaultSections.length);
    }
    await d.set('_meta', 'seed', { version: 1, at: now() });
  }
  const settings = (await d.get('settings', 'site')) || {};
  const missing = Object.fromEntries(Object.entries(defaultSettings).filter(([k]) => settings[k] === undefined));
  if (settings.podcast_title === 'Apocalypse Podcasts') missing.podcast_title = defaultSettings.podcast_title;
  if (Object.keys(missing).length) await d.set('settings', 'site', { ...settings, ...missing });
  for (const [slug, page] of Object.entries(defaultPages)) {
    if (!(await d.get('pages', slug))) await d.set('pages', slug, { ...page, updated_at: now() });
  }
}

// ---- Gesammelter Lesezugriff ----
const NUMERIC = ['users', 'sections', 'posts', 'reviews', 'media'];
let cache = null;
let cacheAt = 0;
let loading = null;

/** Alle Inhalte; `fresh` umgeht den Zwischenspeicher (Redaktionsbereich, Login). */
export async function snapshot({ fresh = false } = {}) {
  await ensureDefaults();
  if (!fresh && cache && Date.now() - cacheAt < config.cacheSeconds * 1000) return cache;
  if (!fresh && loading) return loading;
  const job = build();
  if (!fresh) loading = job;
  try {
    cache = await job;
    cacheAt = Date.now();
    return cache;
  } finally {
    if (!fresh) loading = null;
  }
}

export function invalidate() {
  cache = null;
}

const byId = (list) => new Map(list.map((x) => [x.id, x]));

async function build() {
  const d = await getDriver();
  const [users, sections, posts, reviews, media, pages, settings] = await Promise.all([
    ...NUMERIC.map((c) => d.list(c)),
    d.list('pages'),
    d.get('settings', 'site'),
  ]);
  for (const list of [users, sections, posts, reviews, media]) for (const x of list) x.id = Number(x.id);

  const mediaById = byId(media);
  const file = (id) => (id ? mediaById.get(id)?.file ?? null : null);
  for (const u of users) u.avatar_file = file(u.avatar_id);
  const usersById = byId(users);

  sections.sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name, 'de'));
  const sectionsById = byId(sections);

  for (const p of posts) {
    const s = sectionsById.get(p.section_id);
    const u = usersById.get(p.author_id);
    Object.assign(p, {
      section_slug: s?.slug ?? null,
      section_name: s?.name ?? null,
      author_name: u?.name ?? '–',
      author_slug: u?.slug ?? '',
      author_avatar: u?.avatar_file ?? null,
      cover_file: file(p.cover_id),
      cover_alt: mediaById.get(p.cover_id)?.alt ?? '',
      link_image_file: file(p.link_image_id),
    });
  }
  for (const r of reviews) {
    const u = usersById.get(r.author_id);
    Object.assign(r, {
      author_name: u?.name ?? '–',
      author_slug: u?.slug ?? '',
      author_avatar: u?.avatar_file ?? null,
      artwork_file: file(r.artwork_id),
    });
  }
  const { id: _ignore, ...site } = settings || {};

  return {
    users,
    usersById,
    sections,
    sectionsById,
    posts,
    postsById: byId(posts),
    reviews,
    reviewsById: byId(reviews),
    media: media.sort((a, b) => b.id - a.id),
    mediaById,
    pages: new Map(pages.map((p) => [p.id, { ...p, slug: p.id }])),
    settings: { ...defaultSettings, ...site },
  };
}

// ---- Schreibzugriffe (leeren den Zwischenspeicher) ----
export async function create(collection, data) {
  const d = await getDriver();
  const id = await d.nextId(collection);
  await d.set(collection, id, { ...data, created_at: data.created_at ?? now() });
  invalidate();
  return id;
}

export async function update(collection, id, data) {
  const d = await getDriver();
  await d.update(collection, id, data);
  invalidate();
}

export async function remove(collection, id) {
  const d = await getDriver();
  await d.remove(collection, id);
  invalidate();
}

export async function saveSettings(values) {
  const d = await getDriver();
  const current = (await d.get('settings', 'site')) || {};
  await d.set('settings', 'site', { ...current, ...values });
  invalidate();
}

export async function savePage(slug, values) {
  const d = await getDriver();
  await d.set('pages', slug, { ...values, updated_at: now() });
  invalidate();
}

/** Nutzer*in direkt aus der Datenbank (nicht aus dem Zwischenspeicher), z. B. beim Login. */
export async function getUser(id) {
  const d = await getDriver();
  const u = await d.get('users', id);
  return u ? { ...u, id: Number(u.id) } : null;
}

export async function findUserByEmail(email) {
  const s = await snapshot({ fresh: true });
  const wanted = String(email).toLowerCase();
  return s.users.find((u) => u.email === wanted) || null;
}

/** Eindeutiger Slug innerhalb einer Liste; `ignoreId` = eigener Datensatz beim Bearbeiten. */
export function uniqueSlugIn(list, base, ignoreId = null) {
  const taken = new Set(list.filter((x) => x.id !== ignoreId).map((x) => x.slug));
  let slug = base;
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
  return slug;
}
