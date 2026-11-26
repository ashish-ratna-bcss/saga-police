/**
 * Profile Report: a video looked at frame by frame the way a picture is. The vision model is faked (nothing is called). Frames are cut by
 * the real ffmpeg and by the real headless Chrome wherever each exists (those tests are skipped where it does not), from a 20 KB test video.
 */
process.env.PROFILE_REPORT_VISION_URL = 'http://vision.test:8001';
delete process.env.PROFILE_REPORT_PICTURE_DESCRIPTION;
delete process.env.PROFILE_REPORT_VIDEO_FRAME_ANALYSIS;
delete process.env.PROFILE_REPORT_VIDEO_FRAME_ENGINE;
delete process.env.PROFILE_REPORT_VIDEO_FRAMES;
delete process.env.PROFILE_REPORT_VIDEO_MAX_MB;

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
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
const at = (t, extra = {}) => frame({ t, ...extra });

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

test('a weapon seen on four of 24 frames is kept, the stray "person trapped" on one frame is not, and the weapon is said first', () => {
  const all = Array.from({ length: 24 }, () => frame());
  [13, 16, 17, 20].forEach((i) => { all[i] = frame(RIFLE); });
  all[12] = frame({ alerts: ['person trapped, hurt or motionless'], description: 'Green leaves on the ground.' });   // the real stray alert
  const r = frames.summarise(all, { total: 24, lead: READER });
  assert.deepStrictEqual(r.alerts, ['weapon']);
  assert.match(r.description, /^Weapon \(seen in 4 of 24 frames\): A rifle is partially covered by green foliage\. The rifle has a brown stock and a silver barrel\. The video depicts a person handling a bundle of green leafy material/);
  assert.ok(r.objects.some((o) => /rifle/.test(o)), 'the objects of the frames that show the weapon are kept: ' + r.objects.join(' | '));
  assert.strictEqual(r.source, 'video');
  assert.strictEqual(r.kind, 'video');
  assert.deepStrictEqual(r.frames, { used: 24, total: 24 });
  assert.strictEqual(r.v, vision.PICTURE_VERSION);
  // it is a picture record to everything that reads pictures
  assert.strictEqual(signalsOf({ picture: r })[0], 'weapon');
  assert.ok(sceneOf({ picture: r, description: 'The reader said a knife' }, 900).includes('rifle'), 'the frames\' description comes before the reader\'s');
  assert.ok(sceneOf({ picture: r }, 900).startsWith('Weapon'), 'what the post list shows starts with what was found');
});

test('the description says when the weapon was seen', () => {
  const rifleAt = (...times) => times.map((t) => at(t, RIFLE));
  const mixed = (hits) => [at(5), at(10), ...hits, at(55)];
  const span = frames.summarise(mixed(rifleAt(33.2, 42.6)), { total: 5, lead: READER });
  assert.match(span.description, /^Weapon \(seen from 0:33 to 0:42, in 2 of 5 frames\): A rifle is partially covered/);
  const once = frames.summarise(mixed(rifleAt(42.6)), { total: 4, lead: READER });
  assert.match(once.description, /^Weapon \(seen at 0:42, in 1 of 4 frames\)/);
  const longer = frames.summarise([at(5), ...rifleAt(61, 125)], { total: 3 });
  assert.match(longer.description, /seen from 1:01 to 2:05/, 'minutes and seconds past a minute');
  // frames with no time (older callers) still read well
  assert.match(frames.summarise([frame(RIFLE), frame(RIFLE)], { total: 2 }).description, /^Weapon \(seen in 2 of 2 frames\)/);
});

test('frames less than two seconds apart are one moment, not two', () => {
  const m = (...ts) => frames.momentsOf(ts.map((t) => ({ t })));
  assert.strictEqual(m(30.2, 30.9), 1, 'neighbouring frames see the same thing');
  assert.strictEqual(m(30, 32.4), 2, 'the usual gap between frames is two moments');
  assert.strictEqual(m(33, 42, 51), 3);
  assert.strictEqual(m(30, 31, 32, 33), 1, 'a run of close frames is one moment, however long');
  assert.strictEqual(m(30), 1);
  assert.strictEqual(frames.momentsOf([{}, {}]), 2, 'frames with no time count one each');
  assert.strictEqual(frames.momentsOf([{ t: 1 }, {}]), 2);
});

test('a persistent mistake is not confirmed by the frames next to it: the sack that "looked like a person under a sheet" is one moment', () => {
  // the real case: a cream sack covering the frame for about three seconds was described as a person trapped under a white sheet
  const sack = (t) => at(t, { alerts: ['person trapped, hurt or motionless'], description: 'The person is trapped or buried under objects; white sheet. A person is partially covered by a white sheet.' });
  const r = frames.summarise([at(25), sack(29.6), sack(30.4), sack(31.2), at(36)], { total: 5 });
  assert.deepStrictEqual(r.alerts, [], 'one moment, and a claim about a person needs two');
  // the same claim at two separate moments is kept
  const two = frames.summarise([at(25), sack(30), at(33), sack(41), at(50)], { total: 5 });
  assert.deepStrictEqual(two.alerts, ['person trapped, hurt or motionless']);
});

test('only a weapon may stand on one moment, and only when that frame itself names it; anything else needs two moments', () => {
  const rifle = frames.summarise([at(5), at(10, RIFLE), at(15)], { total: 3 });
  assert.deepStrictEqual(rifle.alerts, ['weapon'], 'a rifle frame says "rifle"');
  const stray = frames.summarise([at(5), at(10, { alerts: ['weapon'], description: 'A pile of green leaves and a hand.', objects: ['leaves'] }), at(15)], { total: 3 });
  assert.deepStrictEqual(stray.alerts, [], 'an alert on one frame whose own words never mention a weapon');
  const fire = frames.summarise([at(5, { alerts: ['fire or smoke'], description: 'Smoke rises from a burning building.', objects: ['burning building'] }), at(10), at(15)], { total: 3 });
  assert.deepStrictEqual(fire.alerts, [], 'a fire named on one frame is still one moment');
  const fireTwice = frames.summarise([at(5, { alerts: ['fire or smoke'] }), at(10), at(15, { alerts: ['fire or smoke'] })], { total: 3 });
  assert.deepStrictEqual(fireTwice.alerts, ['fire or smoke']);
  const blood = frames.summarise([at(5, { alerts: ['blood or injury'], description: 'A man with blood on his shirt.', objects: ['blood'] }), at(10), at(15)], { total: 3 });
  assert.deepStrictEqual(blood.alerts, [], 'a claim about a person is never kept on one moment');
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
  const all = Array.from({ length: 21 }, (_, i) => at(i * 2.5));
  [0, 3].forEach((i) => { all[i] = at(i * 2.5, { description: 'A person in a dark hooded cloak holding a rifle against a snowy mountain.', objects: ['rifle'], alerts: ['weapon'] }); });
  const real = frames.summarise(all, { total: 21, lead: 'A fantasy short film.' });
  assert.deepStrictEqual(real.alerts, ['weapon'], 'as footage it would be flagged');
  const animated = frames.summarise(all, { total: 21, lead: 'A fantasy short film.', animated: true });
  assert.deepStrictEqual(animated.alerts, []);
  assert.strictEqual(animated.animated, true);
  assert.match(animated.description, /^Animated or computer-generated footage, not a recording of real events \(weapon seen in its frames is not counted\)\. A fantasy short film\.$/);
  assert.ok(!/Weapon \(seen/.test(animated.description), 'the weapon is not described as if it were real');
  assert.deepStrictEqual(signalsOf({ picture: animated }), [], 'nothing shows as "Seen in the video"');
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
  const when = (hoursAgo) => new Date(Date.now() - hoursAgo * 3600 * 1000);
  assert.strictEqual(clip.needsFrames({ ...read, picture: clip.framesFailureOf('No video tool', { now: when(100) }) }), false, 'a lasting failure');
  assert.strictEqual(clip.needsFrames({ ...read, picture: clip.framesFailureOf('busy', { transient: true, now: when(2) }) }), false, 'too soon');
  assert.strictEqual(clip.needsFrames({ ...read, picture: clip.framesFailureOf('busy', { transient: true, now: when(7) }) }), true, 'a busy vision model is asked again after 6 hours');
  assert.strictEqual(clip.needsFrames({ full_text: 'not a video' }), false);
  assert.strictEqual(clip.needsFrames(null), false);
});

/* ------------------------------------------------------------------------------------- which engine cuts ---- */

const withEnv = async (vars, fn) => {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  Object.entries(vars).forEach(([k, v]) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; });
  frames.__test.reset();
  try { return await fn(); } finally {
    Object.entries(saved).forEach(([k, v]) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; });
    frames.__test.reset();
  }
};
const puppeteer = require('puppeteer');
const realExecutablePath = puppeteer.executablePath;
const withoutChrome = async (fn) => { puppeteer.executablePath = () => path.join(os.tmpdir(), 'no-such-chrome'); try { return await fn(); } finally { puppeteer.executablePath = realExecutablePath; frames.__test.reset(); } };

test('with neither ffmpeg nor a browser there is no way to cut frames, which is a plain "not available", not an error', async () => {
  await withoutChrome(() => withEnv({ FFMPEG_PATH: path.join(os.tmpdir(), 'no-such-ffmpeg'), PATH: '' }, async () => {
    assert.strictEqual(frames.ffmpegPath(), null);
    assert.strictEqual(frames.pickEngine(), null);
    assert.strictEqual(frames.available(), false);
    assert.strictEqual(frames.enabled(), false);
    const r = await frames.analyse('https://cdn.example.com/a.mp4');
    assert.strictEqual(r.success, false);
    assert.strictEqual(r.unavailable, true, 'the caller leaves the video to be looked at later');
  }));
});

test('ffmpeg is used when it is there, the browser when it is not, and the engine can be chosen', async () => {
  const fakeChrome = path.join(os.tmpdir(), `prv-test-chrome-${process.pid}`);
  fs.writeFileSync(fakeChrome, '');   // only has to exist for it to count as "a browser is installed"
  const realPath = puppeteer.executablePath;
  puppeteer.executablePath = () => fakeChrome;
  try {
    await withEnv({ FFMPEG_PATH: path.join(os.tmpdir(), 'no-such-ffmpeg'), PATH: '' }, async () => {
      assert.strictEqual(frames.pickEngine().name, 'chrome', 'no ffmpeg: the browser');
      assert.strictEqual(frames.available(), true);
    });
    await withEnv({ FFMPEG_PATH: path.join(os.tmpdir(), 'no-such-ffmpeg'), PATH: '', PROFILE_REPORT_VIDEO_FRAME_ENGINE: 'ffmpeg' }, async () => {
      assert.strictEqual(frames.pickEngine(), null, 'ffmpeg asked for and not there');
    });
    await withEnv({ PROFILE_REPORT_VIDEO_FRAME_ENGINE: 'chrome' }, async () => {
      assert.strictEqual(frames.pickEngine().name, 'chrome', 'the browser asked for even though ffmpeg is there');
    });
    if (frames.ffmpegPath()) await withEnv({ PROFILE_REPORT_VIDEO_FRAME_ENGINE: undefined }, async () => { assert.strictEqual(frames.pickEngine().name, 'ffmpeg', 'both there: ffmpeg first'); });
  } finally {
    puppeteer.executablePath = realPath;
    fs.rmSync(fakeChrome, { force: true });
    frames.__test.reset();
  }
});

test('frame analysis can be switched off', () => {
  process.env.PROFILE_REPORT_VIDEO_FRAME_ANALYSIS = '0';
  try { assert.strictEqual(frames.enabled(), false); } finally { delete process.env.PROFILE_REPORT_VIDEO_FRAME_ANALYSIS; }
});

/* ------------------------------ the whole pass on a real (tiny) video, once for each engine that is here ------ */

const FIXTURE = path.join(__dirname, 'fixtures', 'tiny.mp4');   // 9 seconds, 320x240
let server;
let base;
const served = { status: 200, length: null };
test.before(async () => {
  const bytes = fs.readFileSync(FIXTURE);
  server = http.createServer((req, res) => {
    if (served.status !== 200) { res.writeHead(served.status); res.end('no'); return; }
    res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': served.length || bytes.length });
    if (served.length) res.end(Buffer.alloc(Math.min(served.length, 1024))); else res.end(bytes);
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

for (const engineName of ['ffmpeg', 'chrome']) {
  const present = frames.engines[engineName].available();
  const skip = present ? false : `${engineName} is not available here`;
  const forced = (fn) => withEnv({ PROFILE_REPORT_VIDEO_FRAME_ENGINE: engineName }, fn);

  test(`[${engineName}] a real clip: downloaded, frames cut and described one at a time with their times, and every temporary file removed`, { skip }, async () => {
    await forced(async () => {
      const before = tmpLeft().length;
      const r = await frames.analyse(`${base}/clip.mp4`, { postId: 't1', lead: READER });
      assert.strictEqual(r.success, true, JSON.stringify(r));
      assert.strictEqual(r.total, 12, 'a 9 second clip gets the minimum of 12 frames');
      assert.strictEqual(described.length, 12);
      for (const jpg of described) assert.ok(jpg[0] === 0xff && jpg[1] === 0xd8, 'each frame is a JPEG');
      assert.deepStrictEqual(r.described.map((f) => f.t), frames.sampleTimes(9, 12), 'each frame carries the moment it was cut at');
      assert.deepStrictEqual(r.data.alerts, ['weapon'], 'a weapon on 3 of 12 frames, in separate moments, is kept');
      assert.match(r.data.description, /^Weapon \(seen from 0:\d\d to 0:\d\d, in 3 of 12 frames\)/);
      assert.strictEqual(r.described.length, 12, 'the frame results come back, so the caller can combine them again with the reader\'s description');
      assert.strictEqual(tmpLeft().length, before, 'the temporary folder is gone');
    });
  });

  test(`[${engineName}] frames are different pictures at different moments, and a moment past the end is not a crash`, { skip }, async () => {
    await forced(async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prv-test-session-'));
      const session = await frames.engines[engineName].open(FIXTURE, { dir, durationHint: null });
      try {
        assert.ok(session.duration > 8.5 && session.duration < 9.6, `length ${session.duration}`);
        const a = await session.grab(1);
        const b = await session.grab(7);
        assert.ok(a && b, 'both frames were cut');
        assert.notStrictEqual(a, b, 'a different moment is a different picture (the test video counts up)');
        assert.ok(Buffer.from(a, 'base64')[0] === 0xff, 'a JPEG');
        const late = await session.grab(9999);
        assert.ok(late === null || typeof late === 'string', 'past the end gives the last frame or nothing, never an exception');
      } finally { await session.close(); fs.rmSync(dir, { recursive: true, force: true }); }
    });
  });

  test(`[${engineName}] the animation question is asked only when an alert is about to be kept, and an animation's alerts are dropped`, { skip }, async () => {
    await forced(async () => {
      const asked = [];
      const real = frames.__test.deps.animated;
      try {
        frames.__test.deps.animated = async (url) => { asked.push(url); return true; };
        const cartoon = await frames.analyse(`${base}/film.mp4`, { postId: 'a1', lead: 'A short film.' });
        assert.strictEqual(cartoon.success, true);
        assert.deepStrictEqual(asked, [`${base}/film.mp4`], 'asked about this video\'s own link');
        assert.deepStrictEqual(cartoon.data.alerts, []);
        assert.strictEqual(cartoon.data.animated, true);
        assert.strictEqual(cartoon.animated, true, 'the caller is told, so it combines the frames the same way');
        assert.match(cartoon.data.description, /^Animated or computer-generated footage/);
        asked.length = 0; described.length = 0;
        frames.__test.deps.animated = async (url) => { asked.push(url); return false; };
        const footage = await frames.analyse(`${base}/film.mp4`, { postId: 'a2' });
        assert.deepStrictEqual(footage.data.alerts, ['weapon']);
        assert.strictEqual(footage.animated, false);
        described.length = 0;
        frames.__test.deps.animated = async () => null;
        assert.deepStrictEqual((await frames.analyse(`${base}/film.mp4`, { postId: 'a3' })).data.alerts, ['weapon'], 'no clear answer: treated as real');
        asked.length = 0; described.length = 0;
        vision.describeBase64 = async (b64) => { described.push(b64); return { success: true, data: frame() }; };
        frames.__test.deps.animated = async (url) => { asked.push(url); return true; };
        const calm = await frames.analyse(`${base}/film.mp4`, { postId: 'a4' });
        assert.strictEqual(asked.length, 0, 'nothing flagged: not asked');
        assert.strictEqual(calm.animated, null);
      } finally { frames.__test.deps.animated = real; }
    });
  });

  test(`[${engineName}] a link the platform refuses is a lasting failure, with the link not repeated in the message`, { skip }, async () => {
    await forced(async () => {
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
  });

  test(`[${engineName}] a video over the size limit is not downloaded`, { skip }, async () => {
    await forced(async () => {
      process.env.PROFILE_REPORT_VIDEO_MAX_MB = '5';
      served.length = 20 * 1024 * 1024;
      try {
        const r = await frames.analyse(`${base}/big.mp4`, { postId: 't4' });
        assert.strictEqual(r.success, false);
        assert.strictEqual(r.nonRetryable, true);
        assert.match(r.error, /larger than 5 MB/);
      } finally { delete process.env.PROFILE_REPORT_VIDEO_MAX_MB; }
    });
  });

  test(`[${engineName}] a vision model that is busy for a moment is asked again for that frame; one that is down fails the pass, and it can be tried later`, { skip }, async () => {
    await forced(async () => {
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
      assert.strictEqual((await frames.analyse(`${base}/clip.mp4`, { postId: 't7' })).nonRetryable, true, 'a refusal is not repeated');
    });
  });

  test(`[${engineName}] some frames failing is fine when enough are described; too few fails the pass; running out of time still leaves a result`, { skip }, async () => {
    await forced(async () => {
      let n = 0;
      vision.describeBase64 = async () => { n += 1; return n % 3 === 0 ? { success: false, error: 'x', nonRetryable: true } : { success: true, data: frame() }; };
      const r = await frames.analyse(`${base}/clip.mp4`, { postId: 't8' });
      assert.strictEqual(r.success, true, 'eight of twelve');
      assert.strictEqual(r.described.length, 8);
      assert.deepStrictEqual(r.data.frames, { used: 8, total: 12 });
      let m = 0;
      vision.describeBase64 = async () => { m += 1; return m <= 5 ? { success: true, data: frame() } : { success: false, error: 'x', nonRetryable: true }; };
      assert.strictEqual((await frames.analyse(`${base}/clip.mp4`, { postId: 't9' })).success, false, 'five of twelve is not enough to say what a video shows');
      // a slow vision model: the pass stops describing at its deadline and goes on with what it has, when that is enough
      let k = 0;
      vision.describeBase64 = async () => { k += 1; await new Promise((resolve) => setTimeout(resolve, 150)); return { success: true, data: frame() }; };
      const t0 = Date.now();
      const slow = await frames.analyse(`${base}/clip.mp4`, { postId: 't10', deadline: Date.now() + 1300 });
      assert.ok(Date.now() - t0 < 5000);
      assert.ok(slow.success ? slow.described.length >= 6 && slow.described.length < 12 : /Only \d+ of 12/.test(slow.error), `a partial result or a plain failure, got ${JSON.stringify(slow.success ? slow.described.length : slow.error)}`);
      assert.ok(k < 12, 'it stopped before describing every frame');
    });
  });
}

/* ----------------------------------------------------------------------------- ffmpeg's own helpers -------- */

const hasFfmpeg = Boolean(frames.ffmpegPath());
test('ffmpeg: a video\'s length is read from the file, and a frame that cannot be written is false, not a crash', { skip: hasFfmpeg ? false : 'ffmpeg is not installed here' }, async () => {
  const bin = frames.ffmpegPath();
  const d = await frames.probeDuration(bin, FIXTURE);
  assert.ok(d > 8.5 && d < 9.6, `read ${d}`);
  const out = path.join(os.tmpdir(), `prv-test-frame-${process.pid}.jpg`);
  assert.strictEqual(await frames.grabFrame(bin, FIXTURE, 4, out), true);
  assert.ok(fs.statSync(out).size > 500);
  fs.unlinkSync(out);
  assert.strictEqual(await frames.grabFrame(bin, FIXTURE, 4, path.join(os.tmpdir(), 'no-such-dir-x', 'f.jpg')), false);
});
