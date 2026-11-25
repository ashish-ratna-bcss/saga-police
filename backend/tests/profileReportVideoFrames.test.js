/**
 * Profile Report: a video looked at frame by frame the way a picture is. The vision model is faked (nothing is called); ffmpeg is the
 * real one where it is installed (those tests are skipped where it is not).
 */
process.env.PROFILE_REPORT_VISION_URL = 'http://vision.test:8001';
delete process.env.PROFILE_REPORT_PICTURE_DESCRIPTION;
delete process.env.PROFILE_REPORT_VIDEO_FRAME_ANALYSIS;
delete process.env.PROFILE_REPORT_VIDEO_FRAMES;
delete process.env.PROFILE_REPORT_VIDEO_MAX_MB;

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');
const test = require('node:test');
const assert = require('node:assert');

const vision = require('../src/modules/profile-report/profileReport.vision');
const frames = require('../src/modules/profile-report/profileReport.videoFrames');
const clip = require('../src/modules/profile-report/profileReport.video');
const { sceneOf, signalsOf } = require('../src/services/media_post_analysis/imageText');

/** What the vision model's picture record looks like for one frame. */
const frame = (extra = {}) => ({ v: 2, description: 'A pile of green leaves.', kind: null, people: null, setting: '', objects: [], flags: [], symbols: [], text_visible: '', alerts: [], ...extra });
const RIFLE = { description: 'A rifle is partially covered by green foliage. The rifle has a brown stock and a silver barrel.', objects: ['rifle with brown stock and silver barrel', 'a curved magazine'], alerts: ['weapon'] };
const READER = 'The video depicts a person handling a bundle of green leafy material, possibly vegetables or herbs. The person is seen interacting with a knife or cutting tool.';

/* ------------------------------------------------------------------------------------------ how many frames -- */

test('about one frame every 2.5 seconds, never fewer than 12 and never more than the limit', () => {
  assert.strictEqual(frames.frameCount(null), 12, 'length unknown');
  assert.strictEqual(frames.frameCount(10), 12);
  assert.strictEqual(frames.frameCount(30), 12);
  assert.strictEqual(frames.frameCount(60), 24, 'a minute, like the real test video');
  assert.strictEqual(frames.frameCount(80), 32);
  assert.strictEqual(frames.frameCount(3600), 32, 'an hour does not get thousands');
  process.env.PROFILE_REPORT_VIDEO_FRAMES = '16';
  assert.strictEqual(frames.frameCount(60), 16, 'the limit can be changed');
  process.env.PROFILE_REPORT_VIDEO_FRAMES = '4';
  assert.strictEqual(frames.frameCount(60), 6, 'but not below 6');
  delete process.env.PROFILE_REPORT_VIDEO_FRAMES;
});

test('the frames are spread over the whole video, each in the middle of its share', () => {
  assert.deepStrictEqual(frames.sampleTimes(60, 12).slice(0, 3), [2.5, 7.5, 12.5]);
  assert.strictEqual(frames.sampleTimes(60, 12).length, 12);
  assert.ok(frames.sampleTimes(60, 12).at(-1) < 60);
  assert.deepStrictEqual(frames.sampleTimes(null, 12), [0.1], 'length unknown: one frame near the start');
  assert.deepStrictEqual(frames.sampleTimes(0.4, 12), [0.1]);
  assert.strictEqual(frames.sampleTimes(2, 12).length, 4, 'a two second clip gets a few frames, not twelve');
});

/* ---------------------------------------------------------------------------------- combining the frames ---- */

test('a weapon seen on four of 24 frames is kept, the stray "person trapped" on one frame is not, and the description says what was seen', () => {
  const all = Array.from({ length: 24 }, () => frame());
  [13, 16, 17, 20].forEach((i) => { all[i] = frame(RIFLE); });
  all[12] = frame({ alerts: ['person trapped, hurt or motionless'], description: 'Green leaves on the ground.' });   // the real stray alert
  const r = frames.summarise(all, { total: 24, lead: READER });
  assert.deepStrictEqual(r.alerts, ['weapon']);
  assert.match(r.description, /^The video depicts a person handling a bundle of green leafy material/);
  assert.match(r.description, /Weapon \(seen in 4 of 24 frames\): A rifle is partially covered by green foliage\. The rifle has a brown stock and a silver barrel\.$/);
  assert.ok(r.objects.some((o) => /rifle/.test(o)), 'the objects of the frames that show the weapon are kept: ' + r.objects.join(' | '));
  assert.strictEqual(r.source, 'video');
  assert.strictEqual(r.kind, 'video');
  assert.deepStrictEqual(r.frames, { used: 24, total: 24 });
  assert.strictEqual(r.v, vision.PICTURE_VERSION);
  // it is a picture record to everything that reads pictures
  assert.deepStrictEqual(signalsOf({ picture: r }), ['weapon', 'rifle with brown stock and silver barrel'].slice(0, 1).concat(signalsOf({ picture: r }).slice(1)));
  assert.strictEqual(signalsOf({ picture: r })[0], 'weapon');
  assert.ok(sceneOf({ picture: r, description: 'The reader said a knife' }, 900).includes('rifle'), 'the frames\' description comes before the reader\'s');
});

test('one frame is enough when that frame itself names the thing; a lone alert the frame does not describe is dropped', () => {
  const named = frames.summarise([frame(), frame(RIFLE), frame()], { total: 3 });
  assert.deepStrictEqual(named.alerts, ['weapon'], 'a rifle frame says "rifle"');
  assert.match(named.description, /Weapon \(seen in 1 of 3 frames\)/);
  const stray = frames.summarise([frame(), frame({ alerts: ['weapon'], description: 'A pile of green leaves and a hand.', objects: ['leaves'] }), frame()], { total: 3 });
  assert.deepStrictEqual(stray.alerts, [], 'an alert on one frame whose own words never mention a weapon');
  const fire = frames.summarise([frame({ alerts: ['fire or smoke'], description: 'Smoke rises from a burning building.', objects: ['burning building'] }), frame(), frame()], { total: 3 });
  assert.deepStrictEqual(fire.alerts, ['fire or smoke']);
  const twice = frames.summarise([frame({ alerts: ['crowd or protest'] }), frame({ alerts: ['crowd or protest'] }), frame()], { total: 3 });
  assert.deepStrictEqual(twice.alerts, ['crowd or protest'], 'two frames agreeing is enough');
});

test('a video with nothing to flag has no alerts, and objects are only those seen more than once', () => {
  const r = frames.summarise([
    frame({ objects: ['pile of green leaves', 'a stone sculpture'] }), frame({ objects: ['pile of green leaves'] }), frame({ objects: ['Pile of green leaves', 'red vehicle'] }), frame(),
  ], { total: 4, lead: READER });
  assert.deepStrictEqual(r.alerts, []);
  assert.deepStrictEqual(r.objects, ['pile of green leaves'], 'the sculpture and the vehicle each appeared once: a blurred frame\'s invention');
  assert.strictEqual(r.description, READER.replace(/\s+/g, ' '));
  // no lead and nothing flagged: the objects that recur are the description
  const bare = frames.summarise([frame({ objects: ['green leaves'] }), frame({ objects: ['green leaves'] })], { total: 2 });
  assert.strictEqual(bare.description, 'Frames of the video show green leaves.');
  assert.strictEqual(frames.summarise([frame(), frame()], { total: 2 }).description, '', 'nothing to say is nothing said');
});

test('flags need two frames; the description is bounded; a named person is still noted as not identified', () => {
  const one = frames.summarise([frame({ flags: ['flag with red and green bands'] }), frame(), frame()], { total: 3 });
  assert.deepStrictEqual(one.flags, []);
  const two = frames.summarise([frame({ flags: ['flag with red and green bands'] }), frame({ flags: ['Flag with red and green bands'] }), frame()], { total: 3 });
  assert.deepStrictEqual(two.flags, ['flag with red and green bands']);
  assert.strictEqual(signalsOf({ picture: two }).includes('flag with red and green bands'), true);
  const long = frames.summarise([frame()], { total: 1, lead: 'A very long sentence. '.repeat(200) });
  assert.ok(Array.from(long.description).length <= 900);
  assert.strictEqual(frames.summarise([frame({ not_identified: true }), frame()], { total: 2 }).not_identified, true);
});

test('an animation, cartoon or game is not a recording of real events: its alerts are not counted, and the description says so', () => {
  const all = Array.from({ length: 21 }, () => frame());
  [0, 3].forEach((i) => { all[i] = frame({ description: 'A person in a dark hooded cloak holding a rifle against a snowy mountain.', objects: ['rifle'], alerts: ['weapon'] }); });
  const real = frames.summarise(all, { total: 21, lead: 'A fantasy short film.' });
  assert.deepStrictEqual(real.alerts, ['weapon'], 'as footage it would be flagged');
  const animated = frames.summarise(all, { total: 21, lead: 'A fantasy short film.', animated: true });
  assert.deepStrictEqual(animated.alerts, []);
  assert.strictEqual(animated.animated, true);
  assert.match(animated.description, /Animated or computer-generated footage, not a recording of real events \(weapon seen in its frames is not counted\)\./);
  assert.ok(!/Weapon \(seen in/.test(animated.description), 'the weapon is not described as if it were real');
  assert.deepStrictEqual(signalsOf({ picture: animated }), [], 'nothing shows as "Seen in the video"');
  // nothing to say about an animation that raised nothing
  const quiet = frames.summarise([frame(), frame()], { total: 2, lead: 'A cartoon.', animated: true });
  assert.strictEqual(quiet.description, 'A cartoon.');
  assert.deepStrictEqual(quiet.alerts, []);
});

test('the question "real footage or animation?" is asked of the whole video and read as true, false or no answer', async () => {
  const axios = require('axios');
  const realPost = axios.post;
  const sent = [];
  let reply;
  axios.post = async (url, body) => {
    sent.push({ url, body });
    if (reply instanceof Error) throw reply;
    return { data: { choices: [{ message: { content: reply } }] } };
  };
  try {
    reply = '{"footage": "animated"}';
    assert.strictEqual(await frames.askAnimated('https://cdn.example.com/film.mp4'), true);
    assert.strictEqual(sent[0].url, 'http://vision.test:8001/v1/chat/completions');
    assert.strictEqual(sent[0].body.temperature, 0);
    const parts = sent[0].body.messages[1].content;
    assert.deepStrictEqual(parts[0], { type: 'video_url', video_url: { url: 'https://cdn.example.com/film.mp4' } });
    assert.match(parts[1].text, /real-life footage recorded by a camera, or .*animation, cartoon, video game/);
    reply = '```json\n{"footage": "real"}\n```';
    assert.strictEqual(await frames.askAnimated('https://cdn.example.com/a.mp4'), false, 'a fenced answer is read');
    reply = '{"footage": "cannot tell"}';
    assert.strictEqual(await frames.askAnimated('https://cdn.example.com/a.mp4'), null);
    reply = 'I think it is a film.';
    assert.strictEqual(await frames.askAnimated('https://cdn.example.com/a.mp4'), null);
    reply = new Error('socket hang up');
    assert.strictEqual(await frames.askAnimated('https://cdn.example.com/a.mp4'), null, 'no answer is not animated');
  } finally { axios.post = realPost; }
});

test('if the vision server cannot fetch the link, the downloaded file is sent instead, when it is small enough', async () => {
  const axios = require('axios');
  const realPost = axios.post;
  const small = path.join(os.tmpdir(), `prv-test-ask-small-${process.pid}.mp4`);
  const big = path.join(os.tmpdir(), `prv-test-ask-big-${process.pid}.mp4`);
  fs.writeFileSync(small, Buffer.from('tiny video bytes'));
  fs.writeFileSync(big, Buffer.alloc(26 * 1024 * 1024, 1));
  const sources = [];
  let linkWorks = false;
  axios.post = async (url, body) => {
    const source = body.messages[1].content[0].video_url.url;
    sources.push(source.startsWith('data:') ? 'file' : 'link');
    if (!source.startsWith('data:') && !linkWorks) throw new Error('could not fetch the link');
    return { data: { choices: [{ message: { content: '{"footage": "animated"}' } }] } };
  };
  try {
    assert.strictEqual(await frames.askAnimated('https://private.example.com/a.mp4', { file: small }), true);
    assert.deepStrictEqual(sources, ['link', 'file'], 'the link first, then the file');
    sources.length = 0;
    assert.strictEqual(await frames.askAnimated('https://private.example.com/a.mp4', { file: big }), null, 'a 26 MB file is not sent in a request');
    assert.deepStrictEqual(sources, ['link']);
    sources.length = 0;
    linkWorks = true;
    assert.strictEqual(await frames.askAnimated('https://cdn.example.com/a.mp4', { file: small }), true);
    assert.deepStrictEqual(sources, ['link'], 'a link that works is all that is sent');
    sources.length = 0;
    assert.strictEqual(await frames.askAnimated('https://cdn.example.com/a.mp4', { file: path.join(os.tmpdir(), 'no-such-file.mp4') }), true, 'a missing file is no problem when the link works');
  } finally {
    axios.post = realPost;
    fs.rmSync(small, { force: true });
    fs.rmSync(big, { force: true });
  }
});

test('what a video\'s picture is in each state decides whether it is looked at', () => {
  const read = clip.recordOf({ duration_seconds: 60, description: READER });
  assert.deepStrictEqual(read.picture, { skipped: 'video' });
  assert.strictEqual(clip.needsFrames(read), true, 'read by the reader only');
  assert.strictEqual(clip.needsFrames({ ...read, picture: { skipped: 'video', queued: true } }), true, 'queued');
  assert.strictEqual(clip.needsFrames({ ...read, picture: frames.summarise([frame(RIFLE)], { total: 1 }) }), false, 'looked at');
  const at = (hoursAgo) => new Date(Date.now() - hoursAgo * 3600 * 1000);
  assert.strictEqual(clip.needsFrames({ ...read, picture: clip.framesFailureOf('No video tool', { now: at(100) }) }), false, 'a lasting failure');
  assert.strictEqual(clip.needsFrames({ ...read, picture: clip.framesFailureOf('busy', { transient: true, now: at(2) }) }), false, 'too soon');
  assert.strictEqual(clip.needsFrames({ ...read, picture: clip.framesFailureOf('busy', { transient: true, now: at(7) }) }), true, 'a busy vision model is asked again after 6 hours');
  assert.strictEqual(clip.needsFrames({ full_text: 'not a video' }), false);
  assert.strictEqual(clip.needsFrames(null), false);
});

/* ------------------------------------------------------------------------------------------------ ffmpeg --- */

test('ffmpeg is found by FFMPEG_PATH or the PATH, and its absence is a plain "not available", not an error', () => {
  const saved = { path: process.env.PATH, ff: process.env.FFMPEG_PATH };
  try {
    process.env.FFMPEG_PATH = path.join(os.tmpdir(), 'no-such-ffmpeg');
    process.env.PATH = '';
    frames.__test.reset();
    assert.strictEqual(frames.ffmpegPath(), null);
    assert.strictEqual(frames.available(), false);
    assert.strictEqual(frames.enabled(), false);
  } finally {
    process.env.PATH = saved.path;
    if (saved.ff === undefined) delete process.env.FFMPEG_PATH; else process.env.FFMPEG_PATH = saved.ff;
    frames.__test.reset();
  }
});

test('without ffmpeg the pass does nothing and says so (the caller leaves the video to be looked at later)', async () => {
  const saved = { path: process.env.PATH, ff: process.env.FFMPEG_PATH };
  try {
    process.env.FFMPEG_PATH = path.join(os.tmpdir(), 'no-such-ffmpeg');
    process.env.PATH = '';
    frames.__test.reset();
    const r = await frames.analyse('https://cdn.example.com/a.mp4');
    assert.strictEqual(r.success, false);
    assert.strictEqual(r.unavailable, true);
  } finally {
    process.env.PATH = saved.path;
    if (saved.ff === undefined) delete process.env.FFMPEG_PATH; else process.env.FFMPEG_PATH = saved.ff;
    frames.__test.reset();
  }
});

test('frame analysis can be switched off', () => {
  process.env.PROFILE_REPORT_VIDEO_FRAME_ANALYSIS = '0';
  try { assert.strictEqual(frames.enabled(), false); } finally { delete process.env.PROFILE_REPORT_VIDEO_FRAME_ANALYSIS; }
});

/* --------------------------------------- the whole pass on a real (tiny, generated) video, with ffmpeg ----- */

const hasFfmpeg = frames.available();
const skip = hasFfmpeg ? false : 'ffmpeg is not installed here';

let server;
let base;
const served = { status: 200, bytes: null, length: null };
test.before(async () => {
  if (!hasFfmpeg) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prv-test-'));
  const file = path.join(dir, 'tiny.mp4');
  const r = spawnSync(frames.ffmpegPath(), ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=10', '-t', '9', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', file]);
  assert.strictEqual(r.status, 0, 'a test video can be generated');
  served.bytes = fs.readFileSync(file);
  fs.rmSync(dir, { recursive: true, force: true });
  server = http.createServer((req, res) => {
    if (served.status !== 200) { res.writeHead(served.status); res.end('no'); return; }
    res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': served.length || served.bytes.length });
    if (served.length) res.end(Buffer.alloc(Math.min(served.length, 1024))); else res.end(served.bytes);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { if (server) server.close(); });

const realVision = vision.describeBase64;
const described = [];
test.beforeEach(() => {
  described.length = 0;
  served.status = 200; served.length = null;
  vision.describeBase64 = async (b64) => {
    described.push(Buffer.from(b64, 'base64'));
    const n = described.length;
    return { success: true, data: frame(n % 4 === 0 ? RIFLE : { objects: ['test pattern'] }) };
  };
});
test.afterEach(() => { vision.describeBase64 = realVision; });
const tmpLeft = () => fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('prv-') && !f.startsWith('prv-test-'));

test('a real clip: downloaded, its length read, frames cut and described one at a time, and every temporary file removed', { skip }, async () => {
  const before = tmpLeft().length;
  const r = await frames.analyse(`${base}/clip.mp4`, { postId: 't1', lead: READER });
  assert.strictEqual(r.success, true, JSON.stringify(r));
  assert.strictEqual(r.total, 12, 'a 9 second clip gets the minimum of 12 frames');
  assert.strictEqual(described.length, 12);
  for (const jpg of described) assert.ok(jpg[0] === 0xff && jpg[1] === 0xd8, 'each frame is a JPEG');
  assert.deepStrictEqual(r.data.alerts, ['weapon'], 'a weapon on 3 of 12 frames is kept');
  assert.match(r.data.description, /Weapon \(seen in 3 of 12 frames\)/);
  assert.strictEqual(r.described.length, 12, 'the frame results come back, so the caller can combine them again with the reader\'s description');
  assert.strictEqual(tmpLeft().length, before, 'the temporary folder is gone');
});

test('the length of the video is read when it is not given, and a given length is trusted', { skip }, async () => {
  const bin = frames.ffmpegPath();
  const file = path.join(os.tmpdir(), `prv-test-len-${process.pid}.mp4`);
  fs.writeFileSync(file, served.bytes);
  try {
    const d = await frames.probeDuration(bin, file);
    assert.ok(d > 8.5 && d < 9.6, `read ${d}`);
    const out = path.join(os.tmpdir(), `prv-test-frame-${process.pid}.jpg`);
    assert.strictEqual(await frames.grabFrame(bin, file, 4, out), true);
    assert.ok(fs.statSync(out).size > 500);
    fs.unlinkSync(out);
    assert.strictEqual(await frames.grabFrame(bin, file, 4, path.join(os.tmpdir(), 'no-such-dir-x', 'f.jpg')), false, 'a frame that cannot be written is false, not a crash');
  } finally { fs.rmSync(file, { force: true }); }
  // a length the caller already knows (the reader's) is accepted too
  const r = await frames.analyse(`${base}/clip.mp4`, { postId: 't2', durationHint: 9 });
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.total, 12);
});

test('the animation question is asked only when an alert is about to be kept, and an animation\'s alerts are dropped', { skip }, async () => {
  const asked = [];
  const real = frames.__test.deps.animated;
  try {
    // alerts on 4 of 12 frames (the stub in beforeEach flags every fourth), and the video turns out to be animated
    frames.__test.deps.animated = async (url) => { asked.push(url); return true; };
    const cartoon = await frames.analyse(`${base}/film.mp4`, { postId: 'a1', lead: 'A short film.' });
    assert.strictEqual(cartoon.success, true);
    assert.deepStrictEqual(asked, [`${base}/film.mp4`], 'asked about this video\'s own link');
    assert.deepStrictEqual(cartoon.data.alerts, []);
    assert.strictEqual(cartoon.data.animated, true);
    assert.strictEqual(cartoon.animated, true, 'the caller is told, so it combines the frames the same way');
    assert.match(cartoon.data.description, /Animated or computer-generated footage/);
    // real footage: kept
    asked.length = 0; described.length = 0;
    frames.__test.deps.animated = async (url) => { asked.push(url); return false; };
    const footage = await frames.analyse(`${base}/film.mp4`, { postId: 'a2' });
    assert.deepStrictEqual(footage.data.alerts, ['weapon']);
    assert.strictEqual(footage.animated, false);
    // no clear answer: treated as real
    described.length = 0;
    frames.__test.deps.animated = async () => null;
    assert.deepStrictEqual((await frames.analyse(`${base}/film.mp4`, { postId: 'a3' })).data.alerts, ['weapon']);
    // nothing flagged: the question is not asked at all
    asked.length = 0; described.length = 0;
    vision.describeBase64 = async (b64) => { described.push(b64); return { success: true, data: frame() }; };
    frames.__test.deps.animated = async (url) => { asked.push(url); return true; };
    const calm = await frames.analyse(`${base}/film.mp4`, { postId: 'a4' });
    assert.strictEqual(asked.length, 0);
    assert.strictEqual(calm.animated, null);
    assert.deepStrictEqual(calm.data.alerts, []);
  } finally { frames.__test.deps.animated = real; }
});

test('a link the platform refuses is a lasting failure, with the link not repeated in the message', { skip }, async () => {
  served.status = 403;
  const before = tmpLeft().length;
  const r = await frames.analyse(`${base}/secret-signed-link.mp4?oe=69999999`, { postId: 't3' });
  assert.strictEqual(r.success, false);
  assert.strictEqual(r.nonRetryable, true);
  assert.match(r.error, /HTTP 403/);
  assert.ok(!/signed|oe=/.test(r.error));
  assert.strictEqual(described.length, 0);
  assert.strictEqual(tmpLeft().length, before);
});

test('a video over the size limit is not downloaded', { skip }, async () => {
  process.env.PROFILE_REPORT_VIDEO_MAX_MB = '5';
  served.length = 20 * 1024 * 1024;   // says it is 20 MB
  try {
    const r = await frames.analyse(`${base}/big.mp4`, { postId: 't4' });
    assert.strictEqual(r.success, false);
    assert.strictEqual(r.nonRetryable, true);
    assert.match(r.error, /larger than 5 MB/);
  } finally { delete process.env.PROFILE_REPORT_VIDEO_MAX_MB; }
});

test('a vision model that is busy for a moment is asked again for that frame; one that is down fails the pass, and it can be tried later', { skip }, async () => {
  let calls = 0;
  vision.describeBase64 = async () => { calls += 1; return calls === 1 ? { success: false, error: 'Vision model: socket hang up' } : { success: true, data: frame() }; };
  const ok = await frames.analyse(`${base}/clip.mp4`, { postId: 't5' });
  assert.strictEqual(ok.success, true);
  assert.strictEqual(calls, 13, 'the first frame was asked twice');

  vision.describeBase64 = async () => ({ success: false, error: 'Vision model: socket hang up' });
  const down = await frames.analyse(`${base}/clip.mp4`, { postId: 't6' });
  assert.strictEqual(down.success, false);
  assert.strictEqual(down.nonRetryable, false, 'a busy model is worth trying again');
  assert.match(down.error, /Only 0 of 12 frames/);

  vision.describeBase64 = async () => ({ success: false, error: 'Vision model HTTP 400: bad image', nonRetryable: true });
  const bad = await frames.analyse(`${base}/clip.mp4`, { postId: 't7' });
  assert.strictEqual(bad.nonRetryable, true, 'a refusal is not repeated');
});

test('some frames failing is fine when enough are described; too few fails the pass', { skip }, async () => {
  let n = 0;
  vision.describeBase64 = async () => { n += 1; return n % 3 === 0 ? { success: false, error: 'x', nonRetryable: true } : { success: true, data: frame() }; };
  const r = await frames.analyse(`${base}/clip.mp4`, { postId: 't8' });
  assert.strictEqual(r.success, true, 'eight of twelve');
  assert.strictEqual(r.described.length, 8);
  assert.deepStrictEqual(r.data.frames, { used: 8, total: 12 });
  let m = 0;
  vision.describeBase64 = async () => { m += 1; return m <= 5 ? { success: true, data: frame() } : { success: false, error: 'x', nonRetryable: true }; };
  const few = await frames.analyse(`${base}/clip.mp4`, { postId: 't9' });
  assert.strictEqual(few.success, false, 'five of twelve is not enough to say what a video shows');
});
