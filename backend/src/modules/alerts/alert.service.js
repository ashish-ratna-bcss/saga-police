const prisma = require('../../../prisma/client');
const Settings = require('../../models/Settings');
const {
  ALERT_INCLUDE,
  asJson,
  normalizePlatform,
  hydrateCatalogAlert,
  buildWhere,
} = require('./alert.utils');

/**
 * Upsert a Postgres social_media_alerts row from catalog post + analysis_result.
 * Skips low-risk unless settings.alert_for_every_post is true.
 */
const createAlertFromCatalogPost = async (post, analysisResult, options = {}) => {
  if (!post || !analysisResult || analysisResult.skipped) {
    return { created: false, skipped: true, reason: 'no_analysis' };
  }

  const riskLevel = String(analysisResult.risk_level || 'low').toLowerCase();
  const matchedKeywords = Array.isArray(analysisResult.matched_keywords)
    ? analysisResult.matched_keywords
    : [];

  let alertEvery = false;
  try {
    const settings = await Settings.findOne({ id: 'global_settings' }).lean();
    alertEvery = Boolean(settings?.alert_for_every_post);
  } catch (_) {
    /* settings optional */
  }

  const shouldAlert =
    alertEvery ||
    riskLevel === 'medium' ||
    riskLevel === 'high' ||
    matchedKeywords.length > 0;

  if (!shouldAlert) {
    return { created: false, skipped: true, reason: 'below_threshold' };
  }

  const platform = normalizePlatform(post.platform);
  const externalId = String(post.external_id);

  if (options.skipIfExists) {
    const existing = await prisma.social_media_alerts.findUnique({
      where: {
        platform_external_id: { platform, external_id: externalId },
      },
    });
    if (existing) {
      return { created: false, skipped: true, reason: 'already_exists', alert: existing };
    }
  }

  const postId = BigInt(post.id);
  const author =
    post.author_name ||
    post.author_handle ||
    post.account?.profile?.display_name ||
    'Unknown';
  const intent = analysisResult.intent || analysisResult.category || 'Monitor';
  const intentStr =
    intent && !['Neutral', 'Unknown', 'Normal', 'Monitor'].includes(intent)
      ? `${intent} - `
      : '';
  const title = `${riskLevel.toUpperCase()} Risk: ${intentStr}${author}`;

  const reasons = [];
  if (analysisResult.reasoning) reasons.push(String(analysisResult.reasoning));
  if (analysisResult.summary) reasons.push(String(analysisResult.summary));
  matchedKeywords.forEach((m) => {
    reasons.push(`Keyword match: ${m.keyword} (weight ${m.weight})`);
  });

  const description =
    reasons.length > 0
      ? `**Analysis:**\n${reasons.map((r) => `• ${r}`).join('\n')}`
      : 'Catalog post analyzed via sentiment API.';

  const highlights = matchedKeywords.map((m) => m.keyword).filter(Boolean);
  const alertType = matchedKeywords.length > 0 ? 'keyword_risk' : 'ai_risk';
  const riskScore = Number(analysisResult.risk_score) || 0;

  const data = {
    post_id: postId,
    account_id: post.account_id != null ? Number(post.account_id) : null,
    platform,
    external_id: externalId,
    title,
    description,
    content_url: post.url || null,
    author,
    author_handle: post.author_handle || null,
    alert_type: alertType,
    risk_level: riskLevel,
    risk_score: riskScore,
    sentiment: analysisResult.sentiment || null,
    status: 'active',
    is_read: false,
    matched_keywords: highlights,
    analysis_snapshot: {
      category: analysisResult.category,
      intent: analysisResult.intent,
      sentiment: analysisResult.sentiment,
      risk_score: riskScore,
      risk_level: riskLevel,
      keyword_context: analysisResult.keyword_context || [],
      matched_keywords: matchedKeywords,
      reasoning: analysisResult.reasoning || null,
      summary: analysisResult.summary || null,
      source: analysisResult.source || 'sentiment-api',
    },
    posted_at: post.posted_at || post.fetched_at || null,
  };

  if (options.skipIfExists) {
    const alert = await prisma.social_media_alerts.create({ data });
    return { created: true, alert };
  }

  const alert = await prisma.social_media_alerts.upsert({
    where: {
      platform_external_id: {
        platform,
        external_id: externalId,
      },
    },
    create: data,
    update: {
      title: data.title,
      description: data.description,
      content_url: data.content_url,
      author: data.author,
      author_handle: data.author_handle,
      alert_type: data.alert_type,
      risk_level: data.risk_level,
      risk_score: data.risk_score,
      sentiment: data.sentiment,
      matched_keywords: data.matched_keywords,
      analysis_snapshot: data.analysis_snapshot,
      posted_at: data.posted_at,
      status: 'active',
    },
  });

  return { created: true, alert };
};

const buildCatalogStats = async (params = {}) => {
  const where = buildWhere({ ...params, status: undefined });
  delete where.status;

  const rows = await prisma.social_media_alerts.groupBy({
    by: ['status'],
    where,
    _count: { _all: true },
  });

  const counts = {
    active: 0,
    acknowledged: 0,
    escalated: 0,
    resolved: 0,
    false_positive: 0,
    escalated_pending_report: 0,
    virality: { low: 0, medium: 0, high: 0, total: 0 },
  };

  for (const row of rows) {
    const key = String(row.status || '').toLowerCase();
    if (Object.prototype.hasOwnProperty.call(counts, key)) {
      counts[key] = row._count._all;
    }
  }

  return counts;
};

const listCatalogAlerts = async ({ query = {}, page = 1, limit = 20 } = {}) => {
  const skip = (page - 1) * limit;
  const where = buildWhere(query);

  const [rows, total] = await Promise.all([
    prisma.social_media_alerts.findMany({
      where,
      include: ALERT_INCLUDE,
      orderBy: [{ posted_at: 'desc' }, { created_at: 'desc' }, { id: 'desc' }],
      skip,
      take: limit + 1,
    }),
    prisma.social_media_alerts.count({ where }),
  ]);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  return {
    alerts: pageRows.map(hydrateCatalogAlert),
    pagination: {
      total,
      page,
      totalPages: Math.ceil(total / limit),
      hasMore,
      nextCursor: hasMore ? `p:${page + 1}` : null,
    },
  };
};

const getCatalogAlertById = async (id) => {
  const row = await prisma.social_media_alerts.findUnique({
    where: { id: BigInt(id) },
    include: ALERT_INCLUDE,
  });
  return row ? hydrateCatalogAlert(row) : null;
};

const getCatalogAlertsByIds = async (ids = []) => {
  const bigIds = ids
    .map((id) => {
      try {
        return BigInt(id);
      } catch {
        return null;
      }
    })
    .filter((id) => id != null);

  if (!bigIds.length) return [];

  const rows = await prisma.social_media_alerts.findMany({
    where: { id: { in: bigIds } },
    include: ALERT_INCLUDE,
    orderBy: [{ created_at: 'desc' }],
  });

  return rows.map(hydrateCatalogAlert);
};

const updateCatalogAlert = async (id, body = {}) => {
  const existing = await prisma.social_media_alerts.findUnique({
    where: { id: BigInt(id) },
  });
  if (!existing) {
    const err = new Error('Alert not found');
    err.status = 404;
    throw err;
  }

  const data = {};
  const { status, risk_level, notes } = body;

  if (status) data.status = String(status).toLowerCase();
  if (risk_level && ['low', 'medium', 'high'].includes(String(risk_level).toLowerCase())) {
    data.risk_level = String(risk_level).toLowerCase();
  }
  if (notes != null) {
    const snap = asJson(existing.analysis_snapshot, {});
    data.analysis_snapshot = { ...snap, notes };
  }

  const updated = await prisma.social_media_alerts.update({
    where: { id: BigInt(id) },
    data,
    include: ALERT_INCLUDE,
  });

  return hydrateCatalogAlert(updated);
};

const getUnreadCount = async () =>
  prisma.social_media_alerts.count({
    where: { is_read: false, status: 'active' },
  });

const markAllRead = async () => {
  const result = await prisma.social_media_alerts.updateMany({
    where: { is_read: false },
    data: { is_read: true },
  });
  return result.count;
};

const normalizeTopCategory = (row) => {
  const snap = asJson(row.analysis_snapshot, {});
  const raw = String(snap.category || '').trim().toLowerCase();
  if (raw && !['neutral', 'unknown', 'normal', 'monitor', 'null', 'none'].includes(raw)) {
    return raw.replace(/\s+/g, '_').slice(0, 48);
  }
  const risk = String(row.risk_level || 'low').toLowerCase();
  if (risk === 'high' || risk === 'medium') return `risk_${risk}`;
  return 'uncategorized';
};

/**
 * Catalog Top-N alerts per analysis category for the Alerts "Top 50 / Category" page.
 * Ranks by risk_score (no RAG / Mongo dependency).
 */
const listTopCatalogAlertsByCategory = async ({
  hours = 24,
  topNPerCategory = 50,
  maxPerAuthor = 8,
} = {}) => {
  const safeHours = Math.max(1, Math.min(Number(hours) || 24, 168));
  const safeTopN = Math.max(1, Math.min(Number(topNPerCategory) || 50, 100));
  const safeMaxAuthor = Math.max(1, Math.min(Number(maxPerAuthor) || 8, 30));
  const since = new Date(Date.now() - safeHours * 60 * 60 * 1000);

  const rows = await prisma.social_media_alerts.findMany({
    where: {
      status: 'active',
      OR: [
        { posted_at: { gte: since } },
        { AND: [{ posted_at: null }, { created_at: { gte: since } }] },
      ],
    },
    include: ALERT_INCLUDE,
    orderBy: [{ risk_score: 'desc' }, { posted_at: 'desc' }, { id: 'desc' }],
    take: 2500,
  });

  const buckets = new Map();
  for (const row of rows) {
    const cat = normalizeTopCategory(row);
    if (!buckets.has(cat)) buckets.set(cat, []);
    buckets.get(cat).push(row);
  }

  const alerts = [];
  const categories = {};

  for (const [cat, list] of buckets) {
    list.sort((a, b) => {
      const scoreDiff = (Number(b.risk_score) || 0) - (Number(a.risk_score) || 0);
      if (scoreDiff !== 0) return scoreDiff;
      const ta = new Date(a.posted_at || a.created_at || 0).getTime();
      const tb = new Date(b.posted_at || b.created_at || 0).getTime();
      return tb - ta;
    });

    const authorCounts = new Map();
    const picked = [];
    for (const row of list) {
      const authorKey = String(row.author_handle || row.author || row.account_id || '')
        .toLowerCase()
        .trim();
      const seen = authorCounts.get(authorKey) || 0;
      if (authorKey && seen >= safeMaxAuthor) continue;
      if (authorKey) authorCounts.set(authorKey, seen + 1);
      const alert = hydrateCatalogAlert(row);
      alert.source_category = cat;
      picked.push(alert);
      if (picked.length >= safeTopN) break;
    }

    categories[cat] = { count: picked.length, scanned: list.length };
    alerts.push(...picked);
  }

  // Keep category order stable: high-risk buckets first, then by count
  alerts.sort((a, b) => {
    const catCmp = String(a.source_category || '').localeCompare(String(b.source_category || ''));
    if (catCmp !== 0) return catCmp;
    return (Number(b.risk_score) || 0) - (Number(a.risk_score) || 0);
  });

  return {
    alerts,
    total_scanned: rows.length,
    total_unique: alerts.length,
    top_n: alerts.length,
    top_n_per_category: safeTopN,
    categories,
    hours: safeHours,
    date: new Date().toISOString().slice(0, 10),
    mode: 'catalog_risk_rank',
  };
};

module.exports = {
  createAlertFromCatalogPost,
  buildCatalogStats,
  listCatalogAlerts,
  getCatalogAlertById,
  getCatalogAlertsByIds,
  updateCatalogAlert,
  getUnreadCount,
  markAllRead,
  listTopCatalogAlertsByCategory,
};
