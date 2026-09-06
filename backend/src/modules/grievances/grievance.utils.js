const isCatalogStore = (req) => {
  const store = String(req.query?.store || req.body?.store || '')
    .trim()
    .toLowerCase();
  // Default = Postgres catalog. Opt into Mongo only with store=mongo.
  if (store === 'mongo' || store === 'mongodb') return false;
  return true;
};

const normalizePlatform = (value, defaultValue = null) => {
  const normalizedInput =
    value === undefined || value === null || value === '' ? defaultValue : value;
  if (normalizedInput === null || normalizedInput === undefined) return null;
  const p = String(normalizedInput).trim().toLowerCase();
  if (p === 'fb') return 'facebook';
  if (p === 'twitter') return 'x';
  return p;
};

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const asJson = (value, fallback) => {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
};

const serialize = (value) => {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = serialize(v);
    return out;
  }
  return value;
};

const pickAvatar = (previewData) => {
  const preview = previewData && typeof previewData === 'object' ? previewData : {};
  const summary = preview.summary && typeof preview.summary === 'object' ? preview.summary : {};
  return (
    summary.image ||
    preview.image ||
    preview.profile_image_url ||
    summary.profile_image_url ||
    null
  );
};

module.exports = {
  isCatalogStore,
  normalizePlatform,
  escapeRegex,
  asJson,
  serialize,
  pickAvatar,
};
