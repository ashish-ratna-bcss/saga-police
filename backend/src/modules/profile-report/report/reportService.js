/**
 * PROFILE BEHAVIOUR REPORT (Tools → Profile Report): generation, storage and background jobs.
 *
 * Same flow as the event report: one saved report per profile, written by a background job so closing the dialog
 * does not stop it; a second click joins the job already running; cancel aborts the model call and keeps the earlier
 * report. The model is reached through the same LLM settings (getLLMConfig / chat/completions) the event summary uses.
 * The report reads every collected post of the profile's saved accounts, however many there are.
 */
const axios = require('axios');
const logger = require('../../../lib/logger');
const { getLLMConfig } = require('../../../services/SummaryLLM');
const { estimateTokens } = require('../../../services/SummaryLLM/eventSummary.prompt');
const { resolveHeadquarters } = require('../../events/eventIntelligenceReport/headquarters');
const { getTenantProfile } = require('../../events/eventIntelligenceReport/tenantProfile');
const store = require('../profileReport.store');
const { httpError, json, cleanDeep } = require('../profileReport.util');
const { normalisePosts, buildBehaviorFacts, selectEvidence, DEFAULT_TZ } = require('./reportFacts');
const {
  buildSystemPrompt, buildUserContext, RETRY_MESSAGE, parseBehaviorReport, fallbackReport, reportToMarkdown,
} = require('./reportPrompt');

/** Evidence sizes tried in order until the prompt fits the model's window. */
const EVIDENCE_PLANS = [
  { max: 40, chars: 280 }, { max: 32, chars: 220 }, { max: 24, chars: 180 }, { max: 16, chars: 140 }, { max: 10, chars: 120 },
];
const SAFETY_MARGIN_TOKENS = 700;

const NO_POSTS_MESSAGE = 'No posts have been collected for this profile yet. They are being fetched; the report unlocks once the first posts are analysed.';
const NOT_ANALYSED_MESSAGE = 'Posts are still being analysed. The report unlocks once the first posts are analysed.';
const NOTICE_UNREACHABLE = 'The AI model could not be reached, so this report shows the computed statistics only. Regenerate later for the full behaviour analysis.';
const NOTICE_UNREADABLE = 'The AI reply could not be read, so this report shows the computed statistics only. Regenerate to try again.';

const PLATFORM_NAMES = { x: 'X (Twitter)', twitter: 'X (Twitter)', facebook: 'Facebook', instagram: 'Instagram', youtube: 'YouTube', telegram: 'Telegram', reddit: 'Reddit' };

const cancelledError = () => Object.assign(new Error('Report generation was cancelled.'), { code: 'CANCELLED', status: 409 });

/** Why a report cannot be written yet, or '' when it can: it needs at least one analysed post. */
const lockReason = (counts) => {
  if (!counts || !counts.posts) return NO_POSTS_MESSAGE;
  if (!counts.done) return NOT_ANALYSED_MESSAGE;
  return '';
};

/* ------------------------------------------------------------------------ storage --------------------------- */

const serialize = (row) => {
  const report = row.report || {};
  const facts = row.facts || {};
  return {
    ok: true,
    subject_id: row.subject_id,
    profile: facts.profile || null,
    report,
    facts,
    evidence: Array.isArray(row.evidence) ? row.evidence : [],
    markdown: reportToMarkdown(report, facts),
    summary_source: row.summary_source,
    llm_notice: row.llm_notice || null,
    model: row.model || null,
    posts_count: row.posts_count,
    analysed_count: row.analysed_count,
    generated_at: row.generated_at instanceof Date ? row.generated_at.toISOString() : row.generated_at,
    generated_by: { id: row.generated_by_id ?? null, name: row.generated_by_name || null },
  };
};

/** The saved report with a staleness flag (posts collected or analysed since it was written). Never calls the model. */
const getCachedReport = async (subjectId, { db } = {}) => {
  const rows = await store.q(
    db,
    `SELECT subject_id, report, facts, evidence, summary_source, llm_notice, model, posts_count, analysed_count,
            generated_by_id, generated_by_name, generated_at
       FROM profile_report_reports WHERE subject_id = $1`,
    subjectId
  );
  const row = rows[0];
  if (!row) return null;
  const counts = await store.subjectCounts(db, subjectId);
  const newPosts = Math.max(0, counts.posts - row.posts_count);
  const newAnalysed = Math.max(0, counts.done - row.analysed_count);
  return {
    ...serialize(row),
    cached: true,
    is_stale: newPosts > 0 || newAnalysed > 0,
    new_posts_count: newPosts,
    new_analysed_count: newAnalysed,
    analysis: { posts: counts.posts, analysed: counts.done, waiting: counts.waiting },
  };
};

const saveReport = async (db, subjectId, result, counts) => {
  const c = cleanDeep(result);
  await store.exec(
    db,
    `INSERT INTO profile_report_reports
       (subject_id, report, facts, evidence, summary_source, llm_notice, model, posts_count, analysed_count, last_post_id,
        generated_by_id, generated_by_name, generated_at, updated_at)
     VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5, $6, $7, $8, $9, $10::bigint, $11, $12, $13::timestamptz, NOW())
     ON CONFLICT (subject_id) DO UPDATE SET
       report = EXCLUDED.report, facts = EXCLUDED.facts, evidence = EXCLUDED.evidence,
       summary_source = EXCLUDED.summary_source, llm_notice = EXCLUDED.llm_notice, model = EXCLUDED.model,
       posts_count = EXCLUDED.posts_count, analysed_count = EXCLUDED.analysed_count, last_post_id = EXCLUDED.last_post_id,
       generated_by_id = EXCLUDED.generated_by_id, generated_by_name = EXCLUDED.generated_by_name,
       generated_at = EXCLUDED.generated_at, updated_at = NOW()`,
    subjectId,
    json(c.report, {}), json(c.facts, {}), json(c.evidence, []),
    c.summary_source, c.llm_notice, c.model,
    counts.posts, counts.done, counts.max_post_id && counts.max_post_id !== '0' ? counts.max_post_id : null,
    c.generated_by?.id ?? null, c.generated_by?.name ?? null, c.generated_at
  );
};

/* ---------------------------------------------------------------------------- model ------------------------- */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** One chat call with the event summary's retry rules: 5xx retried twice; a 400 retried once without the thinking flag. */
const callModel = async (messages, { maxTokens, signal }) => {
  const { baseUrl, apiKey, model, timeoutMs } = getLLMConfig();
  const pauses = [3000, 8000];
  let thinkingOff = true;
  for (let attempt = 0; ; attempt += 1) {
    if (signal && signal.aborted) throw cancelledError();
    try {
      const res = await axios.post(
        `${baseUrl}/chat/completions`,
        {
          model,
          messages,
          max_tokens: maxTokens,
          temperature: 0.2,
          ...(thinkingOff ? { chat_template_kwargs: { enable_thinking: false } } : {}),
        },
        { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: timeoutMs, ...(signal ? { signal } : {}) }
      );
      const choice = res.data?.choices?.[0] || {};
      return { text: choice.message?.content || '', finish: choice.finish_reason || null, model };
    } catch (err) {
      if ((signal && signal.aborted) || axios.isCancel(err)) throw cancelledError();
      const status = err?.response?.status;
      if (status === 400 && thinkingOff) { thinkingOff = false; continue; }
      if ((!status || status >= 500) && attempt < pauses.length) {
        logger.warn(`[ProfileReport] model server error (${status || err.code}); retrying in ${pauses[attempt] / 1000}s`);
        await sleep(pauses[attempt]);
        continue;
      }
      throw err;
    }
  }
};

/**
 * The area this report is for ("Odisha"), taken from the tenant's name with words like "police" removed.
 * Empty when what is left is too short to be a place name (a code such as "AP"), so the model is never asked about a made-up region.
 */
const regionOf = (tenantName) => {
  const s = String(tenantName || '').replace(/_+/g, ' ').replace(/blura\s*saga|police|force|agency|department/gi, ' ').replace(/\s+/g, ' ').trim();
  if (s.length < 4 || /\d/.test(s)) return '';
  return s.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
};

/** The largest evidence set whose prompt still leaves room for the reply in the model's window. */
const planPrompt = (rows, facts, region = '') => {
  const { contextWindow, maxInputTokens, maxTokens } = getLLMConfig();
  const outputTokens = Math.min(3500, Math.max(2200, maxTokens));
  const system = buildSystemPrompt();
  const budget = Math.min(contextWindow - outputTokens - SAFETY_MARGIN_TOKENS, maxInputTokens) - estimateTokens(system);
  let chosen = null;
  for (const plan of EVIDENCE_PLANS) {
    const evidence = selectEvidence(rows, { max: plan.max });
    const user = buildUserContext({ facts, evidence, maxChars: plan.chars, region });
    chosen = { evidence, user, system };
    if (estimateTokens(user) <= budget) break;
  }
  const used = estimateTokens(chosen.system) + estimateTokens(chosen.user) + 12;
  chosen.maxTokens = Math.max(800, Math.min(outputTokens, contextWindow - used - SAFETY_MARGIN_TOKENS));
  return chosen;
};

/** Stored evidence: enough text to read in the report and the PDF, without the whole post history. */
const clipChars = (s, n) => Array.from(s || '').slice(0, n).join('');
const storedEvidence = (evidence) => evidence.map((e) => ({
  ...e,
  text: clipChars(e.text, 700),
  english: clipChars(e.english, 700),
  image_text: clipChars(e.image_text, 500),
  scene: clipChars(e.scene, 300),
  summary: clipChars(e.summary, 300),
}));

/**
 * Write a fresh behaviour report for one profile and save it.
 * The model writes the reading; if it cannot (down, or unreadable twice), the report is written from the facts alone.
 */
const generateReport = async (subjectId, { db, dbName = null, tenantName, generatedBy = null, signal = null } = {}) => {
  const throwIfCancelled = () => { if (signal && signal.aborted) throw cancelledError(); };

  const subject = await store.getSubject(db, subjectId);
  if (!subject || subject.status !== 'active') throw httpError(404, 'Profile not found');
  const counts = await store.subjectCounts(db, subjectId);
  const locked = lockReason(counts);
  if (locked) throw httpError(422, locked);

  const detail = await store.getSubjectDetail(db, subjectId);
  const accounts = detail.accounts.filter((a) => !a.is_draft).map((a) => ({
    platform: a.platform, platform_name: PLATFORM_NAMES[a.platform] || a.platform, handle: a.handle,
  }));

  let timezone = DEFAULT_TZ;
  try {
    timezone = resolveHeadquarters(tenantName, await getTenantProfile(dbName))?.timezone || DEFAULT_TZ;
  } catch (e) { /* default timezone */ }

  const posts = await store.postsForReport(db, subjectId);
  const rows = normalisePosts(posts, { timezone });
  const facts = buildBehaviorFacts({
    account: { id: subjectId, display_name: subject.display_name },
    accounts,
    rows,
    totalPosts: rows.length,
    timezone,
  });

  let report = null;
  let evidence = selectEvidence(rows, { max: EVIDENCE_PLANS[0].max });
  let summarySource = 'llm';
  let notice = null;
  let modelName = null;

  try {
    const plan = planPrompt(rows, facts, regionOf(tenantName));
    evidence = plan.evidence;
    const messages = [{ role: 'system', content: plan.system }, { role: 'user', content: plan.user }];
    let reply = await callModel(messages, { maxTokens: plan.maxTokens, signal });
    modelName = reply.model;
    try {
      report = parseBehaviorReport(reply.text, { maxN: evidence.length, attentionLevel: facts.attention_level });
    } catch (parseErr) {
      throwIfCancelled();
      logger.warn(`[ProfileReport] subject=${subjectId} unreadable reply (${parseErr.message}${reply.finish ? `, finish=${reply.finish}` : ''}); asking once more`);
      reply = await callModel(
        [...messages, { role: 'assistant', content: String(reply.text || '').slice(0, 4000) }, { role: 'user', content: RETRY_MESSAGE }],
        { maxTokens: plan.maxTokens, signal }
      );
      try {
        report = parseBehaviorReport(reply.text, { maxN: evidence.length, attentionLevel: facts.attention_level });
      } catch (again) {
        logger.warn(`[ProfileReport] subject=${subjectId} reply unreadable twice (${again.message}); writing from facts`);
        summarySource = 'fallback';
        notice = NOTICE_UNREADABLE;
      }
    }
  } catch (err) {
    if (err?.code === 'CANCELLED' || (signal && signal.aborted)) throw cancelledError();
    logger.error(`[ProfileReport] subject=${subjectId} model unavailable: ${err.message}`);
    summarySource = 'fallback';
    notice = NOTICE_UNREACHABLE;
  }
  if (!report) report = fallbackReport(facts, evidence);
  throwIfCancelled();

  const result = {
    report,
    facts,
    evidence: storedEvidence(evidence),
    summary_source: summarySource,
    llm_notice: notice,
    model: modelName,
    generated_by: generatedBy,
    generated_at: new Date().toISOString(),
  };
  const now = await store.subjectCounts(db, subjectId);
  await saveReport(db, subjectId, result, counts);
  return {
    ...serialize({ ...cleanDeep(result), subject_id: subjectId, posts_count: counts.posts, analysed_count: counts.done, generated_by_id: generatedBy?.id, generated_by_name: generatedBy?.name }),
    cached: false,
    is_stale: now.posts !== counts.posts || now.done !== counts.done,
    new_posts_count: Math.max(0, now.posts - counts.posts),
    new_analysed_count: Math.max(0, now.done - counts.done),
    analysis: { posts: now.posts, analysed: now.done, waiting: now.waiting },
  };
};

/* ----------------------------------------------------------------------------- jobs ------------------------- */

const jobs = new Map();
const jobKey = (dbName, subjectId) => `${dbName || 'default'}:${Number(subjectId)}`;
const getReportJob = (dbName, subjectId) => jobs.get(jobKey(dbName, subjectId)) || null;

/** Run generation off the HTTP request; a second click joins the running job. */
const startReportJob = ({ subjectId, db, dbName, tenantName, generatedBy } = {}) => {
  const key = jobKey(dbName, subjectId);
  const existing = jobs.get(key);
  if (existing?.status === 'running') return existing;

  const abort = new AbortController();
  const job = { status: 'running', started_at: new Date().toISOString(), error: null, error_status: null, abort, promise: null };
  logger.info(`[ProfileReport] report started subject=${subjectId} tenant=${tenantName || dbName || 'default'}`);
  job.promise = generateReport(subjectId, { db, dbName, tenantName, generatedBy, signal: abort.signal })
    .then((result) => {
      logger.info(`[ProfileReport] report finished subject=${subjectId} source=${result.summary_source}`);
      if (jobs.get(key) === job) jobs.delete(key);
      return result;
    })
    .catch((err) => {
      job.finished_at = new Date().toISOString();
      if (err?.code === 'CANCELLED') {
        job.status = 'cancelled';
      } else {
        job.status = 'failed';
        job.error = err.status && err.status < 500 ? err.message : 'The report could not be generated. Try again in a moment.';
        job.error_status = err.status || 500;
        logger.error(`[ProfileReport] report failed subject=${subjectId}: ${err.message}`);
      }
      throw err;
    });
  job.promise.catch(() => {});   // nobody may be waiting on it
  jobs.set(key, job);
  return job;
};

/** Stop the running job for this profile. Nothing is saved; the earlier report stays. */
const cancelReportJob = (dbName, subjectId) => {
  const key = jobKey(dbName, subjectId);
  const job = jobs.get(key);
  if (!job || job.status !== 'running') return false;
  job.status = 'cancelled';
  job.finished_at = new Date().toISOString();
  try { job.abort.abort(); } catch (e) { /* already stopped */ }
  const t = setTimeout(() => { if (jobs.get(key) === job) jobs.delete(key); }, 20000);
  if (t.unref) t.unref();
  return true;
};

module.exports = {
  PLATFORM_NAMES,
  NO_POSTS_MESSAGE,
  NOT_ANALYSED_MESSAGE,
  lockReason,
  getCachedReport,
  generateReport,
  startReportJob,
  getReportJob,
  cancelReportJob,
  __test: { jobs, planPrompt, regionOf },
};
