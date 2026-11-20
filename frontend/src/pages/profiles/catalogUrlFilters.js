/**
 * What a link into the Profile Catalog can ask for:
 *
 *   /social-profiles?platform=youtube        (dashboard: "View catalog" on a platform row)
 *   /social-profiles?search=some_handle      (dashboard: a post/profile with no profile page)
 *
 * The catalog used to ignore both and always open on "All", so every "View catalog" showed every
 * platform. It now reads them once when it opens; the analyst can change the tab or search after.
 */

// Same shorthand the Alerts page and the dashboard already treat as equal.
const ALIASES = { twitter: 'x', fb: 'facebook', yt: 'youtube' };
const canon = (value) => {
  const v = String(value ?? '').trim().toLowerCase();
  return ALIASES[v] || v;
};

/**
 * { platform, query } requested by a URL query string.
 * `platform` is lower-cased but otherwise as written (null when absent or "all"); it is checked against
 * the configured platforms later, because those only load after the page opens.
 */
export const readCatalogUrlFilters = (search) => {
  const params = new URLSearchParams(search || '');
  const platform = String(params.get('platform') || '').trim().toLowerCase();
  return {
    platform: platform && platform !== 'all' ? platform : null,
    query: String(params.get('search') || '').trim(),
  };
};

/** Slug of the configured platform that `wanted` means (twitter == x), or null if it is not configured. */
export const matchPlatformSlug = (wanted, platforms) => {
  const target = canon(wanted);
  if (!target) return null;
  const hit = (Array.isArray(platforms) ? platforms : []).find((p) => canon(p?.slug) === target);
  return hit ? hit.slug : null;
};
