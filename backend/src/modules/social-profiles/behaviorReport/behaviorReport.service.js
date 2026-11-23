/**
 * PROFILE BEHAVIOUR REPORT: generation, storage and background jobs.
 *
 * Same flow as the event report: one saved report per profile account, written by a background job
 * so closing the dialog does not stop it; a second click joins the job already running; cancel aborts
 * the model call and keeps the earlier report. The model is reached through the same LLM settings
 * (getLLMConfig / chat/completions) the event summary uses.
 */
const axios = require('axios');
const dbOf = require('../../../lib/dbOf');
const logger = require('../../../lib/logger');
const { getLLMConfig } = require('../../../services/SummaryLLM');
const { estimateTokens } = require('../../../services/SummaryLLM/eventSummary.prompt');
const { resolveHeadquarters } = require('../../events/eventIntelligenceReport/headquarters');
const { getTenantProfile } = require('../../events/eventIntelligenceReport/tenantProfile');
const { normalisePosts, buildBehaviorFacts, selectEvidence, DEFAULT_TZ } = require('./behaviorFacts');
const {
  buildSystemPrompt, buildUserContext, RETRY_MESSAGE, parseBehaviorReport, fallbackReport, reportToMarkdown,
} = require('./behaviorPrompt');

/** Newest posts read per report. Enough for a clear picture; the evidence the model reads is a chosen subset. */
const MAX_POSTS = Math.max(50, Number(process.env.PROFILE_REPORT_MAX_POSTS || 400));
/** Evidence sizes tried in order until the prompt fits the model's window. */
const EVIDENCE_PLANS = [
  { max: 40, chars: 280 }, { max: 32, chars: 220 }, { max: 24, chars: 180 }, { max: 16, chars: 140 }, { max: 10, chars: 120 },
];
const SAFETY_MARGIN_TOKENS = 700;

const NO_POSTS_MESSAGE = 'No posts have been collected for this profile yet. Start monitoring; the report unlocks once posts arrive.';
const NOTICE_UNREACHABLE = 'The AI model could not be reached, so this report shows the computed statistics only. Regenerate later for the full behaviour analysis.';
const NOTICE_UNREADABLE = 'The AI reply could not be read, so this report shows the computed statistics only. Regenerate to try again.';

const httpError = (status, message) => Object.assign(new Error(message), { status });
const cancelledError = () => Object.assign(new Error('Report generation was cancelled.'), { code: 'CANCELLED', status: 409 });

/* ------------------------------------------------------------------------ storage --------------------------- */

const ready = new WeakMap();
const ensureTable = (prisma) => {
  if (!ready.has(prisma)) {
    const p = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS social_profile_behavior_reports (
          account_id INTEGER PRIMARY KEY REFERENCES social_media_accounts(id) ON DELETE CASCADE,
          report JSONB NOT NULL DEFAULT '{}'::jsonb,
          facts JSONB NOT NULL DEFAULT '{}'::jsonb,
          evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
          summary_source TEXT NOT NULL DEFAULT 'llm',
          llm_notice TEXT NULL,
          model TEXT NULL,
          posts_count INTEGER NOT NULL DEFAULT 0,
          last_post_id BIGINT NULL,
          generated_by_id INTEGER NULL,
          generated_by_name TEXT NULL,
          generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
    })();
    p.catch(() => ready.delete(prisma));   // a failed attempt is retried on the next request
    ready.set(prisma, p);
  }
  return ready.get(prisma);
};

/** PostgreSQL JSONB refuses NUL characters and lone surrogates; strip them from every string. */
const cleanDeep = (v) => {
  if (typeof v === 'string') {
    const s = typeof v.toWellFormed === 'function' ? v.toWellFormed() : v.replace(/[\uD800-\uDFFF]/g, '');
    return s.replace(/\u0000/g, '');
  }
  if (Array.isArray(v)) return v.map(cleanDeep);
  if (v instanceof Date) return v.toISOString();
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, cleanDeep(x)]));
  if (typeof v === 'bigint') return v.toString();
  return v;
};

const postCursor = async (prisma, accountId) => {
  const agg = await prisma.social_media_posts.aggregate({ where: { account_id: accountId }, _count: { id: true }, _max: { id: true } });
  return { count: agg._count.id || 0, maxId: agg._max.id != null ? BigInt(agg._max.id) : null };
};

const serialize = (row) => {
  const report = row.report || {};
  const facts = row.facts || {};
  return {
    ok: true,
    account_id: row.account_id,
    profile: facts.profile || null,
    report,
    facts,
    evidence: Array.isArray(row.evidence) ? row.evidence : [],
    markdown: reportToMarkdown(report, facts),
    summary_source: row.summary_source,
    llm_notice: row.llm_notice || null,
    model: row.model || null,
    posts_count: row.posts_count,
    generated_at: row.generated_at instanceof Date ? row.generated_at.toISOString() : row.generated_at,
    generated_by: { id: row.generated_by_id ?? null, name: row.generated_by_name || null },
  };
};

const validId = (accountId) => {
  const id = Number(accountId);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, 'Invalid profile id');
  return id;
};

/** The saved report with a staleness flag (posts collected since it was written). Never calls the model. */
const getCachedBehaviorReport = async (accountId, { db } = {}) => {
  const prisma = dbOf(db);
  const id = validId(accountId);
  await ensureTable(prisma);
  const rows = await prisma.$queryRawUnsafe(
    `SELECT account_id, report, facts, evidence, summary_source, llm_notice, model, posts_count,
            last_post_id::text AS last_post_id, generated_by_id, generated_by_name, generated_at
       FROM social_profile_behavior_reports WHERE account_id = $1`,
    id
  );
  const row = rows && rows[0];
  if (!row) return null;
  const cursor = await postCursor(prisma, id);
  const storedMax = row.last_post_id != null ? BigInt(row.last_post_id) : null;
  const isStale = cursor.count !== row.posts_count || (cursor.maxId != null && (storedMax == null || cursor.maxId > storedMax));
  return { ...serialize(row), cached: true, is_stale: isStale, new_posts_count: Math.max(0, cursor.count - row.posts_count) };
};

const saveReport = async (prisma, id, result, cursor) => {
  const c = cleanDeep(result);
  await prisma.$executeRawUnsafe(
    `INSERT INTO social_profile_behavior_reports
       (account_id, report, facts, evidence, summary_source, llm_notice, model, posts_count, last_post_id,
        generated_by_id, generated_by_name, generated_at, updated_at)
     VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5, $6, $7, $8, $9::bigint, $10, $11, $12::timestamptz, NOW())
     ON CONFLICT (account_id) DO UPDATE SET
       report = EXCLUDED.report, facts = EXCLUDED.facts, evidence = EXCLUDED.evidence,
       summary_source = EXCLUDED.summary_source, llm_notice = EXCLUDED.llm_notice, model = EXCLUDED.model,
       posts_count = EXCLUDED.posts_count, last_post_id = EXCLUDED.last_post_id,
       generated_by_id = EXCLUDED.generated_by_id, generated_by_name = EXCLUDED.generated_by_name,
       generated_at = EXCLUDED.generated_at, updated_at = NOW()`,
    id,
    JSON.stringify(c.report),
    JSON.stringify(c.facts),
    JSON.stringify(c.evidence),
    c.summary_source,
    c.llm_notice,
    c.model,
    cursor.count,
    cursor.maxId != null ? cursor.maxId.toString() : null,
    c.generated_by?.id ?? null,
    c.generated_by?.name ?? null,
    c.generated_at
  );
};

/** Adds { behavior_report: { generated_at, attention_level } | null } to each catalog row. Never breaks the list. */
const attachBehaviorReportFlags = async (rows, { db } = {}) => {
  const ids = (rows || []).map((r) => Number(r.id)).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return rows;
  try {
    const prisma = dbOf(db);
    await ensureTable(prisma);
    const found = await prisma.$queryRawUnsafe(
      `SELECT account_id, generated_at, summary_source, report->>'attention_level' AS attention_level
         FROM social_profile_behavior_reports WHERE account_id = ANY($1::int[])`,
      ids
    );
    const byId = new Map(found.map((f) => [Number(f.account_id), f]));
    return rows.map((r) => {
      const f = byId.get(Number(r.id));
      return {
        ...r,
        behavior_report: f ? {
          generated_at: f.generated_at instanceof Date ? f.generated_at.toISOString() : f.generated_at,
          attention_level: f.attention_level || null,
          summary_source: f.summary_source,
        } : null,
      };
    });
  } catch (err) {
    logger.warn(`[ProfileReport] report flags skipped: ${err.message}`);
    return rows;
  }
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

/** The largest evidence set whose prompt still leaves room for the reply in the model's window. */
const planPrompt = (rows, facts) => {
  const { contextWindow, maxInputTokens, maxTokens } = getLLMConfig();
  const outputTokens = Math.min(3500, Math.max(2200, maxTokens));
  const system = buildSystemPrompt();
  const budget = Math.min(contextWindow - outputTokens - SAFETY_MARGIN_TOKENS, maxInputTokens) - estimateTokens(system);
  let chosen = null;
  for (const plan of EVIDENCE_PLANS) {
    const evidence = selectEvidence(rows, { max: plan.max });
    const user = buildUserContext({ facts, evidence, maxChars: plan.chars });
    chosen = { evidence, user, system };
    if (estimateTokens(user) <= budget) break;
  }
  const used = estimateTokens(chosen.system) + estimateTokens(chosen.user) + 12;
  chosen.maxTokens = Math.max(800, Math.min(outputTokens, contextWindow - used - SAFETY_MARGIN_TOKENS));
  return chosen;
};

/** Stored evidence: enough text to read in the report and the PDF, without the whole post history. */
const storedEvidence = (evidence) => evidence.map((e) => ({
  ...e,
  text: Array.from(e.text || '').slice(0, 700).join(''),
  english: Array.from(e.english || '').slice(0, 700).join(''),
  summary: Array.from(e.summary || '').slice(0, 300).join(''),
}));

const SELECT_POST = {
  id: true, platform: true, url: true, text: true, author_name: true, author_handle: true, media_type: true,
  media_urls: true, engagement: true, posted_at: true, fetched_at: true, raw_data: true, analysis_result: true,
};

/**
 * Write a fresh behaviour report for one catalog account and save it.
 * The model writes the reading; if it cannot (down, or unreadable twice), the report is written from the facts alone.
 */
const generateBehaviorReport = async (accountId, { db, dbName = null, tenantName, generatedBy = null, signal = null } = {}) => {
  const throwIfCancelled = () => { if (signal && signal.aborted) throw cancelledError(); };
  const prisma = dbOf(db);
  const id = validId(accountId);
  await ensureTable(prisma);

  const account = await prisma.social_media_accounts.findUnique({
    where: { id },
    include: { profile: { select: { display_name: true } }, platforms: { select: { slug: true, name: true } } },
  });
  if (!account) throw httpError(404, 'Profile not found');

  const [totalPosts, posts] = await Promise.all([
    prisma.social_media_posts.count({ where: { account_id: id } }),
    prisma.social_media_posts.findMany({
      where: { account_id: id },
      orderBy: [{ posted_at: 'desc' }, { id: 'desc' }],
      take: MAX_POSTS,
      select: SELECT_POST,
    }),
  ]);
  if (!posts.length) throw httpError(422, NO_POSTS_MESSAGE);

  let timezone = DEFAULT_TZ;
  try {
    timezone = resolveHeadquarters(tenantName, await getTenantProfile(dbName))?.timezone || DEFAULT_TZ;
  } catch (e) { /* default timezone */ }

  const rows = normalisePosts(posts, { timezone });
  const facts = buildBehaviorFacts({
    account: {
      id,
      handle: account.handle,
      display_name: account.profile?.display_name || account.handle,
      platform: account.platforms?.slug || '',
      platform_name: account.platforms?.name || account.platforms?.slug || '',
    },
    rows,
    totalPosts,
    timezone,
  });

  let report = null;
  let evidence = selectEvidence(rows, { max: EVIDENCE_PLANS[0].max });
  let summarySource = 'llm';
  let notice = null;
  let modelName = null;

  try {
    const plan = planPrompt(rows, facts);
    evidence = plan.evidence;
    const messages = [{ role: 'system', content: plan.system }, { role: 'user', content: plan.user }];
    let reply = await callModel(messages, { maxTokens: plan.maxTokens, signal });
    modelName = reply.model;
    try {
      report = parseBehaviorReport(reply.text, { maxN: evidence.length, attentionLevel: facts.attention_level });
    } catch (parseErr) {
      throwIfCancelled();
      logger.warn(`[ProfileReport] account=${id} unreadable reply (${parseErr.message}${reply.finish ? `, finish=${reply.finish}` : ''}); asking once more`);
      reply = await callModel(
        [...messages, { role: 'assistant', content: String(reply.text || '').slice(0, 4000) }, { role: 'user', content: RETRY_MESSAGE }],
        { maxTokens: plan.maxTokens, signal }
      );
      try {
        report = parseBehaviorReport(reply.text, { maxN: evidence.length, attentionLevel: facts.attention_level });
      } catch (again) {
        logger.warn(`[ProfileReport] account=${id} reply unreadable twice (${again.message}); writing from facts`);
        summarySource = 'fallback';
        notice = NOTICE_UNREADABLE;
      }
    }
  } catch (err) {
    if (err?.code === 'CANCELLED' || (signal && signal.aborted)) throw cancelledError();
    logger.error(`[ProfileReport] account=${id} model unavailable: ${err.message}`);
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
  const cursor = await postCursor(prisma, id);
  await saveReport(prisma, id, result, cursor);
  return {
    ...serialize({ ...cleanDeep(result), account_id: id, posts_count: cursor.count, generated_by_id: generatedBy?.id, generated_by_name: generatedBy?.name }),
    cached: false,
    is_stale: false,
    new_posts_count: 0,
  };
};

/* ----------------------------------------------------------------------------- jobs ------------------------- */

const jobs = new Map();
const jobKey = (dbName, accountId) => `${dbName || 'default'}:${Number(accountId)}`;
const getBehaviorJob = (dbName, accountId) => jobs.get(jobKey(dbName, accountId)) || null;

/** Run generation off the HTTP request; a second click joins the running job. */
const startBehaviorJob = ({ accountId, db, dbName, tenantName, generatedBy } = {}) => {
  validId(accountId);
  const key = jobKey(dbName, accountId);
  const existing = jobs.get(key);
  if (existing?.status === 'running') return existing;

  const abort = new AbortController();
  const job = { status: 'running', started_at: new Date().toISOString(), error: null, error_status: null, abort, promise: null };
  logger.info(`[ProfileReport] started account=${accountId} tenant=${tenantName || dbName || 'default'}`);
  job.promise = generateBehaviorReport(accountId, { db, dbName, tenantName, generatedBy, signal: abort.signal })
    .then((result) => {
      logger.info(`[ProfileReport] finished account=${accountId} source=${result.summary_source}`);
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
        logger.error(`[ProfileReport] failed account=${accountId}: ${err.message}`);
      }
      throw err;
    });
  job.promise.catch(() => {});   // nobody may be waiting on it
  jobs.set(key, job);
  return job;
};

/** Stop the running job for this account. Nothing is saved; the earlier report stays. */
const cancelBehaviorJob = (dbName, accountId) => {
  const key = jobKey(dbName, accountId);
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
  NO_POSTS_MESSAGE,
  getCachedBehaviorReport,
  generateBehaviorReport,
  startBehaviorJob,
  getBehaviorJob,
  cancelBehaviorJob,
  attachBehaviorReportFlags,
  __test: { cleanDeep, jobs, planPrompt },
};
