const prisma = require('../../../prisma/client');
const { hydrateOccasion, asJson } = require('./event.utils');

const OCCASION_ORIGIN = 'master_calendar';

const MONTHS = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};

/** Parse labels like "6 September", "06 Sep 2026". */
const parseFlexibleDate = (label, year = new Date().getFullYear()) => {
  if (!label) return null;
  const s = String(label).trim();
  const m = s.match(/^(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{4}))?$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = MONTHS[m[2].toLowerCase()];
  const y = m[3] ? Number(m[3]) : year;
  if (!day || month == null || !y) return null;
  const d = new Date(y, month, day);
  return Number.isNaN(d.getTime()) ? null : d;
};

const splitRange = (range) => {
  if (!range) return { from: '', to: '' };
  const parts = String(range)
    .split(/\s*[–—-]\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  return { from: parts[0] || '', to: parts[1] || '' };
};

const keywordsFromSuggested = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return asJson(raw, []);
  return String(raw)
    .split(/[,\n;]/)
    .map((k) => k.trim())
    .filter(Boolean)
    .map((keyword) => ({ keyword, language: 'all' }));
};

/** Build start/end for this year's monitoring window from occasion labels. */
const datesFromOccasion = (row) => {
  const year = new Date().getFullYear();
  const { from, to } = splitRange(row.monitoring_range);
  const anchor = parseFlexibleDate(row.date_label, year);
  let start =
    parseFlexibleDate(from, year) ||
    anchor;
  let end =
    parseFlexibleDate(to, year) ||
    (from && !to ? parseFlexibleDate(from, year) : null) ||
    anchor ||
    start;
  if (start && end && end < start) {
    const tmp = start;
    start = end;
    end = tmp;
  }
  return { start_date: start, end_date: end };
};

const ensureLinkedEvent = async (occasionRow) => {
  if (!occasionRow?.id) return null;

  const name = String(occasionRow.title || '').trim();
  if (!name) return null;

  const origin = occasionRow.is_recurring ? OCCASION_ORIGIN : 'manual';

  let existing = await prisma.social_media_events.findFirst({
    where: { occasion_calendar_id: occasionRow.id },
  });

  // Reuse a same-named unlinked event instead of creating a duplicate
  if (!existing) {
    existing = await prisma.social_media_events.findFirst({
      where: {
        occasion_calendar_id: null,
        name: { equals: name, mode: 'insensitive' },
      },
      orderBy: { id: 'asc' },
    });
  }

  const { start_date, end_date } = datesFromOccasion(occasionRow);
  const keywords = keywordsFromSuggested(occasionRow.suggested_keywords);
  const platforms =
    Array.isArray(occasionRow.platforms) && occasionRow.platforms.length
      ? occasionRow.platforms.map((p) => String(p).toLowerCase())
      : ['x', 'facebook', 'youtube', 'instagram'];

  if (existing) {
    return prisma.social_media_events.update({
      where: { id: existing.id },
      data: {
        name,
        start_date,
        end_date,
        platforms,
        keywords: keywords.length ? keywords : existing.keywords,
        origin,
        occasion_calendar_id: occasionRow.id,
        description: occasionRow.remarks || existing.description || '',
      },
    });
  }

  return prisma.social_media_events.create({
    data: {
      name,
      description: occasionRow.remarks || '',
      start_date,
      end_date,
      location: '',
      platforms,
      keywords,
      polling_interval_minutes: 60,
      monitoring_status: 'stopped',
      monitoring_logs: [],
      last_fetched_history: [],
      origin,
      occasion_calendar_id: occasionRow.id,
      created_by: 'system',
    },
  });
};

const listOccasions = async ({ recurring } = {}) => {
  const where = {};
  if (recurring === 'true' || recurring === true) where.is_recurring = true;
  else if (recurring === 'false' || recurring === false) where.is_recurring = false;

  const rows = await prisma.social_media_occasion_calendar.findMany({
    where,
    orderBy: [{ sl_no: 'asc' }, { created_at: 'desc' }],
  });

  // Backfill: occasions without a linked monitoring event
  for (const row of rows) {
    const linked = await prisma.social_media_events.findFirst({
      where: { occasion_calendar_id: row.id },
      select: { id: true },
    });
    if (!linked) {
      try {
        await ensureLinkedEvent(row);
      } catch (_) {
        /* ignore backfill errors */
      }
    }
  }

  return rows.map(hydrateOccasion);
};

const createOccasion = async (body) => {
  const title = body.occasion || body.title;
  const date_label = body.date || body.date_label;
  if (!title || !date_label) {
    const err = new Error('Occasion title and date are required');
    err.status = 400;
    throw err;
  }
  const is_recurring = Boolean(body.isRecurring ?? body.is_recurring);
  const platforms = Array.isArray(body.platforms) && body.platforms.length
    ? body.platforms.map((p) => String(p).toLowerCase())
    : ['x', 'youtube', 'facebook', 'instagram'];
  const max = await prisma.social_media_occasion_calendar.findFirst({
    where: { is_recurring },
    orderBy: { sl_no: 'desc' },
    select: { sl_no: true },
  });
  const row = await prisma.social_media_occasion_calendar.create({
    data: {
      sl_no: (max?.sl_no || 0) + 1,
      title: String(title).trim(),
      date_label: String(date_label).trim(),
      monitoring_range: body.monitoringRange || body.monitoring_range || '',
      suggested_keywords: body.keywords || body.suggested_keywords || '',
      remarks: body.remarks || '',
      platforms,
      is_recurring,
    },
  });

  try {
    await ensureLinkedEvent(row);
  } catch (_) {
    /* occasion saved even if link fails */
  }

  return hydrateOccasion(row);
};

const updateOccasion = async (id, body) => {
  const data = {};
  if (body.occasion != null || body.title != null) data.title = body.occasion || body.title;
  if (body.date != null || body.date_label != null) data.date_label = body.date || body.date_label;
  if (body.monitoringRange != null || body.monitoring_range != null) {
    data.monitoring_range = body.monitoringRange ?? body.monitoring_range;
  }
  if (body.keywords != null || body.suggested_keywords != null) {
    data.suggested_keywords = body.keywords ?? body.suggested_keywords;
  }
  if (body.remarks != null) data.remarks = body.remarks;
  if (body.platforms != null) {
    data.platforms = Array.isArray(body.platforms) && body.platforms.length
      ? body.platforms.map((p) => String(p).toLowerCase())
      : ['x', 'youtube', 'facebook', 'instagram'];
  }
  if (body.isRecurring != null || body.is_recurring != null) {
    data.is_recurring = Boolean(body.isRecurring ?? body.is_recurring);
  }
  if (body.slNo != null || body.sl_no != null) data.sl_no = Number(body.slNo ?? body.sl_no);

  try {
    const row = await prisma.social_media_occasion_calendar.update({
      where: { id: Number(id) },
      data,
    });
    try {
      await ensureLinkedEvent(row);
    } catch (_) {
      /* ignore */
    }
    return hydrateOccasion(row);
  } catch {
    const err = new Error('Occasion not found');
    err.status = 404;
    throw err;
  }
};

const deleteOccasion = async (id) => {
  try {
    // Unlink + keep media history; never auto-start monitoring
    await prisma.social_media_events.updateMany({
      where: { occasion_calendar_id: Number(id) },
      data: { occasion_calendar_id: null, origin: 'manual', monitoring_status: 'stopped' },
    });
    await prisma.social_media_occasion_calendar.delete({ where: { id: Number(id) } });
    return true;
  } catch {
    const err = new Error('Occasion not found');
    err.status = 404;
    throw err;
  }
};

module.exports = {
  listOccasions,
  createOccasion,
  updateOccasion,
  deleteOccasion,
  ensureLinkedEvent,
  OCCASION_ORIGIN,
};
