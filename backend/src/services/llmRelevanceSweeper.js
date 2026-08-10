// Ollama-backed Hyderabad/Telangana relevance sweeper for event content.
//
// Two entry points:
//   - classifyOne(content)  — one-off check, used inline after event ingest.
//   - runSweep({ limit })   — backfill pass over event posts that are
//                             unclassified or stuck in 'pending'/'failed'.
//
// Verdict policy (decided with the user):
//   * confirmed irrelevant → HARD DELETE the Content document.
//   * confirmed relevant   → persist llm_verdict, keep document.
//   * Ollama unreachable   → leave status='pending'; sweeper will retry.

const Content = require('../models/Content');
const Alert = require('../models/Alert');
const { classifyTelanganaRelevance } = require('./llmService');
const logger = require('../utils/logger');

// Drop event alerts that were tied to the deleted content. We only delete
// alerts that were created in the event-scoped flow (event_id is set), so
// profile/source-tracked alerts pointing to the same content are left
// alone.
const purgeEventAlertsForContent = async (contentDoc) => {
  if (!contentDoc?.id) return;
  try {
    await Alert.deleteMany({ content_id: contentDoc.id, event_id: { $ne: null } });
  } catch (err) {
    logger.error(`[LLMSweeper] alert purge failed for ${contentDoc.id}: ${err.message}`);
  }
};

const buildClassifierInput = (doc) => {
  const parts = [
    doc.text,
    doc.scraped_content,
    doc.title,
    doc.description,
    doc.author,
    doc.author_handle,
    Array.isArray(doc.tags) ? doc.tags.join(' ') : '',
    doc.location?.name, doc.location?.city, doc.location?.address,
    doc.media_location?.name,
    doc.raw_data?.user?.description,
    doc.raw_data?.user?.location
  ];
  return parts.filter(Boolean).join(' \n ').trim();
};

// Single-doc classification. Returns { action, verdict } where action is one
// of 'deleted' | 'kept' | 'pending' | 'skipped'.
const classifyOne = async (doc) => {
  if (!doc) return { action: 'skipped' };
  const text = buildClassifierInput(doc);
  if (!text) {
    await Content.updateOne({ id: doc.id }, {
      $set: {
        'llm_verdict.status': 'classified',
        'llm_verdict.is_telangana_related': false,
        'llm_verdict.confidence': 100,
        'llm_verdict.reasoning': 'empty content',
        'llm_verdict.classified_at': new Date()
      }
    });
    await Content.deleteOne({ id: doc.id });
    await purgeEventAlertsForContent(doc);
    return { action: 'deleted', verdict: { is_telangana_related: false, reasoning: 'empty content' } };
  }

  const verdict = await classifyTelanganaRelevance(text);
  if (!verdict) {
    // Ollama unreachable / parse failure. Mark pending, bump attempts so a
    // hot-loop of bad docs eventually gets skipped by the sweeper.
    await Content.updateOne({ id: doc.id }, {
      $set: { 'llm_verdict.status': 'pending', 'llm_verdict.classified_at': new Date() },
      $inc: { 'llm_verdict.attempts': 1 }
    });
    return { action: 'pending' };
  }

  if (verdict.is_telangana_related) {
    await Content.updateOne({ id: doc.id }, {
      $set: {
        'llm_verdict.status': 'classified',
        'llm_verdict.is_telangana_related': true,
        'llm_verdict.confidence': verdict.confidence,
        'llm_verdict.reasoning': verdict.reasoning,
        'llm_verdict.model': verdict.model,
        'llm_verdict.classified_at': new Date()
      }
    });
    return { action: 'kept', verdict };
  }

  // Hard delete — user explicitly requested. Also purge event alerts that
  // were tied to this content so the dashboard stays consistent.
  await Content.deleteOne({ id: doc.id });
  await purgeEventAlertsForContent(doc);
  return { action: 'deleted', verdict };
};

// Convenience for the event monitor — fire-and-forget so ingest stays fast.
// Logs but never throws into the caller's promise chain.
const classifyOneAsync = (doc) => {
  classifyOne(doc).catch((err) => {
    logger.error(`[LLMSweeper] classifyOne failed for ${doc?.id}: ${err.message}`);
  });
};

// Background sweeper: classify event-tagged posts that are not yet
// classified. Picks the oldest pending first so retries naturally drain.
// Returns counts so the scheduler can log progress.
//
// Concurrency: relies entirely on the llmService queue, which already
// throttles to OLLAMA_CONCURRENCY workers. We just stream docs into it.
const MAX_ATTEMPTS = 3;
let _sweepRunning = false;

const runSweep = async ({ limit = 200 } = {}) => {
  if (_sweepRunning) {
    return { skipped: true, reason: 'already_running' };
  }
  _sweepRunning = true;
  const stats = { processed: 0, kept: 0, deleted: 0, pending: 0, failed: 0 };
  try {
    const filter = {
      event_ids: { $exists: true, $ne: [] },
      $or: [
        { llm_verdict: null },
        { 'llm_verdict.status': { $in: [null, 'pending'] }, 'llm_verdict.attempts': { $lt: MAX_ATTEMPTS } }
      ]
    };
    const cursor = Content.find(filter)
      .sort({ 'llm_verdict.classified_at': 1, published_at: -1 })
      .limit(limit)
      .select('id text scraped_content title description author author_handle tags location media_location raw_data')
      .lean()
      .cursor();

    // Process serially through the cursor; the llmService queue handles
    // concurrency internally. This avoids unbounded memory while still
    // exercising both Ollama workers.
    const inflight = [];
    const MAX_INFLIGHT = Math.max(2, Number(process.env.OLLAMA_CONCURRENCY || 2));
    for await (const doc of cursor) {
      const p = classifyOne(doc).then((r) => {
        stats.processed++;
        if (r.action === 'kept') stats.kept++;
        else if (r.action === 'deleted') stats.deleted++;
        else if (r.action === 'pending') stats.pending++;
      }).catch(() => { stats.failed++; });
      inflight.push(p);
      if (inflight.length >= MAX_INFLIGHT) {
        await Promise.race(inflight);
        // Drop settled promises
        for (let i = inflight.length - 1; i >= 0; i--) {
          if (inflight[i].__settled) inflight.splice(i, 1);
        }
      }
      // Mark settled
      p.finally(() => { p.__settled = true; });
    }
    await Promise.all(inflight);
    return stats;
  } finally {
    _sweepRunning = false;
  }
};

module.exports = { classifyOne, classifyOneAsync, runSweep };
