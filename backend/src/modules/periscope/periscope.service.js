const dbOf = require('../../lib/dbOf');
const { getTenantPrisma } = require('../../lib/tenantDatabase.service');
const logger = require('../../lib/logger');
const { getDayOfWeek, normalizeDateStr } = require('./periscope.docx.service');

function resolvePrisma(db) {
  if (typeof db === 'string') return getTenantPrisma(db);
  return dbOf(db);
}

/** Ensure the table exists in this tenant DB (safety idempotent check) */
async function ensureTable(db) {
  const prisma = resolvePrisma(db);
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS social_media_periscope_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        report_date DATE NOT NULL,
        day_of_week VARCHAR(20) NOT NULL,
        title VARCHAR(255) NOT NULL,
        organization VARCHAR(255) NOT NULL DEFAULT 'SPECIAL BRANCH POLICE',
        status VARCHAR(50) NOT NULL DEFAULT 'draft',
        programmes JSONB NOT NULL DEFAULT '[]'::jsonb,
        abstract JSONB NOT NULL DEFAULT '[]'::jsonb,
        notes TEXT NULL,
        created_by VARCHAR(100) NULL,
        created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT periscope_reports_date_key UNIQUE (report_date)
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS periscope_reports_date_idx ON social_media_periscope_reports (report_date DESC)
    `);
  } catch (err) {
    logger.warn(`[PeriscopeService] ensureTable error (ignorable if exists): ${err.message}`);
  }
}

/** Compute Abstract of Programmes summary from array of programmes */
function computeAbstract(programmes = []) {
  const counts = {};
  programmes.forEach((p) => {
    const cat = (p.category || 'Other Programmes').trim();
    counts[cat] = (counts[cat] || 0) + 1;
  });
  let idx = 1;
  return Object.entries(counts).map(([cat, count]) => ({
    sl_no: idx++,
    category: `${cat} - ${String(count).padStart(2, '0')}`,
    count,
  }));
}

/**
 * Get or initialize a Periscope DSR report for a given date.
 */
async function getReportByDate(dateStr, { db, tenantName = '' } = {}) {
  const prisma = resolvePrisma(db);
  await ensureTable(db);

  const cleanDate = normalizeDateStr(dateStr) || new Date().toISOString().split('T')[0];
  const [yyyy, mm, dd] = cleanDate.split('-');
  const formattedDate = `${dd}.${mm}.${yyyy}`;
  const dayOfWeek = getDayOfWeek(cleanDate);

  const defaultOrg = tenantName || '';

  const rows = await prisma.$queryRawUnsafe(
    `SELECT * FROM social_media_periscope_reports WHERE report_date = $1::date LIMIT 1`,
    cleanDate
  );

  if (rows && rows.length > 0) {
    const row = rows[0];
    return {
      id: row.id,
      report_date: cleanDate,
      day_of_week: row.day_of_week,
      title: row.title,
      organization: row.organization || defaultOrg,
      status: row.status,
      programmes: row.programmes || [],
      abstract: row.abstract || computeAbstract(row.programmes || []),
      notes: row.notes || '',
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
      is_new: false,
    };
  }

  // Return draft template if not yet saved
  return {
    id: null,
    report_date: cleanDate,
    day_of_week: dayOfWeek,
    title: defaultOrg
      ? `${defaultOrg} PERISCOPE REPORT FOR ${formattedDate} (${dayOfWeek})`
      : `PERISCOPE REPORT FOR ${formattedDate} (${dayOfWeek})`,
    organization: defaultOrg,
    status: 'draft',
    programmes: [],
    abstract: [],
    notes: '',
    is_new: true,
  };
}

/**
 * Save or update a Periscope DSR report.
 */
async function saveReport(payload, { db, user } = {}) {
  const prisma = resolvePrisma(db);
  await ensureTable(db);

  const reportDate = normalizeDateStr(payload.report_date) || new Date().toISOString().split('T')[0];
  const dayOfWeek = payload.day_of_week || getDayOfWeek(reportDate);
  const [yyyy, mm, dd] = reportDate.split('-');
  const formattedDate = `${dd}.${mm}.${yyyy}`;

  const title =
    payload.title || `PERISCOPE REPORT OF SPECIAL BRANCH FOR THE DAY ${formattedDate} (${dayOfWeek})`;
  const org = payload.organization || 'SPECIAL BRANCH POLICE';
  const status = payload.status || 'draft';
  const programmes = Array.isArray(payload.programmes) ? payload.programmes : [];
  const abstract =
    Array.isArray(payload.abstract) && payload.abstract.length > 0
      ? payload.abstract
      : computeAbstract(programmes);
  const notes = payload.notes || '';
  const createdBy =
    payload.created_by ||
    user?.full_name ||
    user?.name ||
    user?.username ||
    user?.email ||
    'officer';

  const rows = await prisma.$queryRawUnsafe(
    `
    INSERT INTO social_media_periscope_reports (
      report_date, day_of_week, title, organization, status, programmes, abstract, notes, created_by, updated_at
    )
    VALUES ($1::date, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, NOW())
    ON CONFLICT (report_date) DO UPDATE SET
      day_of_week = EXCLUDED.day_of_week,
      title = EXCLUDED.title,
      organization = EXCLUDED.organization,
      status = EXCLUDED.status,
      programmes = EXCLUDED.programmes,
      abstract = EXCLUDED.abstract,
      notes = EXCLUDED.notes,
      created_by = COALESCE(EXCLUDED.created_by, social_media_periscope_reports.created_by),
      updated_at = NOW()
    RETURNING *;
    `,
    reportDate,
    dayOfWeek,
    title,
    org,
    status,
    JSON.stringify(programmes),
    JSON.stringify(abstract),
    notes,
    createdBy
  );

  return rows[0];
}

/**
 * List past reports with pagination.
 */
async function listReports({ page = 1, limit = 20, search = '' } = {}, { db } = {}) {
  const prisma = resolvePrisma(db);
  await ensureTable(db);

  const offset = (Math.max(1, Number(page)) - 1) * Math.max(1, Number(limit));
  const l = Math.max(1, Number(limit));

  let whereClause = '';
  const params = [];

  if (search && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    whereClause = `WHERE LOWER(title) LIKE $1 OR LOWER(organization) LIKE $1`;
  }

  const countQuery = `SELECT COUNT(*) as total FROM social_media_periscope_reports ${whereClause}`;
  const totalRows = await prisma.$queryRawUnsafe(countQuery, ...params);
  const total = Number(totalRows?.[0]?.total || 0);

  const dataQuery = `
    SELECT id, report_date, day_of_week, title, organization, status,
           jsonb_array_length(programmes) as programme_count,
           jsonb_array_length(programmes) as programmes_count,
           created_by, created_at, updated_at
    FROM social_media_periscope_reports
    ${whereClause}
    ORDER BY report_date DESC
    LIMIT ${l} OFFSET ${offset}
  `;
  const reports = await prisma.$queryRawUnsafe(dataQuery, ...params);

  return {
    reports,
    total,
    page: Number(page),
    limit: l,
    totalPages: Math.ceil(total / l),
  };
}

/**
 * Import monitored social media events for a given date into Periscope programme items.
 */
async function importEventsForDate(dateStr, { db } = {}) {
  const prisma = resolvePrisma(db);
  const cleanDate = normalizeDateStr(dateStr) || new Date().toISOString().split('T')[0];
  const startOfDay = new Date(`${cleanDate}T00:00:00.000Z`);
  const endOfDay = new Date(`${cleanDate}T23:59:59.999Z`);

  const results = [];

  try {
    // 1. Fetch from social_media_event_media
    if (prisma.social_media_event_media) {
      const mediaItems = await prisma.social_media_event_media.findMany({
        where: {
          posted_at: { gte: startOfDay, lte: endOfDay },
        },
        include: {
          event: true,
        },
        take: 50,
      });

      mediaItems.forEach((m, idx) => {
        const text = String(m.text || '').trim();
        const snippet = text.slice(0, 300);
        results.push({
          id: `imp-media-${m.id}`,
          sl_no: idx + 1,
          category: 'Other Programmes',
          zone: m.event?.location || 'State Wide',
          name: m.event?.name || snippet.slice(0, 60) || 'Monitored Social Event',
          police_station_place: m.event?.location || 'Jurisdiction PS',
          organizer: m.author_name || (m.platform ? `${m.platform.toUpperCase()} User` : 'Public'),
          expected_members: 'Not specified',
          time: cleanDate,
          gist: snippet,
          permission_status: 'Publicly reported',
          comments: `Discovered via ${m.platform || 'social media'} event monitoring.`,
        });
      });
    }

    // 2. Fetch from social_media_events scheduled on that date
    if (prisma.social_media_events) {
      const scheduledEvents = await prisma.social_media_events.findMany({
        where: {
          start_date: { gte: startOfDay, lte: endOfDay },
        },
        take: 30,
      });

      scheduledEvents.forEach((ev) => {
        if (!results.some((r) => r.name === ev.name)) {
          results.push({
            id: `imp-ev-${ev.id}`,
            sl_no: results.length + 1,
            category: 'Government Programmes, VIP/Ministerial Programmes',
            zone: ev.location || 'State Wide',
            name: ev.name,
            police_station_place: ev.location || 'Local PS',
            organizer: 'Government / Official Organizers',
            expected_members: 'Not specified',
            time: cleanDate,
            gist: ev.description || ev.name,
            permission_status: 'Government Programme',
            comments: 'Scheduled event in Occasion Calendar.',
          });
        }
      });
    }
  } catch (err) {
    logger.warn(`[PeriscopeService] importEvents error: ${err.message}`);
  }

  return results;
}

/**
 * Delete a report by ID or date.
 */
async function deleteReport(id, { db } = {}) {
  const prisma = resolvePrisma(db);
  await ensureTable(db);
  const idStr = String(id || '').trim();
  const isDate = /^\d{4}-\d{2}-\d{2}/.test(idStr);
  if (isDate) {
    const dateOnly = idStr.split('T')[0];
    await prisma.$executeRawUnsafe(
      `DELETE FROM social_media_periscope_reports WHERE report_date = $1::date`,
      dateOnly
    );
  } else {
    await prisma.$executeRawUnsafe(
      `DELETE FROM social_media_periscope_reports WHERE id = $1::uuid`,
      idStr
    );
  }
  return { ok: true };
}

/**
 * Get active or latest Periscope programmes for dashboard live feed.
 */
async function getFeed({ limit = 40 } = {}, { db, tenantName = '' } = {}) {
  const prisma = resolvePrisma(db);
  await ensureTable(db);
  const today = new Date().toISOString().split('T')[0];

  // Check today's report first
  const todayRows = await prisma.$queryRawUnsafe(
    `SELECT * FROM social_media_periscope_reports WHERE report_date = $1::date LIMIT 1`,
    today
  );

  let programmes = [];
  let reportDate = today;
  let organization = tenantName || '';

  if (
    todayRows &&
    todayRows.length > 0 &&
    Array.isArray(todayRows[0].programmes) &&
    todayRows[0].programmes.length > 0
  ) {
    programmes = todayRows[0].programmes;
    reportDate = today;
    organization = todayRows[0].organization || tenantName;
  } else {
    // If today is empty, fetch the most recent report that has programmes
    const recentRows = await prisma.$queryRawUnsafe(
      `SELECT * FROM social_media_periscope_reports 
       WHERE jsonb_array_length(programmes) > 0 
       ORDER BY report_date DESC LIMIT 1`
    );
    if (recentRows && recentRows.length > 0) {
      const cleanDate = normalizeDateStr(recentRows[0].report_date);
      programmes = recentRows[0].programmes || [];
      reportDate = cleanDate || today;
      organization = recentRows[0].organization || tenantName;
    }
  }

  // Ensure default priority on items
  const normalized = programmes.map((p, idx) => ({
    ...p,
    sl_no: p.sl_no || idx + 1,
    priority: p.priority || 'Low',
  }));

  return {
    report_date: reportDate,
    organization,
    total: normalized.length,
    programmes: normalized.slice(0, Number(limit) || 40),
  };
}

module.exports = {
  ensureTable,
  getReportByDate,
  saveReport,
  listReports,
  getFeed,
  importEventsForDate,
  deleteReport,
  computeAbstract,
};

