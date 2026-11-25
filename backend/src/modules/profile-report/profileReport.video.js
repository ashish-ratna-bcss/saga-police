/**
 * Tools → Profile Report: videos.
 *
 * A post with a video file gets the same video reading live monitoring (Alerts) gives it: the image/video reader
 * (OCR_SERVICE_URL /extract with a video_url) fetches the clip itself and answers with what it shows, the text on screen and
 * how long it is. This module is only the module's side of that: when a video is read, what is kept, and how a reading or a
 * failure is recognised later. Nothing here talks to a service or a database.
 *
 * The reader's answer, as measured against the real service: { media_type: 'video', duration_seconds, frames_processed,
 * chunks_processed, description, summary, events: [{ timestamp, description }], visible_text: [], video_meta, timing }.
 * It samples about ten frames whatever the length, so a ten-minute clip took 18 s and a one-minute clip 7 s (mostly the download).
 *
 * What is stored on the post (image_analysis):
 *   a reading   { media_type: 'video', duration_seconds, description, summary, visible_text[], scenes, picture: { skipped: 'video' }, at }
 *   a failure   { ...whatever reading the post already had (a still frame's), video: { failed: true, error, transient?, at } }
 * A failure sits under `video` so it never hides a still-frame reading the post already had.
 */
const { flatten, descriptive, cut } = require('../../services/media_post_analysis/imageText');

/**
 * A video file link in a post's media_urls, as a PostgreSQL regular expression (matched against media_urls::text, where each link
 * is followed by a quote). Same links as the JS check in analyzeMediaPost.extractFirstVideoUrl: an extension at the end of the
 * link or before its query string, or a .m3u8 stream.
 */
const VIDEO_URL_SQL = '\\.(mp4|m4v|mov|webm|avi|mkv)(\\?|"|$)|\\.m3u8';

/** Videos are read unless PROFILE_REPORT_VIDEO_ANALYSIS=0 (read on every call so it can be switched without a code change). */
const enabled = () => process.env.PROFILE_REPORT_VIDEO_ANALYSIS !== '0';

/** A reading that failed only because the reader was busy or slow is tried again after this long. */
const RETRY_AFTER_HOURS = 6;

const isVideoReading = (img) => Boolean(img && typeof img === 'object' && !Array.isArray(img) && img.media_type === 'video' && !img.failed);

/** The text shown on screen in the video, as one line (the video's counterpart of the words printed on a picture). */
const onScreenTextOf = (img) => {
  if (!isVideoReading(img) || !Array.isArray(img.visible_text)) return '';
  return img.visible_text.map((x) => flatten(x)).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
};

const secondsOf = (img) => {
  const n = Number(img && img.duration_seconds);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

/** What is kept of the reader's answer. Descriptions can arrive as structured data, so they go through the same cleaning as pictures. */
const recordOf = (data = {}, now = new Date()) => {
  const seconds = Number(data.duration_seconds);
  return {
    media_type: 'video',
    duration_seconds: Number.isFinite(seconds) ? Math.round(seconds * 10) / 10 : null,
    description: cut(descriptive(data.description), 1200),
    summary: cut(descriptive(data.summary), 500),
    visible_text: (Array.isArray(data.visible_text) ? data.visible_text : []).map((x) => cut(flatten(x), 400)).filter(Boolean).slice(0, 40),
    scenes: Array.isArray(data.events) ? data.events.length : 0,
    picture: { skipped: 'video' },
    at: now.toISOString(),
  };
};

/** A note that the video could not be read. `transient`: the reader was busy or slow, so it is worth trying again later. */
const failureOf = (error, { transient = false, now = new Date() } = {}) => ({
  failed: true,
  error: String(error || 'The video could not be read').replace(/\s+/g, ' ').slice(0, 160),
  ...(transient ? { transient: true } : {}),
  at: now.toISOString(),
});

/**
 * Does this post's stored reading still need a video reading? Yes when there is none; no once there is one; no after a failure that
 * will not change (an expired link, a file the reader cannot open); yes again for a failure that was only the reader being busy,
 * after RETRY_AFTER_HOURS.
 */
const needsReading = (reading, now = Date.now()) => {
  if (!reading || typeof reading !== 'object' || Array.isArray(reading)) return true;
  if (isVideoReading(reading)) return false;
  const note = reading.media_type === 'video' && reading.failed ? reading : reading.video;
  if (note && note.failed) return Boolean(note.transient) && now - Date.parse(note.at) > RETRY_AFTER_HOURS * 3600 * 1000;
  return true;   // none yet, or only queued by the one-time re-queue
};

module.exports = { VIDEO_URL_SQL, enabled, RETRY_AFTER_HOURS, isVideoReading, onScreenTextOf, secondsOf, recordOf, failureOf, needsReading };
