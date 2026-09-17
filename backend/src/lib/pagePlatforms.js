/**
 * Page capability matrix (pagePlatforms.json) ∩ tenant active platforms.
 * Same intersection as GET /social-profiles/platforms?page=.
 */

const pagePlatformsConfig = require('../config/pagePlatforms.json');

const canonicalSlug = (value) => {
  const s = String(value || '')
    .trim()
    .toLowerCase();
  if (!s) return '';
  return s === 'twitter' ? 'x' : s;
};

/** Capability slugs for a page key from pagePlatforms.json (no DB). */
const getPageCapabilitySlugs = (pageKey) => {
  const key = String(pageKey || '')
    .trim()
    .toLowerCase();
  const cfg = pagePlatformsConfig[key];
  if (!cfg) return [];
  const list = Array.isArray(cfg)
    ? cfg
    : Array.isArray(cfg.platforms)
      ? cfg.platforms
      : [];
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const slug = canonicalSlug(raw);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
};

/**
 * Active tenant platforms ∩ page capability.
 * @param {object} prisma - tenant prisma
 * @param {string} pageKey - e.g. 'grievances' | 'alerts' | 'global_search'
 * @param {{ includeTwitterAlias?: boolean }} [opts]
 * @returns {Promise<string[]>} canonical slugs, optionally with 'twitter' for DB `in` queries
 */
const resolvePagePlatformSlugs = async (prisma, pageKey, opts = {}) => {
  const includeTwitterAlias = Boolean(opts.includeTwitterAlias);
  const capability = new Set(getPageCapabilitySlugs(pageKey));
  // No page matrix, or no DB — never invent tenant platforms from JSON alone.
  if (!capability.size || !prisma?.platforms?.findMany) {
    return [];
  }

  const rows = await prisma.platforms.findMany({
    where: { is_active: true },
    select: { slug: true },
    orderBy: { id: 'asc' },
  });

  const out = [];
  const seen = new Set();
  for (const row of rows) {
    const slug = canonicalSlug(row.slug);
    if (!slug || !capability.has(slug) || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }

  if (includeTwitterAlias && seen.has('x') && !seen.has('twitter')) {
    out.push('twitter');
  }
  return out;
};

module.exports = {
  pagePlatformsConfig,
  canonicalSlug,
  getPageCapabilitySlugs,
  resolvePagePlatformSlugs,
};
