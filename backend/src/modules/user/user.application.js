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
  notice: null,
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

/** Force profile used on intelligence reports; only these text fields are kept. */
const FORCE_FIELDS = ['force', 'display_name', 'head', 'headquarters', 'pin', 'phone', 'report_language', 'timezone', 'classification', 'units', 'signoff'];
const normalizeForceProfile = (raw) => {
  const o = asObject(raw);
  const out = {};
  FORCE_FIELDS.forEach((k) => {
    const v = o[k] == null ? '' : String(o[k]).trim().slice(0, k === 'units' ? 400 : 200);
    if (v) out[k] = v;
  });
  return Object.keys(out).length ? out : null;
};

/** Starting profile for a new tenant, taken from the name the admin gave the application; admins can refine it later. */
const defaultForceProfile = (title) => {
  // The platform's own brand words are not part of the force name ("Odisha Blura Saga" -> "Odisha").
  const t = String(title || '').replace(/blura\s*saga/gi, '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return normalizeForceProfile({ force: t, display_name: t.toUpperCase(), report_language: 'English', timezone: process.env.DEFAULT_REPORT_TIMEZONE || 'Asia/Kolkata' });
};

const readApplicationDetails = (user) => {
  const ad = asObject(user?.application_details);
  const tc = asObject(user?.theme_color); // legacy fallback during migration
  const { subtitle: _ignored, ...restAd } = ad;
  const notice =
    restAd.notice && typeof restAd.notice === 'object' && !Array.isArray(restAd.notice)
      ? restAd.notice
      : null;
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
    notice,
    force_profile: normalizeForceProfile(restAd.force_profile),
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
  if (body.notice !== undefined) {
    next.notice =
      body.notice && typeof body.notice === 'object' && !Array.isArray(body.notice)
        ? body.notice
        : null;
  }

  if (body.force_profile !== undefined) next.force_profile = normalizeForceProfile(body.force_profile);

  const out = {
    title: String(next.title || DEFAULT_APP.title),
    description: String(next.description || DEFAULT_APP.description),
    application_name: String(next.application_name || next.title || DEFAULT_APP.application_name),
    domains: normalizeDomains(next.domains),
  };
  if (next.notice && typeof next.notice === 'object') {
    out.notice = next.notice;
  }
  const fp = normalizeForceProfile(next.force_profile) || defaultForceProfile(out.application_name);
  if (fp) out.force_profile = fp;
  return out;
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
  defaultForceProfile,
  themeOnly,
  parsePort,
};
