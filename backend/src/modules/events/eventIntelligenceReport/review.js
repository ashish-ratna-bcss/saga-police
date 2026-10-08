/**
 * Review of a generated event report: a person edits the opening text and the actions, then approves it.
 * The edits are stored with the saved summary (stats.review.edits) and applied on top of the generated analysis every time
 * the PDF is made, so the generated text is never overwritten. Regenerating the report starts a new draft.
 */
const dbOf = require('../../../lib/dbOf');
const { normalizeReview } = require('../../../services/SummaryLLM/reviewState');

const httpError = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });
const one = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
const para = (v, max) => String(v == null ? '' : v).replace(/[ \t]+/g, ' ').trim().slice(0, max);
const postList = (v) => (Array.isArray(v) ? v : []).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 12);

/**
 * Validates what a reviewer sent. Only the fields below can be edited; everything else is ignored.
 * A list that is present replaces the generated list as a whole, so a reviewer can also delete an item.
 */
const cleanEdits = (raw) => {
  const r = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  if (r.bottomLine !== undefined) out.bottomLine = para(r.bottomLine, 1500);
  if (r.issueLink !== undefined) out.issueLink = one(r.issueLink, 300);
  if (Array.isArray(r.actions)) {
    out.actions = r.actions.slice(0, 8).map((a) => ({ action: one(a?.action, 200), detail: para(a?.detail, 900), posts: postList(a?.posts) })).filter((a) => a.action);
  }
  if (Array.isArray(r.known)) out.known = r.known.slice(0, 8).map((k) => ({ text: one(typeof k === 'string' ? k : k?.text, 260), posts: postList(k?.posts) })).filter((k) => k.text);
  if (Array.isArray(r.notKnown)) out.notKnown = r.notKnown.slice(0, 8).map((t) => one(typeof t === 'string' ? t : t?.text, 220)).filter(Boolean);
  if (Array.isArray(r.strands)) {
    out.strands = r.strands.slice(0, 4).map((x) => ({ title: one(x?.title, 80), who: one(x?.who, 160), demand: one(x?.demand, 300), status: one(x?.status, 160), posts: postList(x?.posts) })).filter((x) => x.title);
  }
  return out;
};

/** Returns the analysis with the reviewer's edits on top. Post numbers that are not in the evidence are dropped. */
const applyEdits = (analysis, edits, validNs = null) => {
  if (!analysis) return analysis;
  const e = edits && typeof edits === 'object' ? edits : {};
  const keep = (posts) => (validNs ? (posts || []).filter((n) => validNs.has(n)) : (posts || []));
  const out = { ...analysis };
  if (e.bottomLine !== undefined) out.bottomLine = e.bottomLine;
  if (e.issueLink !== undefined) out.issueLink = e.issueLink;
  if (e.actions) out.actions = e.actions.map((a) => ({ ...a, posts: keep(a.posts) }));
  if (e.known) out.known = e.known.map((k) => ({ ...k, posts: keep(k.posts) }));
  if (e.notKnown) out.notKnown = e.notKnown;
  if (e.strands) out.issueStrands = e.strands.map((x) => ({ ...x, posts: keep(x.posts) }));
  return out;
};

const loadRow = async (prisma, eventId) => {
  const id = Number(eventId);
  if (!Number.isFinite(id) || id <= 0) throw httpError(400, 'Invalid event ID');
  const row = await prisma.social_media_event_summaries.findUnique({ where: { event_id: id } });
  if (!row) throw httpError(404, 'No report has been generated for this event yet');
  return { id, row };
};

const reviewOf = (row) => normalizeReview(row.stats && row.stats.review, { preparedBy: row.generated_by_name || '', preparedAt: row.generated_at });
const who = (user) => (user ? (user.name || user.username || String(user.id || 'user')) : 'user');
const note = (review, user, event, text = '') => ({ ...review, history: [...review.history, { at: new Date().toISOString(), by: who(user), event, note: text }].slice(-50) });

const writeReview = async (prisma, id, row, review) => {
  const stats = { ...(row.stats || {}), review };
  await prisma.social_media_event_summaries.update({ where: { event_id: id }, data: { stats: JSON.parse(JSON.stringify(stats)) } });
  return review;
};

/** Reads the review state. */
const getReview = async (eventId, { db } = {}) => {
  const prisma = dbOf(db);
  const { row } = await loadRow(prisma, eventId);
  return reviewOf(row);
};

/** Saves the reviewer's edits. Any edit puts an approved report back to draft, because the approved text changed. */
const saveEdits = async (eventId, rawEdits, user, { db } = {}) => {
  const prisma = dbOf(db);
  const { id, row } = await loadRow(prisma, eventId);
  const cur = reviewOf(row);
  const next = note({ ...cur, status: 'draft', approvedBy: '', approvedAt: null, acknowledged: [], edits: cleanEdits(rawEdits), reviewedBy: who(user) }, user, 'edited', cur.status === 'approved' ? 'Edited after approval; back to draft' : '');
  return writeReview(prisma, id, row, next);
};

/**
 * Approves the report. Errors found by the quality check must be fixed, or each one acknowledged by code, first.
 * `quality` is computed by the caller from the text as it will be printed (generated text plus the reviewer's edits).
 */
const approve = async (eventId, user, { db, quality = { issues: [] }, acknowledge = [] } = {}) => {
  const prisma = dbOf(db);
  const { id, row } = await loadRow(prisma, eventId);
  const cur = reviewOf(row);
  const ack = new Set((Array.isArray(acknowledge) ? acknowledge : []).map(String));
  const blocking = (quality.issues || []).filter((i) => i.level === 'error' && !ack.has(i.code));
  if (blocking.length) throw httpError(409, 'Fix these problems, or acknowledge them, before approving.', { issues: blocking });
  const stamp = new Date().toISOString();
  const next = note({ ...cur, status: 'approved', approvedBy: who(user), approvedAt: stamp, reviewedBy: cur.reviewedBy || who(user), acknowledged: [...ack] }, user, 'approved', ack.size ? `Acknowledged: ${[...ack].join(', ')}` : '');
  return writeReview(prisma, id, row, next);
};

/** Puts an approved report back to draft, keeping the edits. */
const reopen = async (eventId, user, { db } = {}) => {
  const prisma = dbOf(db);
  const { id, row } = await loadRow(prisma, eventId);
  const cur = reviewOf(row);
  return writeReview(prisma, id, row, note({ ...cur, status: 'draft', approvedBy: '', approvedAt: null, acknowledged: [] }, user, 'reopened'));
};

module.exports = { cleanEdits, applyEdits, getReview, saveEdits, approve, reopen, reviewOf };
