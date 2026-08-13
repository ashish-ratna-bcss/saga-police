/**
 * Source identity dedupe.
 *
 * Same platform account can be pasted as @handle, URL, or numeric id.
 * Match on identifier aliases + stable platform_user_id so we only add
 * (and only spend provider API quota on) accounts we do not already monitor.
 */
const logger = require('../utils/logger');

const getSourceModel = () => require('../models/Source');

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isYouTubeChannelId = (value = '') => /^UC[A-Za-z0-9_-]{20,}$/.test(String(value || '').trim());

const uniqueNonEmpty = (values) => {
  const seen = new Set();
  const out = [];
  for (const raw of values || []) {
    const v = String(raw || '').trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
};

const extractStableUserId = (platform, identifier) => {
  const p = String(platform || '').toLowerCase().trim();
  const raw = String(identifier || '').trim();
  if (!raw) return '';

  if (p === 'youtube') {
    if (isYouTubeChannelId(raw)) return raw;
    if (!/youtube\.com|youtu\.be/i.test(raw) && !/^https?:\/\//i.test(raw)) return '';
    try {
      const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
      const parts = (url.pathname || '').split('/').filter(Boolean);
      const channelIdx = parts.findIndex((x) => x.toLowerCase() === 'channel');
      if (channelIdx !== -1 && isYouTubeChannelId(parts[channelIdx + 1])) return parts[channelIdx + 1];
      const qp = url.searchParams.get('channel_id');
      if (isYouTubeChannelId(qp)) return qp;
    } catch (_) { /* ignore */ }
    return '';
  }

  if (p === 'facebook') {
    if (/^\d+$/.test(raw)) return raw;
    if (!/facebook\.com|fb\.me|profile\.php/i.test(raw) && !/^https?:\/\//i.test(raw)) return '';
    try {
      const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
      const id = url.searchParams.get('id');
      if (id && /^\d+$/.test(id)) return id;
      const pathname = url.pathname || '';
      const peopleMatch = pathname.match(/^\/people\/(?:[^/]+)\/(\d+)/i);
      if (peopleMatch?.[1]) return peopleMatch[1];
      const pagesMatch = pathname.match(/^\/pages\/(?:[^/]+)\/(\d+)/i);
      if (pagesMatch?.[1]) return pagesMatch[1];
      const first = pathname.split('/').filter(Boolean)[0];
      if (first && /^\d+$/.test(first)) return first;
    } catch (_) { /* ignore */ }
    return '';
  }

  if (p === 'x' || p === 'twitter' || p === 'instagram') {
    let candidate = raw.replace(/^@/, '').trim();
    if (/twitter\.com|x\.com|instagram\.com/i.test(raw) || /^https?:\/\//i.test(raw)) {
      try {
        const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
        candidate = (url.pathname || '').split('/').filter(Boolean)[0] || candidate;
      } catch (_) { /* ignore */ }
    }
    candidate = String(candidate || '').replace(/^@/, '').trim();
    if (/^\d{5,}$/.test(candidate)) return candidate;
    return '';
  }

  return '';
};

const collectLocalAliases = (platform, identifier) => {
  const p = String(platform || '').toLowerCase().trim();
  const raw = String(identifier || '').trim();
  if (!raw) return [];

  const aliases = [raw];

  if (p === 'x' || p === 'twitter') {
    let handle = raw.replace(/^@/, '');
    if (/twitter\.com|\bx\.com\b/i.test(raw) || /^https?:\/\//i.test(raw)) {
      try {
        const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
        handle = (url.pathname || '').split('/').filter(Boolean)[0] || handle;
      } catch (_) { /* ignore */ }
    }
    handle = String(handle || '').replace(/^@/, '').trim();
    if (handle) {
      aliases.push(handle, `@${handle}`, `https://x.com/${handle}`, `https://twitter.com/${handle}`);
    }
  } else if (p === 'instagram') {
    let handle = raw;
    if (/instagram\.com/i.test(raw) || /^https?:\/\//i.test(raw)) {
      try {
        const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
        handle = (url.pathname || '').split('/').filter(Boolean)[0] || handle;
      } catch (_) { /* ignore */ }
    }
    handle = String(handle || '').replace(/^@/, '').trim();
    if (handle) {
      aliases.push(
        handle,
        `@${handle}`,
        `https://www.instagram.com/${handle}`,
        `https://instagram.com/${handle}`
      );
    }
  } else if (p === 'youtube') {
    if (isYouTubeChannelId(raw)) {
      aliases.push(raw, `https://www.youtube.com/channel/${raw}`, `https://youtube.com/channel/${raw}`);
    } else {
      let handle = raw.replace(/^@/, '');
      if (/youtube\.com|youtu\.be/i.test(raw)) {
        try {
          const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
          const parts = (url.pathname || '').split('/').filter(Boolean);
          const atPart = parts.find((x) => x.startsWith('@'));
          if (atPart) handle = atPart.slice(1);
          const channelIdx = parts.findIndex((x) => x.toLowerCase() === 'channel');
          if (channelIdx !== -1 && isYouTubeChannelId(parts[channelIdx + 1])) {
            aliases.push(parts[channelIdx + 1], `https://www.youtube.com/channel/${parts[channelIdx + 1]}`);
          }
        } catch (_) { /* ignore */ }
      }
      if (handle) {
        aliases.push(
          handle,
          `@${handle}`,
          `https://www.youtube.com/@${handle}`,
          `https://youtube.com/@${handle}`
        );
      }
    }
  } else if (p === 'facebook') {
    const stableId = extractStableUserId('facebook', raw);
    if (stableId) {
      aliases.push(
        stableId,
        `https://www.facebook.com/profile.php?id=${stableId}`,
        `https://facebook.com/profile.php?id=${stableId}`
      );
    }
    let slug = raw;
    try {
      const url = new URL(raw.startsWith('http') ? raw : (/facebook\.com|fb\.me/i.test(raw) ? `https://${raw}` : ''));
      const first = (url.pathname || '').split('/').filter(Boolean)[0];
      if (first && !/^(profile\.php|people|pages)$/i.test(first) && !/^\d+$/.test(first)) {
        slug = first;
      }
    } catch (_) {
      slug = raw
        .replace(/^@+/, '')
        .replace(/^https?:\/\/(www\.)?(facebook\.com|fb\.me)\//i, '')
        .split(/[/?#]/)[0];
    }
    slug = String(slug || '').replace(/^@+/, '').replace(/[#?&/]+$/, '').toLowerCase();
    if (slug && !/^\d+$/.test(slug) && slug !== 'profile.php') {
      aliases.push(slug, `@${slug}`, `https://www.facebook.com/${slug}`, `https://facebook.com/${slug}`);
    }
  }

  return uniqueNonEmpty(aliases);
};

const identifierMatch = (value) => {
  const v = String(value || '').trim();
  if (!v) return null;
  if (isYouTubeChannelId(v)) return v;
  return { $regex: `^${escapeRegex(v)}$`, $options: 'i' };
};

const buildDuplicateQuery = (platform, { identifier, platformUserId, aliases = [], excludeId } = {}) => {
  const p = String(platform || '').toLowerCase().trim();
  if (!p) return null;

  const or = [];
  for (const alias of uniqueNonEmpty([identifier, ...(aliases || [])])) {
    const match = identifierMatch(alias);
    if (!match) continue;
    or.push({ identifier: match });
    or.push({ old_identifiers: match });
  }

  const userId = String(platformUserId || '').trim();
  if (userId) {
    or.push({ platform_user_id: userId });
  }

  if (or.length === 0) return null;

  const query = { platform: p, $or: or };
  if (excludeId) query.id = { $ne: excludeId };
  return query;
};

const findDuplicateSource = async (platform, opts = {}) => {
  const query = buildDuplicateQuery(platform, opts);
  if (!query) return null;
  return getSourceModel().findOne(query).lean();
};

const duplicatePayload = (existing) => ({
  message: `This profile is already being monitored as "${existing.display_name || existing.identifier}"`,
  existing: {
    id: existing.id,
    platform: existing.platform,
    identifier: existing.identifier,
    display_name: existing.display_name,
    platform_user_id: existing.platform_user_id || ''
  }
});

const isOlderSource = (a, b) => {
  const at = new Date(a?.created_at || 0).getTime();
  const bt = new Date(b?.created_at || 0).getTime();
  if (at !== bt) return at < bt;
  return String(a?.id || '') < String(b?.id || '');
};

/**
 * If another active source already monitors this platform_user_id, deactivate
 * the newer one and return the canonical (older) source. Caller should skip
 * the provider API call.
 */
const deactivateIfDuplicateIdentity = async (source) => {
  const userId = String(source?.platform_user_id || '').trim();
  if (!source?.id || !source?.platform || !userId) return null;

  const Source = getSourceModel();
  const others = await Source.find({
    platform: source.platform,
    is_active: true,
    platform_user_id: userId,
    id: { $ne: source.id }
  }).select('id created_at display_name identifier platform_user_id').lean();

  if (!others.length) return null;

  const older = others.find((o) => isOlderSource(o, source));
  if (!older) return null;

  await Source.updateOne({ id: source.id }, { $set: { is_active: false } });
  logger.warn(
    `[Source] Deactivated duplicate identity ${source.platform}:${source.identifier} ` +
    `(user ${userId}) — already monitored as "${older.display_name || older.identifier}" (${older.id})`
  );
  return older;
};

module.exports = {
  escapeRegex,
  isYouTubeChannelId,
  uniqueNonEmpty,
  extractStableUserId,
  collectLocalAliases,
  buildDuplicateQuery,
  findDuplicateSource,
  duplicatePayload,
  isOlderSource,
  deactivateIfDuplicateIdentity
};
