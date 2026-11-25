/**
 * Profile Report: two reports from the same saved analysis, like the event report's "Full Report with Evidence" and
 * "Executive Summary": with evidence (every cited post listed and linked, [P#] citations) and without it (the
 * assessment on its own, no post list and no citation tags).
 */
process.env.LLM_BASE_URL = process.env.LLM_BASE_URL || 'http://llm.test/v1';

const test = require('node:test');
const assert = require('node:assert');
const { normalisePosts, buildBehaviorFacts, selectEvidence } = require('../src/modules/profile-report/report/reportFacts');
const { buildBehaviorReportHtml, __test: { richPlain } } = require('../src/modules/profile-report/report/reportPdf');
const { wantsEvidence } = require('../src/modules/profile-report/profileReport.util');

const at = (iso) => new Date(iso);
const post = (id, iso, text, analysis, extra = {}) => ({
  id: String(id), platform: 'instagram', url: `https://instagram.com/p/${id}`, text, posted_at: at(iso), fetched_at: at(iso),
  engagement: { likes: 5, comments: 1 }, media_urls: ['media'], media_type: 'photo', kind: 'original',
  analysis_status: 'done', analysis_result: analysis, image_analysis: null, account_handle: 'stone', ...extra,
});
const A = (sentiment, more = {}) => ({ sentiment, risk_level: 'low', risk_score: 5, english_text: null, ...more });

const rows = normalisePosts([
  post(1, '2021-01-01T04:30:00Z', 'Rally today', A('neutral'), { image_analysis: { picture: { v: 2, description: 'A crowd holds flags in front of a stage.', kind: 'photo', alerts: ['crowd or protest'], flags: ['flag with red, black, green bands'], objects: [] } } }),
  post(2, '2021-01-02T04:30:00Z', 'Happy New Year', A('positive')),
  post(3, '2021-01-03T04:30:00Z', 'A quote about patience', A('positive')),
], { timezone: 'Asia/Kolkata' });
const facts = buildBehaviorFacts({ account: { id: 1, display_name: 'Stone' }, accounts: [{ platform: 'instagram', platform_name: 'Instagram', handle: 'stone' }], rows, timezone: 'Asia/Kolkata', now: at('2026-11-24T06:00:00Z') });
const evidence = selectEvidence(rows, { max: 10 });

const REPORT = {
  bottom_line: 'A personal account that posts greetings and quotes, once with a rally picture [P1].',
  account_type: 'Individual', account_type_basis: 'Greetings and quotes [P2].',
  attention_level: 'Low', attention_reason: 'Nothing in the posts asks anyone to act [P1].',
  behaviour_traits: [{ trait: 'Posts greetings', evidence_level: 'Observed', detail: 'Writes New Year greetings and quotes [P2][P3].', posts: [2, 3] }],
  themes: [{ theme: 'Patience', share: 'Occasional', detail: 'A quote about patience.', posts: [3] }],
  tone: 'Calm and encouraging [P2].', targets: [], communication_style: 'Short English captions.', posting_pattern: 'Three posts in three days.',
  influence: 'Small reach; the most liked posts are [P1], [P2] and [P3].',
  risk_indicators: [], changes_over_time: [], notable_posts: [{ post: 1, why: 'The only post with a crowd' }],
  watch_points: ['Any post that names a place or official: it would show a local link [P1].'], limitations: ['Only public posts.'],
};
const data = { report: REPORT, facts, evidence, summary_source: 'llm', generated_at: '2026-11-24T06:00:00Z', generated_by: { name: 'Nandeep' } };
const body = (html) => html.slice(html.indexOf('<body>'));

/* ---------------------------------------------------------------------------------------- with evidence ------ */

test('the full report is the default and keeps everything: the evidence list and the citation tags', () => {
  const full = buildBehaviorReportHtml(data, { tenantLabel: 'ODISHA' });
  assert.strictEqual(buildBehaviorReportHtml(data, { tenantLabel: 'ODISHA', includeEvidence: true }), full, 'asking for evidence is the same as the default');
  const b = body(full);
  assert.match(b, /<section class="annex"><h2>Evidence: all 3 posts read<\/h2>/);
  assert.match(b, /<span class="cite">P1<\/span>/);
  assert.match(b, /Profile behaviour report<\/div>/, 'the header is unchanged');
  assert.ok(!/Executive summary/.test(b));
  assert.match(b, /P-numbers point to the evidence annex/);
  assert.match(b, /Small reach; the most liked posts are <span class="cite">P1<\/span>/);
});

/* -------------------------------------------------------------------------------------- without evidence ---- */

test('the executive summary has the assessment but no post list and no citation tags', () => {
  const exec = body(buildBehaviorReportHtml(data, { tenantLabel: 'ODISHA', includeEvidence: false }));
  assert.ok(!/class="annex"/.test(exec), 'no evidence section');
  assert.ok(!/Evidence:/.test(exec));
  assert.ok(!/instagram\.com\/p\//.test(exec), 'no links to posts');
  assert.ok(!/<span class="cite">/.test(exec), 'no citation tags');
  assert.ok(!/\[P\d/.test(exec) && !/\bP\d+\b/.test(exec.replace(/<style[\s\S]*?<\/style>/g, '')), 'no post numbers anywhere in the text');
  assert.match(exec, /Profile behaviour report · Executive summary<\/div>/);
  assert.match(exec, /leaves out the post-by-post evidence; the full report with evidence lists and links every post/);
  assert.ok(!/P-numbers point to the evidence annex/.test(exec));
});

test('everything else in the executive summary is the same assessment, with the citations simply gone', () => {
  const exec = body(buildBehaviorReportHtml(data, { tenantLabel: 'ODISHA', includeEvidence: false }));
  assert.match(exec, /A personal account that posts greetings and quotes, once with a rally picture\./);
  assert.match(exec, /Greetings and quotes\./);
  assert.match(exec, /Why Low:<\/b> Nothing in the posts asks anyone to act\./);
  assert.match(exec, /Posts greetings/);
  assert.match(exec, /Writes New Year greetings and quotes\./);
  assert.match(exec, /Calm and encouraging\./);
  assert.match(exec, /Any post that names a place or official: it would show a local link\./);
  assert.match(exec, /Only public posts\./);
  assert.match(exec, /Three posts in three days\./);
  // the key figures, tone bar and charts are still there
  assert.match(exec, /Posts collected/);
  assert.match(exec, /<div class="kpis">/);
  assert.match(exec, /Posts by hour/);
});

test('a sentence that only points at posts is cut back instead of being left hanging', () => {
  const exec = body(buildBehaviorReportHtml(data, { tenantLabel: 'ODISHA', includeEvidence: false }));
  assert.match(exec, /<h2>Reach<\/h2><p>Small reach\.<\/p>/, '"the most liked posts are [P1], [P2] and [P3]" is not left as "are and"');
  assert.ok(!/posts are\s*(?:,|and|\.)/.test(exec));
  const onlyPointers = buildBehaviorReportHtml({ ...data, report: { ...REPORT, influence: 'See [P1] and [P2].' } }, { includeEvidence: false });
  assert.ok(!/<h2>Reach<\/h2>/.test(body(onlyPointers)), 'a section with nothing left is not printed');
});

test('citation clean-up: one tag, a group, and text with none; HTML is still escaped', () => {
  assert.strictEqual(richPlain('Posts mostly about quotes [P1]. One post voices support for a cause [P3].'), 'Posts mostly about quotes. One post voices support for a cause.');
  assert.strictEqual(richPlain('The account posts rarely [P1, P2] and in bursts.'), 'The account posts rarely and in bursts.');
  assert.strictEqual(richPlain('Shows a flag [P1, [P2], [P3], P17].'), 'Shows a flag.');
  assert.strictEqual(richPlain('Small reach; the most liked posts are [P2], [P5] and [P4].'), 'Small reach.');
  assert.strictEqual(richPlain('See [P2] and [P3].'), '');
  assert.strictEqual(richPlain('No citations here, just text.'), 'No citations here, just text.');
  assert.strictEqual(richPlain('Fish & chips <b> [P1]'), 'Fish &amp; chips &lt;b&gt;');
  assert.strictEqual(richPlain(''), '');
  assert.strictEqual(richPlain(undefined), '');
});

test('an older saved report (no evidence data at all) still gives both versions', () => {
  const old = { report: REPORT, facts: { ...facts, coverage: { ...facts.coverage, usable: undefined, notes: undefined } }, evidence: [], generated_at: '2026-01-01T00:00:00Z' };
  const full = body(buildBehaviorReportHtml(old, { includeEvidence: true }));
  const exec = body(buildBehaviorReportHtml(old, { includeEvidence: false }));
  assert.ok(!/class="annex"/.test(full), 'nothing to list');
  assert.ok(!/class="annex"/.test(exec));
  assert.ok(!/undefined|NaN/.test(full + exec));
  assert.ok(!/<span class="cite">/.test(exec));
});

/* -------------------------------------------------------------------------------------- the download link ---- */

test('the download asks for evidence unless it says otherwise', () => {
  for (const yes of [undefined, null, '', 'true', 'TRUE', '1', 'yes', 'anything else']) assert.strictEqual(wantsEvidence(yes), true, String(yes));
  for (const no of ['false', 'FALSE', ' false ', '0', 'no', 'off']) assert.strictEqual(wantsEvidence(no), false, no);
});
