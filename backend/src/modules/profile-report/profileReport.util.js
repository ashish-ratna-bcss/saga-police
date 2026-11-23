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

module.exports = { httpError, cleanDeep, json, toId, encodeCursor, decodeCursor, kindOf };
