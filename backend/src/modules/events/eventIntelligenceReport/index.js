const { getCachedEventSummary, getSummaryJob, startSummaryJob } = require('../../../services/SummaryLLM');
const eventService = require('../event.service');
const { buildReportHtml } = require('./template');
const { resolveHeadquarters } = require('./headquarters');
const { renderHtmlToPdf } = require('./render');

/**
 * Build the consolidated Event Intelligence & Social Analytics PDF for an event.
 * Uses the cached Summary AI result (generating it if missing) plus keyword analytics.
 * Keyword analytics is optional: sections that depend on it degrade with a note.
 */
const generateEventIntelligencePdf = async (eventId, { db, dbName, tenantName, user } = {}) => {
  let summary = await getCachedEventSummary(eventId, { db });
  if (!summary) {
    const existing = getSummaryJob(dbName, eventId);
    const job = existing?.status === 'running'
      ? existing
      : startSummaryJob({
          eventId,
          db,
          dbName,
          tenantName,
          generatedBy: user ? { id: user.id, name: user.name || user.username } : null,
        });
    summary = await job.promise;
  }
  let keywordData = null;
  try {
    keywordData = await eventService.getKeywordAnalytics(eventId, { db });
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
    headquarters: resolveHeadquarters(tenantName),
  });
  const name = summary?.event?.name || 'Event';
  const pdf = await renderHtmlToPdf(html, {
    footerLabel: `${(tenantName || 'DIGITAL INTELLIGENCE PLATFORM').toUpperCase()} · ${name}`,
  });
  return { pdf, eventName: name };
};

module.exports = { generateEventIntelligencePdf };
