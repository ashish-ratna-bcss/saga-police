const { getCachedEventSummary, getSummaryJob, startSummaryJob, getLLMConfig } = require('../../../services/SummaryLLM');
const { normalizeReview } = require('../../../services/SummaryLLM/reviewState');
const eventService = require('../event.service');
const { buildReportHtml } = require('./template');
const { resolveHeadquarters, tenantDisplayName, reportLanguageFor } = require('./headquarters');
const { getLabels } = require('./labels');
const { getTenantProfile } = require('./tenantProfile');
const { renderHtmlToPdf } = require('./render');
const { classifyEvidence } = require('./scope');
const { runQualityChecks } = require('./quality');
const review = require('./review');

const httpError = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });

/** The saved summary for the event, generating it first when it is missing (or for another time window) and allowed. */
const ensureSummary = async (eventId, { db, dbName, tenantName, user, timeframe = 'full', fromDate = null, toDate = null, generateIfMissing = true } = {}) => {
  let summary = await getCachedEventSummary(eventId, { db });
  const wrongWindow = summary && timeframe && timeframe !== 'full' && summary.stats?.timeframe !== timeframe;
  if (!summary || wrongWindow) {
    if (!generateIfMissing) throw httpError(404, 'No report has been generated for this event yet');
    const existing = getSummaryJob(dbName, eventId, timeframe);
    const job = existing?.status === 'running'
      ? existing
      : startSummaryJob({
          eventId,
          db,
          dbName,
          tenantName,
          timeframe,
          fromDate,
          toDate,
          generatedBy: user ? { id: user.id, name: user.name || user.username } : null,
        });
    summary = await job.promise;
  }
  return summary;
};

const postNumbers = (summary) => (summary?.evidence_traceability || []).map((e, i) => ({ n: Number((String(e.citationTag || '').match(/\d+/) || [i + 1])[0]) }));

/**
 * Everything the report and the review screen need: the saved summary, the generated analysis, the reviewer's edits applied
 * on top of it, the review state, and the automatic quality check of the text as it will be printed.
 */
const prepareReport = async (eventId, ctx = {}) => {
  const summary = await ensureSummary(eventId, ctx);
  const base = summary?.stats?.structured_report || null;
  const rv = normalizeReview(summary?.stats?.review, { preparedBy: summary?.generated_by?.name || '', preparedAt: summary?.generated_at });
  const ev = postNumbers(summary);
  const analysis = review.applyEdits(base, rv.edits, new Set(ev.map((e) => e.n)));
  const scope = classifyEvidence(ev, analysis, summary?.event || {});
  const quality = runQualityChecks({ summary, analysis, ev, scope });
  return { summary, base, analysis, review: rv, quality };
};

const editable = (a) => (a ? {
  bottomLine: a.bottomLine || '',
  issueLink: a.issueLink || '',
  strands: a.issueStrands || [],
  known: a.known || [],
  notKnown: a.notKnown || [],
  actions: a.actions || [],
} : null);

/** What the review screen shows: state, quality check, and the editable text (generated and current). */
const reviewView = (p) => ({ review: p.review, quality: p.quality, original: editable(p.base), current: editable(p.analysis) });

const getReviewState = async (eventId, ctx = {}) => reviewView(await prepareReport(eventId, { ...ctx, generateIfMissing: false }));

const saveReviewEdits = async (eventId, edits, ctx = {}) => {
  await review.saveEdits(eventId, edits, ctx.user, { db: ctx.db });
  return reviewView(await prepareReport(eventId, { ...ctx, generateIfMissing: false }));
};

const approveReport = async (eventId, ctx = {}, acknowledge = []) => {
  const p = await prepareReport(eventId, { ...ctx, generateIfMissing: false });
  await review.approve(eventId, ctx.user, { db: ctx.db, quality: p.quality, acknowledge });
  return reviewView(await prepareReport(eventId, { ...ctx, generateIfMissing: false }));
};

const reopenReport = async (eventId, ctx = {}) => {
  await review.reopen(eventId, ctx.user, { db: ctx.db });
  return reviewView(await prepareReport(eventId, { ...ctx, generateIfMissing: false }));
};

/**
 * Build the consolidated Event Intelligence & Social Analytics PDF for an event.
 * Uses the cached Summary AI result (generating it if missing), the reviewer's edits, and keyword analytics.
 * Keyword analytics is optional: sections that depend on it degrade with a note.
 * One report format: the full report with the evidence annex. includeEvidence=false gives the same report without the annex.
 */
const generateEventIntelligencePdf = async (
  eventId,
  { db, dbName, tenantName, user, timeframe = 'full', fromDate = null, toDate = null, includeEvidence = true } = {}
) => {
  const prepared = await prepareReport(eventId, { db, dbName, tenantName, user, timeframe, fromDate, toDate });
  const { summary, analysis } = prepared;
  const profile = await getTenantProfile(dbName);
  let keywordData = null;
  try {
    const windowed = summary?.stats?.timeframe && summary.stats.timeframe !== 'full';
    keywordData = await eventService.getKeywordAnalytics(eventId, { db, timezone: resolveHeadquarters(tenantName, profile)?.timezone || 'Asia/Kolkata', from: windowed ? summary.stats.effective_start : null, to: windowed ? summary.stats.effective_end : null });
  } catch (err) {
    keywordData = null;
  }
  const html = buildReportHtml({
    summary,
    keywordData,
    tenantName,
    analysis,
    headquarters: resolveHeadquarters(tenantName, profile),
    includeEvidence,
    labels: await getLabels(reportLanguageFor(tenantName, profile), getLLMConfig),
    review: prepared.review,
    quality: prepared.quality,
  });
  const cleanTenant = (t) => tenantDisplayName(t, profile);
  const name = summary?.event?.name || 'Event';
  const status = prepared.review.status === 'approved' ? '' : ' (DRAFT)';
  const pdf = await renderHtmlToPdf(html, {
    footerLabel: `${cleanTenant(tenantName)} · ${name}${includeEvidence ? '' : ' (Executive)'}${status}`,
  });
  return { pdf, eventName: name, review: prepared.review };
};

module.exports = { generateEventIntelligencePdf, getReviewState, saveReviewEdits, approveReport, reopenReport, prepareReport };
