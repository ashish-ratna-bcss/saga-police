const ALERT_INCLUDE = {
  post: {
    include: {
      account: {
        include: {
          profile: true,
          platforms: true,
        },
      },
    },
  },
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

const normalizePlatform = (platform) => {
  const p = String(platform || '').toLowerCase();
  if (p === 'twitter') return 'x';
  return p;
};

const isCatalogStore = (req) => {
  const store = String(req.query?.store || req.body?.store || req.headers['x-alert-store'] || '')
    .toLowerCase()
    .trim();
  return store === 'catalog' || store === 'postgres' || store === 'pg';
};

const pickAvatar = (preview = {}, data = {}) =>
  preview.profile_image_url ||
  preview.profile_pic_url ||
  preview.avatar?.image_url ||
  preview.avatar ||
  preview.profilePicUrl ||
  preview.thumbnail ||
  preview.legacy?.profile_image_url_https ||
  data.profile_image_url ||
  data.avatar ||
  null;

const mediaFromPost = (post) => {
  const urls = asJson(post?.media_urls, []);
  if (!Array.isArray(urls)) return [];
  return urls
    .map((item) => {
      const url = typeof item === 'string' ? item : item?.url || item?.preview || null;
      if (!url) return null;
      const typeHint = typeof item === 'object' ? item.type : null;
      const isVideo =
        typeHint === 'video' ||
        /\.(mp4|webm|mov|m3u8)(\?|$)/i.test(url) ||
        /video/i.test(url);
      return { type: isVideo ? 'video' : 'photo', url, preview: url };
    })
    .filter(Boolean);
};

/** Same metric set as velocityAlertService — plus Facebook `reactions`. */
const VELOCITY_METRICS = ['likes', 'retweets', 'replies', 'comments', 'shares', 'views', 'reactions'];

const DEFAULT_VIRALITY_THRESHOLDS = {
  low_threshold: 100,
  medium_threshold: 500,
  high_threshold: 1000,
};

const mappingService = (() => {
  try {
    return require('../../services/mappingService');
  } catch (_) {
    return null;
  }
})();

const normalizeViralityLevel = (value) => {
  const v = String(value || '').toLowerCase().trim();
  if (v === 'low' || v === 'medium' || v === 'high') return v;
  return null;
};

/**
 * Map engagement counts → low|medium|high virality (independent of risk).
 * Mirrors velocityAlertService.checkVelocity priority bands without the time window
 * so list cards can show the viral badge for existing catalog posts.
 */
const deriveViralityFromEngagement = (engagement, thresholds = DEFAULT_VIRALITY_THRESHOLDS) => {
  const eng = engagement && typeof engagement === 'object' ? engagement : {};
  const rank = { low: 1, medium: 2, high: 3 };
  let highest = null;

  for (const metric of VELOCITY_METRICS) {
    const value = Number(eng[metric]) || 0;
    let hit = null;
    if (value >= thresholds.high_threshold) hit = 'high';
    else if (value >= thresholds.medium_threshold) hit = 'medium';
    else if (value >= thresholds.low_threshold) hit = 'low';
    if (hit && (!highest || rank[hit] > rank[highest])) highest = hit;
  }

  return highest;
};

const resolveCatalogViralityLevel = (snap, engagement) =>
  normalizeViralityLevel(snap?.virality_level) || deriveViralityFromEngagement(engagement);

/** Map a social_media_alerts row (+ joined post) into the Alerts UI shape. */
const hydrateCatalogAlert = (row) => {
  const post = row.post || null;
  const account = post?.account || null;
  const profile = account?.profile || null;
  const preview = asJson(account?.preview_data, {});
  const accountData = asJson(account?.data, {});
  const snap = asJson(row.analysis_snapshot, {});
  const matched = asJson(row.matched_keywords, []);
  const highlights = Array.isArray(matched)
    ? matched.map((m) => (typeof m === 'string' ? m : m?.keyword)).filter(Boolean)
    : [];
  const reasons = [];
  if (snap.reasoning) reasons.push(String(snap.reasoning));
  if (snap.summary) reasons.push(String(snap.summary));
  if (Array.isArray(snap.matched_keywords)) {
    snap.matched_keywords.forEach((m) => {
      if (m?.keyword) reasons.push(`Keyword match: ${m.keyword} (weight ${m.weight})`);
    });
  }

  const engagement = asJson(post?.engagement, {});
  const viralityLevel = resolveCatalogViralityLevel(snap, engagement);

  let legalSections = Array.isArray(snap.legal_sections) ? snap.legal_sections : [];
  let violatedPolicies = Array.isArray(snap.violated_policies) ? snap.violated_policies : [];
  let category = snap.category || null;

  // Live-resolve Policy Manager maps for older alerts / missing snapshot fields
  if (
    mappingService &&
    (legalSections.length === 0 || violatedPolicies.length === 0 || !category)
  ) {
    try {
      const text = post?.text || '';
      const platform = normalizePlatform(row.platform || post?.platform || 'x');
      const mapped = mappingService.resolveForAnalysis({
        category,
        text,
        platform,
        country: 'IN',
      });
      if (!category && mapped.category_id) category = mapped.category_id;
      if (legalSections.length === 0 && mapped.legal_sections?.length) {
        legalSections = mapped.legal_sections;
      }
      if (violatedPolicies.length === 0 && mapped.platform_policies?.length) {
        violatedPolicies = mapped.platform_policies;
      }
    } catch (_) {
      /* mapping optional at hydrate time */
    }
  }

  const analysis = {
    category: category || null,
    intent: snap.intent || category || null,
    sentiment: snap.sentiment || row.sentiment || null,
    risk_score: row.risk_score ?? snap.risk_score ?? 0,
    risk_level: row.risk_level || snap.risk_level || 'low',
    reasoning: snap.reasoning || null,
    summary: snap.summary || null,
    matched_keywords: snap.matched_keywords || matched,
    keyword_context: snap.keyword_context || [],
    source: snap.source || 'sentiment-api',
    analyzed_at: post?.analyzed_at || row.updated_at || null,
    legal_sections: legalSections,
    violated_policies: violatedPolicies,
  };

  const llm_analysis = {
    category: analysis.category,
    intent: analysis.intent,
    sentiment: analysis.sentiment,
    reasoning: analysis.reasoning || '',
    score: analysis.risk_score,
    summary: analysis.summary || '',
    platform_policies_violated: violatedPolicies,
    bns_sections_violated: legalSections,
  };

  return serialize({
    id: row.id,
    store: 'catalog',
    platform: normalizePlatform(row.platform),
    title: row.title,
    description: row.description,
    content_url: row.content_url || post?.url || null,
    author: row.author,
    author_handle: row.author_handle || post?.author_handle || account?.handle || null,
    alert_type: row.alert_type,
    risk_level: row.risk_level,
    risk_score: row.risk_score,
    sentiment: row.sentiment,
    status: row.status,
    is_read: row.is_read,
    matched_keywords: highlights,
    virality_level: viralityLevel,
    violated_policies: violatedPolicies,
    legal_sections: legalSections,
    llm_analysis,
    threat_details: {
      intent: analysis.intent,
      reasons,
      highlights,
      risk_score: analysis.risk_score,
      violated_policies: violatedPolicies,
      legal_sections: legalSections,
    },
    content_details: post
      ? {
          id: post.id,
          platform: normalizePlatform(post.platform),
          content_type: post.media_type || 'post',
          content_url: post.url || row.content_url,
          text: post.text,
          author_handle: post.author_handle || row.author_handle,
          published_at: post.posted_at || row.posted_at,
          engagement,
          media: mediaFromPost(post),
          media_type: post.media_type,
          risk_level: row.risk_level,
          analysis,
        }
      : null,
    source_meta: {
      profile_image_url: pickAvatar(preview, accountData),
      is_verified: Boolean(preview.is_verified || preview.verified || accountData.is_verified),
      name: profile?.display_name || row.author || account?.handle || null,
      handle: account?.handle || row.author_handle || null,
    },
    source_category: (() => {
      const raw = String(category || '').trim().toLowerCase();
      if (raw && !['neutral', 'unknown', 'normal', 'monitor', 'null', 'none'].includes(raw)) {
        return raw.replace(/\s+/g, '_').slice(0, 48);
      }
      return 'uncategorized';
    })(),
    post_id: row.post_id,
    account_id: row.account_id,
    external_id: row.external_id,
    posted_at: row.posted_at,
    content_published_at: row.posted_at || post?.posted_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
};

const buildWhere = (query = {}) => {
  const {
    status,
    risk_level,
    search,
    platform,
    startDate,
    endDate,
    alert_type,
    keyword,
  } = query;

  const where = {};

  if (status && status !== 'all') where.status = String(status).toLowerCase();
  else if (!status) where.status = 'active';

  if (risk_level && risk_level !== 'all') {
    where.risk_level = String(risk_level).toLowerCase();
  }

  if (platform && platform !== 'all') {
    where.platform = normalizePlatform(platform);
  }

  if (alert_type && alert_type !== 'all') {
    if (alert_type === 'risk') {
      where.alert_type = { in: ['keyword_risk', 'ai_risk'] };
    } else {
      where.alert_type = alert_type;
    }
  }

  if (startDate || endDate) {
    where.created_at = {};
    if (startDate) where.created_at.gte = new Date(`${startDate}T00:00:00.000Z`);
    if (endDate) where.created_at.lte = new Date(`${endDate}T23:59:59.999Z`);
  }

  const and = [];

  if (keyword && keyword !== 'all') {
    const kw = String(keyword).trim();
    and.push({
      OR: [
        { title: { contains: kw, mode: 'insensitive' } },
        { description: { contains: kw, mode: 'insensitive' } },
        { post: { text: { contains: kw, mode: 'insensitive' } } },
      ],
    });
  }

  if (search && String(search).trim()) {
    const q = String(search).trim();
    and.push({
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { author: { contains: q, mode: 'insensitive' } },
        { author_handle: { contains: q, mode: 'insensitive' } },
        { content_url: { contains: q, mode: 'insensitive' } },
        { external_id: { contains: q, mode: 'insensitive' } },
        { post: { text: { contains: q, mode: 'insensitive' } } },
      ],
    });
  }

  if (and.length) where.AND = and;
  return where;
};

module.exports = {
  ALERT_INCLUDE,
  serialize,
  asJson,
  normalizePlatform,
  isCatalogStore,
  hydrateCatalogAlert,
  buildWhere,
  deriveViralityFromEngagement,
  resolveCatalogViralityLevel,
  normalizeViralityLevel,
  DEFAULT_VIRALITY_THRESHOLDS,
};
