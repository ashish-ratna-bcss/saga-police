// Reads the IG Downloader provider's settings from the environment.
// Set these two in .env (same pattern as Facebook / X):
//   INSTAGRAM_BASE_URL   e.g. https://ig-downloader-api.p.rapidapi.com
//   INSTAGRAM_API_KEY    your RapidAPI key for that provider
//
// Legacy fallbacks (still honored if the new names are unset):
//   RAPIDAPI_INSTAGRAM_HOST / RAPIDAPI_INSTAGRAM_KEYS

const DEFAULT_HOST = 'ig-downloader-api.p.rapidapi.com';

const getInstagramBaseUrl = () => {
  const direct = String(process.env.INSTAGRAM_BASE_URL || '').trim().replace(/\/$/, '');
  if (direct) return direct;
  const host = String(process.env.RAPIDAPI_INSTAGRAM_HOST || DEFAULT_HOST).trim();
  if (!host) return '';
  return host.startsWith('http') ? host.replace(/\/$/, '') : `https://${host}`;
};

const getInstagramApiKey = () => {
  const direct = String(process.env.INSTAGRAM_API_KEY || '').trim();
  if (direct) return direct;
  return String(process.env.RAPIDAPI_INSTAGRAM_KEY || process.env.RAPIDAPI_INSTAGRAM_KEYS || '')
    .split(',')[0]
    .trim();
};

module.exports = {
  getInstagramBaseUrl,
  getInstagramApiKey,
};
