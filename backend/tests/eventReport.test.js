const test = require('node:test');
const assert = require('node:assert');
const { normalizeText, dedupeKey } = require('../src/lib/textNormalize');
const { parseFacts, aggregateFacts } = require('../src/services/SummaryLLM/eventFacts');
const { cleanText } = require('../src/services/SummaryLLM/styleLint');
const { extractJson } = require('../src/services/SummaryLLM/eventSummary.prompt');
const { buildReportHtml } = require('../src/modules/events/eventIntelligenceReport/template');
const { tenantDisplayName, resolveHeadquarters } = require('../src/modules/events/eventIntelligenceReport/headquarters');

const post = (o = {}) => ({ text: 'INDIA bloc called a bandh in Bhubaneswar tomorrow', englishText: '', postedAt: '2026-10-07', author: 'a', platform: 'x', ...o });

test('normalizeText removes zero-width characters', () => {
  assert.strictEqual(normalizeText('ଓଡ଼‌ିଶା  ବନ୍ଦ'), 'ଓଡ଼ିଶା ବନ୍ଦ');
  assert.strictEqual(dedupeKey('Hello https://x.co @bob  World!'), dedupeKey('hello world'));
});

test('parseFacts keeps supported fields and drops invented ones', () => {
  const by = new Map([[1, post()]]);
  const r = parseFacts('{"p":[{"n":1,"k":"bandh","d":"2026-10-08","o":"INDIA bloc","w":"Cuttack","c":1,"r":"o","pl":[{"n":"Bhubaneswar","in":"Odisha, India","a":1},{"n":"Paris","in":"France","a":0}]}]}', by, extractJson);
  assert.strictEqual(r[1].date, '2026-10-08');
  assert.strictEqual(r[1].organiser, 'INDIA bloc');
  assert.strictEqual(r[1].place, '');                    // Cuttack is not in the post
  assert.deepStrictEqual(r[1].places.map((p) => p.name), ['Bhubaneswar']);   // Paris is not in the post
});

test('parseFacts rejects impossible or distant dates', () => {
  const by = new Map([[1, post()]]);
  assert.strictEqual(parseFacts('{"p":[{"n":1,"d":"2026-02-31"}]}', by, extractJson)[1].date, '');
  assert.strictEqual(parseFacts('{"p":[{"n":1,"d":"2025-01-01"}]}', by, extractJson)[1].date, '');
});

test('a news report of someone else\'s call is not counted as a call', () => {
  const by = new Map([[1, post({ author: 'News' })], [2, post({ author: 'Group' })]]);
  const f = aggregateFacts({
    1: { kind: 'bandh', date: '2026-10-08', organiser: '', place: '', call: true, violence: false, role: 'media', places: [] },
    2: { kind: 'bandh', date: '2026-10-08', organiser: '', place: '', call: true, violence: false, role: 'organisation', places: [] },
  }, by);
  assert.strictEqual(f.calls.count, 1);
  assert.deepStrictEqual(f.calls.posts, [2]);
});

test('cleanText removes filler openers', () => {
  assert.strictEqual(cleanText('The analysis indicates that a bandh was called.').text, 'A bandh was called.');
});

const baseSummary = { event: { name: 'E', location: 'Odisha' }, stats: {} };
const analysis = {
  bottomLine: 'A bandh. [Post #1]',
  actions: [{ action: 'x', detail: 'Deploy (Post #1)', posts: [1] }],
  facts: { places: [{ name: 'Kozhikode', region: 'Kerala, India', mentioned: 1, active: 1, posts: [4] }], calls: { count: 0, posts: [] }, violence: { count: 0, posts: [] }, accounts: [], activities: [] },
};

test('executive brief has no post links; full report keeps them', () => {
  const exec = buildReportHtml({ summary: baseSummary, keywordData: null, tenantName: 'odisha', analysis, headquarters: null, includeEvidence: false });
  const full = buildReportHtml({ summary: baseSummary, keywordData: null, tenantName: 'odisha', analysis, headquarters: null, includeEvidence: true });
  assert.ok(!/Post #\d/.test(exec));
  assert.ok(/Post #1/.test(full));
});

test('places in another region are listed as outside the event region', () => {
  const html = buildReportHtml({ summary: baseSummary, keywordData: null, tenantName: 'odisha', analysis, headquarters: null, includeEvidence: true });
  assert.ok(/Outside Odisha/.test(html));
});

test('tenant profile lookup works from config, with a generic fallback', () => {
  assert.strictEqual(tenantDisplayName('odisha_db'), 'ODISHA POLICE');
  assert.ok(/Cuttack/.test(resolveHeadquarters('odisha').addressLine));
  assert.strictEqual(tenantDisplayName('xyz_tenant'), 'XYZ TENANT');
});

const { lookupPlace } = require('../src/services/SummaryLLM/geo.service');
const { buildSystemPrompt } = require('../src/services/SummaryLLM/eventSummary.prompt');
const { reportLanguageFor } = require('../src/modules/events/eventIntelligenceReport/headquarters');

test('GeoNames lookup matches names in any script and picks the region', () => {
  assert.strictEqual(lookupPlace('କଟକ', 'Odisha').label, 'Cuttack, Odisha, India');
  assert.strictEqual(lookupPlace('കോഴിക്കോട്', 'Odisha').region, 'Kerala');
  assert.strictEqual(lookupPlace('Not a real place xyz'), null);
});

test('report language comes from the tenant profile and reaches the prompt', () => {
  assert.strictEqual(reportLanguageFor('odisha'), 'English');
  assert.ok(/in Hindi/.test(buildSystemPrompt({ event: { name: 'E' }, reportLanguage: 'Hindi' })));
  assert.ok(!/LANGUAGE:/.test(buildSystemPrompt({ event: { name: 'E' }, reportLanguage: 'English' })));
});

const { localizeHtml, EN_LABELS } = require('../src/modules/events/eventIntelligenceReport/labels');
const { resolvePlace } = require('../src/services/SummaryLLM/geo.service');

test('fixed headings are translated, post text is left alone', () => {
  const html = '<div class="sec"><span class="nm">Recommended Actions</span></div><td>Recommended Actions in a post</td>';
  const out = localizeHtml(html, { 'Recommended Actions': 'सिफारिश की गई कार्रवाइयाँ' });
  assert.ok(out.includes('<span class="nm">सिफारिश की गई कार्रवाइयाँ</span>'));
  assert.ok(out.includes('Recommended Actions in a post'));
  assert.strictEqual(localizeHtml(html, null), html);
});

test('every section heading of the report is in the label list', () => {
  ['Situation and Risk Assessment', 'Where It Is Happening', 'Activity and Ground Presence', 'Key Actors and Figures', 'Accounts to Watch', 'Public Reaction and Tone', 'Recommended Actions', 'Evidence Annex'].forEach((h) => assert.ok(EN_LABELS.includes(h), h));
});

test('a landmark takes its real region from the city the model gave', () => {
  assert.strictEqual(resolvePlace('Jantar Mantar', 'New Delhi, India', 'India').region, 'Delhi');
  assert.ok(resolvePlace('दिल्ली', '', 'Delhi'));
});

const { buildApplicationDetails, readApplicationDetails } = require('../src/modules/user/user.application');

test('force profile saves through the settings record and wins over defaults', () => {
  const saved = buildApplicationDetails({ title: 'T' }, { force_profile: { force: 'Test Police', report_language: 'Hindi', junk: 'x' } });
  assert.deepStrictEqual(saved.force_profile, { force: 'Test Police', report_language: 'Hindi' });
  assert.strictEqual(readApplicationDetails({ application_details: saved }).force_profile.force, 'Test Police');
  assert.strictEqual(tenantDisplayName('anything', saved.force_profile), 'TEST POLICE');
  assert.strictEqual(reportLanguageFor('anything', saved.force_profile), 'Hindi');
  assert.strictEqual(resolveHeadquarters('x', { force: 'Test Police', headquarters: 'HQ Road', pin: '1' }).addressLine, 'HQ Road, PIN 1');
});

test('a new admin gets a force profile automatically; the generic platform name does not', () => {
  const created = buildApplicationDetails(null, { blurasagatitle: 'Kerala Police' }, { title: 'Kerala Police', description: 'x' });
  assert.strictEqual(created.force_profile.force, 'Kerala Police');
  assert.strictEqual(created.force_profile.display_name, 'KERALA POLICE');
  assert.strictEqual(created.force_profile.report_language, 'English');
  assert.strictEqual(buildApplicationDetails(null, {}, {}).force_profile, undefined);
  const edited = buildApplicationDetails(created, { force_profile: { force: 'Kerala State Police', head: 'DGP' } });
  assert.strictEqual(edited.force_profile.force, 'Kerala State Police');
});

test('platform brand words are not used as the force name', () => {
  assert.strictEqual(buildApplicationDetails(null, {}, { title: 'Odisha Blura Saga' }).force_profile.force, 'Odisha');
  assert.strictEqual(buildApplicationDetails(null, {}, { title: 'BLURA SAGA' }).force_profile, undefined);
});

test('a news account is Media, and a high-risk post alone does not make an account a priority', () => {
  const posts = [1, 2].map((n) => ({ id: n, platform: 'x', author: n === 1 ? 'News One' : 'Group A', text: 'bandh tomorrow', sentiment: 'neutral', risk_level: n === 1 ? 'high' : 'low', posted_at: '2026-10-07T10:00:00Z', likes: 1, shares: 0, comments: 0, views: 10, url: 'u' + n, is_relevant: true, citationTag: `[Post #${n}]` }));
  const summary = { event: { name: 'E', location: 'Odisha' }, stats: { total_media_count: 2 }, evidence_traceability: posts };
  const analysis = { sourceTypes: { 1: 'media', 2: 'individual' }, facts: { places: [], calls: { count: 1, posts: [2] }, violence: { count: 0, posts: [] }, accounts: [{ author: 'Group A', role: 'organisation', calls: 1, violence: 0, posts: [2] }], activities: [] } };
  const html = buildReportHtml({ summary, keywordData: null, tenantName: 'odisha', analysis, headquarters: null, includeEvidence: true });
  assert.ok(/Media \/ news/.test(html));
  assert.ok(/Organiser/.test(html));
  assert.ok(!/critical in tone/.test(html));
});

test('executive brief leaves no dangling "and." after citations are removed', () => {
  const a = { bottomLine: 'x', actions: [{ action: 'Act', detail: 'Verify the claim [Post #1] and [Post #2].', posts: [1, 2] }], facts: { places: [], calls: { count: 0, posts: [] }, violence: { count: 0, posts: [] }, accounts: [], activities: [] } };
  const html = buildReportHtml({ summary: { event: { name: 'E', location: 'Odisha' }, stats: {} }, keywordData: null, tenantName: 'odisha', analysis: a, headquarters: null, includeEvidence: false });
  assert.ok(!/ and\./.test(html));
});

test('calls and violence outside the event region are counted apart and do not raise this region\'s numbers', () => {
  const by = new Map([1, 2, 3].map((n) => [n, { author: `A${n}`, platform: 'x' }]));
  const base = { kind: 'protest', date: '2026-10-10', organiser: '', place: '', call: true, violence: false, role: 'organisation' };
  const map = { 1: { ...base, places: [] }, 2: { ...base, places: [{ name: 'Delhi', region: 'Delhi, India' }] }, 3: { ...base, violence: true, call: false, places: [{ name: 'Paris', region: 'France' }] } };
  const where = (n) => ({ 1: 'in', 2: 'out', 3: 'out' }[n]);
  const f = aggregateFacts(map, by, where);
  assert.strictEqual(f.calls.count, 1);
  assert.strictEqual(f.callsOutside.count, 1);
  assert.strictEqual(f.violence.count, 0);
  assert.strictEqual(f.violenceOutside.count, 1);
});

test('a place name that only exists in another country than the model said is not accepted', () => {
  const g = require('../src/services/SummaryLLM/geo.service');
  assert.strictEqual(g.lookupPlace('Umarkot', 'Odisha', 'Odisha, India'), null);
  assert.strictEqual(g.lookupPlace('Cuttack', 'Odisha', 'Odisha, India').region, 'Odisha');
});
