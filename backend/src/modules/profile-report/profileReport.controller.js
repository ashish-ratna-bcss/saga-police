/**
 * Tools → Profile Report HTTP handlers. Plain-language errors only: provider and database details stay in the log.
 *
 *   GET  /subjects                          saved profiles with collection / analysis progress
 *   POST /accounts/fetch                    Fetch in Add profile: resolve + start collecting every post
 *   POST /subjects/:id/save | /discard      Save or Cancel in the dialog
 *   DELETE /accounts/:id                    remove a draft account from the dialog
 *   GET  /subjects/:id | DELETE /subjects/:id
 *   GET  /subjects/:id/posts                collected posts with their analysis
 *   POST /subjects/:id/refresh | /retry     fetch newer posts | continue what stopped
 *   GET|POST /subjects/:id/report           saved report | start one (background job, like /events/:id/summary-llm)
 *   POST /subjects/:id/report/cancel, GET /subjects/:id/report.pdf
 */
const dbOf = require('../../lib/dbOf');
const logger = require('../../lib/logger');
const store = require('./profileReport.store');
const service = require('./profileReport.service');
const { nudgeTenant } = require('./profileReport.poller');
const { getCachedReport, startReportJob, getReportJob, cancelReportJob, lockReason } = require('./report/reportService');
const { buildBehaviorReportHtml } = require('./report/reportPdf');
const { renderHtmlToPdf } = require('../events/eventIntelligenceReport/render');
const { tenantDisplayName } = require('../events/eventIntelligenceReport/headquarters');
const { getTenantProfile } = require('../events/eventIntelligenceReport/tenantProfile');
const { toId } = require('./profileReport.util');

const fail = (res, error) => {
  const status = Number(error?.status) || 500;
  // `expose` marks messages written for people (a provider problem already logged where it happened); anything else
  // that is a 5xx is unexpected: log it in full and show only a generic sentence.
  const plain = status < 500 || error?.expose === true;
  if (!plain) logger.error(`[ProfileReport] ${error?.stack || error}`);
  return res.status(status).json({
    message: plain ? error.message : 'Something went wrong with Profile Report. Try again in a moment.',
    ...(error?.code === 'NO_TENANT_DB' ? { code: 'NO_TENANT_DB' } : {}),
  });
};

const wrap = (fn) => async (req, res) => {
  try {
    return await fn(req, res, dbOf(req.tenantPrisma));
  } catch (error) {
    return fail(res, error);
  }
};

const tenantLabelOf = (user) => {
  for (const c of [user?.blurasagatitle, user?.theme_name, user?.organization_name, user?.organization, user?.tenant_name, user?.tenantName]) {
    if (typeof c === 'string' && c.trim()) return c.trim().slice(0, 80);
  }
  return undefined;
};
const userOf = (req) => (req.user ? { id: req.user.id ?? null, name: req.user.name || req.user.username || null } : null);

/* ------------------------------------------------------------------------------ profiles ------------ */

const listSubjects = wrap(async (req, res, prisma) => {
  const subjects = await store.listSubjects(prisma, { search: req.query.search });
  res.json({ subjects, supported_platforms: service.SUPPORTED_PLATFORMS });
});

const fetchAccount = wrap(async (req, res, prisma) => {
  const out = await service.fetchAccount({
    db: prisma,
    dbName: req.tenantDbName,
    user: userOf(req),
    subjectId: req.body?.subject_id,
    platform: req.body?.platform,
    data: req.body?.data,
  });
  nudgeTenant(req.tenantDbName);
  res.json(out);
});

const getSubject = wrap(async (req, res, prisma) => res.json(await service.requireSubject(prisma, req.params.id)));

const saveSubject = wrap(async (req, res, prisma) => {
  const saved = await service.saveSubject({
    db: prisma,
    id: req.params.id,
    displayName: req.body?.display_name,
    notes: req.body?.notes,
    accountIds: req.body?.account_ids,
  });
  nudgeTenant(req.tenantDbName);
  res.json(saved);
});

const discardDrafts = wrap(async (req, res, prisma) => res.json(await service.discardDrafts({ db: prisma, id: req.params.id })));
const deleteDraftAccount = wrap(async (req, res, prisma) => res.json(await service.deleteDraftAccount({ db: prisma, accountId: req.params.accountId })));

const deleteSubject = wrap(async (req, res, prisma) => {
  const id = toId(req.params.id, 'profile id');
  cancelReportJob(req.tenantDbName, id);
  await store.deleteSubject(prisma, id);
  res.json({ ok: true });
});

const listPosts = wrap(async (req, res, prisma) => {
  const id = toId(req.params.id, 'profile id');
  await service.requireSubject(prisma, id);
  res.json(await store.listPosts(prisma, id, req.query));
});

const refresh = wrap(async (req, res, prisma) => {
  const id = toId(req.params.id, 'profile id');
  await service.requireSubject(prisma, id);
  await store.requestRefresh(prisma, id);
  nudgeTenant(req.tenantDbName);
  res.json(await service.requireSubject(prisma, id));
});

const retry = wrap(async (req, res, prisma) => {
  const id = toId(req.params.id, 'profile id');
  await service.requireSubject(prisma, id);
  await store.retryFetch(prisma, id);
  await store.retryAnalysis(prisma, id);
  nudgeTenant(req.tenantDbName);
  res.json(await service.requireSubject(prisma, id));
});

/* ------------------------------------------------------------------------------- report ------------- */

const running = (res, job, id) => res.status(202).json({ status: 'running', started_at: job.started_at, subject_id: String(id) });

/** Saved report | running (202) | none | failed | cancelled. Never starts a report by itself. */
const getReport = wrap(async (req, res, prisma) => {
  const id = toId(req.params.id, 'profile id');
  const job = getReportJob(req.tenantDbName, id);
  if (job?.status === 'running') return running(res, job, id);
  const cached = await getCachedReport(id, { db: prisma });
  if (job?.status === 'failed') {
    return cached
      ? res.status(200).json({ ...cached, regenerate_error: job.error })
      : res.status(200).json({ status: 'failed', message: job.error, error_status: job.error_status });
  }
  if (cached) return res.status(200).json(cached);
  if (job?.status === 'cancelled') return res.status(200).json({ status: 'cancelled' });
  return res.status(200).json({ status: 'none' });
});

/** Start a report in the background. Refused (with the reason) until at least one post has been analysed. */
const startReport = wrap(async (req, res, prisma) => {
  const id = toId(req.params.id, 'profile id');
  await service.requireSubject(prisma, id);
  if (getReportJob(req.tenantDbName, id)?.status !== 'running') {
    const locked = lockReason(await store.subjectCounts(prisma, id));
    if (locked) return res.status(422).json({ message: locked, code: 'NOT_READY' });
  }
  const job = startReportJob({ subjectId: id, db: prisma, dbName: req.tenantDbName, tenantName: tenantLabelOf(req.user), generatedBy: userOf(req) });
  return running(res, job, id);
});

const cancelReport = wrap(async (req, res) => {
  const cancelled = cancelReportJob(req.tenantDbName, toId(req.params.id, 'profile id'));
  res.json({ cancelled, subject_id: String(req.params.id) });
});

const getReportPdf = wrap(async (req, res, prisma) => {
  const id = toId(req.params.id, 'profile id');
  const data = await getCachedReport(id, { db: prisma });
  if (!data) return res.status(404).json({ message: 'No report has been generated for this profile yet.' });
  let tenantLabel = tenantLabelOf(req.user) || '';
  try { tenantLabel = tenantDisplayName(tenantLabel, await getTenantProfile(req.tenantDbName)) || tenantLabel; } catch (e) { /* keep the plain label */ }
  const html = buildBehaviorReportHtml(data, { tenantLabel });
  const name = data.facts?.profile?.name || `Profile_${id}`;
  const pdf = await renderHtmlToPdf(html, { footerLabel: `${tenantLabel ? `${tenantLabel} · ` : ''}${name} · Behaviour report` });
  const safe = `${name}_Behaviour_Report`.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
  res.setHeader('Content-Disposition', `attachment; filename="${safe}.pdf"`);
  res.setHeader('Content-Length', pdf.length);
  return res.status(200).send(pdf);
});

module.exports = {
  listSubjects, fetchAccount, getSubject, saveSubject, discardDrafts, deleteDraftAccount, deleteSubject,
  listPosts, refresh, retry, getReport, startReport, cancelReport, getReportPdf,
};
