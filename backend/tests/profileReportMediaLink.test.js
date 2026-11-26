/**
 * Profile Report: showing a post's video. The platform's link is short-lived (an Instagram link carries its own expiry a day or two after
 * collection, then answers 403), so the server opens the stored link and, when it is refused, gets a fresh one from the data provider.
 * The platform, the provider and the database are faked: nothing is called.
 */
process.env.LLM_BASE_URL = process.env.LLM_BASE_URL || 'http://llm.test/v1';
const test = require('node:test');
const assert = require('node:assert');
const { PassThrough } = require('stream');

// the provider client is loaded on demand by the module under test, so its cache entry is replaced
const clientPath = require.resolve('../src/services/blugate/instagram/blugate.instagram.api_client');
require(clientPath);
const providerCalls = [];
let providerAnswer;
const fakeClient = async (key, body) => { providerCalls.push({ key, body }); if (providerAnswer instanceof Error) throw providerAnswer; return providerAnswer; };
fakeClient.authFromPlatformRow = () => ({ fake: true });
require.cache[clientPath].exports = fakeClient;

const mediaLink = require('../src/modules/profile-report/profileReport.mediaLink');
const store = require('../src/modules/profile-report/profileReport.store');
const controller = require('../src/modules/profile-report/profileReport.controller');
const { deps } = mediaLink.__test;

const OLD = 'https://instagram.fsrg6-1.fna.fbcdn.net/o1/v/t16/f2/m86/old.mp4?oe=15190000&sig=a';
const FRESH = 'https://instagram.fsrg6-1.fna.fbcdn.net/o1/v/t16/f2/m86/fresh.mp4?oe=69999999&sig=b';
const post = (extra = {}) => ({ id: '7', platform: 'instagram', url: 'https://www.instagram.com/p/AbC/', external_id: 'AbC', media_urls: [OLD], ...extra });
const prisma = { platforms: { findFirst: async () => ({ slug: 'instagram' }) } };

/** a platform answer: a status and some bytes */
const answer = (status, { type = 'video/mp4', length, body = 'VIDEOBYTES' } = {}) => {
  const data = new PassThrough();
  data.destroyed_ = false;
  const realDestroy = data.destroy.bind(data);
  data.destroy = (...a) => { data.destroyed_ = true; return realDestroy(...a); };
  data.end(body);
  return { status, headers: { 'content-type': type, ...(length === undefined ? {} : { 'content-length': String(length) }) }, data };
};

const opened = [];
const persisted = [];
const origSet = store.setPostMediaUrls;
let freshAnswer;
test.beforeEach(() => {
  opened.length = 0; persisted.length = 0; providerCalls.length = 0;
  providerAnswer = { items: [{ video_versions: [{ url: FRESH }] }] };
  freshAnswer = FRESH;
  mediaLink.__test.reset();
  deps.get = async (url) => { opened.push(url); throw new Error('unexpected request'); };
  deps.fresh = async () => freshAnswer;
  store.setPostMediaUrls = async (db, id, urls) => { persisted.push({ id, urls }); };
});
test.afterEach(() => { store.setPostMediaUrls = origSet; });

/* ------------------------------------------------------------------------------------------ the links ------ */

test('only an https link on a host name is ever fetched', () => {
  assert.strictEqual(mediaLink.isSafeUrl(OLD), true);
  for (const bad of ['http://cdn.example.com/a.mp4', 'https://127.0.0.1/a.mp4', 'https://10.0.0.5/a.mp4', 'https://localhost/a.mp4', 'https://db.internal/a.mp4', 'https://nas.local/a.mp4', 'https://intranet/a.mp4', 'https://[::1]/a.mp4', 'file:///etc/passwd', 'javascript:alert(1)', 'not a url', '', null, undefined]) {
    assert.strictEqual(mediaLink.isSafeUrl(bad), false, String(bad));
  }
});

test('the video link is found in whatever shape the provider answers with', () => {
  assert.strictEqual(mediaLink.findVideoUrl({ video_versions: [{ url: FRESH }, { url: 'https://x/other.mp4' }] }), FRESH, 'a feed item');
  assert.strictEqual(mediaLink.findVideoUrl({ data: { items: [{ code: 'x', video_versions: [{ url: FRESH }] }] } }), FRESH, 'wrapped in data and items');
  assert.strictEqual(mediaLink.findVideoUrl([{ image_versions2: { candidates: [{ url: 'https://x/pic.jpg' }] } }, { video_versions: [{ url: FRESH }] }]), FRESH, 'the second of a list');
  assert.strictEqual(mediaLink.findVideoUrl({ links: [{ url: 'https://x/pic.jpg' }, { url: 'https://x/clip.mp4?sig=1' }] }), 'https://x/clip.mp4?sig=1', 'a list of download links');
  assert.strictEqual(mediaLink.findVideoUrl({ results: { download_url: 'https://x/clip.webm' } }), 'https://x/clip.webm');
  assert.strictEqual(mediaLink.findVideoUrl({ items: [{ image_versions2: { candidates: [{ url: 'https://x/pic.jpg' }] } }] }), null, 'a picture is not a video');
  assert.strictEqual(mediaLink.findVideoUrl({ error: 'not found' }), null);
  assert.strictEqual(mediaLink.findVideoUrl(null), null);
  assert.strictEqual(mediaLink.findVideoUrl('https://x/clip.mp4'), null, 'a bare string is not an answer');
  const deep = {}; let at = deep; for (let i = 0; i < 30; i += 1) { at.next = {}; at = at.next; } at.video_url = 'https://x/deep.mp4';
  assert.strictEqual(mediaLink.findVideoUrl(deep), null, 'a hunt through a hundred levels stops');
});

test('a fresh link is asked for from the provider only for Instagram, a post with a shortcode, once in a while', async () => {
  deps.fresh = undefined;
  const ask = (p) => mediaLink.freshVideoUrl(prisma, 'tenant_t', p);
  assert.strictEqual(await ask(post({ platform: 'facebook' })), null, 'no call for one post on other platforms');
  assert.strictEqual(await ask(post({ external_id: null })), null);
  assert.strictEqual(providerCalls.length, 0);
  assert.strictEqual(await ask(post()), FRESH);
  assert.deepStrictEqual(providerCalls, [{ key: 'MEDIA_BY_SHORTCODE', body: { shortcode: 'AbC' } }]);
  assert.strictEqual(await ask(post()), null, 'the same post is not asked about again for 10 minutes');
  assert.strictEqual(providerCalls.length, 1);
  assert.strictEqual(await ask(post({ id: '8' })), null, 'and the provider is not asked twice within a few seconds');
  assert.strictEqual(providerCalls.length, 1);
});

test('a provider that is rate-limited, down or answers with nothing useful gives no link, never an error', async () => {
  const ask = (id) => mediaLink.freshVideoUrl(prisma, 'tenant_t', post({ id }));
  providerAnswer = Object.assign(new Error('Request failed'), { response: { status: 429 } });
  assert.strictEqual(await ask('21'), null);
  mediaLink.__test.reset();
  providerAnswer = { items: [] };
  assert.strictEqual(await ask('22'), null);
  mediaLink.__test.reset();
  providerAnswer = { items: [{ video_versions: [{ url: 'http://not-secure.example.com/a.mp4' }] }] };
  assert.strictEqual(await ask('23'), null, 'a link that could not be fetched safely is not used');
});

/* ------------------------------------------------------------------------------------- opening a video ----- */

test('a post with no video file, or an unsafe link, is refused plainly', async () => {
  assert.deepStrictEqual(await mediaLink.openVideo(prisma, 't', post({ media_urls: ['https://x/pic.jpg'] })), { ok: false, status: 404, message: 'This post has no video file.' });
  const unsafe = await mediaLink.openVideo(prisma, 't', post({ media_urls: ['http://10.0.0.1/a.mp4'] }));
  assert.strictEqual(unsafe.status, 422);
  assert.strictEqual(opened.length, 0, 'nothing was fetched');
});

test('a link that still works is passed on as it is, with its type and size', async () => {
  deps.get = async (url, opts) => { opened.push({ url, opts }); return answer(200, { length: 10 }); };
  const r = await mediaLink.openVideo(prisma, 't', post());
  assert.strictEqual(r.ok, true);
  assert.strictEqual(opened.length, 1);
  assert.strictEqual(opened[0].url, OLD);
  assert.strictEqual(opened[0].opts.responseType, 'stream');
  assert.strictEqual(opened[0].opts.headers.Referer, 'https://www.facebook.com/', 'asked the way picture downloads already ask this CDN (an fbcdn.net host)');
  assert.strictEqual(r.headers['Content-Type'], 'video/mp4');
  assert.strictEqual(r.headers['Content-Length'], '10');
  assert.strictEqual(r.headers['X-Content-Type-Options'], 'nosniff');
  assert.strictEqual(await new Promise((resolve) => { let s = ''; r.stream.on('data', (c) => { s += c; }); r.stream.on('end', () => resolve(s)); }), 'VIDEOBYTES');
  assert.strictEqual(persisted.length, 0, 'nothing is rewritten when nothing expired');
  assert.strictEqual(providerCalls.length, 0);
});

test('an expired link (403) is replaced by a fresh one from the provider, kept for next time, and the video is served from it', async () => {
  const stale = answer(403);
  deps.get = async (url) => { opened.push(url); return url === OLD ? stale : answer(200, { length: 10 }); };
  const r = await mediaLink.openVideo(prisma, 't', post({ media_urls: [OLD, 'https://x/cover.jpg'] }));
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(opened, [OLD, FRESH]);
  assert.strictEqual(stale.data.destroyed_, true, 'the refused response is dropped');
  assert.deepStrictEqual(persisted, [{ id: '7', urls: [FRESH, 'https://x/cover.jpg'] }], 'only the video link is replaced');
});

test('404 and 410 are treated the same as 403', async () => {
  for (const status of [401, 404, 410]) {
    opened.length = 0; persisted.length = 0;
    deps.get = async (url) => { opened.push(url); return url === OLD ? answer(status) : answer(200); };
    assert.strictEqual((await mediaLink.openVideo(prisma, 't', post())).ok, true, String(status));
    assert.strictEqual(opened.length, 2, String(status));
  }
});

test('when no fresh link can be had, the answer says so plainly and points to the original; nothing is rewritten', async () => {
  deps.get = async (url) => { opened.push(url); return answer(403); };
  freshAnswer = null;
  const r = await mediaLink.openVideo(prisma, 't', post());
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.status, 410);
  assert.match(r.message, /no longer serves this video, and a fresh link could not be fetched right now\. Open the original to watch it\./);
  assert.deepStrictEqual(opened, [OLD]);
  assert.strictEqual(persisted.length, 0);
  // a fresh link that is refused too is no better
  opened.length = 0;
  freshAnswer = FRESH;
  const both = await mediaLink.openVideo(prisma, 't', post());
  assert.strictEqual(both.status, 410);
  assert.deepStrictEqual(opened, [OLD, FRESH]);
  assert.strictEqual(persisted.length, 0, 'a link that does not work is not kept');
});

test('a platform that is itself down, a network failure, a huge video and an odd type are each handled', async () => {
  deps.get = async () => answer(503);
  const down = await mediaLink.openVideo(prisma, 't', post());
  assert.strictEqual(down.status, 502);
  assert.match(down.message, /Try again in a moment/);
  deps.get = async () => { throw new Error('ECONNRESET'); };
  assert.strictEqual((await mediaLink.openVideo(prisma, 't', post())).status, 502);
  process.env.PROFILE_REPORT_VIDEO_SERVE_MAX_MB = '5';
  try {
    const big = answer(200, { length: 6 * 1024 * 1024 });
    deps.get = async () => big;
    const r = await mediaLink.openVideo(prisma, 't', post());
    assert.strictEqual(r.status, 413);
    assert.strictEqual(big.data.destroyed_, true);
  } finally { delete process.env.PROFILE_REPORT_VIDEO_SERVE_MAX_MB; }
  deps.get = async () => answer(200, { type: 'text/html' });
  assert.strictEqual((await mediaLink.openVideo(prisma, 't', post())).headers['Content-Type'], 'video/mp4', 'a page is never passed on as itself');
});

/* ----------------------------------------------------------------------------------------- the endpoint ---- */

const origGetPostMedia = store.getPostMedia;
const origOpen = mediaLink.openVideo;
test.afterEach(() => { store.getPostMedia = origGetPostMedia; mediaLink.openVideo = origOpen; });
const reqOf = (postId) => { const handlers = {}; return { params: { postId }, tenantPrisma: prisma, tenantDbName: 'tenant_t', user: {}, on: (e, f) => { handlers[e] = f; }, handlers }; };
const resOf = () => {
  const out = new PassThrough();
  const chunks = [];
  out.on('data', (c) => chunks.push(c));
  out.statusCode = null; out.headers = {}; out.jsonBody = null;
  out.setHeader = (k, v) => { out.headers[k] = v; };
  out.status = (s) => { out.statusCode = s; return out; };
  out.json = (b) => { out.jsonBody = b; out.end(); return out; };
  out.text = () => Buffer.concat(chunks).toString();
  return out;
};
const done = (res) => new Promise((resolve) => { if (res.writableEnded) resolve(); else res.on('end', resolve); });

test('the endpoint streams the video with its headers', async () => {
  store.getPostMedia = async (db, id) => (id === 7 ? post() : null);
  mediaLink.openVideo = async () => ({ ok: true, stream: answer(200).data, headers: { 'Content-Type': 'video/mp4', 'Cache-Control': 'private, max-age=300' } });
  const res = resOf();
  await controller.getPostVideo(reqOf('7'), res);
  await done(res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.headers['Content-Type'], 'video/mp4');
  assert.strictEqual(res.text(), 'VIDEOBYTES');
});

test('the endpoint answers an unknown post, a bad id and a video that cannot be shown in plain words', async () => {
  store.getPostMedia = async () => null;
  const missing = resOf();
  await controller.getPostVideo(reqOf('99'), missing);
  assert.strictEqual(missing.statusCode, 404);
  assert.strictEqual(missing.jsonBody.message, 'Post not found');
  const bad = resOf();
  await controller.getPostVideo(reqOf('abc'), bad);
  assert.strictEqual(bad.statusCode, 400);
  store.getPostMedia = async () => post();
  mediaLink.openVideo = async () => ({ ok: false, status: 410, message: 'The platform no longer serves this video, and a fresh link could not be fetched right now. Open the original to watch it.' });
  const gone = resOf();
  await controller.getPostVideo(reqOf('7'), gone);
  assert.strictEqual(gone.statusCode, 410);
  assert.match(gone.jsonBody.message, /Open the original/);
  assert.ok(!/instagram|fbcdn|oe=|sig=/i.test(gone.jsonBody.message), 'no link, provider or platform detail leaks');
});

test('leaving the page stops the download', async () => {
  const upstream = answer(200).data;
  store.getPostMedia = async () => post();
  mediaLink.openVideo = async () => ({ ok: true, stream: upstream, headers: {} });
  const req = reqOf('7');
  const res = resOf();
  await controller.getPostVideo(req, res);
  req.handlers.close();
  assert.strictEqual(upstream.destroyed_, true);
});
