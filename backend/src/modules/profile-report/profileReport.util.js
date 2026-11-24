/** Small shared helpers for the Profile Report module. */

const httpError = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });

/** PostgreSQL JSONB refuses NUL characters and lone surrogates; strip them from every string, and make BigInt / Date JSON-safe. */
const cleanDeep = (v) => {
  if (typeof v === 'string') {
    const s = typeof v.toWellFormed === 'function' ? v.toWellFormed() : v.replace(/[\uD800-\uDFFF]/g, '');
    return s.replace(/\u0000/g, '');
  }
  if (Array.isArray(v)) return v.map(cleanDeep);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'bigint') return v.toString();
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, cleanDeep(x)]));
  return v;
};

const json = (v, fallback) => JSON.stringify(cleanDeep(v == null ? fallback : v));

const toId = (value, label = 'id') => {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw httpError(400, `Invalid ${label}`);
  return n;
};

/** Cursors are opaque to the store: a string, or an object (Instagram) kept as JSON text. */
const encodeCursor = (c) => (c == null || c === '' ? null : typeof c === 'string' ? c : JSON.stringify(c));
const decodeCursor = (text) => {
  if (text == null || text === '') return null;
  if (text[0] === '{') {
    try { return JSON.parse(text); } catch (e) { return text; }
  }
  return text;
};

const raw = (p) => (p && typeof p.raw_data === 'object' && p.raw_data ? p.raw_data : {});

/**
 * original | shared | reply | quote, decided once when a post is stored (the report never reads raw_data again).
 * Only explicit signals count; guessing from names or links misfires.
 */
const kindOf = (post) => {
  const r = raw(post);
  const legacy = r.legacy && typeof r.legacy === 'object' ? r.legacy : {};
  const text = String(post?.text || '').trim();
  if (/^RT @/i.test(text) || legacy.retweeted_status_result || r.retweeted_status || r.is_retweet || r.is_repost || r.is_share
    || r.forwarded || r.is_forwarded || r.fwd_from || r.forward_from) return 'shared';
  if (legacy.in_reply_to_status_id_str || r.in_reply_to_status_id || r.is_reply || r.reply_to_msg_id || r.reply_to_message_id || r.reply_to) return 'reply';
  if (legacy.is_quote_status || r.is_quote_status || r.quoted_status) return 'quote';
  return 'original';
};

/**
 * The status the DATA PROVIDER answered with. BluGate's 401 is re-labelled 502 on our side (so a bad provider key never logs
 * a user out), which means err.status is not the provider's status: the response and the message hold the real one.
 */
const upstreamStatusOf = (err) => Number(err?.response?.status)
  || Number((/\bHTTP (\d{3})\b/.exec(String(err?.message || '')) || [])[1])
  || 0;

/** True when the error came from the data provider or the network, not from our own validation. */
const isProviderError = (err) => Boolean(err?.response)
  || /blu\s?gate .*(HTTP \d{3}|:)|ECONN\w*|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|timeout of \d+/i.test(String(err?.message || ''));

/**
 * Plain, actionable text for a provider failure during Fetch (identity lookup), or null for errors that are not the
 * provider's (those already carry their own plain message). The provider's own wording and URLs stay in the log.
 * The `expose` flag lets the HTTP layer show this message even though the status is a 5xx.
 */
const providerFailure = (err, platformName = 'platform') => {
  if (!isProviderError(err)) return null;
  const s = upstreamStatusOf(err);
  if (s === 401 || s === 403) {
    return Object.assign(
      new Error(`The data provider did not accept the ${platformName} key saved for this workspace. An administrator can check it under Settings → Platforms, or try again in a few minutes.`),
      { status: 502, expose: true }
    );
  }
  if (s === 404) {
    return Object.assign(new Error(`${platformName} did not find that account. Check the username or link and try again.`), { status: 404, expose: true });
  }
  if (s === 429) {
    return Object.assign(new Error(`The ${platformName} data provider is limiting requests right now. Wait a minute and press Fetch again.`), { status: 429, expose: true });
  }
  return Object.assign(new Error(`The ${platformName} data provider did not answer. Try again in a moment.`), { status: 502, expose: true });
};

module.exports = {
  httpError, cleanDeep, json, toId, encodeCursor, decodeCursor, kindOf, upstreamStatusOf, isProviderError, providerFailure,
};
