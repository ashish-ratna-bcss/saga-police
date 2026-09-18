/**
 * Formal Reports API — Postgres only.
 * Uses existing social_media_grievance_reports (G/S/C/Q) — no Mongo, no second reports table.
 */
const dbOf = require('../../lib/dbOf');
const cacheService = require('./cache.service');

const asObject = (value, fallback = {}) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return fallback;
};

const asArray = (value) => (Array.isArray(value) ? value : []);

/** Map grievance-report row → shape expected by /reports UI. */
const toFormalReportShape = (row) => {
  const postedBy = asObject(row.posted_by);
  const handle =
    postedBy.handle ||
    postedBy.username ||
    postedBy.screen_name ||
    row.profile_id ||
    '';
  const name =
    postedBy.display_name ||
    postedBy.name ||
    handle ||
    'Unknown';

  return {
    id: row.id,
    serial_number: row.unique_code,
    alert_id: row.grievance_id,
    report_type: row.report_type,
    platform: row.platform,
    status: String(row.status || '').toLowerCase() || 'pending',
    title: row.category || row.report_type,
    target_user_details: {
      name,
      handle,
      profile_url: row.profile_link || '',
      avatar_url: postedBy.profile_image_url || postedBy.avatar_url || '',
      is_verified: Boolean(postedBy.is_verified),
    },
    content_summary: row.post_description || row.message || '',
    media_links: asArray(row.media_urls),
    post_link: row.post_link || null,
    report_pdf_url: row.report_pdf_url || (row.pdf_base64 ? `/api/reports/${row.id}/pdf` : null),
    informed_to: asObject(row.informed_to),
    generated_at: row.created_at || row.shared_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    unique_code: row.unique_code,
    grievance_id: row.grievance_id,
  };
};

const generateSerialNumber = async (platform, reportType = 'grievance', { db } = {}) => {
  const prisma = dbOf(db);
  // Kept for callers; unique codes are owned by grievance.report.service.
  const prefix = String(reportType || 'G')[0].toUpperCase();
  const p = String(platform || 'x').toUpperCase()[0] || 'X';
  const count = await prisma.social_media_grievance_reports.count({
    where: { platform: String(platform || 'x').toLowerCase() },
  });
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${prefix}-${p}${String(count + 1).padStart(5, '0')}-${dd}${mm}${yyyy}`;
};

/**
 * Escalating catalog alerts into formal notices is not used when reports
 * are grievance-table only. Create G/S/C/Q reports from Grievances UI instead.
 */
const createReportFromAlert = async () => {
  const err = new Error(
    'Formal reports use social_media_grievance_reports. Create them from Grievances (G/S/C/Q), not Mongo alerts.'
  );
  err.status = 400;
  throw err;
};

const getAllReports = async (filters = {}, { db } = {}) => {
  const prisma = dbOf(db);
  const {
    platform,
    status,
    search,
    report_type,
    page = 1,
    limit = 100,
  } = filters;

  const where = {};

  if (platform && platform !== 'all') {
    where.platform = String(platform).toLowerCase();
  }
  if (report_type && report_type !== 'all') {
    where.report_type = String(report_type).toLowerCase();
  }
  if (status && status !== 'all') {
    where.status = String(status).toUpperCase();
  }

  const normalizedSearch = String(search || '').trim();
  if (normalizedSearch) {
    where.OR = [
      { unique_code: { contains: normalizedSearch, mode: 'insensitive' } },
      { post_description: { contains: normalizedSearch, mode: 'insensitive' } },
      { profile_id: { contains: normalizedSearch, mode: 'insensitive' } },
      { category: { contains: normalizedSearch, mode: 'insensitive' } },
      { remarks: { contains: normalizedSearch, mode: 'insensitive' } },
    ];
  }

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
  const skip = (pageNum - 1) * limitNum;

  const [rows, total] = await Promise.all([
    prisma.social_media_grievance_reports.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take: limitNum,
    }),
    prisma.social_media_grievance_reports.count({ where }),
  ]);

  const items = rows.map(toFormalReportShape);

  return {
    items,
    // Flat array also for older clients that expect res.data = []
    ...{ length: items.length },
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.max(Math.ceil(total / limitNum), 1),
    },
  };
};

const updateReport = async (idOrCode, updateData, { db } = {}) => {
  const prisma = dbOf(db);
  const existing = await prisma.social_media_grievance_reports.findFirst({
    where: {
      OR: [{ id: String(idOrCode) }, { unique_code: String(idOrCode) }],
    },
  });
  if (!existing) throw new Error('Report not found');

  const data = {};
  if (updateData.status != null) data.status = String(updateData.status).toUpperCase();
  if (updateData.remarks != null) data.remarks = updateData.remarks;
  if (updateData.message != null) data.message = updateData.message;
  if (updateData.category != null) data.category = updateData.category;
  if (updateData.report_pdf_url != null) data.report_pdf_url = updateData.report_pdf_url;
  if (updateData.pdf_url != null) data.report_pdf_url = updateData.pdf_url;

  const row = await prisma.social_media_grievance_reports.update({
    where: { id: existing.id },
    data,
  });

  await cacheService.invalidatePrefix('reports:stats:v1');
  return toFormalReportShape(row);
};

const getReportStats = async ({ db } = {}) => {
  const prisma = dbOf(db);
  const cacheKey = 'reports:stats:v1:grievance_table';
  const cached = await cacheService.get(cacheKey);
  if (cached) return cached;

  const grouped = await prisma.social_media_grievance_reports.groupBy({
    by: ['platform', 'status'],
    _count: { _all: true },
  });

  const normalizePlatform = (platform) => {
    const p = String(platform || 'unknown').toLowerCase();
    return p === 'x' ? 'twitter' : p;
  };
  const statuses = ['pending', 'escalated', 'closed', 'generated', 'printed', 'sent', 'sent_to_intermediary', 'awaiting_reply'];
  const { resolvePagePlatformSlugs } = require('../../lib/pagePlatforms');
  const tenantSlugs = await resolvePagePlatformSlugs(prisma, 'grievances', {
    includeTwitterAlias: false,
  });
  // Stats buckets from real report rows + tenant grievance platforms (legacy twitter alias for UI).
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

  const byType = await prisma.social_media_grievance_reports.groupBy({
    by: ['report_type'],
    _count: { _all: true },
  });

  const payload = {
    byPlatform,
    byStatus,
    totals,
    byType: Object.fromEntries(byType.map((r) => [r.report_type, r._count._all])),
  };
  await cacheService.set(cacheKey, payload, 30);
  return payload;
};

const finalizeReport = async () => {
  const err = new Error('PDF finalize for grievance reports is handled in the Grievances reports workflow.');
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
};
