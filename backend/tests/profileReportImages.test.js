/**
 * Profile Report: picture readings that arrive as structured data ("[object Object]"), honest engagement,
 * posts without readable text, the activity timeline, the region line, and the PDF built from all of it.
 */
process.env.LLM_BASE_URL = process.env.LLM_BASE_URL || 'http://llm.test/v1';

const test = require('node:test');
const assert = require('node:assert');
const { flatten, mediaTextOf, sceneOf, cleanTranslation } = require('../src/services/media_post_analysis/imageText');
const { normalisePosts, buildBehaviorFacts, selectEvidence, timelineOf, sharesReported } = require('../src/modules/profile-report/report/reportFacts');
const {
  buildSystemPrompt, buildUserContext, parseBehaviorReport, fallbackReport, reportToMarkdown,
} = require('../src/modules/profile-report/report/reportPrompt');
const { buildBehaviorReportHtml } = require('../src/modules/profile-report/report/reportPdf');
const { __test: { regionOf } } = require('../src/modules/profile-report/report/reportService');

const at = (iso) => new Date(iso);
const post = (id, iso, text, analysis = {}, extra = {}) => ({
  id: String(id), platform: 'instagram', url: `https://instagram.com/p/${id}`, text, posted_at: at(iso), fetched_at: at(iso),
  engagement: { likes: 3, comments: 1 }, media_urls: ['media'], media_type: 'photo', kind: 'original',
  analysis_status: analysis.sentiment ? 'done' : 'pending', analysis_result: analysis, image_analysis: null, account_handle: 'stone', ...extra,
});
const A = (sentiment, more = {}) => ({ sentiment, risk_level: 'low', risk_score: 5, english_text: null, ...more });
const facts = (rows) => buildBehaviorFacts({ account: { id: 1, display_name: 'Stone' }, accounts: [{ platform: 'instagram', platform_name: 'Instagram', handle: 'stone' }], rows, timezone: 'Asia/Kolkata', now: at('2026-11-24T06:00:00Z') });

/* ------------------------------------------------------------------------------ the helper ------------------- */

test('image text: plain strings come out exactly as before', () => {
  assert.strictEqual(mediaTextOf({ full_text: '  Join the rally  ' }), 'Join the rally');
  assert.strictEqual(mediaTextOf({ description: 'A poster.', summary: 'Protest notice.' }), 'A poster.\nProtest notice.');
  assert.strictEqual(mediaTextOf({ description: 'A poster.', summary: 'Protest notice.', visible_text: ['PROTEST', '10th Oct'] }), 'A poster.\nProtest notice.\nPROTEST\n10th Oct');
  assert.strictEqual(mediaTextOf({ description: 'A poster.', summary: 'Protest notice.', visible_text: ['PROTEST'] }, { sep: ' ', visible: false }), 'A poster. Protest notice.');
  assert.strictEqual(mediaTextOf({ full_text: 'Text wins', description: 'ignored' }), 'Text wins');
  assert.strictEqual(mediaTextOf(null), '');
  assert.strictEqual(mediaTextOf('just a string'), '');
  assert.strictEqual(mediaTextOf({ full_text: '   ', description: 'x' }), '', 'a blank full_text still means "no text", as it always did');
});

test('image text: structured readings become sentences, and "[object Object]" can never come out', () => {
  assert.strictEqual(flatten({ scene: 'a crowd at a rally', people: 3 }), 'a crowd at a rally; people: 3');
  assert.strictEqual(flatten(['a', { text: 'b' }, null, '']), 'a; b');
  assert.strictEqual(flatten({ objects: ['flag', 'stage'], location_clues: { sign: 'Master Canteen' } }), 'objects: flag; stage; location clues: sign: Master Canteen');
  assert.strictEqual(flatten('seen at [object Object] square'), 'seen at square', 'the broken placeholder is removed from text that already has it');
  assert.strictEqual(flatten('[object Object]'), '');
  assert.strictEqual(flatten(undefined), '');
  assert.strictEqual(flatten(42), '42');
  const deep = { a: { b: { c: { d: { e: 'too deep' } } } } };
  assert.ok(!flatten(deep).includes('too deep'), 'depth is bounded');
  for (const reading of [{ summary: { scene: 'x' } }, { description: ['a', { b: 1 }] }, { full_text: { lines: ['one', 'two'] } }, { summary: {} }]) {
    assert.ok(!/\[object/.test(mediaTextOf(reading)), JSON.stringify(reading));
  }
  assert.strictEqual(mediaTextOf({ summary: { scene: 'a crowd at a rally' } }), 'a crowd at a rally');
  assert.strictEqual(mediaTextOf({ summary: {} }), '');
});

test('picture description: description, plus the summary when it says something else; nothing for a failed reading', () => {
  assert.strictEqual(sceneOf({ description: 'A yellow poster.', summary: 'Protest notice.' }), 'A yellow poster. Protest notice.');
  assert.strictEqual(sceneOf({ description: 'A yellow poster for a protest.', summary: 'a yellow poster' }), 'A yellow poster for a protest.', 'a summary already contained in the description is not repeated');
  assert.strictEqual(sceneOf({ summary: { scene: 'people at a market' } }), 'people at a market');
  assert.strictEqual(sceneOf({ failed: true, description: 'x' }), '');
  assert.strictEqual(sceneOf(null), '');
  assert.strictEqual(Array.from(sceneOf({ description: 'x'.repeat(900) }, 50)).length, 50);
});

test('translation: an object becomes text; the broken placeholder becomes nothing', () => {
  assert.strictEqual(cleanTranslation('Hello friends'), 'Hello friends');
  assert.strictEqual(cleanTranslation({ text: 'Hello friends' }), 'Hello friends');
  assert.strictEqual(cleanTranslation('[object Object]'), null);
  assert.strictEqual(cleanTranslation(null), null);
  assert.strictEqual(cleanTranslation('  '), null);
});

/* ------------------------------------------------------------------------------- the facts ------------------- */

test('a photo whose reading is structured data shows what it shows, never "[object Object]"', () => {
  const rows = normalisePosts([
    // the garbled case: no caption, the reader's description is an object, the analysis echoed the placeholder
    post(7, '2020-04-14T08:00:00Z', '', A('neutral', { english_text: '[object Object]' }), { image_analysis: { description: { scene: 'a beach at sunset', people: 2 }, summary: null } }),
    // an English reading that only repeats the description is not shown twice
    post(8, '2020-04-15T08:00:00Z', '', A('neutral', { english_text: 'A beach at sunset' }), { image_analysis: { description: 'A beach at sunset' } }),
    post(9, '2020-04-16T08:00:00Z', 'Good morning', A('positive'), { image_analysis: { full_text: 'GOOD MORNING', description: 'GOOD MORNING' } }),
  ], { timezone: 'Asia/Kolkata' });
  const [p7, p8, p9] = rows;
  assert.strictEqual(p7.english, '', 'the placeholder is not a translation');
  assert.strictEqual(p7.imageText, '');
  assert.strictEqual(p7.scene, 'a beach at sunset; people: 2');
  assert.strictEqual(p8.english, '');
  assert.strictEqual(p8.scene, 'A beach at sunset');
  assert.strictEqual(p9.scene, '', 'a description that only repeats the printed words is dropped');
  assert.strictEqual(p9.imageText, 'GOOD MORNING');
  const ev = selectEvidence(rows, { max: 10 });
  assert.ok(ev.every((e) => !/\[object/.test(JSON.stringify(e))), 'nothing garbled reaches the evidence');
  assert.strictEqual(ev.find((e) => e.id === '7').scene, 'a beach at sunset; people: 2');
});

test('posts with nothing to read are counted and explained, not silently left out', () => {
  const rows = normalisePosts([
    post(1, '2020-01-01T08:00:00Z', 'Hello', A('positive')),
    post(2, '2020-01-02T08:00:00Z', '', { skipped: true, reason: 'empty_text' }, { analysis_status: 'skipped' }),
    post(3, '2020-01-03T08:00:00Z', 'Waiting one', {}),
    post(4, '2020-01-04T08:00:00Z', 'Waiting two', {}),
  ], { timezone: 'Asia/Kolkata' });
  const f = facts(rows);
  assert.strictEqual(f.coverage.read, 4);
  assert.strictEqual(f.coverage.analysed, 1);
  assert.strictEqual(f.coverage.no_text, 1);
  assert.strictEqual(f.coverage.waiting, 2);
  assert.strictEqual(f.coverage.usable, 3, 'the empty post is not usable evidence');
  assert.ok(f.coverage.notes.includes('1 of 4 posts has no caption and nothing readable in the picture, so it was not analysed.'));
  assert.ok(f.coverage.notes.includes('2 of 4 posts are still waiting to be analysed; regenerate the report when they are done.'));
});

test('engagement: shares are not claimed for platforms that do not publish them', () => {
  assert.strictEqual(sharesReported('instagram'), false);
  assert.strictEqual(sharesReported('YouTube'), false);
  assert.strictEqual(sharesReported('x'), true);
  assert.strictEqual(sharesReported('facebook'), true);
  const igOnly = facts(normalisePosts([post(1, '2020-01-01T08:00:00Z', 'Hi there', A('neutral'))], { timezone: 'Asia/Kolkata' }));
  assert.strictEqual(igOnly.engagement.shares_reported, false);
  assert.deepStrictEqual(igOnly.engagement.no_share_platforms, ['instagram']);
  assert.ok(igOnly.coverage.notes.includes('Instagram does not publish share counts, so no share figures are shown for it.'));
  const mixed = facts(normalisePosts([
    post(1, '2020-01-01T08:00:00Z', 'Hi there', A('neutral')),
    post(2, '2020-01-02T08:00:00Z', 'Hello again', A('neutral'), { platform: 'x', engagement: { likes: 1, retweets: 4 } }),
  ], { timezone: 'Asia/Kolkata' }));
  assert.strictEqual(mixed.engagement.shares_reported, true, 'X reports them');
  assert.deepStrictEqual(mixed.engagement.no_share_platforms, ['instagram']);
  const ev = selectEvidence(normalisePosts([post(1, '2020-01-01T08:00:00Z', 'Hi there', A('neutral'))]), { max: 5 });
  assert.strictEqual(ev[0].shares_reported, false);
});

test('timeline: posts per month across the whole period, empty months included, with the longest silence and its dates', () => {
  const day = (d) => new Date(Date.UTC(2019, 4, 23) + d * 864e5).toISOString();
  const rows = normalisePosts([
    post(1, day(0), 'a first post', A('neutral')), post(2, day(3), 'second post', A('neutral')),
    post(3, day(400), 'a later one', A('neutral')), post(4, day(401), 'another later', A('neutral')), post(5, day(401.4), 'and another', A('neutral')),
  ], { timezone: 'Asia/Kolkata' });
  const f = facts(rows);
  const tl = f.cadence.timeline;
  assert.strictEqual(tl.unit, 'month');
  assert.strictEqual(tl.buckets[0].key, '2019-05');
  assert.strictEqual(tl.buckets[0].posts, 2);
  assert.strictEqual(tl.buckets.length, 14, 'May 2019 to Jun 2020 with the silent months in between');
  assert.strictEqual(tl.buckets.filter((b) => b.posts === 0).length, 12);
  assert.strictEqual(tl.active, 2);
  assert.deepStrictEqual(tl.peak, { label: tl.buckets[tl.buckets.length - 1].label, posts: 3 });
  assert.strictEqual(f.cadence.longest_gap.days, 397);
  assert.strictEqual(f.cadence.longest_gap.from, '2019-05-26');
  assert.strictEqual(f.cadence.longest_gap.to, '2020-06-26');
});

test('timeline: long histories are grouped by quarter or year; nothing dated gives nothing', () => {
  const rowsAt = (...years) => normalisePosts(years.map((y, i) => post(i + 1, `${y}-03-10T08:00:00Z`, `post ${i}`, A('neutral'))), { timezone: 'Asia/Kolkata' });
  assert.strictEqual(timelineOf(rowsAt(2014, 2024)).unit, 'quarter');
  assert.strictEqual(timelineOf(rowsAt(2000, 2024)).unit, 'year');
  assert.strictEqual(timelineOf(rowsAt(2019, 2023)).unit, 'month', 'five years is still read month by month');
  assert.strictEqual(timelineOf([]), null);
});

/* --------------------------------------------------------------------------------- the prompt -------------- */

test('prompt: region, shares, pictures and watch points are all spelled out for the model', () => {
  const rows = normalisePosts([post(1, '2020-04-14T08:00:00Z', '', A('neutral'), { image_analysis: { description: 'a beach at sunset' } })], { timezone: 'Asia/Kolkata' });
  const f = facts(rows);
  const ev = selectEvidence(rows, { max: 5 });
  const withRegion = buildUserContext({ facts: f, evidence: ev, region: 'Odisha' });
  assert.match(withRegion, /REGION: Odisha/);
  assert.ok(!/REGION:/.test(buildUserContext({ facts: f, evidence: ev })), 'no region line when the region is not known');
  assert.match(withRegion, /ENGAGEMENT: 3 likes, 1 comments/, 'shares are left out for Instagram');
  assert.ok(!/ENGAGEMENT:[^\n]*shares/.test(withRegion));
  assert.match(withRegion, /3 likes 1 comments/);
  assert.ok(!/3 likes \d+ shares/.test(withRegion));
  assert.match(withRegion, /Text: \(no caption\)\nPicture: a beach at sunset/);
  assert.match(withRegion, /ACTIVITY OVER TIME: posts in 1 of 1 months/);
  const p = buildSystemPrompt();
  assert.match(p, /does not publish share counts[\s\S]*Never write that the posts were not shared/);
  assert.match(p, /never name a person in a photo/);
  assert.match(p, /No link to <REGION> found in the posts read/);
  assert.match(p, /Never guess nationality, residence or location from names, posting hours or the language used/);
  assert.match(p, /what would change the assessment/);
  assert.match(p, /"regional_link"/);
});

test('prompt: shares stay in for platforms that report them', () => {
  const rows = normalisePosts([post(1, '2020-04-14T08:00:00Z', 'Hello world', A('neutral'), { platform: 'x', engagement: { likes: 2, retweets: 5, replies: 1 } })], { timezone: 'Asia/Kolkata' });
  const ctx = buildUserContext({ facts: facts(rows), evidence: selectEvidence(rows, { max: 5 }) });
  assert.match(ctx, /ENGAGEMENT: 2 likes, 5 shares, 1 comments/);
  assert.match(ctx, /2 likes 5 shares 1 comments/);
});

test('parser and fallback: regional link is read, kept short, and absent from a report written without the model', () => {
  const r = parseBehaviorReport(JSON.stringify({ bottom_line: 'Quotes account [P1].', regional_link: 'No link to Odisha found in the posts read.' }), { maxN: 3 });
  assert.strictEqual(r.regional_link, 'No link to Odisha found in the posts read.');
  assert.strictEqual(parseBehaviorReport(JSON.stringify({ bottom_line: 'x' }), { maxN: 3 }).regional_link, '');
  const rows = normalisePosts([post(1, '2020-04-14T08:00:00Z', 'Hello world', A('neutral'))], { timezone: 'Asia/Kolkata' });
  const fb = fallbackReport(facts(rows), selectEvidence(rows, { max: 5 }));
  assert.strictEqual(fb.regional_link, '');
  assert.ok(!/shares/.test(fb.influence), 'no share figure for an Instagram-only profile');
  const md = reportToMarkdown({ ...r, attention_level: 'Low', attention_reason: '', account_type: 'Individual', account_type_basis: '', limitations: ['one'] }, { ...facts(rows), profile: { name: 'Stone', platform_name: 'Instagram' } });
  assert.match(md, /\*\*Regional link:\*\* No link to Odisha/);
  assert.match(md, /Instagram does not publish share counts/);
});

test('region comes from the tenant name, and only when it reads like a place', () => {
  assert.strictEqual(regionOf('Odisha'), 'Odisha');
  assert.strictEqual(regionOf('Odisha Police'), 'Odisha');
  assert.strictEqual(regionOf('uttarakhandpolice'), 'Uttarakhand');
  assert.strictEqual(regionOf('Delhi_Police'), 'Delhi');
  assert.strictEqual(regionOf('APpolice'), '', 'a code like AP is not asked about as a place');
  assert.strictEqual(regionOf('tenant7'), '');
  assert.strictEqual(regionOf(''), '');
  assert.strictEqual(regionOf(null), '');
});

/* ------------------------------------------------------------------------------------- the PDF ------------- */

const pdfFor = (postsIn, report = {}, tenantLabel = 'ODISHA') => {
  const rows = normalisePosts(postsIn, { timezone: 'Asia/Kolkata' });
  const f = facts(rows);
  const evidence = selectEvidence(rows, { max: 40 });
  const data = {
    report: { bottom_line: 'Personal account.', attention_level: 'Low', account_type: 'Individual', notable_posts: [], behaviour_traits: [], themes: [], ...report },
    facts: f, evidence, generated_at: '2026-11-24T06:00:00Z', summary_source: 'llm',
  };
  return { html: buildBehaviorReportHtml(data, { tenantLabel }), f, evidence };
};

const SMALL = () => [
  post(1, '2019-05-26T04:30:00Z', '', A('negative', { summary: 'Quote with strong language about self-esteem.' }), { image_analysis: { full_text: 'Before you diagnose yourself ... Sigmund Freud' } }),
  post(2, '2019-08-01T04:30:00Z', 'Happy New Year', A('positive')),
  post(3, '2020-04-14T04:30:00Z', '', A('neutral', { english_text: '[object Object]' }), { image_analysis: { description: { scene: 'a beach at sunset' } } }),
  post(4, '2020-04-15T04:30:00Z', '', { skipped: true }, { analysis_status: 'skipped' }),
  post(5, '2023-05-16T04:30:00Z', 'Jai Jagannath', A('neutral'), { platform: 'x', engagement: { likes: 4, retweets: 2, replies: 1 } }),
];

test('pdf: every post is listed for a small profile, each with its reading, its reason and only the figures its platform has', () => {
  const { html } = pdfFor(SMALL(), { bottom_line: 'Personal account [P1].' });
  assert.match(html, /Evidence: all 4 posts read/);
  for (const n of [1, 2, 3, 4]) assert.match(html, new RegExp(`<td class="no">P${n}</td>`), `P${n} is listed`);
  assert.match(html, /Not listed: 1 post with no caption and nothing readable in the picture\./);
  assert.ok(!/\[object/.test(html), 'no placeholder anywhere in the report');
  // Instagram: likes and comments only. X: shares too.
  const ig = html.slice(html.indexOf('<td class="no">P1</td>'), html.indexOf('<td class="no">P2</td>'));
  assert.match(ig, /3 likes · 1 comments/);
  assert.ok(!/shares/.test(ig), 'no "0 shares" for Instagram');
  const x = html.slice(html.indexOf('<td class="no">P4</td>'));
  assert.match(x, /4 likes · 1 comments · 2 shares/);
  // the reason for the label sits beside it
  assert.match(ig, /<b>Reading:<\/b> Quote with strong language about self-esteem\./);
  // a photo with no caption and no printed words shows what it shows
  const p3 = html.slice(html.indexOf('<td class="no">P3</td>'), html.indexOf('<td class="no">P4</td>'));
  assert.match(p3, /Image post<\/span> <span class="muted">no caption, no text on the picture<\/span>/);
  assert.match(p3, /Picture: a beach at sunset/);
});

test('pdf: the limitations list carries what the numbers do not cover, and the region line is in the opening box', () => {
  const { html } = pdfFor(SMALL(), { regional_link: 'No link to Odisha found in the posts read.', limitations: ['Only public posts.'] });
  assert.match(html, /<b>Regional link:<\/b> No link to Odisha found in the posts read\./);
  const lim = html.slice(html.indexOf('Limitations'));
  assert.match(lim, /Only public posts\./);
  assert.match(lim, /1 of 5 posts has no caption and nothing readable in the picture, so it was not analysed\./);
  assert.match(lim, /Instagram and X do not publish share counts|Instagram does not publish share counts/);
  assert.match(html, /5 posts collected|<div class="v">5<\/div>/);
  assert.match(html, /4 analysed|3 analysed/);
  assert.match(html, /1 no text/);
});

test('pdf: a large profile keeps the cited-posts annex', () => {
  const many = Array.from({ length: 80 }, (_, i) => post(i + 1, new Date(Date.UTC(2024, 0, 1) + i * 864e5).toISOString(), `post number ${i}`, A('neutral')));
  const rows = normalisePosts(many, { timezone: 'Asia/Kolkata' });
  const f = facts(rows);
  const evidence = selectEvidence(rows, { max: 40 });
  const html = buildBehaviorReportHtml({ report: { bottom_line: 'A busy account [P3].', attention_level: 'Low', notable_posts: [] }, facts: f, evidence, generated_at: '2026-11-24T06:00:00Z' });
  assert.match(html, /Evidence: posts cited in this report/);
  assert.ok(!/Evidence: all/.test(html));
});

test('pdf: an older saved report (no usable count, no notes, no timeline) still opens', () => {
  const { f, evidence } = pdfFor(SMALL());
  const old = JSON.parse(JSON.stringify(f));
  delete old.coverage.usable; delete old.coverage.notes; delete old.coverage.no_text; delete old.coverage.waiting;
  delete old.cadence.timeline; delete old.cadence.longest_gap; delete old.engagement.shares_reported;
  const oldEvidence = evidence.map(({ scene, shares_reported: s, ...rest }) => rest);
  const html = buildBehaviorReportHtml({ report: { bottom_line: 'Old report [P1].', attention_level: 'Low' }, facts: old, evidence: oldEvidence, generated_at: '2026-01-01T00:00:00Z' });
  assert.match(html, /Evidence: posts cited in this report/);
  assert.match(html, /Old report/);
  assert.ok(!/undefined|NaN/.test(html), 'nothing undefined or NaN in the page');
  const ig = html.slice(html.indexOf('<td class="no">P1</td>'), html.indexOf('</tr>', html.indexOf('<td class="no">P1</td>')));
  assert.ok(!/shares/.test(ig), 'an Instagram post saved before this change also hides shares');
});

test('pdf: the activity timeline and the chart values are drawn, and the evidence is not forced onto a new page', () => {
  const { html } = pdfFor(SMALL());
  assert.match(html, /Posts per month · posted in 4 of \d+ months · busiest/);
  assert.match(html, /longest silence 1[,0-9]* days \(\d+ \w{3} 2020 → 16 May 2023\)/);
  assert.match(html, /<div class="tl">/);
  assert.match(html, /<div class="tax"><span[^>]*>May 2019<\/span>/);
  assert.match(html, /<div class="bv">\d+<\/div>/, 'hour and weekday columns carry their counts');
  assert.ok(!/page-break-before:always/.test(html), 'the evidence flows on after the report instead of leaving a gap');
  assert.match(html, /<thead><tr><th/, 'the evidence table repeats its header across pages');
});

/* ------------------------------------------------------------------ what the pictures show, all posts ---------- */

const PICTURES = () => [
  post(1, '2021-01-01T04:30:00Z', 'Rally today', A('neutral'), { image_analysis: { description: 'A large crowd holding flags in front of a stage.' } }),
  post(2, '2021-01-02T04:30:00Z', 'Meeting', A('neutral'), { image_analysis: { description: 'Crowd gathered around a speaker with a flag behind him.' } }),
  post(3, '2021-01-03T04:30:00Z', 'Evening', A('neutral'), { image_analysis: { description: 'A flag on a pole at sunset.', summary: 'Flag at dusk' } }),
  post(4, '2021-01-04T04:30:00Z', 'Lunch', A('neutral'), { image_analysis: { description: 'A plate of rice and curry on a table.' } }),
  post(5, '2021-01-05T04:30:00Z', 'No description from the reader', A('neutral'), { image_analysis: { full_text: 'GOOD LUCK' } }),
  post(6, '2021-01-06T04:30:00Z', 'Waiting for the reader', {}, { image_analysis: null }),
];

test('pictures: what they show is summed up across ALL posts, and the report says how many the reader described', () => {
  const rows = normalisePosts(PICTURES(), { timezone: 'Asia/Kolkata' });
  const f = facts(rows);
  const pic = f.content.pictures;
  assert.strictEqual(pic.with_pictures, 6);
  assert.strictEqual(pic.described, 4, 'posts 1 to 4 have a description');
  const terms = Object.fromEntries(pic.terms.map((x) => [x.term, x.count]));
  assert.strictEqual(terms.flag, 3, 'flag / flags counted once per picture, plural folded');
  assert.strictEqual(terms.crowd, 2);
  assert.ok(!('with' in terms) && !('large' in terms) && !('front' in terms) && !('behind' in terms), 'filler words are left out');
  assert.ok(!terms.rice, 'a word in a single picture is not a pattern');
  assert.ok(!pic.terms.some((x) => /^(man|woman|men|women)$/.test(x.term)), 'no gender words');
  // the note counts only posts the reader has already looked at: post 6 is simply waiting
  assert.ok(f.coverage.notes.includes('1 of 5 analysed posts with pictures have no description of the picture, so those are judged from their caption and any printed text only.'));
});

test('pictures: the model is told what the pictures show, for every post and not only the numbered ones', () => {
  const rows = normalisePosts(PICTURES(), { timezone: 'Asia/Kolkata' });
  const ctx = buildUserContext({ facts: facts(rows), evidence: selectEvidence(rows, { max: 3 }) });
  assert.match(ctx, /PICTURES: 4 of 6 posts with photos or video have a description of what the picture shows; words that recur in those descriptions, with the number of pictures each appears in: flag 3, crowd 2/);
  assert.match(ctx, /Picture: /);
  assert.match(buildSystemPrompt(), /caption, the text printed on its picture and what the picture shows, together/);
  assert.match(buildSystemPrompt(), /Do not describe pictures you were not given a description for/);
  // no pictures, no line
  const none = normalisePosts([post(1, '2021-01-01T04:30:00Z', 'No picture', A('neutral'), { media_urls: [], media_type: null })], { timezone: 'Asia/Kolkata' });
  assert.ok(!/PICTURES:/.test(buildUserContext({ facts: facts(none), evidence: selectEvidence(none, { max: 3 }) })));
});

test('pictures: the PDF shows what they show, and an older report without the summary still opens', () => {
  const { html, f, evidence } = pdfFor(PICTURES());
  assert.match(html, /What the pictures show \(4 of 6 pictures described\)/);
  assert.match(html, /<span>flag · 3<\/span>/);
  assert.match(html, /Picture: A large crowd holding flags in front of a stage\./);
  const old = JSON.parse(JSON.stringify(f));
  delete old.content.pictures;
  const again = buildBehaviorReportHtml({ report: { bottom_line: 'x', attention_level: 'Low' }, facts: old, evidence, generated_at: '2026-01-01T00:00:00Z' });
  assert.ok(!/What the pictures show/.test(again) && !/undefined|NaN/.test(again));
});
