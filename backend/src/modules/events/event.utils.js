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
    payload.platforms = payload.platforms.map((p) => String(p).toLowerCase()).filter(Boolean);
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
    platforms: row.platforms || [],
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
  const media = asJson(row.media, []);
  return serialize({
    id: String(row.id),
    platform: row.platform,
    content_id: row.external_id,
    content_url: row.url,
    text: row.text || '',
    author: row.author_name || row.author_handle || 'Unknown',
    author_handle: row.author_handle || '',
    published_at: row.posted_at,
    engagement: asJson(row.engagement, {}),
    media: Array.isArray(media) ? media : [],
    event_ids: [String(row.event_id)],
  });
};

const hydrateOccasion = (row) => {
  if (!row) return null;
  const platforms = Array.isArray(row.platforms) && row.platforms.length
    ? row.platforms
    : ['x', 'youtube', 'facebook', 'instagram'];
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
};
