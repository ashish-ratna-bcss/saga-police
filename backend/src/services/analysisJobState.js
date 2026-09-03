/**
 * Stateful analysis job markers on Content.analysis_job.
 * Prevents silent timeout holes and retry storms against a shared Ollama GPU.
 */
const getContent = () => require('../models/Content');

const DEFAULT_COOLDOWN_MS = 15 * 60 * 1000;
const DEFAULT_STALE_PROCESSING_MS = 10 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 8;

const cooldownMs = () =>
  Math.max(0, Number(process.env.ANALYSIS_RETRY_COOLDOWN_MS || DEFAULT_COOLDOWN_MS));

const maxAttempts = () =>
  Math.max(1, Number(process.env.ANALYSIS_RETRY_MAX_ATTEMPTS || DEFAULT_MAX_ATTEMPTS));

const staleProcessingMs = () =>
  Math.max(60 * 1000, Number(process.env.ANALYSIS_PROCESSING_STALE_MS || DEFAULT_STALE_PROCESSING_MS));

const liveWindowMs = () =>
  Math.max(60 * 1000, Number(process.env.ANALYSIS_LIVE_WINDOW_MS || 2 * 60 * 60 * 1000));

const liveRatio = () => {
  const n = Number(process.env.ANALYSIS_LIVE_RETRY_RATIO || 0.7);
  if (!Number.isFinite(n)) return 0.7;
  return Math.min(0.9, Math.max(0.5, n));
};

const isRetryEligible = (content, now = Date.now()) => {
  const job = content?.analysis_job || {};
  const status = String(job.status || '');
  if (status === 'done') return false;
  const attempts = Number(job.attempts || 0);
  if (status === 'failed' && attempts >= maxAttempts()) return false;
  if (status === 'processing') {
    const started = job.started_at ? new Date(job.started_at).getTime() : 0;
    if (started && now - started < staleProcessingMs()) return false;
  }
  if (job.next_retry_at) {
    const next = new Date(job.next_retry_at).getTime();
    if (Number.isFinite(next) && next > now) return false;
  }
  return true;
};

const classifyAnalysisError = (error) => {
  const status = Number(error?.status || error?.response?.status || 0);
  const msg = String(error?.message || '');
  if (error?.backpressure || status === 429) {
    const retryAfterS = Number(error.retryAfterS || error?.response?.headers?.['retry-after'] || 15);
    return {
      kind: 'backpressure',
      status: 'timeout',
      retryAfterMs: Math.max(5000, (Number.isFinite(retryAfterS) ? retryAfterS : 15) * 1000)
    };
  }
  if (
    error?.code === 'ECONNABORTED' ||
    error?.code === 'ETIMEDOUT' ||
    /timeout/i.test(msg) ||
    /overload/i.test(msg)
  ) {
    return { kind: 'timeout', status: 'timeout', retryAfterMs: cooldownMs() };
  }
  return { kind: 'failed', status: 'failed', retryAfterMs: cooldownMs() };
};

const emptyJob = () => ({
  status: null,
  attempts: 0,
  last_error: null,
  next_retry_at: null,
  started_at: null,
  finished_at: null
});

const patchJob = async (content, patch, incAttempts = false) => {
  if (!content?.id && !content?.content_id) return;
  const Content = getContent();
  const prev = content.analysis_job && typeof content.analysis_job === 'object'
    ? content.analysis_job
    : emptyJob();
  const next = {
    ...emptyJob(),
    ...prev,
    attempts: Number(prev.attempts || 0) + (incAttempts ? 1 : 0),
    ...patch
  };
  const filter = content.id
    ? { id: content.id }
    : { content_id: content.content_id, platform: content.platform };
  // Replace the whole subdocument. Dotted $set fails when analysis_job is null.
  await Content.updateOne(filter, { $set: { analysis_job: next } });
  content.analysis_job = next;
};

const markProcessing = async (content) => {
  await patchJob(content, {
    status: 'processing',
    started_at: new Date(),
    last_error: null
  });
};

const markDone = async (content) => {
  await patchJob(content, {
    status: 'done',
    finished_at: new Date(),
    last_error: null,
    next_retry_at: null
  });
};

const markFailure = async (content, error) => {
  const classified = classifyAnalysisError(error);
  const nextAttempts = Number(content?.analysis_job?.attempts || 0) + 1;
  const exhausted = nextAttempts >= maxAttempts();
  await patchJob(content, {
    status: exhausted ? 'failed' : classified.status,
    attempts: nextAttempts,
    last_error: String(error?.message || classified.kind).slice(0, 500),
    next_retry_at: exhausted ? null : new Date(Date.now() + classified.retryAfterMs),
    finished_at: new Date()
  });
};

module.exports = {
  cooldownMs,
  maxAttempts,
  staleProcessingMs,
  liveWindowMs,
  liveRatio,
  isRetryEligible,
  classifyAnalysisError,
  markProcessing,
  markDone,
  markFailure
};
