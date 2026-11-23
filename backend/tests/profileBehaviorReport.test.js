process.env.LLM_BASE_URL = process.env.LLM_BASE_URL || 'http://llm.test/v1';

const test = require('node:test');
const assert = require('node:assert');
const axios = require('axios');
const { normalisePosts, buildBehaviorFacts, selectEvidence, attentionLevel } = require('../src/modules/social-profiles/behaviorReport/behaviorFacts');
const { parseBehaviorReport, fallbackReport, buildUserContext, cleanCites } = require('../src/modules/social-profiles/behaviorReport/behaviorPrompt');
const { buildBehaviorReportHtml } = require('../src/modules/social-profiles/behaviorReport/behaviorReport.pdf');
const service = require('../src/modules/social-profiles/behaviorReport/behaviorReport.service');

const at = (iso) => new Date(iso);
const post = (id, iso, text, analysis = {}, extra = {}) => ({
  id: BigInt(id), platform: 'x', url: `https://x.com/a/status/${id}`, text, posted_at: at(iso), fetched_at: at(iso),
  engagement: { likes: 0, retweets: 0, replies: 0 }, media_urls: [], media_type: null, raw_data: {},
  analysis_result: analysis, ...extra,
});
const A = (sentiment, risk_level = 'low', risk_score = 10, more = {}) => ({ sentiment, risk_level, risk_score, english_text: null, ...more });

const POSTS = [
  // 18:30 IST on a Monday
  post(1, '2026-11-02T13:00:00Z', 'Road is broken again #Ranchi @dcranchi', A('negative', 'low', 12, { category: 'civic', stance: 'oppose' }), { engagement: { likes: 40, retweets: 5, replies: 3 } }),
  post(2, '2026-11-03T13:10:00Z', 'Great work by the traffic police today', A('positive', 'low', 5, { category: 'praise', stance: 'support' })),
  post(3, '2026-11-05T20:30:00Z', 'Everyone block the highway tomorrow at 10, bandh!', A('negative', 'high', 78, { category: 'protest' })),
  post(4, '2026-11-06T13:00:00Z', 'RT @news: Budget announced', A('neutral', 'low', 3)),
  post(5, '2026-11-07T13:00:00Z', '', {}),                     // no text, not analysed
  post(6, '2026-11-08T13:00:00Z', 'Pending analysis post', {}),
  post(7, '2026-11-09T13:00:00Z', 'They will pay for this, burn it down', A('negative', 'critical', 92, { category: 'threat' })),
  post(8, '2026-11-10T13:00:00Z', 'Another #Ranchi pothole', A('negative', 'medium', 40, { category: 'civic' })),
];

test('facts: counts tone, risk, content and rhythm from the posts only', () => {
  const rows = normalisePosts(POSTS, { timezone: 'Asia/Kolkata' });
  const facts = buildBehaviorFacts({ account: { id: 7, handle: 'ashish', display_name: 'Ashish', platform: 'x', platform_name: 'X' }, rows, totalPosts: 8, timezone: 'Asia/Kolkata', now: at('2026-11-23T06:00:00Z') });

  assert.strictEqual(facts.coverage.read, 8);
  assert.strictEqual(facts.coverage.analysed, 6, 'posts without analysis are not counted as neutral');
  assert.deepStrictEqual(facts.sentiment, { positive: 1, neutral: 1, negative: 4 });
  assert.strictEqual(facts.risk.critical, 1);
  assert.strictEqual(facts.risk.high, 1);
  assert.strictEqual(facts.attention_level, 'High');
  assert.strictEqual(facts.content.shared, 1, 'RT @ is a shared post');
  assert.deepStrictEqual(facts.content.hashtags[0], { tag: '#Ranchi', count: 2 }, 'counted case-insensitively, shown as written');
  assert.strictEqual(facts.cadence.by_hour[18], 7, '13:00 and 13:10 UTC fall in the 18:00 hour in Kolkata');
  assert.strictEqual(facts.cadence.night_posts, 1, '20:30 UTC is 02:00 in Kolkata');
  assert.strictEqual(facts.today, '2026-11-23');
  assert.ok(facts.trend && ['rising', 'falling', 'steady'].includes(facts.trend.negativity));
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
  const rows = normalisePosts(POSTS);
  const facts = buildBehaviorFacts({ account: { id: 7, handle: 'ashish', display_name: 'Ashish', platform: 'x', platform_name: 'X' }, rows, totalPosts: 8 });
  const ev = selectEvidence(rows, { max: 10 });
  const ctx = buildUserContext({ facts, evidence: ev });
  assert.match(ctx, /ATTENTION LEVEL \(decided from risk counts, final\): High/);
  assert.match(ctx, /SENTIMENT \(analysed posts\): 1 positive, 1 neutral, 4 negative/);
  assert.match(ctx, /\[P1\]/);
  const fb = fallbackReport(facts, ev);
  assert.strictEqual(fb.attention_level, 'High');
  assert.ok(fb.risk_indicators.length >= 2);
  assert.match(fb.bottom_line, /Ashish published 8 posts/);
});

test('pdf: escapes post text and renders citations', () => {
  const html = buildBehaviorReportHtml({
    report: { bottom_line: 'Pattern [P1] <b>x</b>', attention_level: 'Medium', notable_posts: [{ post: 1, why: 'Top' }], behaviour_traits: [], themes: [] },
    facts: { profile: { name: 'A <script>', handle: 'a', platform_name: 'X' }, coverage: { read: 1, total_posts: 1 }, sentiment: { positive: 0, neutral: 1, negative: 0 }, risk: {}, cadence: { by_hour: Array(24).fill(0), by_weekday: Array(7).fill(0) }, content: {}, engagement: {} },
    evidence: [{ n: 1, text: '<img src=x onerror=alert(1)>', engagement: {}, posted_at: '2026-11-02T13:00:00Z' }],
    generated_at: '2026-11-23T06:00:00Z',
  }, { tenantLabel: 'Test Police' });
  assert.ok(!html.includes('<script>') && !html.includes('<img src=x'));
  assert.match(html, /<span class="cite">P1<\/span>/);
  assert.match(html, /Evidence: posts cited/);
});

/* ------------------------------------------------ end to end with a fake database and model ------------ */

const fakePrisma = (posts) => {
  const saved = [];
  return {
    saved,
    $executeRawUnsafe: async (sql, ...params) => { if (/INSERT INTO social_profile_behavior_reports/.test(sql)) saved.push(params); return 1; },
    $queryRawUnsafe: async () => [],
    social_media_accounts: {
      findUnique: async () => ({ id: 7, handle: 'ashish', profile: { display_name: 'Ashish Tiwari' }, platforms: { slug: 'x', name: 'X (Twitter)' } }),
    },
    social_media_posts: {
      count: async () => posts.length,
      findMany: async () => posts,
      aggregate: async () => ({ _count: { id: posts.length }, _max: { id: posts.length ? posts[posts.length - 1].id : null } }),
    },
  };
};

test('generate: model reply is parsed, cited and saved', async (t) => {
  const prisma = fakePrisma(POSTS);
  const calls = [];
  t.mock.method(axios, 'post', async (url, body) => {
    calls.push(body);
    return { data: { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ bottom_line: 'Civic critic who once called for a bandh [P2].', account_type: 'Individual', attention_reason: 'A critical threat post.', behaviour_traits: [{ trait: 'Civic complaints', evidence_level: 'Observed', detail: 'Roads.', posts: [1] }], notable_posts: [{ post: 1, why: 'x' }] }) } }] } };
  });
  const result = await service.generateBehaviorReport(7, { db: prisma, dbName: null, generatedBy: { id: 1, name: 'Nandeep' } });
  assert.strictEqual(result.summary_source, 'llm');
  assert.strictEqual(result.report.attention_level, 'High');
  assert.strictEqual(result.report.bottom_line, 'Civic critic who once called for a bandh [P2].');
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].chat_template_kwargs.enable_thinking, false);
  assert.match(calls[0].messages[1].content, /EVIDENCE POSTS/);
  assert.strictEqual(prisma.saved.length, 1, 'the report is stored');
  assert.strictEqual(prisma.saved[0][0], 7);
  assert.match(result.markdown, /# Behaviour report: Ashish Tiwari/);
});

test('generate: unreadable reply is retried once, then the report is written from facts', async (t) => {
  const prisma = fakePrisma(POSTS);
  let n = 0;
  t.mock.method(axios, 'post', async () => { n += 1; return { data: { choices: [{ message: { content: 'not json at all' } }] } }; });
  const result = await service.generateBehaviorReport(7, { db: prisma, dbName: null });
  assert.strictEqual(n, 2);
  assert.strictEqual(result.summary_source, 'fallback');
  assert.match(result.llm_notice, /could not be read/);
  assert.strictEqual(result.report.attention_level, 'High');
});

test('generate: model server down gives the facts-only report, not an error', async (t) => {
  const prisma = fakePrisma(POSTS);
  t.mock.method(axios, 'post', async () => { const e = new Error('Request failed with status code 401'); e.response = { status: 401 }; throw e; });
  const result = await service.generateBehaviorReport(7, { db: prisma, dbName: null });
  assert.strictEqual(result.summary_source, 'fallback');
  assert.match(result.llm_notice, /could not be reached/);
  assert.ok(!/401/.test(result.llm_notice), 'no provider details in what people see');
});

test('generate: a profile with no posts says so plainly', async () => {
  await assert.rejects(service.generateBehaviorReport(7, { db: fakePrisma([]) }), (err) => err.status === 422 && /No posts have been collected/.test(err.message));
});

test('storage strips characters PostgreSQL JSONB refuses', () => {
  assert.deepStrictEqual(service.__test.cleanDeep({ a: 'x\u0000y', b: [1n, 'ok'] }), { a: 'xy', b: ['1', 'ok'] });
});

/* ------------------------------------------------------------------------------ endpoints ------------ */

const controller = require('../src/modules/social-profiles/behaviorReport/behaviorReport.controller');
const fakeRes = () => ({
  statusCode: 0, body: null,
  status(c) { this.statusCode = c; return this; },
  json(b) { this.body = b; return this; },
});

test('POST refuses a profile with no posts yet, without starting a job', async () => {
  const res = fakeRes();
  await controller.startBehaviorReport({ params: { id: '9' }, tenantPrisma: fakePrisma([]), tenantDbName: 'tenant_t', user: { id: 1, name: 'N' } }, res);
  assert.strictEqual(res.statusCode, 422);
  assert.strictEqual(res.body.code, 'NO_POSTS');
  assert.match(res.body.message, /Start monitoring/);
  assert.strictEqual(service.getBehaviorJob('tenant_t', 9), null);
});

test('POST starts a background job when posts exist; GET reports it running, then the saved report', async (t) => {
  const prisma = fakePrisma(POSTS);
  t.mock.method(axios, 'post', async () => ({ data: { choices: [{ message: { content: JSON.stringify({ bottom_line: 'Civic critic [P1].' }) } }] } }));
  const req = { params: { id: '7' }, tenantPrisma: prisma, tenantDbName: null, user: { id: 1, name: 'N' } };
  const started = fakeRes();
  await controller.startBehaviorReport(req, started);
  assert.strictEqual(started.statusCode, 202);
  assert.strictEqual(started.body.status, 'running');
  const polled = fakeRes();
  await controller.getBehaviorReport(req, polled);
  assert.strictEqual(polled.statusCode, 202, 'a second look while it runs joins the job');
  await service.getBehaviorJob(null, 7).promise;
  assert.strictEqual(service.getBehaviorJob(null, 7), null, 'a finished job is cleared');
  assert.strictEqual(prisma.saved.length, 1);
});

test('GET with nothing saved and nothing running says none (it never starts a report by itself)', async () => {
  const res = fakeRes();
  await controller.getBehaviorReport({ params: { id: '11' }, tenantPrisma: fakePrisma(POSTS), tenantDbName: 'tenant_t' }, res);
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.body, { status: 'none' });
});
