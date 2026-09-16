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

const normalizeEventPlatformSlug = (slug) => {
  const s = String(slug || '').trim().toLowerCase();
  if (s === 'twitter') return 'x';
  return s;
};

/** Active platform slugs from this tenant's `platforms` table (Settings → Platforms). */
const listActiveEventPlatforms = async (prisma) => {
  const rows = await prisma.platforms.findMany({
    where: { is_active: true },
    select: { slug: true },
    orderBy: { id: 'asc' },
  });
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const slug = normalizeEventPlatformSlug(row.slug);
    if (!slug || slug === 'instagram' || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
};

/** Keep requested slugs that exist in the tenant DB; if none requested, use all active. */
const resolveEventPlatforms = async (prisma, requested) => {
  const configured = await listActiveEventPlatforms(prisma);
  const wanted = Array.isArray(requested)
    ? requested.map(normalizeEventPlatformSlug).filter((p) => p && p !== 'instagram')
    : [];
  if (!configured.length) return wanted;
  if (!wanted.length) return configured;
  return wanted.filter((p) => configured.includes(p));
};

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

const normalizeKeywords = (body = {}) => {
  const allowed = new Set(['en', 'hi', 'te', 'all']);
  const normalizeInput = (value, fallbackLanguage = 'all') => {
    if (!value) return [];
    const items = Array.isArray(value)
      ? value
      : String(value)
          .split(/\n|,|;/g)
          .map((s) => s.trim())
          .filter(Boolean);
    return items
      .map((k) => {
        if (typeof k === 'string') return { keyword: k.trim(), language: fallbackLanguage };
        if (!k) return null;
        const language = String(k.language || fallbackLanguage).toLowerCase();
        return {
          keyword: String(k.keyword || '').trim(),
          language: allowed.has(language) ? language : fallbackLanguage,
        };
      })
      .filter((k) => k && k.keyword);
  };

  const buckets = [
    ...normalizeInput(body.keywords, 'all'),
    ...normalizeInput(body.keywords_all, 'all'),
    ...normalizeInput(body.keywords_en, 'en'),
    ...normalizeInput(body.keywords_hi, 'hi'),
    ...normalizeInput(body.keywords_te, 'te'),
  ];
  const dedup = new Map();
  for (const kw of buckets) {
    const key = `${kw.language}::${kw.keyword.toLowerCase()}`;
    if (!dedup.has(key)) dedup.set(key, kw);
  }
  return Array.from(dedup.values());
};

const normalizeEventPayload = (body = {}) => {
  const payload = { ...body };
  if (payload.start_date) payload.start_date = new Date(payload.start_date);
  if (payload.end_date) payload.end_date = new Date(payload.end_date);
  if (typeof payload.location === 'string') payload.location = payload.location.trim();

  const keywords = normalizeKeywords(payload);
  if (keywords.length > 0) payload.keywords = keywords;

  if (Array.isArray(payload.platforms)) {
    payload.platforms = payload.platforms
      .map((p) => String(p).toLowerCase())
      .filter((p) => p && p !== 'instagram');
  }

  if (payload.polling_interval_minutes != null) {
    const n = Number(payload.polling_interval_minutes);
    if (Number.isFinite(n) && n > 0) {
      payload.polling_interval_minutes = Math.min(10080, Math.max(1, Math.floor(n)));
    } else {
      payload.polling_interval_minutes = 60;
    }
  }

  return payload;
};

/** Shape expected by Events.js (Mongo-compatible fields). */
const hydrateEvent = (row) => {
  if (!row) return null;
  const monitoring_status = row.monitoring_status === 'started' ? 'started' : 'stopped';
  return serialize({
    id: String(row.id),
    name: row.name,
    description: row.description || '',
    start_date: row.start_date,
    end_date: row.end_date,
    location: row.location || '',
    platforms: (Array.isArray(row.platforms) ? row.platforms : [])
      .map((p) => String(p).toLowerCase().replace(/^twitter$/, 'x'))
      .filter((p) => p && p !== 'instagram'),
    keywords: asJson(row.keywords, []),
    high_risk_threshold: row.high_risk_threshold,
    medium_risk_threshold: row.medium_risk_threshold,
    polling_interval_minutes: row.polling_interval_minutes ?? 60,
    monitoring_status,
    monitoring_logs: asJson(row.monitoring_logs, []),
    last_fetched_at: row.last_fetched_at,
    last_fetched_history: asJson(row.last_fetched_history, []),
    origin: row.origin || 'manual',
    occasion_calendar_id: row.occasion_calendar_id != null ? String(row.occasion_calendar_id) : null,
    origin_calendar_id: row.occasion_calendar_id != null ? String(row.occasion_calendar_id) : null,
    created_by: row.created_by || 'system',
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
};

/** Map event media row to ContentCard-ish shape. */
const hydrateEventMedia = (row) => {
  if (!row) return null;
  let media = asJson(row.media, []);
  if (!Array.isArray(media)) media = [];

  // Repair X videos stored with thumbnail-only URLs (from older scans).
  const raw = asJson(row.raw_data, {});
  const rawLegacy = raw?.legacy || raw?.tweet?.legacy || null;
  const rawMedia =
    rawLegacy?.extended_entities?.media ||
    rawLegacy?.entities?.media ||
    raw?.extended_entities?.media ||
    [];
  if (Array.isArray(rawMedia) && rawMedia.length) {
    const pickBestVideoUrl = (variants = []) => {
      const list = Array.isArray(variants) ? variants : [];
      const mp4 = list
        .filter((v) => v?.url && String(v.content_type || '').includes('mp4'))
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
      if (mp4?.url) return mp4.url;
      const hls = list.find((v) => v?.url && /mpegurl|m3u8/i.test(String(v.content_type || v.url)));
      return hls?.url || list.find((v) => v?.url)?.url || null;
    };
    media = media.map((item, idx) => {
      if (!item || typeof item !== 'object') return item;
      const type = String(item.type || '').toLowerCase();
      if (type !== 'video' && type !== 'animated_gif') return item;
      const current = String(item.video_url || item.url || '');
      if (/\.(mp4|m3u8|webm|mov)(\?|$)/i.test(current) || /video\.twimg\.com/i.test(current)) {
        return item;
      }
      const source = rawMedia[idx] || rawMedia.find((m) => m?.type === 'video' || m?.type === 'animated_gif');
      const videoUrl = pickBestVideoUrl(source?.video_info?.variants);
      if (!videoUrl) return item;
      return {
        ...item,
        url: videoUrl,
        video_url: videoUrl,
        preview: item.preview || source?.media_url_https || item.url || videoUrl,
      };
    });
  }

  return serialize({
    id: String(row.id),
    platform: row.platform,
    content_id: row.external_id,
    content_url: row.url,
    text: row.text || '',
    author: row.author_name || row.author_handle || 'Unknown',
    author_handle: row.author_handle || '',
    published_at: row.posted_at,
    fetched_at: row.fetched_at,
    updated_at: row.updated_at,
    engagement: asJson(row.engagement, {}),
    media,
    raw_data: raw,
    event_ids: [String(row.event_id)],
    analysis_status: row.analysis_status || null,
    analysis_result: asJson(row.analysis_result, null),
    sentiment: asJson(row.analysis_result, null)?.sentiment || null,
    risk_level: asJson(row.analysis_result, null)?.risk_level || null,
    risk_score: asJson(row.analysis_result, null)?.risk_score ?? null,
    stance: asJson(row.analysis_result, null)?.stance || null,
    // ?? not || : a genuine 0.0 confidence (e.g. stance "unclear") must not
    // be coerced into null.
    stance_confidence: asJson(row.analysis_result, null)?.stance_confidence ?? null,
  });
};

const hydrateOccasion = (row) => {
  if (!row) return null;
  const platforms = Array.isArray(row.platforms) && row.platforms.length
    ? row.platforms.map((p) => String(p).toLowerCase().replace(/^twitter$/, 'x')).filter((p) => p && p !== 'instagram')
    : [];
  return serialize({
    id: String(row.id),
    slNo: row.sl_no,
    sl_no: row.sl_no,
    occasion: row.title,
    title: row.title,
    date: row.date_label,
    date_label: row.date_label,
    monitoringRange: row.monitoring_range,
    monitoring_range: row.monitoring_range,
    keywords: row.suggested_keywords,
    suggested_keywords: row.suggested_keywords,
    remarks: row.remarks || '',
    platforms,
    isRecurring: Boolean(row.is_recurring),
    is_recurring: Boolean(row.is_recurring),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
};

module.exports = {
  serialize,
  asJson,
  normalizeKeywords,
  normalizeEventPayload,
  hydrateEvent,
  hydrateEventMedia,
  hydrateOccasion,
  normalizeEventPlatformSlug,
  listActiveEventPlatforms,
  resolveEventPlatforms,
};
