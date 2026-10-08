const { getCachedEventSummary, getSummaryJob, startSummaryJob, getLLMConfig } = require('../../../services/SummaryLLM');
const eventService = require('../event.service');
const { buildReportHtml } = require('./template');
const { resolveHeadquarters, tenantDisplayName, reportLanguageFor } = require('./headquarters');
const { getLabels } = require('./labels');
const { getTenantProfile } = require('./tenantProfile');
const { renderHtmlToPdf } = require('./render');

/**
 * Build the consolidated Event Intelligence & Social Analytics PDF for an event.
 * Uses the cached Summary AI result (generating it if missing) plus keyword analytics.
 * Keyword analytics is optional: sections that depend on it degrade with a note.
 */
const generateEventIntelligencePdf = async (
  eventId,
  { db, dbName, tenantName, user, timeframe = 'full', fromDate = null, toDate = null, includeEvidence = true } = {}
) => {
  let summary = await getCachedEventSummary(eventId, { db });
  if (!summary || (timeframe && timeframe !== 'full' && summary.stats?.timeframe !== timeframe)) {
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
  const profile = await getTenantProfile(dbName);
  let keywordData = null;
  try {
    const windowed = summary?.stats?.timeframe && summary.stats.timeframe !== 'full';
    keywordData = await eventService.getKeywordAnalytics(eventId, { db, from: windowed ? summary.stats.effective_start : null, to: windowed ? summary.stats.effective_end : null });
  } catch (err) {
    keywordData = null;
  }
  // Saved with the summary by the single generation call (stats.structured_report). Older summaries have none, so those parts show a regenerate note.
  const analysis = summary?.stats?.structured_report || null;
  const html = buildReportHtml({
    summary,
    keywordData,
    tenantName,
    analysis,
    headquarters: resolveHeadquarters(tenantName, profile),
    includeEvidence,
    labels: await getLabels(reportLanguageFor(tenantName, profile), getLLMConfig),
  });
  const cleanTenant = (t) => tenantDisplayName(t, profile);
  const name = summary?.event?.name || 'Event';
  const pdf = await renderHtmlToPdf(html, {
    footerLabel: `${cleanTenant(tenantName)} · ${name}${includeEvidence ? '' : ' (Executive)'}`,
  });
  return { pdf, eventName: name };
};

module.exports = { generateEventIntelligencePdf };
