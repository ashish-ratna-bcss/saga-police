const { getCachedEventSummary, getSummaryJob, startSummaryJob, getLLMConfig, generateClosingSummary, saveClosingSummary } = require('../../../services/SummaryLLM');
const eventService = require('../event.service');
const { buildReportHtml } = require('./template');
const { resolveHeadquarters, tenantDisplayName, reportLanguageFor } = require('./headquarters');
const { getLabels } = require('./labels');
const { getTenantProfile } = require('./tenantProfile');
const { renderHtmlToPdf } = require('./render');

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

/** The saved summary for the event and the analysis written from it. */
const prepareReport = async (eventId, ctx = {}) => {
  const summary = await ensureSummary(eventId, ctx);
  return { summary, analysis: summary?.stats?.structured_report || null };
};

/**
 * Build the consolidated Event Intelligence & Social Analytics PDF for an event.
 * Uses the cached Summary AI result (generating it if missing) and keyword analytics.
 * Keyword analytics is optional: sections that depend on it degrade with a note.
 * One report format: the full report with the evidence annex. includeEvidence=false gives the same report without the annex.
 */
const generateEventIntelligencePdf = async (
  eventId,
  { db, dbName, tenantName, user, timeframe = 'full', fromDate = null, toDate = null, includeEvidence = true, regionOnly = false, compact = false } = {}
) => {
  const prepared = await prepareReport(eventId, { db, dbName, tenantName, user, timeframe, fromDate, toDate });
  const { summary, analysis } = prepared;
  const profile = await getTenantProfile(dbName);
  // A report saved before the closing summary existed gets it now, once; the text is stored with the report.
  if (analysis && !analysis.closingSummary) {
    try {
      const text = await generateClosingSummary({
        report: analysis, facts: analysis.facts, event: summary?.event, stats: summary?.stats,
        ctx: { event: summary?.event, headquarters: resolveHeadquarters(tenantName, profile), reportLanguage: reportLanguageFor(tenantName, profile) },
      });
      if (text) { analysis.closingSummary = text; await saveClosingSummary(db, eventId, text); }
    } catch (err) { /* the report is still produced without it */ }
  }
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
    regionOnly: regionOnly || compact,
    compact,
    labels: await getLabels(reportLanguageFor(tenantName, profile), getLLMConfig),
  });
  const cleanTenant = (t) => tenantDisplayName(t, profile);
  const name = summary?.event?.name || 'Event';
  const pdf = await renderHtmlToPdf(html, {
    footerLabel: `${cleanTenant(tenantName)} · ${name}${includeEvidence ? '' : compact ? ` (${summary?.event?.location || 'Location'} summary)` : regionOnly ? ` (${summary?.event?.location || 'Region'} only)` : ' (Executive)'}`,
  });
  return { pdf, eventName: name };
};

module.exports = { generateEventIntelligencePdf, prepareReport };
