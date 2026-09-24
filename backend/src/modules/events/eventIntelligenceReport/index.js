const { generateEventSummary, getCachedEventSummary } = require('../../../services/SummaryLLM');
const eventService = require('../event.service');
const { buildReportHtml } = require('./template');
const { renderHtmlToPdf } = require('./render');

/**
 * Build the consolidated Event Intelligence & Social Analytics PDF for an event.
 * Uses the cached Summary AI result (generating it if missing) plus keyword analytics.
 * Keyword analytics is optional: sections that depend on it degrade with a note.
 */
const generateEventIntelligencePdf = async (eventId, { db, tenantName, user } = {}) => {
  let summary = await getCachedEventSummary(eventId, { db });
  if (!summary) {
    summary = await generateEventSummary(eventId, {
      db,
      generatedBy: user ? { id: user.id, name: user.name || user.username } : null,
    });
  }
  let keywordData = null;
  try {
    keywordData = await eventService.getKeywordAnalytics(eventId, { db });
  } catch (err) {
    keywordData = null;
  }
  // Saved with the summary by the single generation call (stats.structured_report). Older summaries have none, so those parts show a regenerate note.
  const analysis = summary?.stats?.structured_report || null;
  const html = buildReportHtml({ summary, keywordData, tenantName, analysis });
  const name = summary?.event?.name || 'Event';
  const pdf = await renderHtmlToPdf(html, {
    footerLabel: `${(tenantName || 'DIGITAL INTELLIGENCE PLATFORM').toUpperCase()} · ${name} · RESTRICTED / LAW ENFORCEMENT ONLY`,
  });
  return { pdf, eventName: name };
};

module.exports = { generateEventIntelligencePdf };
