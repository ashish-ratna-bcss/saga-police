/**
 * Formal Reports API — alert-generated notices only.
 * Rows live in formal_reports; created via POST /reports/escalate/:alertId
 * when the user opens Generate Report. G/S/C/Q grievance reports stay in
 * social_media_grievance_reports and are not listed here.
 */
const dbOf = require('../../lib/dbOf');
const cacheService = require('./cache.service');
const alertService = require('../alerts/alert.service');

const asObject = (value, fallback = {}) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return fallback;
};

const asArray = (value) => (Array.isArray(value) ? value : []);

const escapeRegexLike = (value = '') =>
  String(value).replace(/([%_\\])/g, '\\$1');

/** Map formal_reports row → shape expected by Alerts → Reports UI. */
const toFormalReportShape = (row, alertExtra = null) => {
  const target = asObject(row.target_user_details);
  const edited = asObject(row.edited_content);
  const contentUrl =
    edited.contentUrl || row.content_url || alertExtra?.content_url || null;
  const category =
    row.source_category ||
    alertExtra?.source_category ||
    alertExtra?.analysis?.category ||
    '';

  return {
    id: row.id,
    serial_number: row.serial_number,
    alert_id: String(row.alert_id),
    report_type: 'alert_notice',
    platform: row.platform,
    status: String(row.status || 'sent_to_intermediary').toLowerCase(),
    title: row.title || category,
    source_category: category,
    joined_content_url: contentUrl,
    closing_remarks: row.closing_remarks || '',
    edited_content: edited,
    target_user_details: {
      name: target.name || 'Unknown',
      handle: target.handle || '',
      profile_url: target.profile_url || '',
      avatar_url: target.avatar_url || '',
      is_verified: Boolean(target.is_verified),
    },
    content_summary: row.content_summary || '',
    media_links: asArray(row.media_links),
    legal_sections: asArray(row.legal_sections),
    violated_policies: asArray(row.violated_policies),
    post_link: contentUrl,
    report_pdf_url: row.report_pdf_url || (row.pdf_base64 ? `/api/reports/${row.alert_id}/pdf` : null),
    generated_at: row.generated_at || row.created_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    alert_data: alertExtra || undefined,
  };
};

const generateSerialNumber = async (platform, { db } = {}) => {
  const prisma = dbOf(db);
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const platformCode = String(platform || 'x').toUpperCase().substring(0, 1);
  const count = await prisma.formal_reports.count({
    where: { platform: String(platform || 'x').toLowerCase() },
  });
  const sn = String(count + 1).padStart(4, '0');
  return `${platformCode}${sn}-${dd}${mm}${yyyy}`;
};

/**
 * Create a formal notice row when the user opens Generate Report for an alert.
 * Idempotent: returns the existing row if one already exists for alert_id.
 */
const createReportFromAlert = async (alertId, { db } = {}) => {
  const prisma = dbOf(db);
  const id = String(alertId);

  const existing = await prisma.formal_reports.findUnique({
    where: { alert_id: id },
  });
  if (existing) return toFormalReportShape(existing);

  const alert = await alertService.getCatalogAlertById(id, { db: prisma });
  if (!alert) {
    const err = new Error('Alert not found');
    err.status = 404;
    throw err;
  }

  const handle =
    alert.author_handle ||
    alert.source_meta?.handle ||
    alert.author ||
    '';
  const name =
    alert.source_meta?.name ||
    alert.author ||
    handle ||
    'Unknown';
  const platform = String(alert.platform || 'x').toLowerCase();
  const profileHandle = String(handle || '').replace(/^@/, '');
  const profileUrl =
    platform === 'x' || platform === 'twitter'
      ? `https://x.com/${profileHandle}`
      : alert.content_url || '';

  const media = asArray(alert.content_details?.media)
    .map((m) => m?.url || m)
    .filter(Boolean);

  const serialNumber = await generateSerialNumber(platform, { db: prisma });

  const row = await prisma.formal_reports.create({
    data: {
      serial_number: serialNumber,
      alert_id: id,
      platform,
      status: 'sent_to_intermediary',
      source_category: alert.source_category || null,
      content_url: alert.content_url || null,
      content_summary: alert.content_details?.text || alert.description || '',
      target_user_details: {
        name,
        handle: handle ? (String(handle).startsWith('@') ? handle : `@${profileHandle}`) : '',
        profile_url: profileUrl,
        avatar_url: alert.source_meta?.profile_image_url || '',
        is_verified: Boolean(alert.source_meta?.is_verified),
      },
      media_links: media,
      legal_sections: asArray(alert.legal_sections),
      violated_policies: asArray(alert.violated_policies),
      edited_content: alert.content_url ? { contentUrl: alert.content_url } : {},
    },
  });

  // Mark alert escalated if still active
  try {
    if (alert.status !== 'escalated') {
      await alertService.updateCatalogAlert(id, { status: 'escalated' }, { db: prisma });
    }
  } catch (e) {
    // Non-fatal — report row is the source of truth for the Reports tab
  }

  await cacheService.invalidatePrefix('reports:stats:v1');
  await cacheService.invalidatePrefix('alerts:stats');
  return toFormalReportShape(row, alert);
};

const getAllReports = async (filters = {}, { db } = {}) => {
  const prisma = dbOf(db);
  const {
    platform,
    status,
    search,
    startDate,
    endDate,
    page = 1,
    limit = 100,
    risk_level,
    category,
    keyword,
  } = filters;

  const where = {};

  if (platform && platform !== 'all') {
    const p = String(platform).toLowerCase();
    where.platform = p === 'twitter' ? 'x' : p;
  }
  if (status && status !== 'all') {
    where.status = String(status).toLowerCase();
  }
  if (startDate || endDate) {
    where.generated_at = {};
    if (startDate) where.generated_at.gte = new Date(startDate);
    if (endDate) where.generated_at.lte = new Date(endDate);
  }

  const normalizedSearch = String(search || '').trim();
  if (normalizedSearch) {
    const q = escapeRegexLike(normalizedSearch);
    const handleQ = q.replace(/^@/, '');
    where.OR = [
      { serial_number: { contains: q, mode: 'insensitive' } },
      { content_summary: { contains: q, mode: 'insensitive' } },
      { alert_id: { contains: q, mode: 'insensitive' } },
      { source_category: { contains: q, mode: 'insensitive' } },
      { closing_remarks: { contains: q, mode: 'insensitive' } },
      { target_user_details: { path: ['handle'], string_contains: handleQ } },
      { target_user_details: { path: ['name'], string_contains: q } },
    ];
  }

  // Optional alert-side filters: narrow by alert_ids first
  const needsAlertFilter =
    (risk_level && risk_level !== 'all') ||
    (category && category !== 'all') ||
    (keyword && keyword !== 'all');

  if (needsAlertFilter) {
    const alertWhere = {};
    if (risk_level && risk_level !== 'all') {
      alertWhere.risk_level = String(risk_level).toLowerCase();
    }
    const alerts = await prisma.social_media_alerts.findMany({
      where: alertWhere,
      select: { id: true, analysis_snapshot: true, matched_keywords: true },
      take: 5000,
    });
    let ids = alerts.map((a) => String(a.id));
    if (category && category !== 'all') {
      const cat = String(category).toLowerCase();
      ids = alerts
        .filter((a) => {
          const snap = asObject(a.analysis_snapshot);
          const c = String(snap.category || '').toLowerCase();
          return c === cat || c.replace(/\s+/g, '_') === cat;
        })
        .map((a) => String(a.id));
    }
    if (keyword && keyword !== 'all') {
      const kw = String(keyword).toLowerCase();
      ids = alerts
        .filter((a) => {
          const matched = asArray(a.matched_keywords);
          return matched.some((m) =>
            String(typeof m === 'string' ? m : m?.keyword || '')
              .toLowerCase()
              .startsWith(kw)
          );
        })
        .map((a) => String(a.id));
    }
    where.alert_id = { in: ids.length ? ids : ['__none__'] };
  }

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
  const skip = (pageNum - 1) * limitNum;

  const [rows, total] = await Promise.all([
    prisma.formal_reports.findMany({
      where,
      orderBy: { generated_at: 'desc' },
      skip,
      take: limitNum,
    }),
    prisma.formal_reports.count({ where }),
  ]);

  // Enrich with live alert fields when available
  const alertIds = rows.map((r) => r.alert_id);
  let alertById = {};
  if (alertIds.length) {
    try {
      const alerts = await alertService.getCatalogAlertsByIds(alertIds, { db: prisma });
      alertById = Object.fromEntries(alerts.map((a) => [String(a.id), a]));
    } catch (_) {
      /* optional enrich */
    }
  }

  const items = rows.map((row) => toFormalReportShape(row, alertById[String(row.alert_id)] || null));

  return {
    items,
    length: items.length,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.max(Math.ceil(total / limitNum), 1),
    },
  };
};

const findFormalReport = async (idOrAlertId, { db } = {}) => {
  const prisma = dbOf(db);
  const key = String(idOrAlertId);
  return prisma.formal_reports.findFirst({
    where: {
      OR: [{ id: key }, { alert_id: key }, { serial_number: key }],
    },
  });
};

const updateReport = async (idOrAlertId, updateData, { db } = {}) => {
  const prisma = dbOf(db);
  const existing = await findFormalReport(idOrAlertId, { db: prisma });
  if (!existing) {
    const err = new Error('Report not found');
    err.status = 404;
    throw err;
  }

  const data = {};
  if (updateData.status != null) {
    data.status = String(updateData.status).toLowerCase();
  }
  if (updateData.closing_remarks != null) data.closing_remarks = updateData.closing_remarks;
  if (updateData.remarks != null) data.closing_remarks = updateData.remarks;
  if (updateData.edited_content != null) {
    data.edited_content = {
      ...asObject(existing.edited_content),
      ...asObject(updateData.edited_content),
    };
  }
  if (updateData.title != null) data.title = updateData.title;
  if (updateData.report_pdf_url != null) data.report_pdf_url = updateData.report_pdf_url;
  if (updateData.pdf_url != null) data.report_pdf_url = updateData.pdf_url;
  if (updateData.pdf_base64 != null) data.pdf_base64 = updateData.pdf_base64;
  if (updateData.source_category != null) data.source_category = updateData.source_category;

  const row = await prisma.formal_reports.update({
    where: { id: existing.id },
    data,
  });

  await cacheService.invalidatePrefix('reports:stats:v1');
  return toFormalReportShape(row);
};

const getReportStats = async ({ db } = {}) => {
  const prisma = dbOf(db);
  const cacheKey = 'reports:stats:v1:formal';
  const cached = await cacheService.get(cacheKey);
  if (cached) return cached;

  const grouped = await prisma.formal_reports.groupBy({
    by: ['platform', 'status'],
    _count: { _all: true },
  });

  const normalizePlatform = (platform) => {
    const p = String(platform || 'unknown').toLowerCase();
    return p === 'x' ? 'twitter' : p;
  };
  const statuses = [
    'generated',
    'printed',
    'sent',
    'sent_to_intermediary',
    'awaiting_reply',
    'closed',
    'pending',
  ];
  const { resolvePagePlatformSlugs } = require('../../lib/pagePlatforms');
  const tenantSlugs = await resolvePagePlatformSlugs(prisma, 'alerts', {
    includeTwitterAlias: false,
  }).catch(() => ['x', 'facebook', 'instagram', 'youtube']);

  const platformKeys = new Set(['all']);
  for (const s of tenantSlugs) {
    platformKeys.add(s === 'x' ? 'twitter' : s);
    if (s === 'x') platformKeys.add('twitter');
  }
  for (const row of grouped) {
    platformKeys.add(normalizePlatform(row.platform || 'unknown'));
  }

  const platforms = [...platformKeys];
  const byPlatform = {};
  const byStatus = Object.fromEntries(statuses.map((s) => [s, 0]));
  const totals = { total: 0 };

  platforms.forEach((p) => {
    byPlatform[p] = { total: 0 };
    statuses.forEach((s) => {
      byPlatform[p][s] = 0;
    });
  });

  grouped.forEach((row) => {
    const platform = normalizePlatform(row.platform || 'unknown');
    const status = String(row.status || '').toLowerCase();
    const count = row._count?._all || 0;
    if (!byPlatform[platform]) {
      byPlatform[platform] = { total: 0 };
      statuses.forEach((s) => {
        byPlatform[platform][s] = 0;
      });
    }
    if (byPlatform[platform][status] == null) byPlatform[platform][status] = 0;
    byPlatform[platform][status] += count;
    byPlatform[platform].total += count;
    byPlatform.all[status] = (byPlatform.all[status] || 0) + count;
    byPlatform.all.total += count;
    byStatus[status] = (byStatus[status] || 0) + count;
    totals.total += count;
  });

  const payload = { byPlatform, byStatus, totals, byType: { alert_notice: totals.total } };
  await cacheService.set(cacheKey, payload, 30);
  return payload;
};

const finalizeReport = async () => {
  const err = new Error('Use Save + Download PDF on the notice generator to finalize.');
  err.status = 400;
  throw err;
};

module.exports = {
  generateSerialNumber,
  createReportFromAlert,
  getAllReports,
  updateReport,
  getReportStats,
  finalizeReport,
  toFormalReportShape,
  findFormalReport,
};
