const axios = require('axios');
const logger = require('../../lib/logger');

// Local Whisper worker on the saga box (PM2: audio-transcriber).
const AUDIO_BASE_URL = (process.env.AUDIO_TRANSCRIBER_URL || 'http://127.0.0.1:2002').replace(/\/$/, '');
// Whisper is single-flight; busy (429) is common when several video posts queue.
// Wait/retry longer so sentiment can include speech instead of skipping it.
const AUDIO_MAX_ATTEMPTS = Math.max(1, Number(process.env.AUDIO_TRANSCRIBE_MAX_ATTEMPTS) || 8);
const AUDIO_TIMEOUT_MS = Math.max(30000, Number(process.env.AUDIO_TRANSCRIBE_TIMEOUT_MS) || 600000);
const AUDIO_BUSY_WAIT_MS = Math.max(5000, Number(process.env.AUDIO_TRANSCRIBE_BUSY_WAIT_MS) || 120000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isBusyError(err) {
  const status = err?.response?.status;
  const detail = String(err?.response?.data?.detail || err?.message || '');
  return status === 429 || err?.code === 'EBUSY' || /busy|try again shortly/i.test(detail);
}

/**
 * Media that Whisper/ffmpeg cannot decode (corrupt file, image URL, empty
 * container, etc.). These come back as HTTP 500 with ffmpeg's config dump in
 * the detail — treating them as transient left video posts stuck on
 * "Analyzing…" forever and blocked sentiment on caption text alone.
 */
function isPermanentMediaError(err) {
  const detail = String(err?.response?.data?.detail || err?.message || '');
  return /enable-lib[a-z]|ffmpeg version|Invalid data found|does not contain any stream|moov atom not found|Protocol not found|Error opening input|Could not find codec|No such file or directory|HTTP Error 4\d\d|Download failed|Downloaded media is empty|File too large/i.test(
    detail
  );
}

function isTransientError(err) {
  if (isPermanentMediaError(err)) return false;
  const status = err?.response?.status;
  return (
    isBusyError(err) ||
    !status ||
    status >= 500 ||
    err?.code === 'ECONNABORTED' ||
    err?.code === 'ECONNREFUSED' ||
    err?.code === 'ETIMEDOUT' ||
    /timeout|econnrefused|econnaborted/i.test(String(err?.message || ''))
  );
}

/** Poll /health until the single Whisper worker is free (or timeout). */
async function waitUntilIdle(postId, maxWaitMs = AUDIO_BUSY_WAIT_MS) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const h = await axios.get(`${AUDIO_BASE_URL}/health`, { timeout: 3000 });
      if (!h.data?.busy) return true;
    } catch (_) {
      // health flap — keep waiting
    }
    await sleep(4000);
  }
  logger.warn(`[Audio] Still busy after ${maxWaitMs}ms wait for post ${postId}`);
  return false;
}

/**
 * Sends a direct video/audio file URL to the audio-transcriber for speech-to-text.
 * The worker downloads the media, extracts mono 16k wav via ffmpeg when needed,
 * and returns Whisper text (+ optional segments).
 *
 * On busy/timeouts returns `{ success: false, transient: true }` so the caller
 * can re-queue without marking a permanent failure or running sentiment early.
 *
 * @param {string} mediaUrl
 * @param {object} [options]
 * @returns {Promise<{ success: boolean, data?: object, error?: string, attempts: number, transient?: boolean }>}
 */
async function extractAudioTranscript(
  mediaUrl,
  {
    postId = 'unknown',
    language = null,
    timeoutMs = AUDIO_TIMEOUT_MS,
    maxAttempts = AUDIO_MAX_ATTEMPTS,
  } = {}
) {
  if (!mediaUrl || typeof mediaUrl !== 'string') {
    return { success: false, error: 'Invalid or missing media URL', attempts: 0, transient: false };
  }

  const tries = Math.max(1, Number(maxAttempts) || AUDIO_MAX_ATTEMPTS);
  let lastError = null;
  let lastTransient = false;

  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      await waitUntilIdle(postId);

      const res = await axios.post(
        `${AUDIO_BASE_URL}/transcribe_url`,
        {
          video_url: mediaUrl,
          ...(language ? { language } : {}),
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: Math.max(1000, Number(timeoutMs) || AUDIO_TIMEOUT_MS),
          validateStatus: () => true,
        }
      );

      if (res.status === 429) {
        throw Object.assign(new Error(res.data?.detail || 'Transcriber busy — try again shortly'), {
          code: 'EBUSY',
          response: res,
        });
      }

      if (res.status >= 400) {
        const detail = res.data?.detail || res.data?.error || `HTTP ${res.status}`;
        throw Object.assign(new Error(detail), { response: res });
      }

      const result = res.data || {};
      const text = typeof result.text === 'string' ? result.text.trim() : '';
      return {
        success: true,
        data: {
          text,
          language: result.language || null,
          language_probability: result.language_probability ?? null,
          duration: result.duration ?? null,
          segments: Array.isArray(result.segments) ? result.segments : [],
          model: result.model || null,
          device: result.device || null,
        },
        attempts: attempt,
        transient: false,
      };
    } catch (err) {
      lastError = err;
      lastTransient = isTransientError(err);
      const status = err.response?.status;
      const detail = err.response?.data?.detail || err.message;

      logger.warn(
        `[Audio] Attempt ${attempt}/${tries} failed for post ${postId}${status ? ` (HTTP ${status})` : ''}: ${detail}`
      );

      if (!lastTransient || attempt >= tries) {
        break;
      }

      // Busy: wait for a full Whisper job window. Other transient: shorter exponential.
      const backoffMs = isBusyError(err)
        ? Math.min(20000 * attempt, 90000)
        : Math.min(2000 * Math.pow(2, attempt - 1), 15000);
      await sleep(backoffMs);
    }
  }

  return {
    success: false,
    error: lastError?.response?.data?.detail || lastError?.message || 'Audio transcription failed',
    attempts: tries,
    transient: Boolean(lastTransient),
  };
}

module.exports = {
  extractAudioTranscript,
  AUDIO_BASE_URL,
  isBusyError,
  isTransientError,
};
