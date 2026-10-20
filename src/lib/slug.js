const map = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', Ä: 'ae', Ö: 'oe', Ü: 'ue' };

export function slugify(text) {
  return (
    String(text || '')
      .replace(/[äöüßÄÖÜ]/g, (c) => map[c])
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
      .replace(/-+$/g, '') || 'beitrag'
  );
}

/** Liefert einen in `table` eindeutigen Slug. `ignoreId` = eigener Datensatz beim Bearbeiten. */
export function uniqueSlug(db, table, text, ignoreId = null) {
  const base = slugify(text);
  const stmt = db.prepare(`SELECT id FROM ${table} WHERE slug = ? AND id IS NOT ?`);
  let slug = base;
  for (let i = 2; stmt.get(slug, ignoreId); i++) slug = `${base}-${i}`;
  return slug;
}
