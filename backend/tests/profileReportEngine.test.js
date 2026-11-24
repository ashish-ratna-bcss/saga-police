process.env.LLM_BASE_URL = process.env.LLM_BASE_URL || 'http://llm.test/v1';

const test = require('node:test');
const assert = require('node:assert');
const { normalisePosts, buildBehaviorFacts, selectEvidence, attentionLevel, citedPostNumbers } = require('../src/modules/profile-report/report/reportFacts');
const { parseBehaviorReport, fallbackReport, buildUserContext, cleanCites } = require('../src/modules/profile-report/report/reportPrompt');
const { buildBehaviorReportHtml } = require('../src/modules/profile-report/report/reportPdf');
const { lockReason } = require('../src/modules/profile-report/report/reportService');
const { kindOf, cleanDeep, encodeCursor, decodeCursor, upstreamStatusOf, providerFailure } = require('../src/modules/profile-report/profileReport.util');
const { tidyIdentity } = require('../src/modules/profile-report/profileReport.service');
const collectMod = require('../src/modules/profile-report/profileReport.collect');
const { plainFetchError, SUPPORTED_PLATFORMS } = collectMod;
const { nextCursorOf } = require('../src/services/blugate/instagram/blugate.instagram.helpers');
const { computeAccountRelevance } = require('../src/modules/social-profiles/catalogRelevance.service');

const at = (iso) => new Date(iso);
const post = (id, iso, text, analysis = {}, extra = {}) => ({
  id: String(id), platform: 'x', url: `https://x.com/a/status/${id}`, text, posted_at: at(iso), fetched_at: at(iso),
  engagement: { likes: 0, retweets: 0, replies: 0 }, media_urls: [], media_type: null, kind: 'original',
  analysis_status: analysis.sentiment ? 'done' : 'pending', analysis_result: analysis, image_analysis: null, account_handle: 'ashish', ...extra,
});
const A = (sentiment, risk_level = 'low', risk_score = 10, more = {}) => ({ sentiment, risk_level, risk_score, english_text: null, ...more });

const POSTS = [
  // 18:30 IST on a Monday
  post(1, '2026-11-02T13:00:00Z', 'Road is broken again #Ranchi @dcranchi', A('negative', 'low', 12, { category: 'civic', stance: 'oppose' }), { engagement: { likes: 40, retweets: 5, replies: 3 } }),
  post(2, '2026-11-03T13:10:00Z', 'Great work by the traffic police today', A('positive', 'low', 5, { category: 'praise', stance: 'support' })),
  post(3, '2026-11-05T20:30:00Z', 'Everyone block the highway tomorrow at 10, bandh!', A('negative', 'high', 78, { category: 'protest' })),
  post(4, '2026-11-06T13:00:00Z', 'RT @news: Budget announced', A('neutral', 'low', 3), { kind: 'shared' }),
  post(5, '2026-11-07T13:00:00Z', '', {}),                     // no text, not analysed
  post(6, '2026-11-08T13:00:00Z', 'Pending analysis post', {}),
  post(7, '2026-11-09T13:00:00Z', 'They will pay for this, burn it down', A('negative', 'critical', 92, { category: 'threat' })),
  post(8, '2026-11-10T13:00:00Z', 'Another #ranchi pothole', A('negative', 'medium', 40, { category: 'civic' })),
];
const ACCOUNTS = [{ platform: 'x', platform_name: 'X (Twitter)', handle: 'ashish' }];
const facts = (rows = normalisePosts(POSTS, { timezone: 'Asia/Kolkata' }), extra = {}) => buildBehaviorFacts({
  account: { id: 7, display_name: 'Ashish' }, accounts: ACCOUNTS, rows, timezone: 'Asia/Kolkata', now: at('2026-11-23T06:00:00Z'), ...extra,
});

test('facts: counts tone, risk, content and rhythm from every collected post', () => {
  const f = facts();
  assert.strictEqual(f.coverage.read, 8);
  assert.strictEqual(f.coverage.analysed, 6, 'posts without analysis are not counted as neutral');
  assert.deepStrictEqual(f.sentiment, { positive: 1, neutral: 1, negative: 4 });
  assert.strictEqual(f.risk.critical, 1);
  assert.strictEqual(f.risk.high, 1);
  assert.strictEqual(f.attention_level, 'High');
  assert.strictEqual(f.content.shared, 1, 'kind=shared is a shared post');
  assert.deepStrictEqual(f.content.hashtags[0], { tag: '#Ranchi', count: 2 }, 'counted case-insensitively, shown as first written');
  assert.strictEqual(f.cadence.by_hour[18], 7, '13:00 and 13:10 UTC fall in the 18:00 hour in Kolkata');
  assert.strictEqual(f.cadence.night_posts, 1, '20:30 UTC is 02:00 in Kolkata');
  assert.strictEqual(f.today, '2026-11-23');
  assert.ok(f.trend && ['rising', 'falling', 'steady'].includes(f.trend.negativity));
  assert.strictEqual(f.profile.name, 'Ashish');
  assert.deepStrictEqual(f.profile.accounts, [{ platform: 'x', platform_name: 'X (Twitter)', handle: 'ashish', posts: 8 }]);
});

test('facts: a profile on several platforms gets a per-platform breakdown', () => {
  const fb = (i, iso, text, a) => post(100 + i, iso, text, a, { platform: 'facebook', account_handle: 'ashish.page', engagement: { reactions: 30, comments: 2, shares: 1 } });
  const rows = normalisePosts([...POSTS, fb(1, '2026-11-04T12:00:00Z', 'Great event', A('positive')), fb(2, '2026-11-05T12:00:00Z', 'Thank you all', A('positive'))], { timezone: 'Asia/Kolkata' });
  const f = facts(rows, { accounts: [...ACCOUNTS, { platform: 'facebook', platform_name: 'Facebook', handle: 'ashish.page' }] });
  assert.deepStrictEqual(f.by_platform.map((p) => [p.platform, p.posts]), [['x', 8], ['facebook', 2]]);
  assert.strictEqual(f.by_platform[1].negative_share, 0);
  assert.strictEqual(f.by_platform[0].high_risk, 2);
  assert.deepStrictEqual(f.profile.accounts.map((a) => [a.platform, a.posts]), [['x', 8], ['facebook', 2]]);
  assert.strictEqual(f.profile.platform, 'multiple');
  assert.match(buildUserContext({ facts: f, evidence: selectEvidence(rows, { max: 5 }) }), /BY PLATFORM: x: 8 posts.*\| facebook: 2 posts/);
});

test('facts: text read from images counts, and image-only posts can be evidence', () => {
  const ocrPost = post(20, '2026-11-11T09:00:00Z', '', A('negative', 'medium', 50), { image_analysis: { full_text: 'Join the rally at Morabadi 10am' }, media_urls: ['media'] });
  const rows = normalisePosts([...POSTS, ocrPost], { timezone: 'Asia/Kolkata' });
  const f = facts(rows);
  assert.strictEqual(f.content.with_image_text, 1);
  const ev = selectEvidence(rows, { max: 40 });
  const e = ev.find((x) => x.id === '20');
  assert.ok(e, 'a post with no text but image text is usable evidence');
  assert.strictEqual(e.image_text, 'Join the rally at Morabadi 10am');
  assert.match(buildUserContext({ facts: f, evidence: ev }), /Text: \(no caption\)\nImage text: Join the rally at Morabadi 10am/);
  assert.strictEqual(normalisePosts([post(21, '2026-11-11T09:00:00Z', 'x', {}, { image_analysis: { failed: true, error: 'x' } })])[0].imageText, '', 'a failed OCR contributes nothing');
});

test('facts: a very large history stays fast and exact (no cap)', () => {
  const many = Array.from({ length: 30000 }, (_, i) => post(1000 + i, new Date(Date.UTC(2025, 0, 1) + i * 3600e3).toISOString(), `post ${i} #t${i % 7}`, A(i % 5 === 0 ? 'negative' : 'neutral', i % 997 === 0 ? 'high' : 'low', i % 997 === 0 ? 75 : 5)));
  const t0 = Date.now();
  const f = facts(normalisePosts(many));
  assert.strictEqual(f.coverage.read, 30000);
  assert.strictEqual(f.sentiment.negative, 6000);
  assert.strictEqual(f.risk.high, 31);
  assert.ok(Date.now() - t0 < 5000, `took ${Date.now() - t0}ms`);
  assert.strictEqual(selectEvidence(normalisePosts(many), { max: 40 }).length, 40);
});

test('attention level comes from risk counts', () => {
  assert.strictEqual(attentionLevel({ critical: 0, high: 0, medium: 1 }), 'Low');
  assert.strictEqual(attentionLevel({ critical: 0, high: 0, medium: 2 }), 'Medium');
  assert.strictEqual(attentionLevel({ critical: 0, high: 1, medium: 0 }), 'Medium');
  assert.strictEqual(attentionLevel({ critical: 1, high: 0, medium: 0 }), 'High');
});

test('evidence: serious-risk posts always included, numbered oldest first, capped', () => {
  const rows = normalisePosts(POSTS);
  const ev = selectEvidence(rows, { max: 3 });
  assert.strictEqual(ev.length, 3);
  assert.deepStrictEqual(ev.map((e) => e.n), [1, 2, 3]);
  const ids = ev.map((e) => e.id);
  assert.ok(ids.includes('3') && ids.includes('7'), 'high and critical posts are picked first');
  assert.ok(ev.every((e, i) => i === 0 || new Date(e.posted_at) >= new Date(ev[i - 1].posted_at)));
  assert.ok(!ids.includes('5'), 'posts without text are not evidence');
});

test('parser: keeps only valid citations, normalises labels, forces the computed attention level', () => {
  const reply = '```json\n' + JSON.stringify({
    bottom_line: 'Local civic account [Post #2] that turned to calls for a bandh [P9].',
    account_type: 'individual',
    account_type_basis: 'Personal tone.',
    attention_level: 'Low',
    attention_reason: 'One call to block a highway [P3].',
    platform_differences: 'X is sharper than Facebook [P3].',
    behaviour_traits: [{ trait: 'Calls for road blockades', evidence_level: 'observed', detail: 'x', posts: [3, 99, '2'] }],
    themes: [{ theme: 'Roads', share: 'MAIN theme', detail: 'Potholes.', posts: [1] }],
    risk_indicators: [
      { indicator: 'Bandh call', severity: 'high risk', detail: 'Calls to block the highway.', posts: [3] },
      { indicator: 'Vague worry', severity: 'Low', detail: 'No post.', posts: [] },
    ],
    notable_posts: [{ post: 'P3', why: 'Bandh call' }, { post: 42, why: 'not in evidence' }],
    watch_points: ['#Ranchi'],
    limitations: ['Only 8 posts.'],
    unknown_field: 'dropped',
  }) + '\n```';
  const r = parseBehaviorReport(reply, { maxN: 5, attentionLevel: 'High' });
  assert.strictEqual(r.attention_level, 'High', 'the model cannot change the attention level');
  assert.strictEqual(r.account_type, 'Individual');
  assert.strictEqual(r.bottom_line, 'Local civic account [P2] that turned to calls for a bandh.');
  assert.strictEqual(r.platform_differences, 'X is sharper than Facebook [P3].');
  assert.deepStrictEqual(r.behaviour_traits[0].posts, [3, 2]);
  assert.strictEqual(r.behaviour_traits[0].evidence_level, 'Observed');
  assert.strictEqual(r.themes[0].share, 'Main');
  assert.strictEqual(r.risk_indicators.length, 1, 'a risk indicator with no post behind it is dropped');
  assert.strictEqual(r.risk_indicators[0].severity, 'High');
  assert.deepStrictEqual(r.notable_posts, [{ post: 3, why: 'Bandh call' }]);
  assert.strictEqual(r.unknown_field, undefined);
});

test('parser: rejects replies without a bottom line or without JSON', () => {
  assert.throws(() => parseBehaviorReport('{"themes": []}', { maxN: 3 }));
  assert.throws(() => parseBehaviorReport('I cannot help with that.', { maxN: 3 }));
  assert.strictEqual(cleanCites('see (P2) and [post 7]', 3), 'see [P2] and');
});

test('context and fallback carry the computed numbers', () => {
  const f = facts();
  const ev = selectEvidence(normalisePosts(POSTS), { max: 10 });
  const ctx = buildUserContext({ facts: f, evidence: ev });
  assert.match(ctx, /ATTENTION LEVEL \(decided from risk counts, final\): High/);
  assert.match(ctx, /SENTIMENT \(analysed posts\): 1 positive, 1 neutral, 4 negative/);
  assert.match(ctx, /ACCOUNTS: X \(Twitter\) ashish \(8 posts\)/);
  assert.match(ctx, /\[P1\]/);
  const fb = fallbackReport(f, ev);
  assert.strictEqual(fb.attention_level, 'High');
  assert.ok(fb.risk_indicators.length >= 2);
  assert.match(fb.bottom_line, /Ashish published 8 posts/);
  assert.strictEqual(fb.platform_differences, '', 'one platform: nothing to compare');
});

test('pdf: escapes post text, shows image text, accounts and the per-platform table', () => {
  const f = facts();
  f.by_platform = [{ platform: 'x', posts: 8, analysed: 6, negative_share: 67, high_risk: 2, avg_engagement: 9, first_post: '2026-11-02', last_post: '2026-11-10' }, { platform: 'facebook', posts: 2, analysed: 2, negative_share: 0, high_risk: 0, avg_engagement: 31, first_post: '2026-11-04', last_post: '2026-11-05' }];
  const html = buildBehaviorReportHtml({
    report: { bottom_line: 'Pattern [P1] <b>x</b>', attention_level: 'Medium', platform_differences: 'X sharper.', notable_posts: [{ post: 1, why: 'Top' }], behaviour_traits: [], themes: [] },
    facts: { ...f, profile: { ...f.profile, name: 'A <script>' } },
    evidence: [{ n: 1, platform: 'facebook', text: '<img src=x onerror=alert(1)>', image_text: 'RALLY <b>10am</b>', engagement: {}, posted_at: '2026-11-02T13:00:00Z' }],
    generated_at: '2026-11-23T06:00:00Z',
  }, { tenantLabel: 'Test Police' });
  assert.ok(!html.includes('<script>') && !html.includes('<img src=x') && !html.includes('<b>10am</b>'));
  assert.match(html, /<span class="cite">P1<\/span>/);
  assert.match(html, /Evidence: posts cited/);
  assert.match(html, /Image text: RALLY &lt;b&gt;10am/);
  assert.match(html, /By platform/);
  assert.match(html, /<b>Facebook<\/b>/);
  assert.match(html, /Posts collected/);
});

test('the report needs at least one analysed post, and says why when it cannot start', () => {
  assert.match(lockReason(null), /No posts have been collected/);
  assert.match(lockReason({ posts: 0, done: 0 }), /No posts have been collected/);
  assert.match(lockReason({ posts: 40, done: 0, waiting: 40 }), /still being analysed/);
  assert.strictEqual(lockReason({ posts: 40, done: 1 }), '');
});

/* ------------------------------------------------------------------ collection helpers --------------------- */

test('posts are classified once when stored: shared, reply, quote, original', () => {
  assert.strictEqual(kindOf({ text: 'RT @a: hi', raw_data: {} }), 'shared');
  assert.strictEqual(kindOf({ text: 'hi', raw_data: { legacy: { retweeted_status_result: {} } } }), 'shared');
  assert.strictEqual(kindOf({ text: 'hi', raw_data: { fwd_from: { x: 1 } } }), 'shared', 'a forwarded Telegram message');
  assert.strictEqual(kindOf({ text: '@b thanks', raw_data: { legacy: { in_reply_to_status_id_str: '9' } } }), 'reply');
  assert.strictEqual(kindOf({ text: 'look', raw_data: { legacy: { is_quote_status: true } } }), 'quote');
  assert.strictEqual(kindOf({ text: 'plain', raw_data: { legacy: {} } }), 'original');
  assert.strictEqual(kindOf({ text: null }), 'original');
});

test('only platforms with a walkable timeline are collected', () => {
  assert.deepStrictEqual(SUPPORTED_PLATFORMS, ['x', 'facebook', 'instagram', 'youtube', 'telegram']);
});

test('instagram: the next-page cursor is found wherever the gateway puts it, and "no more" wins', () => {
  assert.strictEqual(nextCursorOf({ result: { items: [], end_cursor: 'abc' } }), 'abc');
  assert.strictEqual(nextCursorOf({ items: [], end_cursor: 'abc' }), 'abc');
  assert.strictEqual(nextCursorOf({ data: { page_info: { end_cursor: 'p1', has_next_page: true } } }), 'p1');
  assert.strictEqual(nextCursorOf({ result: { next_max_id: 'm9', items: [] } }), 'm9');
  assert.strictEqual(nextCursorOf({ result: { items: [], end_cursor: 'zzz', more_available: false } }), null, 'an explicit end overrides a leftover cursor');
  assert.strictEqual(nextCursorOf({ result: { items: [] } }), null);
  assert.strictEqual(nextCursorOf(null), null);
});

test('cursors round-trip (a string stays a string, Instagram\'s object survives)', () => {
  assert.strictEqual(decodeCursor(encodeCursor('abc==')), 'abc==');
  assert.deepStrictEqual(decodeCursor(encodeCursor({ feed: 'reels', maxId: '7' })), { feed: 'reels', maxId: '7' });
  assert.strictEqual(encodeCursor(null), null);
  assert.strictEqual(decodeCursor(null), null);
});

test('what people see when a collection stops never contains provider details', () => {
  const e404 = plainFetchError({ response: { status: 404 }, message: 'Request failed at https://blugate.blurasaga.com/x' }, 0);
  assert.match(e404, /not found on the platform/);
  assert.match(plainFetchError({ response: { status: 403 }, message: 'Forbidden' }, 1200), /1,200 posts were saved; Retry continues from there/);
  assert.match(plainFetchError({ response: { status: 429 }, message: 'rate' }, 0), /limiting requests/);
  assert.match(plainFetchError(new Error('ECONNRESET 10.0.0.5:8003'), 3), /stopped returning posts/);
  for (const e of [e404, plainFetchError(new Error('ECONNRESET 10.0.0.5:8003'), 3)]) assert.ok(!/blugate|https?:|10\.0\.0|ECONN/i.test(e), e);
});

test('stored JSON is made safe for PostgreSQL', () => {
  assert.deepStrictEqual(cleanDeep({ a: 'x\u0000y', b: [1n, 'ok'], c: new Date('2026-01-01T00:00:00Z') }), { a: 'xy', b: ['1', 'ok'], c: '2026-01-01T00:00:00.000Z' });
});

/* ------------------------------------------------------------------------ relevance ----------------------- */

const alert = (risk_level, daysAgo) => ({ risk_level, posted_at: new Date(Date.UTC(2026, 10, 23) - daysAgo * 864e5) });
const NOW = Date.UTC(2026, 10, 23);

test('relevance: the label always matches the data (the old "Few or no recent alerts" on 4 alerts, one high, is gone)', () => {
  // The case from the screenshot: 1 high, 1 medium, 2 low in 30 days.
  // Low alerts are listed in the hint but do not change the score.
  const r = computeAccountRelevance([alert('high', 3), alert('medium', 10), alert('low', 12), alert('low', 20)], { postCount: 40, now: NOW });
  assert.strictEqual(r.level, 'medium');
  assert.strictEqual(r.label, 'Moderately relevant');
  assert.match(r.hint, /1 high, 1 medium, 2 low in the last 30 days/);
  assert.strictEqual(r.total_alerts, 4);
  assert.strictEqual(r.low_alerts, 2);
  assert.strictEqual(r.recent_alerts_7d, 1, 'only serious alerts count toward the 7-day recency tally');
  assert.strictEqual(r.posts_in_window, 40);
  assert.ok(r.score >= 30 && r.score < 70, `score ${r.score}`);
});

test('relevance: low-risk alerts add nothing, no alerts is its own level, recent and frequent serious alerts rank high', () => {
  assert.strictEqual(computeAccountRelevance([], { now: NOW }).level, 'none');
  assert.strictEqual(computeAccountRelevance([], { now: NOW }).label, 'No recent alerts');
  const noise = computeAccountRelevance(Array.from({ length: 15 }, () => alert('low', 2)), { postCount: 15, now: NOW });
  assert.strictEqual(noise.score, 0, 'twelve+ low alerts used to make an account "moderately relevant"');
  assert.strictEqual(noise.level, 'none', 'low-only noise is not a relevance level');
  assert.strictEqual(noise.low_alerts, 15);
  const hot = computeAccountRelevance([alert('high', 1), alert('high', 2), alert('high', 3)], { postCount: 500, now: NOW });
  assert.strictEqual(hot.level, 'high');
  assert.ok(hot.score >= 70 && hot.score <= 100);
});

test('relevance: newer alerts count more; low-risk volume and total post count do not dilute the score', () => {
  const fresh = computeAccountRelevance([alert('high', 2)], { postCount: 10, now: NOW });
  const old = computeAccountRelevance([alert('high', 25)], { postCount: 10, now: NOW });
  assert.ok(fresh.score > old.score);
  // Same serious alert → same score whether the account has 10 or 2000 posts,
  // and whether it also has a pile of low-risk alerts.
  const quiet = computeAccountRelevance([alert('high', 2)], { postCount: 10, now: NOW });
  const busy = computeAccountRelevance(
    [alert('high', 2), ...Array.from({ length: 100 }, () => alert('low', 2))],
    { postCount: 2000, now: NOW }
  );
  assert.strictEqual(quiet.score, busy.score, `${quiet.score} vs ${busy.score}`);
  assert.ok(computeAccountRelevance(Array.from({ length: 30 }, () => alert('high', 1)), { postCount: 30, now: NOW }).score <= 100);
});

/* ------------------------------------------------------------ provider failures (the Odisha "Invalid API key" case) --- */

/** What the BluGate client throws: the provider's 401 is re-labelled 502 so a bad key never logs a user out. */
const blugate = (upstream, detail) => Object.assign(
  new Error(`Blugate X USER HTTP ${upstream}: ${detail}`),
  { status: upstream === 401 ? 502 : upstream, response: { status: upstream } }
);

test('the provider status is read from the response, not from the re-labelled one', () => {
  const e = blugate(401, 'Invalid API key. Go to https://blugate.blurasaga.com/docs/keys-and-key-rotation for more info.');
  assert.strictEqual(e.status, 502);
  assert.strictEqual(upstreamStatusOf(e), 401);
  assert.strictEqual(upstreamStatusOf(new Error('Blugate X USER HTTP 429: Too many requests')), 429, 'also read from the message when there is no response object');
  assert.strictEqual(upstreamStatusOf(new Error('boom')), 0);
});

test('Fetch: a rejected key, a rate limit and an outage each get their own plain sentence, with nothing technical in it', () => {
  const key = providerFailure(blugate(401, 'Invalid API key. Go to https://blugate.blurasaga.com/docs/keys-and-key-rotation for more info.'), 'X (Twitter)');
  assert.ok(key.message.includes('did not accept the X (Twitter) key saved for this workspace'), key.message);
  assert.match(key.message, /Settings → Platforms/);
  assert.strictEqual(key.expose, true);
  assert.match(providerFailure(blugate(429, 'Too many requests'), 'X').message, /limiting requests right now.*press Fetch again/);
  assert.strictEqual(providerFailure(blugate(429, 'x'), 'X').status, 429);
  assert.match(providerFailure(blugate(404, 'user not found'), 'X').message, /did not find that account/);
  assert.match(providerFailure(blugate(503, 'unavailable'), 'YouTube').message, /did not answer/);
  assert.match(providerFailure(new Error('connect ECONNREFUSED 127.0.0.1:8003'), 'X').message, /did not answer/);
  for (const f of [key, providerFailure(blugate(429, 'x'), 'X'), providerFailure(new Error('connect ECONNREFUSED 10.0.0.5:8003'), 'X')]) {
    assert.ok(!/blugate|https?:|ECONN|10.0.0|api key/i.test(f.message), f.message);
  }
});

test('Fetch: our own validation messages pass through untouched', () => {
  assert.strictEqual(providerFailure(Object.assign(new Error('X account needs username or user_id in data'), { status: 400 }), 'X'), null);
  assert.strictEqual(providerFailure(Object.assign(new Error('platform is invalid or not active'), { status: 400 }), 'X'), null);
});

test('collection: a rejected key is not retried (it was, as a 502) and says to check the key; a 429 is waited out', () => {
  const { statusOf, isRetryable, PAUSES_MS } = collectMod.__test;
  const rejected = blugate(401, 'Invalid API key');
  assert.strictEqual(statusOf(rejected), 401);
  assert.strictEqual(isRetryable(rejected), false, 'retrying a bad key only wastes time and calls');
  assert.match(plainFetchError(rejected, 300), /did not accept the request.*key in Settings.*300 posts were saved/);
  assert.strictEqual(isRetryable(blugate(429, 'Too many requests')), true);
  assert.strictEqual(isRetryable(blugate(503, 'x')), true);
  assert.strictEqual(isRetryable(blugate(404, 'x')), false);
  assert.ok(PAUSES_MS.rateLimit.length >= 5 && PAUSES_MS.rateLimit[0] >= 30000, 'rate limits get a patient schedule');
  assert.ok(PAUSES_MS.rateLimit.reduce((a, b) => a + b, 0) > 300000, 'longer than the 5-minute claim window, which is why waits show life');
});

/* --------------------------------------------------------------------------- handles typed into Fetch -------- */

test('Fetch: a handle, an @handle and a pasted link all become the same username', () => {
  assert.strictEqual(tidyIdentity('x', { username: 'yourBabulal' }).username, 'yourBabulal');
  assert.strictEqual(tidyIdentity('x', { username: '  @yourBabulal ' }).username, 'yourBabulal');
  assert.strictEqual(tidyIdentity('x', { username: 'https://x.com/yourBabulal?lang=en' }).username, 'yourBabulal');
  assert.strictEqual(tidyIdentity('x', { username: 'twitter.com/yourBabulal/status/123' }).username, 'yourBabulal');
  assert.strictEqual(tidyIdentity('instagram', { username: 'https://www.instagram.com/first.last/' }).username, 'first.last');
});

test('Fetch: a display name (as in "O BO Stonecold") is refused before any provider call is spent, with a hint', () => {
  assert.throws(() => tidyIdentity('x', { username: 'O BO Stonecold' }), (e) => e.status === 400 && /no spaces.*yourBabulal.*profile link/.test(e.message));
  assert.throws(() => tidyIdentity('x', { username: 'a_name_longer_than_fifteen' }), (e) => e.status === 400);
  assert.throws(() => tidyIdentity('instagram', { username: 'two words' }), (e) => e.status === 400 && /Instagram usernames/.test(e.message));
});

test('Fetch: nothing is changed for platforms without a fixed format, for resolved ids, or for empty input', () => {
  const fb = { url: 'https://facebook.com/some page' };
  assert.deepStrictEqual(tidyIdentity('facebook', fb), fb);
  assert.deepStrictEqual(tidyIdentity('x', { username: 'Name With Spaces', user_id: '99' }).user_id, '99');
  assert.strictEqual(tidyIdentity('x', { username: 'Name With Spaces', user_id: '99' }).username, 'Name With Spaces', 'an account already resolved keeps what it has');
  assert.strictEqual(tidyIdentity('x', { username: '' }).username, '', 'empty is left for the platform lookup to report as "required"');
  assert.deepStrictEqual(tidyIdentity('x', undefined), {});
});

/* ------------------------------------------------------------- what the first real report showed (Instagram, 18 posts) --- */

const sparse = () => {
  // 18 posts spread over four years, most of them pictures with a quote on them
  const day = (n) => new Date(Date.UTC(2019, 4, 23) + n * 864e5).toISOString();
  const quote = 'Remember: the day you plant the seed is not the day you eat the fruit. Be patient.';
  return Array.from({ length: 18 }, (_, i) => post(i + 1, day(Math.round((i * 1455) / 17)), i % 3 === 0 ? '' : 'Happy New Year', A(i % 4 === 0 ? 'positive' : 'neutral', 'low', 0, { english_text: i % 3 === 0 ? quote : null }), {
    image_analysis: i % 3 === 0 ? { full_text: quote } : null, media_urls: ['media'], platform: 'instagram', account_handle: 'stone_9itbob',
  }));
};

test('an account that posts rarely is "0.4 a month over 4 years", not "0 posts a day"', () => {
  const f = facts(normalisePosts(sparse(), { timezone: 'Asia/Kolkata' }));
  assert.deepStrictEqual(f.cadence.rate, { value: 0.4, unit: 'month' });
  assert.strictEqual(f.coverage.span_label, '4 years');
  assert.ok(f.cadence.posts_per_day > 0, 'the exact per-day figure is still kept');
  const ctx = buildUserContext({ facts: f, evidence: selectEvidence(normalisePosts(sparse()), { max: 5 }) });
  assert.match(ctx, /RHYTHM: 0\.4 posts a month \(18 posts over 4 years\)/);
  assert.ok(!/0 posts a day/.test(ctx));
});

test('a busy account is still "per day", a weekly one "per week"', () => {
  const rows = (n, spanDays) => normalisePosts(Array.from({ length: n }, (_, i) => post(i + 1, new Date(Date.UTC(2026, 0, 1) + (i * spanDays * 864e5) / n).toISOString(), 'x', A('neutral'))));
  assert.deepStrictEqual(facts(rows(60, 30)).cadence.rate, { value: 2, unit: 'day' });
  assert.deepStrictEqual(facts(rows(8, 56)).cadence.rate.unit, 'week');
});

test('a picture-only post does not repeat its quote three times: the translation of the image text is dropped', () => {
  const rows = normalisePosts(sparse(), { timezone: 'Asia/Kolkata' });
  const pic = rows.find((r) => r.text === '');
  assert.ok(pic.imageText.length > 20);
  assert.strictEqual(pic.english, '', 'the English line was the same words as the image text');
  const ev = selectEvidence(rows, { max: 18 }).find((e) => e.id === pic.id);
  assert.strictEqual(ev.english, '');
  const ctx = buildUserContext({ facts: facts(rows), evidence: [ev] });
  assert.ok(!/English:/.test(ctx));
  assert.match(ctx, /Text: \(no caption\)\nImage text: Remember/);
  // a real translation is kept
  const kept = normalisePosts([post(50, '2026-01-01T00:00:00Z', 'नमस्ते दोस्तों', A('positive', 'low', 0, { english_text: 'Hello friends' }))])[0];
  assert.strictEqual(kept.english, 'Hello friends');
});

test('parser: the model placeholder "earlier pattern -> later pattern" and a trait that restates a theme are dropped', () => {
  const reply = JSON.stringify({
    bottom_line: 'Personal account posting quotes [P1].',
    behaviour_traits: [
      { trait: 'Posts motivational quotes and personal reflections', evidence_level: 'Observed', detail: 'The account frequently shares motivational quotes and personal reflections, often in the form of images with text.', posts: [1, 2] },
      { trait: 'Mentions Biafra', evidence_level: 'Likely', detail: 'Posted support for Biafra once, without context.', posts: [3] },
    ],
    themes: [{ theme: 'Motivational quotes', share: 'Frequent', detail: 'The account regularly shares motivational quotes and personal reflections, often in the form of images with text.', posts: [1, 2] }],
    changes_over_time: [{ from: 'earlier pattern', to: 'later pattern', posts: [1, 9] }, { from: 'Earlier', to: 'Later', posts: [1] }],
  });
  const r = parseBehaviorReport(reply, { maxN: 8 });
  assert.deepStrictEqual(r.behaviour_traits.map((t) => t.trait), ['Mentions Biafra']);
  assert.strictEqual(r.themes.length, 1, 'the theme stays; only the repeat goes');
  assert.deepStrictEqual(r.changes_over_time, []);
  const real = parseBehaviorReport(JSON.stringify({ bottom_line: 'x', changes_over_time: [{ from: 'Mostly quotes', to: 'Mostly calls to rallies', posts: [1, 3] }] }), { maxN: 8 });
  assert.strictEqual(real.changes_over_time.length, 1, 'a real change is kept');
});

test('parser: "the most engaged posts are P1, P3 and P7" becomes links, and numbers outside the evidence disappear', () => {
  assert.strictEqual(cleanCites('The most engaged posts are P1, P3, P4 and P7.', 8), 'The most engaged posts are [P1], [P3], [P4] and [P7].');
  assert.strictEqual(cleanCites('See [P2] and P3 but not P13.', 8), 'See [P2] and [P3] but not.');
  assert.strictEqual(cleanCites('P2P payments and PX1 are not post numbers', 8), 'P2P payments and PX1 are not post numbers');
});

test('the prompt asks for behaviour in traits and subjects in themes, forbids legal conclusions and placeholder lists', () => {
  const { buildSystemPrompt } = require('../src/modules/profile-report/report/reportPrompt');
  const p = buildSystemPrompt();
  assert.match(p, /A trait is what the account DOES[\s\S]*A theme is what it talks ABOUT/);
  assert.match(p, /Do not say whether anything is legal or illegal/);
  assert.match(p, /never the label in capitals/);
  assert.match(p, /leave "changes_over_time" empty/);
  assert.ok(!/earlier pattern/.test(p), 'no placeholder text left for the model to copy');
});

test('pdf: the annex lists every cited post (inline [P#] too), each post says its words once, a rate and period read naturally', () => {
  const rows = normalisePosts(sparse(), { timezone: 'Asia/Kolkata' });
  const f = facts(rows);
  const evidence = selectEvidence(rows, { max: 18 });
  const picNo = evidence.find((e) => e.text === '').n;
  const report = {
    bottom_line: 'Quotes account [P' + picNo + '].', attention_level: 'Low', notable_posts: [], behaviour_traits: [], themes: [], tone: 'Calm.',
    influence: 'Reach is small; the most engaged posts are [P2] and [P5].',
  };
  assert.deepStrictEqual([...citedPostNumbers(report)].sort((a, b) => a - b), [2, 5, picNo].sort((a, b) => a - b));
  const html = buildBehaviorReportHtml({ report, facts: f, evidence, generated_at: '2026-11-24T05:21:00Z' }, { tenantLabel: 'Odisha' });
  for (const n of [2, 5, picNo]) assert.match(html, new RegExp('<td class="no">P' + n + '</td>'), 'P' + n + ' is in the annex');
  assert.match(html, /Posts a month/);
  assert.match(html, /4 years/);
  assert.match(html, /23 May 2019 → \d{1,2} \w{3} 2023/, 'the period is written as dates, not 2019-05-23');
  assert.ok(!/\d{4}-\d{2}-\d{2} → /.test(html), 'no raw ISO dates left in the report');
  assert.ok(!/Posts a day/.test(html));
  const pic = html.slice(html.indexOf('<td class="no">P' + picNo + '</td>'));
  assert.match(pic, /<span class="tag">Image post<\/span> Remember: the day you plant the seed/);
  assert.ok(!/\(no (text|caption)\)/.test(pic.slice(0, 900)), 'a picture-only post is not "(no text)"');
  assert.strictEqual(pic.slice(0, 1200).split('Remember: the day you plant the seed').length - 1, 1, 'the quote appears once');
});
