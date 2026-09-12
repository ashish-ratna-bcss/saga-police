/**
 * application_details JSON shape (title/description — not theme_color).
 * Logo bytes live in users.logo_data / logo_mime.
 * Login branding is resolved by users.port (and optional domains[]).
 */

const DEFAULT_APP = {
  title: 'BLURA SAGA',
  description: 'Digital Intelligence Platform for Digital India',
  application_name: 'Blura Saga',
  domains: [],
};

const asObject = (raw) =>
  typeof raw === 'object' && raw && !Array.isArray(raw) ? raw : {};

const normalizeDomains = (raw) => {
  if (Array.isArray(raw)) {
    return raw.map((d) => String(d || '').trim().toLowerCase()).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    return [raw.trim().toLowerCase()];
  }
  return [];
};

const readApplicationDetails = (user) => {
  const ad = asObject(user?.application_details);
  const tc = asObject(user?.theme_color); // legacy fallback during migration
  const { subtitle: _ignored, ...restAd } = ad;
  return {
    title:
      restAd.title ||
      restAd.blurasagatitle ||
      tc.blurasagatitle ||
      tc.title ||
      DEFAULT_APP.title,
    description:
      restAd.description ||
      restAd.blurasagadescription ||
      tc.blurasagadescription ||
      tc.description ||
      DEFAULT_APP.description,
    application_name:
      restAd.application_name ||
      restAd.title ||
      restAd.blurasagatitle ||
      tc.blurasagatitle ||
      DEFAULT_APP.application_name,
    domains: normalizeDomains(restAd.domains || restAd.domain),
  };
};

const buildApplicationDetails = (existing, body = {}, fallback = {}) => {
  const cur = { ...DEFAULT_APP, ...asObject(existing), ...asObject(fallback) };
  delete cur.subtitle;
  const next = { ...cur };

  if (body.blurasagatitle !== undefined || body.title !== undefined) {
    next.title = body.blurasagatitle ?? body.title;
  }
  if (body.blurasagadescription !== undefined || body.description !== undefined) {
    next.description = body.blurasagadescription ?? body.description;
  }
  if (body.application_name !== undefined) {
    next.application_name = body.application_name;
  } else if (next.title) {
    next.application_name = next.title;
  }
  if (body.domains !== undefined || body.domain !== undefined) {
    next.domains = normalizeDomains(body.domains ?? body.domain);
  }

  return {
    title: String(next.title || DEFAULT_APP.title),
    description: String(next.description || DEFAULT_APP.description),
    application_name: String(next.application_name || next.title || DEFAULT_APP.application_name),
    domains: normalizeDomains(next.domains),
  };
};

/** theme_color should only hold visual theme — strip branding keys */
const themeOnly = (raw, valueOverride) => {
  const tc = asObject(raw);
  const value =
    valueOverride ||
    tc.value ||
    'linear-gradient(135deg, #0f172a 0%, #38bdf8 100%)';
  return {
    type: tc.type || (String(value).startsWith('linear-gradient') ? 'gradient' : 'solid'),
    value,
    primary_hex: tc.primary_hex || '#38bdf8',
  };
};

const parsePort = (raw) => {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) return null;
  return n;
};

module.exports = {
  DEFAULT_APP,
  readApplicationDetails,
  buildApplicationDetails,
  themeOnly,
  parsePort,
};
