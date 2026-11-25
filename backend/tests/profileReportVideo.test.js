/**
 * Profile Report: videos are read the way Alerts read them (the image/video reader's /extract with a video_url), and what the
 * reader saw feeds the post's analysis, the report and the PDF. The reader and the database are faked: nothing is called.
 */
process.env.OCR_SERVICE_URL = 'http://gpu.test:8000';
process.env.LLM_BASE_URL = process.env.LLM_BASE_URL || 'http://llm.test/v1';
process.env.PROFILE_REPORT_PICTURE_DESCRIPTION = '0';   // the picture step is not what is tested here
delete process.env.PROFILE_REPORT_VIDEO_ANALYSIS;

const test = require('node:test');
const assert = require('node:assert');

// the readers are taken from the OCR module when the analysis module loads, so they are replaced first
const ocrModule = require('../src/services/media_post_analysis/extractOcr');
const videoCalls = [];
const ocrCalls = [];
let videoAnswer = null;
let ocrAnswer = null;
ocrModule.extractVideo = async (url, opts) => { videoCalls.push({ url, opts }); return typeof videoAnswer === 'function' ? videoAnswer(url, opts) : videoAnswer; };
ocrModule.extractOcr = async (url, opts) => { ocrCalls.push({ url, opts }); return typeof ocrAnswer === 'function' ? ocrAnswer(url, opts) : ocrAnswer; };

const clip = require('../src/modules/profile-report/profileReport.video');
const frames = require('../src/modules/profile-report/profileReport.videoFrames');
const store = require('../src/modules/profile-report/profileReport.store');
const analyze = require('../src/modules/profile-report/profileReport.analyze');
const { sceneOf, signalsOf } = require('../src/services/media_post_analysis/imageText');
const { normalisePosts, buildBehaviorFacts, selectEvidence } = require('../src/modules/profile-report/report/reportFacts');
const { buildUserContext, buildSystemPrompt } = require('../src/modules/profile-report/report/reportPrompt');
const { buildBehaviorReportHtml } = require('../src/modules/profile-report/report/reportPdf');

/** What the real reader answered for a 52-second clip (measured against the service), trimmed to the fields it returns. */
const READER_ANSWER = {
  media_type: 'video',
  duration_seconds: 52.21,
  frames_processed: 6,
  chunks_processed: 1,
  description: 'The video begins with a wide shot of a snowy landscape. The scene transitions to a close-up of an older man with a beard. The video then shows a crowd holding flags in a street.',
  summary: 'The video depicts a journey through snowy mountains, a close-up of a man and a crowd with flags.',
  events: [{ timestamp: 0, description: 'A snowy landscape.' }, { timestamp: 13.05, description: 'A close-up of a man.' }, { timestamp: 30.45, description: 'A crowd with flags.' }],
  visible_text: ['VOTE FOR CHANGE', 'Rally 10am'],
  video_meta: { width: 854, height: 480, fps: 24 },
  timing: { download: 0.479, vlm: 4.95, total: 5.293 },
};
const IG_VIDEO = 'https://scontent.cdninstagram.com/o1/v/t16/f2/m86/abc123.mp4?efg=1&oe=69999999';
const NOW = new Date('2026-11-25T10:00:00Z');

/* ------------------------------------------------------------------------------------------------ the helpers -- */

test('what is kept of the reader\'s answer: the words, the on-screen text and the length; not its timings, frames or scene list', () => {
  const r = clip.recordOf(READER_ANSWER, NOW);
  assert.strictEqual(r.media_type, 'video');
  assert.strictEqual(r.duration_seconds, 52.2);
  assert.match(r.description, /^The video begins with a wide shot of a snowy landscape\./);
  assert.match(r.summary, /^The video depicts a journey/);
  assert.deepStrictEqual(r.visible_text, ['VOTE FOR CHANGE', 'Rally 10am']);
  assert.strictEqual(r.scenes, 3);
  assert.deepStrictEqual(r.picture, { skipped: 'video' });
  assert.strictEqual(r.at, '2026-11-25T10:00:00.000Z');
  for (const k of ['events', 'timing', 'video_meta', 'frames_processed', 'chunks_processed']) assert.ok(!(k in r), `${k} is not stored`);
  assert.ok(clip.isVideoReading(r));
  assert.strictEqual(clip.secondsOf(r), 52);
  assert.strictEqual(clip.onScreenTextOf(r), 'VOTE FOR CHANGE Rally 10am');
});

test('a description that arrives as structured data is read as words, never as "[object Object]", and the reader\'s statistics are no description', () => {
  const r = clip.recordOf({ duration_seconds: 10, description: { scene: 'A man speaks to a crowd', total_processing_time_sec: 2 }, summary: { text_blocks_detected: 0, total_processing_time_sec: 0.4 }, visible_text: [{ text: 'HELLO' }, null, '', 5] });
  assert.strictEqual(r.description, 'A man speaks to a crowd');
  assert.strictEqual(r.summary, '', 'timing statistics are not a summary');
  assert.deepStrictEqual(r.visible_text, ['HELLO', '5']);
  assert.ok(!JSON.stringify(r).includes('[object'));
  const empty = clip.recordOf({});
  assert.deepStrictEqual([empty.description, empty.summary, empty.visible_text, empty.scenes, empty.duration_seconds], ['', '', [], 0, null]);
  assert.ok(clip.isVideoReading(empty), 'a video the reader saw nothing in is still a video that was read: it is not asked again');
  // bounded
  const big = clip.recordOf({ description: 'x '.repeat(2000), visible_text: Array.from({ length: 100 }, (_, i) => `t${i}`) });
  assert.ok(Array.from(big.description).length <= 1200);
  assert.strictEqual(big.visible_text.length, 40);
});

test('a video needs reading when it has none; not after a reading or a lasting failure; again after hours for a busy reader', () => {
  const at = (hoursAgo) => new Date(NOW.getTime() - hoursAgo * 3600 * 1000).toISOString();
  assert.strictEqual(clip.needsReading(null), true);
  assert.strictEqual(clip.needsReading({ full_text: 'a still frame\'s text' }), true, 'a still frame\'s reading is not the video\'s');
  assert.strictEqual(clip.needsReading({ video: { queued: true } }), true, 'queued by the one-time re-queue');
  assert.strictEqual(clip.needsReading(clip.recordOf(READER_ANSWER)), false);
  assert.strictEqual(clip.needsReading({ video: clip.failureOf('Could not fetch video_url: returned HTTP 403.', { now: new Date(at(100)) }) }, NOW.getTime()), false, 'an expired link does not get better');
  assert.strictEqual(clip.needsReading({ video: clip.failureOf('socket hang up', { transient: true, now: new Date(at(2)) }) }, NOW.getTime()), false, 'too soon');
  assert.strictEqual(clip.needsReading({ video: clip.failureOf('socket hang up', { transient: true, now: new Date(at(7)) }) }, NOW.getTime()), true, 'a busy reader is asked again after 6 hours');
  // the shape older code wrote for a failed video
  assert.strictEqual(clip.needsReading({ media_type: 'video', failed: true, error: 'x' }), false);
  assert.strictEqual(clip.isVideoReading({ media_type: 'video', failed: true }), false);
});

test('reading videos is on unless it is switched off', () => {
  delete process.env.PROFILE_REPORT_VIDEO_ANALYSIS;
  assert.strictEqual(clip.enabled(), true);
  process.env.PROFILE_REPORT_VIDEO_ANALYSIS = '1';
  assert.strictEqual(clip.enabled(), true);
  process.env.PROFILE_REPORT_VIDEO_ANALYSIS = '0';
  assert.strictEqual(clip.enabled(), false);
  delete process.env.PROFILE_REPORT_VIDEO_ANALYSIS;
});

test('the SQL pattern for a video link matches what the code treats as a video file, and nothing else', () => {
  const re = new RegExp(clip.VIDEO_URL_SQL, 'i');   // the same syntax in JavaScript for what these cases use
  const matches = (urls) => re.test(JSON.stringify(urls));
  assert.ok(matches([IG_VIDEO]));
  assert.ok(matches(['https://cdn.example.com/a.mp4']));
  assert.ok(matches(['https://cdn.example.com/a.WEBM?x=1']));
  assert.ok(matches(['https://video.twimg.com/amplify_video/1/pl/a.m3u8?tag=14']));
  assert.ok(!matches(['https://cdn.example.com/photo.jpg']));
  assert.ok(!matches(['https://cdn.example.com/mp4/photo.jpg']), 'a folder named mp4 is not a video');
  assert.ok(!matches(['https://cdn.example.com/a.mp4x']));
  assert.ok(!matches([]));
  // and it agrees with the check the analysis uses
  const media = require('../src/services/media_post_analysis/analyzeMediaPost');
  for (const url of [IG_VIDEO, 'https://cdn.example.com/a.mp4', 'https://cdn.example.com/a.mkv', 'https://cdn.example.com/photo.jpg', 'https://v.x/a.m3u8?t=1']) {
    assert.strictEqual(matches([url]), Boolean(media.extractFirstVideoUrl({ media_urls: [url] })), url);
  }
});

/* ------------------------------------------------------------------------------ what the post is analysed on -- */

test('the words of a video are its on-screen text, and what it shows is the description', () => {
  const reading = clip.recordOf(READER_ANSWER);
  assert.strictEqual(store.printedTextOf(reading), 'VOTE FOR CHANGE Rally 10am');
  assert.match(store.imageTextOf(reading), /^VOTE FOR CHANGE/);
  const silent = clip.recordOf({ ...READER_ANSWER, visible_text: [] });
  assert.strictEqual(store.printedTextOf(silent), '');
  assert.match(store.imageTextOf(silent), /snowy landscape/, 'with no writing on screen, the post is analysed on what the video shows');
  assert.strictEqual(store.printedTextOf({ full_text: 'PICTURE WORDS' }), 'PICTURE WORDS', 'pictures are unchanged');
  assert.strictEqual(store.printedTextOf({ ...reading, failed: true }), '');
});

/* ----------------------------------------------------------------------------------- reading a post's video -- */

const executed = [];
const origExec = store.exec;
const post = (extra = {}) => ({ id: '10', platform: 'instagram', text: '', media_type: 'reel', media_urls: [IG_VIDEO], raw_data: {}, image_analysis: null, analysis_attempts: 0, ...extra });
const savedImageAnalysis = () => executed.filter((e) => /SET image_analysis = \$2::jsonb/.test(e.sql)).map((e) => JSON.parse(e.params[1]));
const merged = () => executed.filter((e) => /\|\| \$2::jsonb/.test(e.sql)).map((e) => JSON.parse(e.params[1]));
const heartbeats = () => executed.filter((e) => /SET claimed_at = NOW\(\)/.test(e.sql)).length;
const run = (p) => analyze.__test.enrichMedia({}, p, 'tenant_x');

// the frame-by-frame look is off unless a test turns it on (ffmpeg may or may not be installed where these run)
const framesCalls = [];
let framesAnswer;
let framesOn = false;
const realFramesEnabled = frames.enabled;
const realFramesAnalyse = frames.analyse;
test.beforeEach(() => {
  executed.length = 0; videoCalls.length = 0; ocrCalls.length = 0; framesCalls.length = 0;
  videoAnswer = { success: true, data: READER_ANSWER, attempts: 1 };
  ocrAnswer = { success: true, data: { full_text: 'RALLY 10AM', language: 'en' }, attempts: 1 };
  delete process.env.PROFILE_REPORT_VIDEO_ANALYSIS;
  store.exec = async (prisma, sql, ...params) => { executed.push({ sql, params }); return 1; };
  framesOn = false;
  framesAnswer = null;
  frames.enabled = () => framesOn;
  frames.analyse = async (url, opts) => { framesCalls.push({ url, opts }); return typeof framesAnswer === 'function' ? framesAnswer(url, opts) : framesAnswer; };
});
test.afterEach(() => { store.exec = origExec; frames.enabled = realFramesEnabled; frames.analyse = realFramesAnalyse; });

test('a video post with no caption is read: the reader is sent the video link, and its reading is what gets analysed', async () => {
  const res = await run(post());
  assert.strictEqual(videoCalls.length, 1);
  assert.strictEqual(videoCalls[0].url, IG_VIDEO);
  assert.strictEqual(videoCalls[0].opts.postId, '10');
  assert.strictEqual(videoCalls[0].opts.tenantKey, 'tenant_x', 'the reader orders requests fairly across tenants by this');
  assert.strictEqual(videoCalls[0].opts.maxAttempts, 1, 'a busy reader is retried by the queue, not by hammering it');
  assert.ok(videoCalls[0].opts.timeoutMs < analyze.__test.limits.videoBudgetMs, 'the request is dropped when the post stops waiting');
  assert.strictEqual(ocrCalls.length, 0, 'no picture reading for a post whose video was read');
  assert.strictEqual(res.retryLater, false);
  assert.ok(clip.isVideoReading(res.ocr));
  assert.strictEqual(store.printedTextOf(res.ocr), 'VOTE FOR CHANGE Rally 10am');
  const [saved] = savedImageAnalysis();
  assert.strictEqual(saved.media_type, 'video');
  assert.match(saved.description, /snowy landscape/);
  assert.ok(!('timing' in saved) && !('events' in saved));
  assert.ok(heartbeats() >= 1, 'the post shows life before the long step');
});

test('a post that already has a still frame\'s reading still gets its video read, and the video\'s reading replaces it', async () => {
  const res = await run(post({ platform: 'x', media_type: 'video', image_analysis: { full_text: 'still frame words' }, raw_data: { legacy: { extended_entities: { media: [{ media_url_https: 'https://pbs.twimg.com/still.jpg' }] } } } }));
  assert.strictEqual(videoCalls.length, 1);
  assert.ok(clip.isVideoReading(res.ocr));
  assert.ok(!('full_text' in savedImageAnalysis()[0]));
});

test('a video that was read is not read again when its post is analysed again', async () => {
  const res = await run(post({ image_analysis: clip.recordOf(READER_ANSWER) }));
  assert.strictEqual(videoCalls.length, 0);
  assert.strictEqual(ocrCalls.length, 0);
  assert.ok(clip.isVideoReading(res.ocr));
});

test('a video the reader cannot open: the post keeps its still frame\'s text, and the failure is noted so it is not tried again', async () => {
  videoAnswer = { success: false, error: 'Could not fetch video_url: \'https://cdn/x.mp4\' returned HTTP 403.', attempts: 1 };
  const res = await run(post({ platform: 'x', media_type: 'video', raw_data: { legacy: { extended_entities: { media: [{ media_url_https: 'https://pbs.twimg.com/still.jpg' }] } } } }));
  assert.strictEqual(videoCalls.length, 1);
  assert.strictEqual(res.retryLater, false, 'an expired link is not retried');
  assert.strictEqual(ocrCalls.length, 1, 'it goes on to the still frame');
  assert.strictEqual(ocrCalls[0].url, 'https://pbs.twimg.com/still.jpg');
  assert.strictEqual(res.ocr.full_text, 'RALLY 10AM');
  // the note is written first, and the still frame's reading saved afterwards does not erase it
  const note = merged().find((m) => m.video);
  assert.strictEqual(note.video.failed, true);
  assert.ok(!note.video.transient);
  const last = savedImageAnalysis().pop();
  assert.strictEqual(last.full_text, 'RALLY 10AM');
  assert.strictEqual(last.video.failed, true, 'the failure note survives the still frame\'s reading being saved');
  assert.strictEqual(clip.needsReading(last), false);
});

test('a video with no still frame either falls back to the caption, with the failure noted', async () => {
  videoAnswer = { success: false, error: 'Video analysis service returned success=false', attempts: 1 };
  const res = await run(post());
  assert.strictEqual(ocrCalls.length, 0);
  assert.strictEqual(res.retryLater, false);
  assert.strictEqual(store.imageTextOf(res.ocr), '');
  assert.ok(merged().some((m) => m.video && m.video.failed));
});

test('a reader that is busy or slow is asked once more shortly, then the post goes on with its caption and is tried again after hours', async () => {
  videoAnswer = { success: false, error: 'socket hang up', attempts: 1 };
  const first = await run(post({ analysis_attempts: 0 }));
  assert.strictEqual(first.retryLater, true);
  assert.strictEqual(savedImageAnalysis().length + merged().length, 0, 'nothing is recorded for a try that will be repeated');
  executed.length = 0;
  const second = await run(post({ analysis_attempts: 1 }));
  assert.strictEqual(second.retryLater, false);
  const note = merged().find((m) => m.video);
  assert.strictEqual(note.video.failed, true);
  assert.strictEqual(note.video.transient, true, 'a busy reader\'s failure is worth trying again later');
});

test('a reader that never answers cannot hold a post for ever: the wait is cut off, and the heartbeat timer does not outlive it', async () => {
  const saved = analyze.__test.limits.videoBudgetMs;
  analyze.__test.limits.videoBudgetMs = 6000;
  videoAnswer = () => new Promise(() => {});   // never answers
  try {
    const t0 = Date.now();
    const res = await run(post({ analysis_attempts: 0 }));
    assert.ok(Date.now() - t0 < 8000);
    assert.strictEqual(res.retryLater, true, 'too slow counts as busy');
  } finally {
    analyze.__test.limits.videoBudgetMs = saved;
  }
});

test('video reading can be switched off: the post is then read as a picture, as before', async () => {
  process.env.PROFILE_REPORT_VIDEO_ANALYSIS = '0';
  const res = await run(post({ platform: 'x', media_type: 'video', raw_data: { legacy: { extended_entities: { media: [{ media_url_https: 'https://pbs.twimg.com/still.jpg' }] } } } }));
  assert.strictEqual(videoCalls.length, 0);
  assert.strictEqual(ocrCalls.length, 1);
  assert.strictEqual(res.ocr.full_text, 'RALLY 10AM');
});

test('a post with a picture and no video is untouched by all of this', async () => {
  const res = await run(post({ media_type: 'post', media_urls: ['https://scontent.cdninstagram.com/v/t51/photo.jpg?x=1'] }));
  assert.strictEqual(videoCalls.length, 0);
  assert.strictEqual(ocrCalls.length, 1);
  assert.strictEqual(res.ocr.full_text, 'RALLY 10AM');
});

test('a post queued for its video that has no video file after all gets a note saying so, so it is never queued again', async () => {
  const res = await run(post({ media_type: 'post', media_urls: ['https://cdn.example.com/photo.jpg'], image_analysis: { full_text: 'words on the picture', video: { queued: true } } }));
  assert.strictEqual(videoCalls.length, 0, 'there is nothing to send to the video reader');
  const note = merged().find((m) => m.video);
  assert.strictEqual(note.video.failed, true);
  assert.ok(!note.video.transient, 'it will not change');
  assert.ok(!note.video.queued, 'the queued mark is replaced');
  assert.strictEqual(clip.needsReading({ video: note.video }), false);
  assert.strictEqual(res.ocr.full_text, 'words on the picture', 'what the post had is kept');
});

test('the video\'s own timeout is shorter than the time after which a post counts as abandoned', () => {
  assert.ok(analyze.__test.limits.videoBudgetMs < analyze.__test.STALE_PROCESSING_MINUTES * 60 * 1000);
});

/* ---------------------------------------- looking at the video frame by frame (the picture questions) ---- */

const fr = (extra = {}) => ({ v: 2, description: 'A pile of green leaves.', objects: [], flags: [], symbols: [], alerts: [], ...extra });
const RIFLE_FRAME = { description: 'A rifle is resting against a green bush. The rifle has a black stock and a silver barrel.', objects: ['a rifle with a black stock and silver barrel'], alerts: ['weapon'] };
/** what frames.analyse answers when the video's frames were looked at: 4 of 24 frames show a rifle */
const LOOKED_AT = (() => {
  const described = Array.from({ length: 24 }, () => fr());
  [13, 16, 17, 20].forEach((i) => { described[i] = fr(RIFLE_FRAME); });
  return { success: true, data: frames.summarise(described, { total: 24 }), described, total: 24 };
})();
const lastSaved = () => savedImageAnalysis().pop();

test('a video is read by the reader and looked at frame by frame at the same time, and the frames\' weapon alert leads the picture record', async () => {
  framesOn = true;
  framesAnswer = LOOKED_AT;
  const res = await run(post());
  assert.strictEqual(videoCalls.length, 1);
  assert.strictEqual(framesCalls.length, 1);
  assert.strictEqual(framesCalls[0].url, IG_VIDEO);
  assert.strictEqual(res.retryLater, false);
  const saved = lastSaved();
  assert.strictEqual(saved.media_type, 'video');
  assert.strictEqual(saved.duration_seconds, 52.2, 'the reader\'s length and on-screen text are kept');
  assert.deepStrictEqual(saved.visible_text, ['VOTE FOR CHANGE', 'Rally 10am']);
  assert.strictEqual(saved.picture.source, 'video');
  assert.deepStrictEqual(saved.picture.alerts, ['weapon']);
  assert.match(saved.picture.description, /^The video begins with a wide shot of a snowy landscape\./, 'the reader\'s description leads');
  assert.match(saved.picture.description, /Weapon \(seen in 4 of 24 frames\): A rifle is resting against a green bush\./);
  assert.deepStrictEqual(signalsOf({ picture: saved.picture })[0], 'weapon', 'it shows as "Seen in the video"');
  assert.ok(sceneOf(saved, 900).includes('rifle'), 'what the post list and the report show says rifle, not what the reader said alone');
  assert.ok(clip.isVideoReading(res.ocr));
  assert.strictEqual(clip.needsFrames(res.ocr), false, 'looked at: not again');
});

test('a video that turns out to be an animation is not flagged for a weapon its frames showed, and the post says it is animated', async () => {
  framesOn = true;
  framesAnswer = { ...LOOKED_AT, animated: true };
  const res = await run(post());
  const saved = lastSaved();
  assert.deepStrictEqual(saved.picture.alerts, []);
  assert.strictEqual(saved.picture.animated, true);
  assert.match(saved.picture.description, /Animated or computer-generated footage, not a recording of real events \(weapon seen in its frames is not counted\)/);
  assert.deepStrictEqual(signalsOf(res.ocr), []);
  assert.ok(!/Notable in the video/.test(analyze.__test.imageContext(res.ocr).description || ''), 'the sentiment service is not told of a weapon');
});

test('the sentiment service is told about the weapon seen in the video', async () => {
  framesOn = true;
  framesAnswer = LOOKED_AT;
  const res = await run(post());
  const context = analyze.__test.imageContext(res.ocr);
  assert.match(context.description, /Notable in the video: weapon/);
  assert.ok(!/Notable in the picture/.test(context.description));
  assert.ok(!('picture' in context) && !('video' in context));
});

test('a vision model that was busy: the reader\'s reading is kept, the frames are noted as not looked at, and are tried again after 6 hours', async () => {
  framesOn = true;
  framesAnswer = { success: false, error: 'Only 0 of 24 frames could be described: Vision model: socket hang up', nonRetryable: false };
  const res = await run(post());
  assert.strictEqual(res.retryLater, false, 'the post is analysed now, on what the reader saw');
  const saved = lastSaved();
  assert.strictEqual(saved.media_type, 'video');
  assert.strictEqual(saved.picture.failed, true);
  assert.strictEqual(saved.picture.transient, true);
  assert.deepStrictEqual(signalsOf({ picture: saved.picture }), []);
  assert.match(sceneOf(saved, 900), /snowy landscape/, 'the reader\'s description still shows');
  assert.strictEqual(clip.needsFrames(res.ocr), false, 'too soon to try again');
});

test('frames that cannot be got at all (an expired link) are a lasting note, not retried', async () => {
  framesOn = true;
  framesAnswer = { success: false, error: 'Download failed: HTTP 403', nonRetryable: true };
  await run(post());
  const saved = lastSaved();
  assert.strictEqual(saved.picture.failed, true);
  assert.ok(!saved.picture.transient);
  assert.strictEqual(clip.needsFrames(saved, Date.now() + 1000 * 3600 * 1000 * 24 * 30), false, 'not even after a month');
});

test('with no video tool on the server the video keeps the reader\'s reading and is left to be looked at later', async () => {
  framesOn = true;
  framesAnswer = { success: false, error: 'No video tool is installed here', nonRetryable: true, unavailable: true };
  const res = await run(post());
  assert.deepStrictEqual(lastSaved().picture, { skipped: 'video' }, 'no failure is recorded for a missing tool');
  assert.strictEqual(clip.needsFrames(res.ocr), true);
});

test('when the reader cannot open a video but the frames can, the post still gets a reading, made from the frames', async () => {
  framesOn = true;
  videoAnswer = { success: false, error: 'Could not read video: Could not determine video duration.', attempts: 1 };
  framesAnswer = LOOKED_AT;
  const res = await run(post());
  assert.strictEqual(videoCalls.length, 1);
  assert.strictEqual(res.retryLater, false);
  const saved = lastSaved();
  assert.ok(clip.isVideoReading(saved));
  assert.strictEqual(saved.picture.source, 'video');
  assert.deepStrictEqual(saved.picture.alerts, ['weapon']);
  assert.ok(!saved.video, 'no "video could not be read" note: it was read, by its frames');
  assert.match(sceneOf(saved, 900), /Weapon \(seen in 4 of 24 frames\)/);
  // a reader that was only busy is not retried either: the frames gave the post its reading
  videoAnswer = { success: false, error: 'socket hang up', attempts: 1 };
  executed.length = 0;
  const busy = await run(post({ analysis_attempts: 0 }));
  assert.strictEqual(busy.retryLater, false);
});

test('when neither the reader nor the frames can open the video, it is as before: a retry for a busy reader, else a note and the caption', async () => {
  framesOn = true;
  framesAnswer = { success: false, error: 'Download failed: HTTP 403', nonRetryable: true };
  videoAnswer = { success: false, error: 'socket hang up', attempts: 1 };
  assert.strictEqual((await run(post({ analysis_attempts: 0 }))).retryLater, true);
  executed.length = 0;
  videoAnswer = { success: false, error: "Could not fetch video_url: 'x' returned HTTP 403.", attempts: 1 };
  const res = await run(post({ analysis_attempts: 0 }));
  assert.strictEqual(res.retryLater, false);
  assert.ok(merged().some((m) => m.video && m.video.failed));
});

test('a video the reader already read is not sent to the reader again, only looked at frame by frame, and the reader\'s reading is kept', async () => {
  framesOn = true;
  framesAnswer = LOOKED_AT;
  const earlier = clip.recordOf(READER_ANSWER);   // picture: { skipped: 'video' }
  const res = await run(post({ image_analysis: { ...earlier, picture: { skipped: 'video', queued: true } } }));
  assert.strictEqual(videoCalls.length, 0, 'the reader is not asked again');
  assert.strictEqual(framesCalls.length, 1);
  const saved = lastSaved();
  assert.strictEqual(saved.duration_seconds, 52.2);
  assert.deepStrictEqual(saved.visible_text, ['VOTE FOR CHANGE', 'Rally 10am']);
  assert.match(saved.picture.description, /^The video begins with a wide shot of a snowy landscape\./);
  assert.deepStrictEqual(saved.picture.alerts, ['weapon']);
  assert.ok(clip.isVideoReading(res.ocr));
});

test('a video already looked at frame by frame is not looked at again', async () => {
  framesOn = true;
  framesAnswer = LOOKED_AT;
  const done = { ...clip.recordOf(READER_ANSWER), picture: LOOKED_AT.data };
  const res = await run(post({ image_analysis: done }));
  assert.strictEqual(videoCalls.length, 0);
  assert.strictEqual(framesCalls.length, 0);
  assert.deepStrictEqual(res.ocr.picture.alerts, ['weapon']);
});

test('with the frame-by-frame look switched off nothing is asked of it, and the video is read as before', async () => {
  framesOn = false;
  const res = await run(post());
  assert.strictEqual(framesCalls.length, 0);
  assert.strictEqual(videoCalls.length, 1);
  assert.deepStrictEqual(lastSaved().picture, { skipped: 'video' });
  assert.ok(clip.isVideoReading(res.ocr));
});

test('a post queued to be looked at that turns out to have no video file gets a note, so it is not queued again', async () => {
  framesOn = true;
  const res = await run(post({ media_type: 'post', media_urls: ['https://cdn.example.com/photo.jpg'], image_analysis: { ...clip.recordOf(READER_ANSWER), picture: { skipped: 'video', queued: true } } }));
  assert.strictEqual(framesCalls.length, 0);
  const note = merged().find((m) => m.picture && m.picture.failed);
  assert.ok(note, 'a note was written');
  assert.ok(!note.picture.transient && !note.picture.queued);
  assert.strictEqual(clip.needsFrames(res.ocr), false);
});

/* --------------------------------------------------------------------------------- the report and the PDF ---- */

const at = (iso) => new Date(iso);
const reportPost = (id, iso, text, extra = {}) => ({
  id: String(id), platform: 'instagram', url: `https://instagram.com/p/${id}`, text, posted_at: at(iso), fetched_at: at(iso),
  engagement: { likes: 5, comments: 1 }, media_urls: ['media'], media_type: 'post', kind: 'original',
  analysis_status: 'done', analysis_result: { sentiment: 'neutral', risk_level: 'low', risk_score: 5, english_text: null }, image_analysis: null, account_handle: 'stone', ...extra,
});
const READ = clip.recordOf(READER_ANSWER);
const rows = normalisePosts([
  reportPost(1, '2021-01-01T04:30:00Z', '', { media_urls: ['video'], media_type: 'reel', image_analysis: READ }),
  reportPost(2, '2021-01-02T04:30:00Z', 'A speech', { media_urls: ['video'], media_type: 'reel', image_analysis: { video: clip.failureOf('Could not fetch video_url: returned HTTP 403.') } }),
  reportPost(3, '2021-01-03T04:30:00Z', 'A beach', { image_analysis: { description: 'A beach at sunset.', picture: { v: 2, description: 'A beach at sunset.', objects: ['sea'] } } }),
  reportPost(4, '2021-01-04T04:30:00Z', 'Watch this', { platform: 'youtube', media_type: 'video', media_urls: ['media'] }),
  reportPost(5, '2021-01-05T04:30:00Z', 'Only words', { media_urls: [], media_type: 'post' }),
], { timezone: 'Asia/Kolkata' });
const facts = buildBehaviorFacts({ account: { id: 1, display_name: 'Stone' }, accounts: [{ platform: 'instagram', platform_name: 'Instagram', handle: 'stone' }], rows, timezone: 'Asia/Kolkata', now: at('2026-11-25T06:00:00Z') });

test('a video post carries what the video showed and said on screen, apart from pictures', () => {
  const [v, failed, beach, youtube, words] = rows;
  assert.strictEqual(v.video, true);
  assert.strictEqual(v.isVideo, true);
  assert.strictEqual(v.videoSeconds, 52);
  assert.strictEqual(v.imageText, 'VOTE FOR CHANGE Rally 10am');
  assert.match(v.scene, /snowy landscape/);
  assert.strictEqual(v.noText, false);
  assert.deepStrictEqual([failed.isVideo, failed.video, failed.scene], [true, false, '']);
  assert.deepStrictEqual([beach.isVideo, beach.video], [false, false]);
  assert.deepStrictEqual([youtube.isVideo, youtube.video], [true, false], 'a YouTube video has no file to read');
  assert.deepStrictEqual([words.isVideo, words.video], [false, false]);
});

test('the facts count videos on their own and pictures without them, and say how many videos were not watched', () => {
  const c = facts.content;
  assert.deepStrictEqual(c.videos, { total: 3, read: 1 });
  assert.strictEqual(c.pictures.with_pictures, 1, 'only the beach is a picture');
  assert.strictEqual(c.pictures.described, 1);
  assert.deepStrictEqual(c.pictures.terms, [], 'what a video shows is not counted among the pictures');
  assert.strictEqual(c.with_media, 4);
  assert.strictEqual(c.with_image_text, 1, 'the on-screen text of the video counts as text read from the media');
  assert.ok(facts.coverage.notes.some((n) => /2 of 3 videos were not watched/.test(n)), facts.coverage.notes.join(' | '));
  assert.ok(!facts.coverage.notes.some((n) => /have no description of the picture/.test(n)), 'an unwatched video is not a picture without a description');
});

test('the evidence says whether the video was watched, and for how long', () => {
  const ev = selectEvidence(rows, { max: 10 });
  const byId = Object.fromEntries(ev.map((e) => [e.id, e]));
  assert.deepStrictEqual([byId['1'].is_video, byId['1'].video, byId['1'].video_seconds], [true, true, 52]);
  assert.deepStrictEqual([byId['2'].is_video, byId['2'].video, byId['2'].video_seconds], [true, false, null]);
  assert.deepStrictEqual([byId['3'].is_video, byId['3'].video], [false, false]);
});

test('the model is told what a video line is, and is not allowed to say what a video said or who is in it', () => {
  const evidence = selectEvidence(rows, { max: 10 });
  const ctx = buildUserContext({ facts, evidence, maxChars: 280 });
  assert.ok(ctx.includes('VIDEOS: 3 posts are videos; 1 of them have a description of what the video shows (in their "Video" lines) and the rest have only their caption'));
  const first = ctx.split('\n').filter((l) => /^\[P1\]/.test(l)).length;
  assert.strictEqual(first, 1);
  assert.match(ctx, /Video \(52s\): The video begins with a wide shot of a snowy landscape/);
  assert.match(ctx, /Video text: VOTE FOR CHANGE Rally 10am/);
  assert.ok(ctx.includes('Video: (no description available)'), 'a video nothing is known about says so');
  assert.ok(!/Picture: The video begins/.test(ctx), 'a video is not described as a picture');
  const system = buildSystemPrompt();
  assert.match(system, /24\. Videos\./);
  assert.match(system, /never say what was spoken or sung in a video, never name a person in it/);
  assert.ok(system.includes('"Video: (no description available)" has a video that nothing is known about'));
  assert.match(system, /Never write that a video was "read", "watched", "analysed" or "processed"/, 'the report must not describe how it was made');
  assert.ok(!/video reader/i.test(system), 'the prompt does not name the tool that looked at the videos');
  assert.ok(!/video itself was read|not read/i.test(ctx), 'nothing in the facts invites the model to talk about reading videos');
  // no VIDEOS line when the profile has none
  const plain = normalisePosts([reportPost(9, '2021-02-01T04:30:00Z', 'Hello')], { timezone: 'Asia/Kolkata' });
  const plainFacts = buildBehaviorFacts({ account: { id: 2, display_name: 'Plain' }, accounts: [{ platform: 'instagram', platform_name: 'Instagram', handle: 'p' }], rows: plain, timezone: 'Asia/Kolkata', now: at('2026-11-25T06:00:00Z') });
  assert.ok(!/VIDEOS:/.test(buildUserContext({ facts: plainFacts, evidence: selectEvidence(plain, { max: 5 }), maxChars: 280 })));
});

test('the PDF labels a video as a video: its tag, its length, its on-screen text and the count of videos watched', () => {
  const evidence = selectEvidence(rows, { max: 10 });
  const report = {
    bottom_line: 'A personal account that posts a rally video [P1].', account_type: 'Individual', account_type_basis: 'Mostly its own posts.',
    attention_level: 'Low', attention_reason: 'Nothing asks anyone to act.', behaviour_traits: [], themes: [], tone: 'Calm.', targets: [],
    communication_style: 'Short captions and videos.', posting_pattern: 'One post a day.', influence: 'Small reach.', risk_indicators: [], changes_over_time: [],
    notable_posts: [], watch_points: [], limitations: [],
  };
  const html = buildBehaviorReportHtml({ report, facts, evidence, summary_source: 'llm', generated_at: '2026-11-25T06:00:00Z', generated_by: { name: 'N' } });
  const body = html.slice(html.indexOf('<body>'));
  assert.match(body, /<span class="tag">Video post<\/span> VOTE FOR CHANGE Rally 10am/, 'a video with no caption: tagged, and its on-screen text is the post');
  assert.match(body, /Video \(52s\): The video begins with a wide shot of a snowy landscape/);
  assert.match(body, /Videos: 1 of 3 watched by the video reader/);
  assert.match(body, /2 of 3 videos were not watched/);
  assert.ok(!/Picture: The video begins/.test(body));
});

test('a report saved before videos were read opens exactly as it did', () => {
  const old = normalisePosts([reportPost(1, '2021-01-01T04:30:00Z', 'Old post', { media_urls: ['media'], media_type: 'reel' })], { timezone: 'Asia/Kolkata' });
  assert.strictEqual(old[0].isVideo, true);
  assert.strictEqual(old[0].video, false);
  const f = buildBehaviorFacts({ account: { id: 3, display_name: 'Old' }, accounts: [{ platform: 'instagram', platform_name: 'Instagram', handle: 'o' }], rows: old, timezone: 'Asia/Kolkata', now: at('2026-11-25T06:00:00Z') });
  const html = buildBehaviorReportHtml({ report: { bottom_line: 'x', attention_level: 'Low' }, facts: { ...f, content: { ...f.content, videos: undefined } }, evidence: selectEvidence(old, { max: 5 }).map(({ is_video, video, video_seconds, ...rest }) => rest) });
  assert.ok(!/undefined|NaN|\[object/.test(html.slice(html.indexOf('<body>'))));
  assert.ok(!/Videos:/.test(html));
});
