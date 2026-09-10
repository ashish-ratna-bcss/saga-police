const dbOf = require('../../lib/dbOf');
const { createAuditLog } = require('../../lib/audit');
const logger = require('../../lib/logger');

const toProp = (row) => {
  if (!row) return null;
  return {
    id: String(row.id),
    keyword: row.keyword,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

const listKeywords = async (_filters = {}, { db } = {}) => {
  const prisma = dbOf(db);
  const rows = await prisma.keywords.findMany({
    orderBy: { keyword: 'asc' },
    take: 1000,
  });
  return rows.map(toProp);
};

/**
 * Re-queue catalog posts whose text contains the keyword so sentiment
 * can re-run and create social_media_alerts when matched.
 */
const rescanCatalogPostsForKeyword = async (keyword, { db } = {}) => {
  const prisma = dbOf(db);
  const needle = String(keyword || '').trim();
  if (!needle) return { reset: 0 };

  const rows = await prisma.$queryRaw`
    SELECT id
    FROM social_media_posts
    WHERE analysis_status IN ('done', 'skipped', 'failed')
      AND text IS NOT NULL
      AND position(lower(${needle}) in lower(text)) > 0
  `;

  if (!rows.length) return { reset: 0 };

  const ids = rows.map((r) => r.id);
  const result = await prisma.social_media_posts.updateMany({
    where: { id: { in: ids } },
    data: {
      analysis_status: 'pending',
      analysis_error: null,
      analysis_attempts: 0,
    },
  });

  return { reset: result.count };
};

const createKeyword = async (body = {}, { user, db } = {}) => {
  const prisma = dbOf(db);
  const keyword = String(body.keyword || '').trim();
  if (!keyword) {
    const err = new Error('keyword is required');
    err.status = 400;
    throw err;
  }

  const existing = await prisma.keywords.findUnique({ where: { keyword } });
  if (existing) {
    let rescan = null;
    if (body.rescan_catalog === true || body.rescan_catalog === 'true') {
      try {
        rescan = await rescanCatalogPostsForKeyword(existing.keyword, { db: prisma });
      } catch (rescanErr) {
        logger.error('[AlertsKeywords] catalog rescan failed:', rescanErr);
        rescan = { reset: 0, error: rescanErr.message };
      }
    }
    return { keyword: toProp(existing), rescan, already_exists: true };
  }

  let created;
  try {
    created = await prisma.keywords.create({ data: { keyword } });
  } catch (error) {
    if (error?.code === 'P2002') {
      const again = await prisma.keywords.findUnique({ where: { keyword } });
      if (again) {
        return { keyword: toProp(again), rescan: null, already_exists: true };
      }
      const err = new Error('Keyword already exists');
      err.status = 409;
      throw err;
    }
    throw error;
  }

  if (user) {
    try {
      await createAuditLog(user, 'create', 'keyword', String(created.id), {
        keyword: created.keyword,
        via: 'alerts',
        store: 'postgres',
      });
    } catch (auditErr) {
      logger.warn('[AlertsKeywords] audit failed:', auditErr.message);
    }
  }

  let rescan = null;
  if (body.rescan_catalog === true || body.rescan_catalog === 'true') {
    try {
      rescan = await rescanCatalogPostsForKeyword(created.keyword, { db: prisma });
    } catch (rescanErr) {
      logger.error('[AlertsKeywords] catalog rescan failed:', rescanErr);
      rescan = { reset: 0, error: rescanErr.message };
    }
  }

  return { keyword: toProp(created), rescan };
};

const updateKeyword = async (id, body = {}, { user, db } = {}) => {
  const prisma = dbOf(db);
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    const err = new Error('Keyword not found');
    err.status = 404;
    throw err;
  }

  const existing = await prisma.keywords.findUnique({ where: { id: numericId } });
  if (!existing) {
    const err = new Error('Keyword not found');
    err.status = 404;
    throw err;
  }

  const keyword = body.keyword != null ? String(body.keyword).trim() : existing.keyword;
  if (!keyword) {
    const err = new Error('keyword is required');
    err.status = 400;
    throw err;
  }

  let updated;
  try {
    updated = await prisma.keywords.update({
      where: { id: numericId },
      data: { keyword },
    });
  } catch (error) {
    if (error?.code === 'P2002') {
      const err = new Error('Keyword already exists');
      err.status = 409;
      throw err;
    }
    throw error;
  }

  if (user) {
    try {
      await createAuditLog(user, 'update', 'keyword', String(updated.id), {
        keyword: updated.keyword,
        via: 'alerts',
        store: 'postgres',
      });
    } catch (auditErr) {
      logger.warn('[AlertsKeywords] audit failed:', auditErr.message);
    }
  }

  let rescan = null;
  const shouldRescan =
    body.rescan_catalog === true ||
    body.rescan_catalog === 'true' ||
    updated.keyword !== existing.keyword;

  if (shouldRescan) {
    try {
      rescan = await rescanCatalogPostsForKeyword(updated.keyword, { db: prisma });
    } catch (rescanErr) {
      logger.error('[AlertsKeywords] catalog rescan failed:', rescanErr);
      rescan = { reset: 0, error: rescanErr.message };
    }
  }

  return { keyword: toProp(updated), rescan };
};

const deleteKeyword = async (id, { user, db } = {}) => {
  const prisma = dbOf(db);
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    const err = new Error('Keyword not found');
    err.status = 404;
    throw err;
  }

  const existing = await prisma.keywords.findUnique({ where: { id: numericId } });
  if (!existing) {
    const err = new Error('Keyword not found');
    err.status = 404;
    throw err;
  }

  await prisma.keywords.delete({ where: { id: numericId } });

  if (user) {
    try {
      await createAuditLog(user, 'delete', 'keyword', String(numericId), {
        keyword: existing.keyword,
        via: 'alerts',
        store: 'postgres',
      });
    } catch (auditErr) {
      logger.warn('[AlertsKeywords] audit failed:', auditErr.message);
    }
  }

  return { deleted: true, keyword: toProp(existing) };
};

/**
 * Full-table rescan: match every post text against all keywords,
 * update analysis risk on hits, create alert only if one does not exist yet.
 */
const rescanAllCatalogPostsForKeywords = async ({ db } = {}) => {
  const prisma = dbOf(db);
  const { createAlertFromCatalogPost } = require('./alert.service');

  const keywordRows = await prisma.keywords.findMany({
    select: { keyword: true },
    orderBy: { keyword: 'asc' },
  });
  const needles = keywordRows
    .map((k) => String(k.keyword || '').trim())
    .filter(Boolean);

  if (!needles.length) {
    return {
      posts_scanned: 0,
      posts_matched: 0,
      posts_updated: 0,
      alerts_created: 0,
      alerts_skipped_existing: 0,
      keywords: 0,
    };
  }

  const posts = await prisma.social_media_posts.findMany({
    where: { text: { not: null } },
    include: {
      account: {
        include: {
          profile: { select: { id: true, display_name: true } },
        },
      },
    },
    orderBy: { id: 'asc' },
  });

  let postsMatched = 0;
  let postsUpdated = 0;
  let alertsCreated = 0;
  let alertsSkippedExisting = 0;

  for (const post of posts) {
    const hay = String(post.text || '').toLowerCase();
    if (!hay) continue;

    const matchedKeywords = [];
    for (const keyword of needles) {
      if (hay.includes(keyword.toLowerCase())) {
        matchedKeywords.push({ keyword, weight: 50, category: 'other' });
      }
    }
    if (!matchedKeywords.length) continue;
    postsMatched += 1;

    const riskScore = Math.min(
      100,
      matchedKeywords.reduce((sum, m) => sum + (Number(m.weight) || 50), 0)
    );
    const riskLevel = riskScore >= 70 ? 'high' : riskScore >= 40 ? 'medium' : 'low';

    const prev = asJsonSafe(post.analysis_result, {});
    const analysis_result = {
      ...prev,
      sentiment: prev.sentiment || 'neutral',
      risk_score: Math.max(Number(prev.risk_score) || 0, riskScore),
      risk_level:
        ['high', 'medium', 'low'].indexOf(String(prev.risk_level || '').toLowerCase()) >= 0 &&
        rankRisk(prev.risk_level) > rankRisk(riskLevel)
          ? prev.risk_level
          : riskLevel,
      matched_keywords: matchedKeywords,
      category: prev.category || 'keyword_match',
      intent: prev.intent || 'Monitor',
      reasoning: prev.reasoning || 'Keyword rescan',
      summary:
        prev.summary ||
        `Matched: ${matchedKeywords.map((m) => m.keyword).join(', ')}`,
      source: prev.source || 'keyword-rescan',
      analyzed_via: prev.analyzed_via || 'keyword-rescan',
      rescanned_at: new Date().toISOString(),
    };

    // Prefer higher risk from this pass
    if (rankRisk(riskLevel) >= rankRisk(analysis_result.risk_level)) {
      analysis_result.risk_level = riskLevel;
      analysis_result.risk_score = Math.max(Number(analysis_result.risk_score) || 0, riskScore);
    }

    await prisma.social_media_posts.update({
      where: { id: post.id },
      data: {
        analysis_status: 'done',
        analysis_result,
        analysis_error: null,
        analyzed_at: post.analyzed_at || new Date(),
      },
    });
    postsUpdated += 1;

    const alertInfo = await createAlertFromCatalogPost(
      { ...post, id: String(post.id) },
      analysis_result,
      { skipIfExists: true, db: prisma }
    );

    if (alertInfo?.created) alertsCreated += 1;
    else if (alertInfo?.reason === 'already_exists') alertsSkippedExisting += 1;
  }

  return {
    posts_scanned: posts.length,
    posts_matched: postsMatched,
    posts_updated: postsUpdated,
    alerts_created: alertsCreated,
    alerts_skipped_existing: alertsSkippedExisting,
    keywords: needles.length,
  };
};

const asJsonSafe = (value, fallback) => {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const rankRisk = (level) => {
  const v = String(level || '').toLowerCase();
  if (v === 'high') return 3;
  if (v === 'medium') return 2;
  if (v === 'low') return 1;
  return 0;
};

module.exports = {
  listKeywords,
  createKeyword,
  updateKeyword,
  deleteKeyword,
  rescanCatalogPostsForKeyword,
  rescanAllCatalogPostsForKeywords,
};
