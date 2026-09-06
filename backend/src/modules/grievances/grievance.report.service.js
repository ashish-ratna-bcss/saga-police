const { randomUUID } = require('crypto');
const prisma = require('../../../prisma/client');
const { asJson, serialize } = require('./grievance.utils');
const { getCatalogGrievance } = require('./grievance.service');

const REPORT_TYPES = {
  grievance: 'grievance',
  suggestion: 'suggestion',
  criticism: 'criticism',
  query: 'query',
};

const CODE_PREFIX = {
  grievance: 'G',
  suggestion: 'S',
  criticism: 'C',
  query: 'Q',
};

const SEQ_NAME = {
  grievance: 'social_media_grievance_report_seq_g',
  suggestion: 'social_media_grievance_report_seq_s',
  criticism: 'social_media_grievance_report_seq_c',
  query: 'social_media_grievance_report_seq_q',
};

const asObject = (value, fallback = {}) => {
  const parsed = asJson(value, fallback);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
};

const asArray = (value) => (Array.isArray(value) ? value : []);

const platformLetter = (platform) => {
  const p = String(platform || 'x').toLowerCase();
  if (p === 'facebook' || p === 'fb') return 'F';
  if (p === 'whatsapp') return 'W';
  return 'X';
};

/** Atomic code numbers via Postgres SEQUENCE (no counters table). */
const nextUniqueCode = async (reportType, platform = 'x') => {
  const seq = SEQ_NAME[reportType] || SEQ_NAME.grievance;
  const prefix = CODE_PREFIX[reportType] || 'G';
  // Sequence name is from our fixed map only — never user input.
  await prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS ${seq}`);
  const rows = await prisma.$queryRawUnsafe(`SELECT nextval('${seq}') AS seq`);
  const n = Number(rows?.[0]?.seq || 1);
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${prefix}-${platformLetter(platform)}${String(n).padStart(5, '0')}-${dd}${mm}${yyyy}`;
};

const serializeReport = (row) => {
  const meta = asObject(row.meta);
  return serialize({
    ...row,
    posted_by: asObject(row.posted_by),
    engagement: asObject(row.engagement),
    informed_to: asObject(row.informed_to),
    created_by: asObject(row.created_by),
    media_urls: asArray(row.media_urls),
    media_s3_urls: asArray(row.media_s3_urls),
    status_history: asArray(row.status_history),
    meta,
    complainant_logs: asArray(meta.complainant_logs),
    officer_logs: asArray(meta.officer_logs),
    fir_status: meta.fir_status || '',
    fir_number: meta.fir_number || '',
    closing_remarks: meta.closing_remarks || '',
    escalation_message: meta.escalation_message || meta.shared_message || '',
  });
};

const mapWorkflowStatus = (status) => {
  const s = String(status || '').trim().toUpperCase();
  if (s === 'ESCALATED') return 'escalated';
  if (s === 'CLOSED') return 'closed';
  if (s === 'PENDING') return 'pending';
  return String(status || 'pending').toLowerCase() || 'pending';
};

const syncCatalogGrievance = async (grievanceId, reportType, report) => {
  if (!/^\d+$/.test(String(grievanceId))) return;
  const id = BigInt(String(grievanceId));
  const row = await prisma.social_media_grievances.findUnique({ where: { id } });
  if (!row) return;

  const context = asObject(row.context);
  const patch = {
    report_id: report.id,
    unique_code: report.unique_code,
    status: report.status,
    category: report.category,
    shared_at: report.shared_at || null,
    informed_to: asObject(report.informed_to),
  };

  if (reportType === REPORT_TYPES.grievance) context.grievance_workflow = patch;
  if (reportType === REPORT_TYPES.suggestion) context.suggestion = patch;
  if (reportType === REPORT_TYPES.criticism) context.criticism = patch;
  if (reportType === REPORT_TYPES.query) context.query_workflow = patch;

  await prisma.social_media_grievances.update({
    where: { id },
    data: {
      classification: reportType,
      complaint_code: report.unique_code,
      workflow_status: mapWorkflowStatus(report.status),
      context,
    },
  });
};

const resolveCatalogGrievance = async (grievanceId) => {
  const idStr = String(grievanceId || '').trim();
  if (!idStr) {
    const err = new Error('grievance_id is required');
    err.status = 400;
    throw err;
  }
  const row = await getCatalogGrievance(idStr);
  if (!row) {
    const err = new Error('Grievance not found');
    err.status = 404;
    throw err;
  }
  return row;
};

const createOrUpdateReport = async (reportType, body = {}, user = {}) => {
  const type = REPORT_TYPES[reportType] || reportType;
  const grievance = await resolveCatalogGrievance(body.grievance_id);
  const grievanceId = String(grievance.id);
  const platform = body.platform || grievance.platform || 'x';

  const existing = await prisma.social_media_grievance_reports.findUnique({
    where: {
      report_type_grievance_id: {
        report_type: type,
        grievance_id: grievanceId,
      },
    },
  });

  const unique_code =
    existing?.unique_code || (await nextUniqueCode(type, platform));

  const mediaUrls = Array.isArray(body.media_urls)
    ? body.media_urls.filter(Boolean)
    : asArray(existing?.media_urls);
  const mediaS3 = Array.isArray(body.media_s3_urls)
    ? body.media_s3_urls.filter(Boolean)
    : asArray(existing?.media_s3_urls);

  const statusHistory = existing
    ? asArray(existing.status_history)
    : [
        {
          from_status: null,
          to_status: 'PENDING',
          changed_by: user,
          note: 'Report created',
          timestamp: new Date().toISOString(),
        },
      ];

  const data = {
    unique_code,
    platform,
    status: existing?.status || 'PENDING',
    category: body.category || existing?.category || 'Others',
    complaint_phone: body.complaint_phone || existing?.complaint_phone || '',
    profile_id: body.profile_id || grievance.posted_by?.handle || '',
    profile_link: body.profile_link || grievance.posted_by?.profile_url || '',
    post_link: body.post_link || grievance.tweet_url || grievance.url || '',
    post_date: body.post_date
      ? new Date(body.post_date)
      : grievance.post_date
        ? new Date(grievance.post_date)
        : null,
    post_description:
      body.post_description ||
      grievance.content?.full_text ||
      grievance.content?.text ||
      '',
    remarks: body.remarks || '',
    message: body.message || '',
    posted_by: body.posted_by || {
      handle: grievance.posted_by?.handle || '',
      display_name: grievance.posted_by?.display_name || '',
      profile_image_url: grievance.posted_by?.profile_image_url || '',
    },
    engagement: body.engagement || grievance.engagement || {},
    created_by: existing?.created_by || user,
    media_urls: mediaUrls,
    media_s3_urls: mediaS3,
    status_history: statusHistory,
  };

  let row;
  if (existing) {
    row = await prisma.social_media_grievance_reports.update({
      where: { id: existing.id },
      data,
    });
  } else {
    row = await prisma.social_media_grievance_reports.create({
      data: {
        id: randomUUID(),
        report_type: type,
        grievance_id: grievanceId,
        ...data,
      },
    });
  }

  await syncCatalogGrievance(grievanceId, type, row);
  return { report: serializeReport(row), created: !existing };
};

const findReport = async (idOrCode, reportType = null) => {
  const key = String(idOrCode || '').trim();
  if (!key) return null;
  const where = reportType
    ? {
        OR: [
          { id: key, report_type: reportType },
          { unique_code: key, report_type: reportType },
        ],
      }
    : { OR: [{ id: key }, { unique_code: key }] };
  const row = await prisma.social_media_grievance_reports.findFirst({ where });
  return row ? serializeReport(row) : null;
};

const shareReport = async (idOrCode, body = {}, reportType = null) => {
  const existing = await prisma.social_media_grievance_reports.findFirst({
    where: reportType
      ? {
          OR: [
            { id: String(idOrCode), report_type: reportType },
            { unique_code: String(idOrCode), report_type: reportType },
          ],
        }
      : {
          OR: [{ id: String(idOrCode) }, { unique_code: String(idOrCode) }],
        },
  });
  if (!existing) {
    const err = new Error('Report not found');
    err.status = 404;
    throw err;
  }
  if (existing.status === 'CLOSED') {
    const err = new Error('Closed report cannot be shared');
    err.status = 400;
    throw err;
  }

  const targetStatus =
    body.set_status === 'ESCALATED' ? 'ESCALATED' : existing.status;
  const history = asArray(existing.status_history);
  if (targetStatus !== existing.status) {
    history.push({
      from_status: existing.status,
      to_status: targetStatus,
      changed_by: body.changed_by || {},
      note: 'Shared via WhatsApp',
      timestamp: new Date().toISOString(),
    });
  }

  const row = await prisma.social_media_grievance_reports.update({
    where: { id: existing.id },
    data: {
      informed_to: {
        name: body.contact_name || '',
        phone: body.contact_phone || '',
        department: body.contact_department || '',
      },
      shared_at: new Date(),
      action_taken_at: new Date(),
      shared_via: 'whatsapp',
      status: targetStatus,
      escalated_at: targetStatus === 'ESCALATED' ? new Date() : existing.escalated_at,
      status_history: history,
      meta: {
        ...asObject(existing.meta),
        ...(body.shared_message ? { shared_message: body.shared_message } : {}),
      },
    },
  });

  await syncCatalogGrievance(row.grievance_id, row.report_type, row);
  return serializeReport(row);
};

const closeReport = async (idOrCode, body = {}, reportType = REPORT_TYPES.grievance) => {
  const existing = await prisma.social_media_grievance_reports.findFirst({
    where: {
      OR: [
        { id: String(idOrCode), report_type: reportType },
        { unique_code: String(idOrCode), report_type: reportType },
      ],
    },
  });
  if (!existing) {
    const err = new Error('Report not found');
    err.status = 404;
    throw err;
  }

  const history = asArray(existing.status_history);
  history.push({
    from_status: existing.status,
    to_status: 'CLOSED',
    changed_by: body.changed_by || {},
    note: body.closing_remarks || 'Closed',
    timestamp: new Date().toISOString(),
  });

  const row = await prisma.social_media_grievance_reports.update({
    where: { id: existing.id },
    data: {
      status: 'CLOSED',
      closed_at: new Date(),
      status_history: history,
      meta: {
        ...asObject(existing.meta),
        closing_remarks: body.closing_remarks || '',
        final_reply_to_user: body.final_reply_to_user || '',
        operator_reply: body.operator_reply || '',
        final_communication: body.final_communication || '',
      },
    },
  });

  await syncCatalogGrievance(row.grievance_id, row.report_type, row);
  return serializeReport(row);
};

const updateReportStatus = async (
  idOrCode,
  status,
  reportType = REPORT_TYPES.grievance,
  changedBy = {}
) => {
  const allowed = ['PENDING', 'ESCALATED', 'CLOSED'];
  const next = String(status || '').toUpperCase();
  if (!allowed.includes(next)) {
    const err = new Error('Invalid status');
    err.status = 400;
    throw err;
  }

  const existing = await prisma.social_media_grievance_reports.findFirst({
    where: {
      OR: [
        { id: String(idOrCode), report_type: reportType },
        { unique_code: String(idOrCode), report_type: reportType },
      ],
    },
  });
  if (!existing) {
    const err = new Error('Report not found');
    err.status = 404;
    throw err;
  }

  if (existing.status === next) return serializeReport(existing);

  const history = asArray(existing.status_history);
  history.push({
    from_status: existing.status,
    to_status: next,
    changed_by: changedBy,
    note: `Status changed to ${next}`,
    timestamp: new Date().toISOString(),
  });

  const row = await prisma.social_media_grievance_reports.update({
    where: { id: existing.id },
    data: {
      status: next,
      status_history: history,
      escalated_at: next === 'ESCALATED' ? new Date() : existing.escalated_at,
      closed_at: next === 'CLOSED' ? new Date() : existing.closed_at,
    },
  });

  await syncCatalogGrievance(row.grievance_id, row.report_type, row);
  return serializeReport(row);
};

const updateReportDetails = async (idOrCode, body = {}, reportType = REPORT_TYPES.grievance) => {
  const existing = await prisma.social_media_grievance_reports.findFirst({
    where: {
      OR: [
        { id: String(idOrCode), report_type: reportType },
        { unique_code: String(idOrCode), report_type: reportType },
      ],
    },
  });
  if (!existing) {
    const err = new Error('Report not found');
    err.status = 404;
    throw err;
  }

  const meta = { ...asObject(existing.meta) };
  if (body.complainant_logs != null) meta.complainant_logs = body.complainant_logs;
  if (body.officer_logs != null) meta.officer_logs = body.officer_logs;

  const row = await prisma.social_media_grievance_reports.update({
    where: { id: existing.id },
    data: {
      meta,
      ...(body.message != null ? { message: body.message } : {}),
      ...(body.remarks != null ? { remarks: body.remarks } : {}),
      ...(body.category != null ? { category: body.category } : {}),
      ...(body.complaint_phone != null ? { complaint_phone: body.complaint_phone } : {}),
    },
  });

  return serializeReport({
    ...row,
    complainant_logs: asArray(meta.complainant_logs),
    officer_logs: asArray(meta.officer_logs),
  });
};

const listReports = async (reportType, query = {}) => {
  const baseWhere = { report_type: reportType };

  if (query.platform && query.platform !== 'all') {
    baseWhere.platform = String(query.platform).toLowerCase();
  }
  if (query.category && query.category !== 'all') {
    baseWhere.category = String(query.category);
  }
  if (query.from || query.to) {
    baseWhere.post_date = {};
    if (query.from) baseWhere.post_date.gte = new Date(query.from);
    if (query.to) {
      const end = new Date(query.to);
      end.setHours(23, 59, 59, 999);
      baseWhere.post_date.lte = end;
    }
  }
  if (query.search) {
    const s = String(query.search).trim();
    if (s) {
      baseWhere.OR = [
        { unique_code: { contains: s, mode: 'insensitive' } },
        { post_description: { contains: s, mode: 'insensitive' } },
        { remarks: { contains: s, mode: 'insensitive' } },
        { complaint_phone: { contains: s, mode: 'insensitive' } },
        { profile_id: { contains: s, mode: 'insensitive' } },
        { category: { contains: s, mode: 'insensitive' } },
      ];
    }
  }

  const statusRaw = query.status ? String(query.status).toUpperCase() : '';
  const where = { ...baseWhere };
  if (statusRaw && statusRaw !== 'ALL') {
    if (statusRaw === 'FIR') {
      // FIR is stored in meta, not as a primary status
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { meta: { path: ['fir_status'], string_contains: 'Yes' } },
            { meta: { path: ['fir_number'], not: '' } },
          ],
        },
      ];
    } else {
      where.status = statusRaw;
    }
  }

  const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10) || 20));
  const skip = (page - 1) * limit;

  const sortKey = String(query.sort || 'created_at');
  const order = String(query.order || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
  const orderByField =
    sortKey === 'post_date' || sortKey === 'status' || sortKey === 'category' || sortKey === 'created_at'
      ? sortKey
      : 'created_at';

  const [total, rows, grouped, firCount] = await Promise.all([
    prisma.social_media_grievance_reports.count({ where }),
    prisma.social_media_grievance_reports.findMany({
      where,
      orderBy: { [orderByField]: order },
      skip,
      take: limit,
    }),
    // Stats ignore status chip filter so chips stay meaningful
    prisma.social_media_grievance_reports.groupBy({
      by: ['status'],
      where: baseWhere,
      _count: { _all: true },
    }),
    prisma.social_media_grievance_reports.count({
      where: {
        ...baseWhere,
        OR: [
          { meta: { path: ['fir_status'], string_contains: 'Yes' } },
          { meta: { path: ['fir_number'], not: '' } },
        ],
      },
    }),
  ]);

  const byStatus = Object.fromEntries(
    grouped.map((g) => [String(g.status || '').toUpperCase(), g._count._all])
  );

  const stats = {
    total: grouped.reduce((sum, g) => sum + g._count._all, 0),
    pending: byStatus.PENDING || 0,
    escalated: byStatus.ESCALATED || 0,
    closed: byStatus.CLOSED || 0,
    fir: firCount || 0,
  };

  return {
    reports: rows.map(serializeReport),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    stats,
  };
};

const listContacts = async () => {
  const rows = await prisma.social_media_grievance_contacts.findMany({
    where: { is_active: true },
    orderBy: { name: 'asc' },
  });
  return serialize(rows);
};

const addContact = async (body = {}) => {
  if (!body.name || !body.phone) {
    const err = new Error('name and phone are required');
    err.status = 400;
    throw err;
  }
  const row = await prisma.social_media_grievance_contacts.create({
    data: {
      id: randomUUID(),
      name: String(body.name).trim(),
      phone: String(body.phone).trim(),
      department: String(body.department || '').trim(),
      designation: String(body.designation || '').trim(),
      is_active: true,
    },
  });
  return serialize(row);
};

const updateContact = async (id, body = {}) => {
  try {
    const row = await prisma.social_media_grievance_contacts.update({
      where: { id: String(id) },
      data: {
        ...(body.name != null ? { name: String(body.name).trim() } : {}),
        ...(body.phone != null ? { phone: String(body.phone).trim() } : {}),
        ...(body.department != null
          ? { department: String(body.department).trim() }
          : {}),
        ...(body.designation != null
          ? { designation: String(body.designation).trim() }
          : {}),
        ...(body.is_active != null ? { is_active: Boolean(body.is_active) } : {}),
      },
    });
    return serialize(row);
  } catch (error) {
    if (error.code === 'P2025') {
      const err = new Error('Contact not found');
      err.status = 404;
      throw err;
    }
    throw error;
  }
};

const deleteContact = async (id) => {
  try {
    await prisma.social_media_grievance_contacts.update({
      where: { id: String(id) },
      data: { is_active: false },
    });
    return { ok: true };
  } catch (error) {
    if (error.code === 'P2025') {
      const err = new Error('Contact not found');
      err.status = 404;
      throw err;
    }
    throw error;
  }
};

module.exports = {
  REPORT_TYPES,
  createOrUpdateReport,
  findReport,
  shareReport,
  closeReport,
  updateReportStatus,
  updateReportDetails,
  listReports,
  listContacts,
  addContact,
  updateContact,
  deleteContact,
  nextUniqueCode,
};
