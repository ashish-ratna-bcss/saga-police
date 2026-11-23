/**
 * Profile Catalog → Human behaviour report.
 *
 *   GET  /social-profiles/:id/behavior-report             saved report | { status: 'running' } (202) | { status: 'none' | 'failed' | 'cancelled' }
 *   POST /social-profiles/:id/behavior-report             start a fresh report in the background (joins one already running)
 *   POST /social-profiles/:id/behavior-report/cancel      stop it; the earlier saved report stays
 *   GET  /social-profiles/:id/behavior-report/report.pdf  the saved report as an A4 PDF
 *
 * Same shape as the event report endpoints (/events/:id/summary-llm), except GET never starts a
 * generation on its own: a profile report is written only when someone asks for it.
 */
const dbOf = require('../../../lib/dbOf');
const {
  getCachedBehaviorReport, startBehaviorJob, getBehaviorJob, cancelBehaviorJob, NO_POSTS_MESSAGE,
} = require('./behaviorReport.service');
const { buildBehaviorReportHtml } = require('./behaviorReport.pdf');
const { renderHtmlToPdf } = require('../../events/eventIntelligenceReport/render');
const { tenantDisplayName } = require('../../events/eventIntelligenceReport/headquarters');
const { getTenantProfile } = require('../../events/eventIntelligenceReport/tenantProfile');

const tenantLabelOf = (user) => {
  for (const c of [user?.blurasagatitle, user?.theme_name, user?.organization_name, user?.organization, user?.tenant_name, user?.tenantName]) {
    if (typeof c === 'string' && c.trim()) return c.trim().slice(0, 80);
  }
  return undefined;
};

const callerOf = (req) => ({
  accountId: req.params.id,
  db: req.tenantPrisma,
  dbName: req.tenantDbName,
  tenantName: tenantLabelOf(req.user),
  generatedBy: req.user ? { id: req.user.id ?? null, name: req.user.name || req.user.username || null } : null,
});

const running = (res, job, id) => res.status(202).json({ status: 'running', started_at: job.started_at, account_id: String(id) });
const fail = (res, error) => res.status(error.status || 500).json({ message: error.status && error.status < 500 ? error.message : 'Something went wrong with the behaviour report. Try again.' });

const getBehaviorReport = async (req, res) => {
  try {
    const job = getBehaviorJob(req.tenantDbName, req.params.id);
    if (job?.status === 'running') return running(res, job, req.params.id);
    const cached = await getCachedBehaviorReport(req.params.id, { db: req.tenantPrisma });
    if (job?.status === 'failed') {
      return cached
        ? res.status(200).json({ ...cached, regenerate_error: job.error })
        : res.status(200).json({ status: 'failed', message: job.error, error_status: job.error_status });
    }
    if (cached) return res.status(200).json(cached);
    if (job?.status === 'cancelled') return res.status(200).json({ status: 'cancelled' });
    return res.status(200).json({ status: 'none' });
  } catch (error) {
    return fail(res, error);
  }
};

const startBehaviorReport = async (req, res) => {
  try {
    // The report unlocks only once monitoring has collected posts for this profile.
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid profile id' });
    const isRunning = getBehaviorJob(req.tenantDbName, id)?.status === 'running';
    if (!isRunning) {
      const posts = await dbOf(req.tenantPrisma).social_media_posts.count({ where: { account_id: id } });
      if (!posts) return res.status(422).json({ message: NO_POSTS_MESSAGE, code: 'NO_POSTS' });
    }
    const job = startBehaviorJob(callerOf(req));
    return running(res, job, req.params.id);
  } catch (error) {
    return fail(res, error);
  }
};

const cancelBehaviorReport = async (req, res) => {
  try {
    const cancelled = cancelBehaviorJob(req.tenantDbName, req.params.id);
    return res.status(200).json({ cancelled, account_id: String(req.params.id) });
  } catch (error) {
    return fail(res, error);
  }
};

const getBehaviorReportPdf = async (req, res) => {
  try {
    const data = await getCachedBehaviorReport(req.params.id, { db: req.tenantPrisma });
    if (!data) return res.status(404).json({ message: 'No behaviour report has been generated for this profile yet.' });
    let tenantLabel = tenantLabelOf(req.user) || '';
    try { tenantLabel = tenantDisplayName(tenantLabel, await getTenantProfile(req.tenantDbName)) || tenantLabel; } catch (e) { /* keep the plain label */ }
    const html = buildBehaviorReportHtml(data, { tenantLabel });
    const name = data.facts?.profile?.name || `Profile_${req.params.id}`;
    const pdf = await renderHtmlToPdf(html, { footerLabel: `${tenantLabel ? `${tenantLabel} · ` : ''}${name} · Behaviour report` });
    const safe = `${name}_Behaviour_Report`.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.setHeader('Content-Disposition', `attachment; filename="${safe}.pdf"`);
    res.setHeader('Content-Length', pdf.length);
    return res.status(200).send(pdf);
  } catch (error) {
    return fail(res, error);
  }
};

module.exports = { getBehaviorReport, startBehaviorReport, cancelBehaviorReport, getBehaviorReportPdf };
