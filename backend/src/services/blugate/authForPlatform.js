/**
 * BluGate credentials for a tenant's `platforms` row, by platform slug.
 * One place for every caller (profile preview, Profile Report history fetch), so they all
 * use the same client account the tenant configured in Settings → Platforms.
 */
const CLIENTS = {
  x: () => require('./x/blugate.x.api_client'),
  twitter: () => require('./x/blugate.x.api_client'),
  facebook: () => require('./facebook/blugate.facebook.api_client'),
  instagram: () => require('./instagram/blugate.instagram.api_client'),
  youtube: () => require('./youtube/blugate.youtube.api_client'),
  telegram: () => require('./telegram/blugate.telegram.api_client'),
  reddit: () => require('./reddit/blugate.reddit.api_client'),
};

/**
 * @param {object|null} platformRow  tenant `platforms` row (slug + stored keys)
 * @param {{ tenantKey?: string|null }} [opts]  tenant DB name; Reddit uses it to keep per-tenant state apart
 * @returns {object|null} auth for the platform's api client, or null for an unknown platform
 */
const authForPlatform = (platformRow, { tenantKey = null } = {}) => {
  const slug = String(platformRow?.slug || '').toLowerCase();
  const load = CLIENTS[slug];
  if (!load) return null;
  const auth = load().authFromPlatformRow(platformRow);
  if (slug === 'reddit' && tenantKey && auth) auth.tenantKey = tenantKey;
  return auth;
};

module.exports = { authForPlatform };
