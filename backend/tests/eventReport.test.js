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

const evRow = (n, o = {}) => ({ citationTag: `[Post #${n}]`, id: String(n), platform: 'facebook', author: `acct${n}`, text: `Post ${n} about the bandh`, sentiment: 'neutral', risk_level: 'low', url: `https://facebook.com/p/${n}`, posted_at: '2026-10-07T10:00:00Z', likes: 3, shares: 0, comments: 0, views: 0, ...o });
const evSummary = { event: { name: 'E', location: 'Odisha' }, stats: { total_unique_posts: 2, sentiment_counts: { positive: 0, neutral: 2, negative: 0 }, platform_counts: { facebook: 2 } }, evidence_traceability: [evRow(1), evRow(2)] };
const evAnalysis = {
  bottomLine: 'A bandh was called. [Post #1]',
  facts: {
    places: [{ name: 'Bhubaneswar', region: 'Odisha, India', mentioned: 1, active: 1, posts: [1] }, { name: 'Kozhikode', region: 'Kerala, India', mentioned: 1, active: 1, posts: [2] }],
    byPost: { 1: { places: ['Bhubaneswar'] }, 2: { places: ['Kozhikode'] } },
    calls: { count: 0, posts: [] }, violence: { count: 0, posts: [] }, accounts: [], activities: [],
  },
};

test('full report: each [Post #n] in the brief links to its annex row, and annex rows carry the target id', () => {
  const html = buildReportHtml({ summary: evSummary, keywordData: null, tenantName: 'odisha', analysis: evAnalysis, headquarters: null, includeEvidence: true });
  assert.ok(/<a href="#e1" class="ref">\[Post #1\]<\/a>/.test(html));
  assert.ok(/<tr id="e1">/.test(html) && /<tr id="e2">/.test(html));
  assert.ok(/href="https:\/\/facebook\.com\/p\/1"/.test(html));   // the annex row still holds the live link
});

test('annex lists posts about other regions apart, as context only', () => {
  const html = buildReportHtml({ summary: evSummary, keywordData: null, tenantName: 'odisha', analysis: evAnalysis, headquarters: null, includeEvidence: true });
  assert.ok(/Posts in Odisha/.test(html));
  assert.ok(/Outside Odisha \(context only\)/.test(html));
  const inPart = html.slice(html.indexOf('Posts in Odisha'), html.indexOf('Outside Odisha (context only)'));
  assert.ok(inPart.includes('id="e1"') && !inPart.includes('id="e2"'));
});

test('each headline number appears once: no repeated tone or total tiles', () => {
  const html = buildReportHtml({ summary: evSummary, keywordData: null, tenantName: 'odisha', analysis: evAnalysis, headquarters: null, includeEvidence: true });
  assert.ok(!/Negative share|Positive share|Neutral share|Toned volume|Posts in window/.test(html));
  assert.strictEqual((html.match(/Interactions \(likes, shares, comments\)/g) || []).length, 1);   // interactions are shown once
});

test('executive brief still carries no post links after the citation change', () => {
  const html = buildReportHtml({ summary: evSummary, keywordData: null, tenantName: 'odisha', analysis: evAnalysis, headquarters: null, includeEvidence: false });
  assert.ok(!/Post #\d/.test(html));
  assert.ok(!/href="#e\d/.test(html));
});

test('accounts whose platform gives no view counts say so instead of showing 0 views', () => {
  const posts = [1].map((n) => ({ id: n, platform: 'facebook', author: 'Page A', text: 'bandh', sentiment: 'neutral', risk_level: 'low', posted_at: '2026-10-07T10:00:00Z', likes: 10, shares: 1, comments: 1, views: 0, url: 'u', is_relevant: true, citationTag: '[Post #1]' }));
  const html = buildReportHtml({ summary: { event: { name: 'E', location: 'Odisha' }, stats: {}, evidence_traceability: posts }, keywordData: null, tenantName: 'odisha', analysis: { facts: { places: [], calls: { count: 0, posts: [] }, violence: { count: 0, posts: [] }, accounts: [], activities: [] } }, headquarters: null, includeEvidence: true });
  assert.ok(/views not reported/.test(html));
  assert.ok(!/ 0 views/.test(html));
});

test('executive cleanup does not damage normal sentences that start with "post"', () => {
  const a = { facts: { places: [], calls: { count: 0, posts: [] }, violence: { count: 0, posts: [] }, accounts: [], activities: [] } };
  const html = buildReportHtml({ summary: { event: { name: 'E', location: 'Odisha' }, stats: {} }, keywordData: null, tenantName: 'odisha', analysis: a, headquarters: null, includeEvidence: false });
  assert.ok(/No post reports violence/.test(html));
  assert.ok(!/No Posts reports/.test(html));
});

test('tenant name comes from the force profile; an unknown tenant is not mistaken for another force', () => {
  const generic = buildReportHtml({ summary: evSummary, keywordData: null, tenantName: 'map_tenant_db', analysis: evAnalysis, headquarters: null, includeEvidence: false });
  assert.ok(/MAP TENANT/.test(generic) && !/ANDHRA/.test(generic));      // used to match /andhra|ap/ and print another force's name
  const hq = resolveHeadquarters('x', { force: 'Goa Police', display_name: 'GOA POLICE', head: 'Director General of Police', headquarters: 'Panaji' });
  const own = buildReportHtml({ summary: evSummary, keywordData: null, tenantName: 'x', analysis: evAnalysis, headquarters: hq, includeEvidence: false });
  assert.ok(/GOA POLICE/.test(own));
});

test('post times and days follow the tenant timezone, not the server clock', () => {
  const late = { ...evSummary, evidence_traceability: [evRow(1, { posted_at: '2026-10-07T20:00:00Z' })] };   // 01:30 on 8 Oct in India
  const ist = buildReportHtml({ summary: late, keywordData: null, tenantName: 'odisha', analysis: evAnalysis, headquarters: { ...resolveHeadquarters('odisha'), timezone: 'Asia/Kolkata' }, includeEvidence: true });
  const utc = buildReportHtml({ summary: late, keywordData: null, tenantName: 'odisha', analysis: evAnalysis, headquarters: { ...resolveHeadquarters('odisha'), timezone: 'UTC' }, includeEvidence: true });
  assert.ok(/08 Oct, 01:30/.test(ist));
  assert.ok(/07 Oct, 20:00/.test(utc));
});

test('classification marking comes from the profile; there are no sign-off boxes', () => {
  const hq = { ...resolveHeadquarters('odisha'), classification: 'RESTRICTED', signoff: ['Analyst', 'Superintendent', 'DIG'] };
  const html = buildReportHtml({ summary: evSummary, keywordData: null, tenantName: 'odisha', analysis: evAnalysis, headquarters: hq, includeEvidence: true });
  assert.ok(/class="classif">RESTRICTED</.test(html));
  assert.ok(!/class="sign"/.test(html));
  const plain = buildReportHtml({ summary: evSummary, keywordData: null, tenantName: 'odisha', analysis: evAnalysis, headquarters: null, includeEvidence: true });
  assert.ok(!/Prepared by|Reviewed by|Approved by/.test(plain));
  assert.ok(!/class="classif"/.test(plain));
});

test('the analyst prompt names the tenant\'s own audience and units, with sensible defaults', () => {
  const { buildSystemPrompt: bsp } = require('../src/services/SummaryLLM/eventSummary.prompt');
  const own = bsp({ event: { name: 'E' }, headquarters: { head: 'Commissioner of Police', force: 'Delhi Police', units: ['Traffic Police', 'Cyber Cell'] }, addresseeLine: '' });
  assert.ok(/for the Commissioner of Police, Delhi Police/.test(own) && /e\.g\. Traffic Police, Cyber Cell/.test(own));
  const dflt = bsp({ event: { name: 'E' } });
  assert.ok(/senior police leadership/.test(dflt) && /District Police \/ SHO/.test(dflt) && !/State DGP/.test(dflt));
});

// ---------------------------------------------------------------- scope, quality, review, issue section, multi-tenant
const { classifyEvidence } = require('../src/modules/events/eventIntelligenceReport/scope');
const { stockPhrases, genericAction } = require('../src/services/SummaryLLM/styleLint');
const { parseLLMReport } = require('../src/services/SummaryLLM/eventSummary.prompt');

const mixed = {
  event: { name: 'Odisha bandh', location: 'Odisha' },
  generated_at: '2026-10-08T09:00:00Z',
  stats: { total_unique_posts: 100, relevant_posts_count: 4, sentiment_counts: { positive: 10, neutral: 80, negative: 10 }, platform_counts: { facebook: 90, x: 10 }, total_engagement: { likes: 5000 } },
  evidence_traceability: [
    evRow(1, { sentiment: 'neutral', likes: 10 }), evRow(2, { sentiment: 'negative', likes: 20 }),
    evRow(3, { platform: 'x', sentiment: 'neutral', likes: 4000 }), evRow(4, { platform: 'x', sentiment: 'positive', likes: 900 }),
  ],
};
const mixedAnalysis = {
  bottomLine: 'A bandh is under way in Bhubaneswar. [Post #1]',
  facts: {
    places: [{ name: 'Bhubaneswar', region: 'Odisha, India', mentioned: 2, active: 1, posts: [1, 2] }, { name: 'Mumbai', region: 'Maharashtra, India', mentioned: 2, active: 1, posts: [3, 4] }],
    byPost: { 1: { places: ['Bhubaneswar'] }, 2: { places: ['Bhubaneswar'] }, 3: { places: ['Mumbai'] }, 4: { places: ['Mumbai'] } },
    calls: { count: 0, posts: [] }, violence: { count: 0, posts: [] }, accounts: [], activities: [],
  },
};

test('scope: posts that name only places outside the region are split off; posts with no place stay in', () => {
  const ev = [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 5 }];
  const a = { facts: { places: mixedAnalysis.facts.places, byPost: { 1: { places: ['Bhubaneswar'] }, 2: { places: ['Bhubaneswar', 'Mumbai'] }, 3: { places: ['Mumbai'] } } } };
  const s = classifyEvidence(ev, a, { location: 'Odisha' });
  assert.deepStrictEqual(s.outEv.map((e) => e.n), [3]);
  assert.deepStrictEqual(s.inEv.map((e) => e.n), [1, 2, 5]);
  assert.strictEqual(classifyEvidence(ev, null, { location: 'Odisha' }).outEv.length, 0);   // no place data: nothing is split off
});

test('headline numbers describe the event region, with the monitor-wide total kept apart', () => {
  const html = buildReportHtml({ summary: mixed, keywordData: null, tenantName: 'odisha', analysis: mixedAnalysis, headquarters: null, includeEvidence: true });
  assert.ok(/2 in Odisha of 100 monitored/.test(html));                       // 2 region posts out of 100 monitored
  assert.ok(/<div class="n">30<\/div><div class="l">Interactions/.test(html)); // 10 + 20 likes, not the 5,000 monitor-wide
  const tone = html.slice(html.indexOf('Tone Breakdown'));
  assert.ok(/Neutral 1 \(50%\)/.test(tone) && /Negative 1 \(50%\)/.test(tone) && /Positive 0/.test(tone));
});

test('timeline days follow the tenant timezone, built from the region evidence', () => {
  const s = { ...mixed, evidence_traceability: [evRow(1, { posted_at: '2026-10-07T20:00:00Z' }), evRow(2, { posted_at: '2026-10-08T10:00:00Z' })] };
  const html = buildReportHtml({ summary: s, keywordData: null, tenantName: 'odisha', analysis: mixedAnalysis, headquarters: { ...resolveHeadquarters('odisha'), timezone: 'Asia/Kolkata' }, includeEvidence: false });
  assert.ok(/>08\/10</.test(html) && /Peak 2/.test(html));                    // both posts fall on 8 Oct in India
});

test('issue strands, what is known and not known are printed, with citations linked', () => {
  const a = { ...mixedAnalysis, issueStrands: [{ title: 'Odisha Bandh', who: 'INDIA bloc', demand: 'Repeal of a law', status: 'Under way today', posts: [1] }], issueLink: 'Both ask the CEC to resign.', known: [{ text: 'The bandh runs 6 AM to 6 PM.', posts: [1] }], notKnown: ['How many people took part.'] };
  const html = buildReportHtml({ summary: mixed, keywordData: null, tenantName: 'odisha', analysis: a, headquarters: null, includeEvidence: true });
  assert.ok(/What the Issue Is/.test(html) && /INDIA bloc/.test(html) && /What we know/.test(html) && /What we do not know yet/.test(html));
  assert.ok(/<a href="#e1" class="ref">\[Post #1\]<\/a>/.test(html.slice(html.indexOf('What the Issue Is'))));
  assert.ok(html.indexOf('Bottom line:') < html.indexOf('What the Issue Is') && html.indexOf('What the Issue Is') < html.indexOf('Immediate Action Summary'));   // answer first
  const first = html.match(/class="no">(\d\d)\./g);
  assert.strictEqual(first[0], 'class="no">01.');                              // sections are numbered in the order they print
  const none = buildReportHtml({ summary: mixed, keywordData: null, tenantName: 'odisha', analysis: mixedAnalysis, headquarters: null, includeEvidence: true });
  assert.ok(!/What the Issue Is/.test(none));                                  // no strands: no empty section
});

test('the model reply is parsed into issue strands, known and not known, dropping invented posts', () => {
  const r = parseLLMReport({ situation: 's', narratives: [{ title: 't', posts: [1] }], issue_strands: [{ title: 'A', who: 'B', demand: 'C', status: 'D', posts: [1, 50] }], known: [{ text: 'k', posts: [2] }, 'plain'], not_known: ['q'], issue_link: 'l' }, [{ citationTag: '[Post #1]' }, { citationTag: '[Post #2]' }]);
  assert.deepStrictEqual(r.issueStrands[0].posts, [1]);
  assert.strictEqual(r.known.length, 2);
  assert.deepStrictEqual(r.notKnown, ['q']);
  assert.strictEqual(r.issueLink, 'l');
});

test('two tenants built one after the other keep their own name and timezone', () => {
  const late = { ...mixed, evidence_traceability: [evRow(1, { posted_at: '2026-10-07T20:00:00Z' })] };
  const a = buildReportHtml({ summary: late, keywordData: null, tenantName: 'a', analysis: mixedAnalysis, headquarters: resolveHeadquarters('a', { force: 'A Police', display_name: 'A POLICE', head: 'DGP', headquarters: 'X', timezone: 'UTC', signoff: 'Analyst, SP, DIG' }), includeEvidence: true });
  const b = buildReportHtml({ summary: late, keywordData: null, tenantName: 'b', analysis: mixedAnalysis, headquarters: resolveHeadquarters('b', { force: 'B Police', display_name: 'B POLICE', head: 'CP', headquarters: 'Y', timezone: 'Asia/Kolkata' }), includeEvidence: true });
  assert.ok(/A POLICE/.test(a) && !/B POLICE/.test(a) && /07 Oct, 20:00/.test(a));
  assert.ok(/B POLICE/.test(b) && !/A POLICE/.test(b) && /08 Oct, 01:30/.test(b));
});

test('other languages: Odia text gets its font, translated labels are used, and values in labels survive', () => {
  const odia = { ...mixed, evidence_traceability: [evRow(1, { text: 'ଓଡ଼ିଶା ବନ୍ଦ ଆଜି' })] };
  const html = buildReportHtml({ summary: odia, keywordData: null, tenantName: 'odisha', analysis: mixedAnalysis, headquarters: null, includeEvidence: true, labels: { 'Evidence Annex': 'प्रमाण संलग्नक', 'Posts in {region}': '{region} में पोस्ट' } });
  assert.ok(/font-family:'Report Oriya'/.test(html));
  assert.ok(/प्रमाण संलग्नक/.test(html));
  const two = buildReportHtml({ summary: mixed, keywordData: null, tenantName: 'odisha', analysis: mixedAnalysis, headquarters: null, includeEvidence: true, labels: { 'Posts in {region}': '{region} में पोस्ट' } });
  assert.ok(/Odisha में पोस्ट/.test(two));
});

test('label translation: a reply that loses a {placeholder} is not accepted', async () => {
  const axios = require('axios');
  const { __test } = require('../src/modules/events/eventIntelligenceReport/labels');
  const orig = axios.post;
  axios.post = async () => ({ data: { choices: [{ message: { content: JSON.stringify({ 0: 'पोस्ट {region}', 1: 'पोस्ट' }) } }] } });
  try {
    const m = await __test.translateWithModel('Hindi', () => ({ baseUrl: 'x', apiKey: 'k', model: 'm', timeoutMs: 1000 }), ['Posts in {region}', 'Outside {region} (context only)']);
    assert.strictEqual(m['Posts in {region}'], 'पोस्ट {region}');
    assert.strictEqual(m['Outside {region} (context only)'], undefined);
  } finally { axios.post = orig; }
});

test('a 400-post event builds quickly, every post has an anchor, and long text is kept', () => {
  const many = { ...mixed, stats: { ...mixed.stats, total_unique_posts: 400 }, evidence_traceability: Array.from({ length: 400 }, (_, i) => evRow(i + 1, { text: `Post ${i + 1} ${'long '.repeat(80)}` })) };
  const t0 = Date.now();
  const html = buildReportHtml({ summary: many, keywordData: null, tenantName: 'odisha', analysis: { ...mixedAnalysis, facts: { ...mixedAnalysis.facts, byPost: {} } }, headquarters: null, includeEvidence: true });
  assert.ok(Date.now() - t0 < 3000);
  assert.strictEqual((html.match(/<tr id="e\d+">/g) || []).length, 400);
  assert.ok(/long long long long long long long long long long/.test(html.slice(html.indexOf('id="e400"'))));
});

test('region-only brief drops outside-region posts, places, dates and sentences, and has no annex', () => {
  const posts = [
    { citationTag: '[Post #1]', id: '1', platform: 'facebook', author: 'a', text: 'Bandh in Bhubaneswar', sentiment: 'neutral', risk_level: 'low', posted_at: '2026-10-08T05:00:00Z', likes: 5 },
    { citationTag: '[Post #2]', id: '2', platform: 'x', author: 'b', text: 'Protest in Mumbai', sentiment: 'neutral', risk_level: 'low', posted_at: '2026-10-07T05:00:00Z', likes: 9 },
  ];
  const facts = { places: [{ name: 'Bhubaneswar', region: 'Odisha, India', mentioned: 1, active: 1, posts: [1] }, { name: 'Mumbai', region: 'Maharashtra, India', mentioned: 1, active: 1, posts: [2] }], byPost: { 1: { places: ['Bhubaneswar'] }, 2: { places: ['Mumbai'] } }, calls: { count: 1, posts: [1] }, violence: { count: 0, posts: [] }, accounts: [], activities: [] };
  const a = {
    bottomLine: 'A bandh is called in Bhubaneswar. A protest is planned in Mumbai.',
    issueStrands: [{ title: 'Odisha bandh', who: 'INDIA bloc', demand: 'x', status: 'y', posts: [1] }, { title: 'Mumbai march', who: 'CJP', demand: 'z', status: 'w', posts: [2] }],
    keyDates: [{ date: '2026-10-08', event: 'Bandh', posts: [1] }, { date: '2026-10-10', event: 'March in Mumbai', posts: [2], outside: true }],
    actions: [{ action: 'Watch Mumbai: Cyber Cell', detail: 'd', posts: [2] }, { action: 'Watch roads: Police', detail: 'd', posts: [1] }],
    facts,
  };
  const summary = { event: { name: 'E', location: 'Odisha' }, stats: {}, evidence_traceability: posts };
  const html = buildReportHtml({ summary, keywordData: null, tenantName: 'odisha', analysis: a, headquarters: null, includeEvidence: false, regionOnly: true });
  assert.ok(/Bhubaneswar/.test(html) && /Odisha bandh/.test(html) && /Watch roads/.test(html));
  assert.ok(!/Mumbai/.test(html));
  assert.ok(!/Evidence Annex/.test(html));
  assert.ok(/Odisha Only Brief/.test(html));
  const normal = buildReportHtml({ summary, keywordData: null, tenantName: 'odisha', analysis: a, headquarters: null, includeEvidence: false });
  assert.ok(/Mumbai/.test(normal));
});
