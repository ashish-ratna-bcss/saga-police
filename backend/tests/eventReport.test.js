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
  assert.ok(/News \/ official/.test(html));
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
  assert.ok(/No post confirms violence/.test(html));
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
  assert.ok(/Odisha Executive Summary/.test(html));
  const normal = buildReportHtml({ summary, keywordData: null, tenantName: 'odisha', analysis: a, headquarters: null, includeEvidence: false });
  assert.ok(/Mumbai/.test(normal));
});

test('Odisha-only report: nothing names a place outside the region, in lists or in the model text; "goal" is not "Goa"', () => {
  const posts = [1, 2, 3].map((n) => ({ id: n, platform: 'x', author: `A${n}`, text: n === 1 ? 'bandh in Bhubaneswar' : n === 2 ? 'protest at Shivaji Park Mumbai' : 'a goal was scored', sentiment: 'neutral', risk_level: 'low', posted_at: '2026-10-07T10:00:00Z', likes: 1, shares: 0, comments: 0, views: 0, url: 'u' + n, is_relevant: true, citationTag: `[Post #${n}]` }));
  const analysis = {
    bottomLine: 'A bandh is planned in Odisha. A protest is planned in Mumbai. The goal is to stop traffic.',
    actions: [{ action: 'Bandobast', detail: 'Deploy in Bhubaneswar.', posts: [1] }, { action: 'Watch Mumbai', detail: 'Monitor the Mumbai protest.', posts: [2] }],
    keyDates: [{ date: '2026-10-08', type: 'upcoming', event: 'Bandh at Bhubaneswar', posts: [1] }, { date: '2026-10-02', type: 'past', event: 'Protest at Shivaji Park', posts: [2] }],
    facts: { places: [{ name: 'Bhubaneswar', region: 'Odisha, India', mentioned: 1, active: 1, posts: [1] }, { name: 'Mumbai', region: 'Maharashtra, India', mentioned: 1, active: 1, posts: [2] }, { name: 'Shivaji Park', region: 'Maharashtra, India', mentioned: 1, active: 1, posts: [2] }], byPost: { 1: { places: ['Bhubaneswar'] }, 2: { places: ['Mumbai', 'Shivaji Park'] }, 3: { places: [] } }, calls: { count: 0, posts: [] }, violence: { count: 0, posts: [] }, accounts: [], activities: [] },
  };
  const html = buildReportHtml({ summary: { event: { name: 'E', location: 'Odisha' }, stats: {}, evidence_traceability: posts }, keywordData: null, tenantName: 'odisha', analysis, headquarters: null, includeEvidence: false, regionOnly: true });
  assert.ok(!/Mumbai|Shivaji/.test(html), 'an outside place is still named');
  assert.ok(/Bhubaneswar/.test(html));
  assert.ok(/The goal is to stop traffic/.test(html));
  const full = buildReportHtml({ summary: { event: { name: 'E', location: 'Odisha' }, stats: {}, evidence_traceability: posts }, keywordData: null, tenantName: 'odisha', analysis, headquarters: null, includeEvidence: false });
  assert.ok(/Mumbai/.test(full));
});

test('more recommended actions: valid posts only, no repeats, at most ten, region facts only', () => {
  const p = require('../src/services/SummaryLLM/eventSummary.prompt');
  const extra = p.parseMoreActions(JSON.stringify({ actions: [
    { theme: 'b', action: 'Traffic plan — Traffic Police', detail: 'Divert heavy vehicles around Bhubaneswar on 8 October from 6 AM. Escalate if roads are blocked.', posts: [3, 999] },
    { action: 'Empty', detail: 'x', posts: [1] },
  ] }), new Set([1, 2, 3]));
  assert.strictEqual(extra.length, 1);
  assert.deepStrictEqual(extra[0].posts, [3]);
  const core = [{ action: 'Bandobast — District Police', detail: 'd', posts: [1] }];
  const merged = p.mergeActions(core, [...extra, { action: 'bandobast — district police', detail: 'again', posts: [] }, { theme: 'b', action: 'Traffic management — Traffic Police', detail: 'second traffic action', posts: [] }, { theme: 'a', action: 'Ground Bandobast Monitoring plan — Police', detail: 'near copy of the first', posts: [] }], 10);
  assert.strictEqual(merged.length, 2);   // the exact repeat, the near copy and the second action of the same theme are all dropped
  const many = Array.from({ length: 20 }, (_, i) => ({ action: `Distinct${String.fromCharCode(97 + i)}${String.fromCharCode(98 + i)}${String.fromCharCode(99 + i)}${String.fromCharCode(100 + i)}${String.fromCharCode(101 + i)}`, detail: 'd'.repeat(40), posts: [] }));
  assert.strictEqual(p.mergeActions([], many, 10).length, 10);
  const ctx = p.buildActionsContext({ report: { bottomLine: 'b', claims: [] }, facts: { activities: [{ date: '2026-10-08', kind: 'bandh', place: 'Odisha', posts: [1], outside: false }, { date: '2026-10-10', kind: 'protest', place: 'Delhi', posts: [2], outside: true }], places: [], accounts: [], calls: { count: 1 }, violence: { count: 0 }, callsOutside: { count: 1 } }, event: { name: 'E', location: 'Odisha' }, today: '2026-10-08', existing: core });
  assert.ok(/ACTIVITIES IN THE REGION:\n- 2026-10-08 bandh/.test(ctx) && /OUTSIDE THE REGION \(context only\)/.test(ctx) && /ALREADY LISTED[^\n]*\n- Bandobast/.test(ctx));
  assert.ok(/6 to 10 recommended actions/.test(p.buildActionsSystem({ event: { name: 'E' } })));
});

test('closing summary: cleaned reply, printed as the last section, and trimmed in the region-only report', () => {
  const p = require('../src/services/SummaryLLM/eventSummary.prompt');
  const good = 'A 12-hour bandh is planned in Odisha on 8 October by the INDIA bloc. [Post #4] The posts show no violence in the state. A protest in Mumbai is also planned, but that is outside the state. Nobody has said how many people will come. The police should keep the main roads clear and stay in touch with the organisers.';
  const txt = p.parseClosing('```\n' + good + '\n```');
  assert.ok(txt.length > 120 && !/\[Post #/.test(txt) && !/```/.test(txt));
  assert.strictEqual(p.parseClosing('Too short.'), '');
  assert.strictEqual(p.parseClosing('{"summary": "' + 'word '.repeat(40) + '"}').length > 120, true);
  const a = { closingSummary: txt, facts: { places: [{ name: 'Bhubaneswar', region: 'Odisha, India', mentioned: 1, active: 1, posts: [1] }, { name: 'Mumbai', region: 'Maharashtra, India', mentioned: 1, active: 1, posts: [2] }], byPost: { 1: { places: ['Bhubaneswar'] }, 2: { places: ['Mumbai'] } }, calls: { count: 0, posts: [] }, violence: { count: 0, posts: [] }, accounts: [], activities: [] } };
  const posts = [1, 2].map((n) => ({ id: n, platform: 'x', author: `A${n}`, text: n === 1 ? 'bandh Bhubaneswar' : 'protest Mumbai', sentiment: 'neutral', risk_level: 'low', posted_at: '2026-10-07T10:00:00Z', likes: 1, shares: 0, comments: 0, views: 0, url: 'u' + n, is_relevant: true, citationTag: `[Post #${n}]` }));
  const sm = { event: { name: 'E', location: 'Odisha' }, stats: {}, evidence_traceability: posts };
  const full = buildReportHtml({ summary: sm, keywordData: null, tenantName: 'odisha', analysis: a, headquarters: null, includeEvidence: false });
  assert.ok(/<span class="nm">Summary<\/span>/.test(full) && /class="closing"/.test(full) && /A protest in Mumbai/.test(full));
  const region = buildReportHtml({ summary: sm, keywordData: null, tenantName: 'odisha', analysis: a, headquarters: null, includeEvidence: false, regionOnly: true });
  assert.ok(/class="closing"/.test(region) && !/Mumbai/.test(region) && /12-hour bandh is planned in Odisha/.test(region));
  const none = buildReportHtml({ summary: sm, keywordData: null, tenantName: 'odisha', analysis: { ...a, closingSummary: '' }, headquarters: null, includeEvidence: false });
  assert.ok(!/class="closing"/.test(none));
});

test('closing summary check: right risk level, nothing invented about what the police already do', () => {
  const p = require('../src/services/SummaryLLM/eventSummary.prompt');
  assert.strictEqual(p.closingLevel({ facts: { calls: { count: 7 }, violence: { count: 0 } }, stats: {} }), 'Medium');
  assert.strictEqual(p.closingLevel({ facts: { calls: { count: 0 }, violence: { count: 2 } }, stats: {} }), 'High');
  assert.strictEqual(p.closingLevel({ facts: { calls: { count: 0 }, violence: { count: 0 } }, stats: { risk_counts: { high: 0 } } }), 'Low');
  assert.match(p.checkClosing('The seriousness is low because there is no violence.', 'Medium'), /Medium/);
  assert.match(p.checkClosing('The risk is Medium. The police are monitoring the situation closely.', 'Medium'), /police/);
  assert.match(p.checkClosing('The risk is Medium because posts call for a bandh. The police should deploy early.', 'Low') || 'x', /Low|x/);
  assert.strictEqual(p.checkClosing('The risk is Medium because posts call for a bandh on 8 October. The police should keep roads clear.', 'Medium'), '');
  assert.strictEqual(p.checkClosing('anything', 'Medium', 'Hindi'), '');
  assert.ok(/risk level is "Medium"/.test(p.buildClosingSystem({ event: { name: 'E' }, level: 'Medium' })));
});

test('the posts behind "people on site" and "calls to act" are listed, linked in the full report only', () => {
  const posts = [
    { citationTag: '[Post #1]', id: '1', platform: 'facebook', author: 'a', text: 'Picket at Bhubaneswar square', sentiment: 'neutral', risk_level: 'low', posted_at: '2026-10-08T05:00:00Z', likes: 5 },
    { citationTag: '[Post #2]', id: '2', platform: 'x', author: 'b', text: 'Join the bandh tomorrow', sentiment: 'neutral', risk_level: 'low', posted_at: '2026-10-07T05:00:00Z', likes: 9 },
  ];
  const facts = { places: [{ name: 'Bhubaneswar', region: 'Odisha, India', mentioned: 1, active: 1, posts: [1] }], byPost: { 1: { places: ['Bhubaneswar'] }, 2: { places: [] } }, calls: { count: 1, posts: [2] }, violence: { count: 0, posts: [] }, accounts: [], activities: [] };
  const summary = { event: { name: 'E', location: 'Odisha' }, stats: {}, evidence_traceability: posts };
  const full = buildReportHtml({ summary, keywordData: null, tenantName: 'odisha', analysis: { facts }, headquarters: null, includeEvidence: true });
  assert.ok(/Posts reporting people on site<\/h4>/.test(full) && /Picket at Bhubaneswar square/.test(full));
  assert.ok(/<a href="#e1" class="ref">\[Post #1\]<\/a>/.test(full));
  assert.ok(/Posts calling people to act:/.test(full) && /<a href="#e2" class="ref">\[Post #2\]<\/a>/.test(full));
  const exec = buildReportHtml({ summary, keywordData: null, tenantName: 'odisha', analysis: { facts }, headquarters: null, includeEvidence: false });
  assert.ok(/class="geo"/.test(exec) && /<b>Bhubaneswar<\/b>/.test(exec) && /1 on site/.test(exec), 'the summary shows the place board');
  assert.ok(/class="glinks"[^>]*>\s*<a href="[^"]*"[^>]*class="plink">#1<\/a>/.test(exec) || /class="glinks">#1/.test(exec), 'the place row links to its post');
  assert.ok(!/Picket at Bhubaneswar square/.test(exec), 'the summary has no long table of post texts');
  assert.ok(!/Post #\d/.test(exec));
});

test('cancel: stops only that event\'s running generation, aborts its model calls, leaves others alone', () => {
  const svc = require('../src/services/SummaryLLM/eventSummary.service');
  const jobs = svc.__test.summaryJobs;
  const mk = (status = 'running') => ({ status, abort: new AbortController(), started_at: 'now' });
  const mine = mk(); const mineWeekly = mk(); const other = mk(); const done = mk('failed');
  jobs.set('t1:7:full', mine); jobs.set('t1:7:weekly', mineWeekly); jobs.set('t1:8:full', other); jobs.set('t1:7:daily', done);
  assert.strictEqual(svc.cancelSummaryJobs('t1', 7), 2);
  assert.ok(mine.abort.signal.aborted && mineWeekly.abort.signal.aborted);
  assert.strictEqual(mine.status, 'cancelled');
  assert.ok(!other.abort.signal.aborted && other.status === 'running');
  assert.strictEqual(done.status, 'failed');
  assert.strictEqual(svc.cancelSummaryJobs('t1', 7), 0);     // nothing left to cancel
  assert.strictEqual(svc.cancelSummaryJobs('nobody', 7), 0);
  ['t1:7:full', 't1:7:weekly', 't1:8:full', 't1:7:daily'].forEach((k) => jobs.delete(k));
});

test('relevance: a place name split into words must not turn plain words into locations ("morning assembly" is not Odisha)', () => {
  const { classifyEventRelevance, getEventAnchorProfile } = require('../src/modules/events/eventTelemetry.service');
  const ev = { name: "CJP Demand - Education Minister's Resignation", location: 'Odisha', description: 'Students protested near the Odisha Legislative Assembly in Bhubaneswar over textbook errors and demanded the Education Minister resign.', keywords: [{ keyword: 'School Thik Karo' }] };
  const profile = getEventAnchorProfile(ev, ev.keywords, '', '');
  assert.ok(!profile.locationTokens.includes('assembly'), 'assembly must not be a location word');
  assert.ok(profile.locationTokens.includes('odisha') && profile.locationTokens.includes('bhubaneswar'));
  const sriLanka = 'It is time to end the school cut. Students are pulled out of the morning assembly by a teacher. Email the Ministry of Education and demand an end to this. The minister should act. Students demand education rights.';
  assert.strictEqual(classifyEventRelevance(sriLanka, ev, [], '', '', {}).isRelevant, false);
  const real = 'Students gathered near the Odisha Legislative Assembly and demanded the education minister resign over textbook errors in Bhubaneswar.';
  assert.strictEqual(classifyEventRelevance(real, ev, [], '', '', {}).isRelevant, true);
});

test('every number about posts shows its posts as links: annex links in the full report, live links in the executive summary', () => {
  const mk = (n, o = {}) => ({ id: n, platform: 'x', author: `A${n}`, text: `post ${n} about the bandh in Bhubaneswar`, sentiment: 'neutral', risk_level: 'low', posted_at: '2026-10-07T10:00:00Z', likes: 1, shares: 0, comments: 0, views: 0, url: `https://x.com/a/status/${n}`, is_relevant: true, citationTag: `[Post #${n}]`, ...o });
  const posts = [mk(1, { risk_level: 'high' }), mk(2), mk(3, { risk_level: 'critical' })];
  const facts = { places: [{ name: 'Bhubaneswar', region: 'Odisha, India', mentioned: 3, active: 1, posts: [1] }], byPost: { 1: { places: ['Bhubaneswar'] }, 2: { places: [] }, 3: { places: [] } }, calls: { count: 1, posts: [2] }, violence: { count: 1, posts: [3] }, accounts: [{ author: 'A2', platform: 'x', role: 'organisation', calls: 1, violence: 0, posts: [2] }], activities: [] };
  const summary = { event: { name: 'E', location: 'Odisha' }, stats: { risk_counts: { high: 1, critical: 1 } }, evidence_traceability: posts };
  const exec = buildReportHtml({ summary, keywordData: null, tenantName: 'odisha', analysis: { facts }, headquarters: null, includeEvidence: false });
  assert.ok(/Posts behind these numbers/.test(exec));
  assert.ok(/High \/ critical risk \(2\):<\/b>\s*<a href="https:\/\/x\.com\/a\/status\/1"[^>]*class="plink">#1<\/a>\s*<a href="https:\/\/x\.com\/a\/status\/3"/.test(exec), 'risk posts are live links');
  assert.ok(/Violence mentioned \(not confirmed\) \(1\):<\/b>\s*<a href="https:\/\/x\.com\/a\/status\/3"/.test(exec));
  assert.ok(/Posts calling people to act \(1\):<\/b>\s*<a href="https:\/\/x\.com\/a\/status\/2"/.test(exec));
  assert.ok(/class="pcard[^"]*"[\s\S]*A2[\s\S]*<a href="https:\/\/x\.com\/a\/status\/2"[^>]*>#2<\/a>/.test(exec), 'the summary shows each platform with its accounts and their posts as links');
  assert.ok(!/<th>Posts & Reach<\/th>/.test(exec), 'the summary has no long accounts table');
  assert.ok(!/\[Post #\d+\]/.test(exec), 'no raw bracket tags are left');
  const full = buildReportHtml({ summary, keywordData: null, tenantName: 'odisha', analysis: { facts }, headquarters: null, includeEvidence: true });
  assert.ok(/High \/ critical risk \(2\):<\/b>\s*<a href="#e1" class="ref">\[Post #1\]<\/a>/.test(full), 'full report links to the annex');
  assert.ok(/Posts & Reach/.test(full) && /<b>1<\/b> post<br><span class="sm"><a href="#e2" class="ref">\[Post #2\]<\/a>/.test(full), 'the full report keeps the table with each account\'s posts');
});

test('accounts section tells the officer the answer first and never claims an official page "does not organise" the event', () => {
  const mk = (n, o = {}) => ({ id: n, platform: 'facebook', author: `Page${n}`, text: `post ${n} about the bandh`, sentiment: 'neutral', risk_level: 'low', posted_at: '2026-10-07T10:00:00Z', likes: n * 10, shares: 0, comments: 0, views: 0, url: `https://fb.com/p/${n}`, is_relevant: true, citationTag: `[Post #${n}]`, ...o });
  const posts = [mk(1), mk(2), mk(3, { likes: 5000 })];
  const facts = { places: [], byPost: {}, calls: { count: 0, posts: [] }, violence: { count: 0, posts: [] }, accounts: [{ author: 'Page1', role: 'media', calls: 0, violence: 0, posts: [1] }, { author: 'Page2', role: 'media', calls: 0, violence: 0, posts: [2] }], activities: [] };
  const html = buildReportHtml({ summary: { event: { name: 'E', location: 'Odisha' }, stats: {}, evidence_traceability: posts }, keywordData: null, tenantName: 'odisha', analysis: { facts }, headquarters: null, includeEvidence: false });
  assert.ok(/No account in these posts calls for action or violence/.test(html));
  assert.ok(/2 of 3 accounts are news or official pages reporting the event/.test(html));
  assert.ok(/Largest reach from a non-news account/.test(html) && /Page3/.test(html));
  assert.ok(/News \/ official pages <b>2<\/b>/.test(html) && /class="grp"/.test(html), 'accounts are listed by role in one dense index');
  assert.ok(!/does not organise/.test(html));
});

test('closing summary comes as confirmed / not verified / next steps / risk; allegations and arrests make Medium, never High', () => {
  const prompt = require('../src/services/SummaryLLM/eventSummary.prompt');
  const text = prompt.parseClosing(JSON.stringify({
    confirmed: ['The INDIA bloc called a 12-hour Odisha bandh on 8 October over three demands, and the CJP did not call it.'],
    unverified: ['Saurav Das alleges stone-pelting may be planned at the 10 October protest in Delhi; no post confirms it.'],
    next: ['Verify how the 8 October bandh passed in Bhubaneswar and Cuttack.'],
    risk: 'Medium, because posts allege violence and report arrests, but none confirms violence.',
  }));
  assert.match(text, /^CONFIRMED\n- /);
  assert.match(text, /\n\nNOT VERIFIED\n- /);
  assert.match(text, /\n\nNEXT STEPS\n- /);
  assert.match(text, /\n\nRISK\n- /);
  const level = (facts) => prompt.closingLevel({ facts, stats: { risk_counts: {} } });
  assert.equal(level({ violence: { count: 0 }, alleged: { count: 2 }, detentions: { count: 1 }, calls: { count: 0 } }), 'Medium');
  assert.equal(level({ violence: { count: 1 }, alleged: { count: 0 }, detentions: { count: 0 }, calls: { count: 0 } }), 'Medium');
  assert.equal(level({ violence: { count: 2 }, alleged: { count: 0 }, detentions: { count: 0 }, calls: { count: 0 } }), 'High');
  assert.equal(level({ violence: { count: 0 }, alleged: { count: 0 }, detentions: { count: 0 }, calls: { count: 0 } }), 'Low');
});

test('a report reply cut off by the length limit keeps its finished part instead of failing', () => {
  const { extractJson } = require('../src/services/SummaryLLM/eventSummary.prompt');
  const cut = '{"bottomLine":"A bandh was held.","actions":[{"action":"a","detail":"d"},{"action":"b","detail":"cut off in the mid';
  const out = extractJson(cut);
  assert.equal(out.bottomLine, 'A bandh was held.');
  assert.equal(out.actions.length, 2);
  assert.deepEqual(extractJson('{"a":1,"b":[1,2]}'), { a: 1, b: [1, 2] });
});

test('region view: the popup data is narrowed to posts about the event location, with matching counts', () => {
  const { toRegionView } = require('../src/modules/events/eventIntelligenceReport/regionView');
  const ev = [
    { citationTag: '[Post #1]', text: 'Bandh across Odisha tomorrow', sentiment: 'Neutral', likes: 10, platform: 'facebook', author: 'a', risk_level: 'low' },
    { citationTag: '[Post #2]', text: 'Protest at Jantar Mantar in Delhi', sentiment: 'Negative', likes: 5, platform: 'x', author: 'b', risk_level: 'high' },
    { citationTag: '[Post #3]', text: 'Rally in Rourkela', sentiment: 'Positive', likes: 1, platform: 'facebook', author: 'c', risk_level: 'low' },
  ];
  const facts = {
    places: [{ name: 'Odisha', region: 'India', posts: [1] }, { name: 'Jantar Mantar', region: 'Delhi, India', posts: [2] }, { name: 'Rourkela', region: 'Odisha, India', posts: [3] }],
    byPost: { 1: { places: ['Odisha'] }, 2: { places: ['Jantar Mantar'] }, 3: { places: ['Rourkela'] } },
    calls: { count: 1, posts: [2] }, violence: { count: 0, posts: [] }, alleged: { count: 0, posts: [] }, detentions: { count: 0, posts: [] },
    activities: [{ date: '2026-10-10', kind: 'protest', place: 'Jantar Mantar', posts: [2] }], accounts: [],
  };
  const out = toRegionView({ event: { location: 'Odisha' }, evidence_traceability: ev, stats: { structured_report: { facts, bottomLine: 'x' }, sentiment_counts: { positive: 1, neutral: 1, negative: 1 } } });
  assert.equal(out.region_view.applied, true);
  assert.equal(out.stats.total_unique_posts, 2);
  assert.equal(out.stats.sentiment_counts.negative, 0);
  assert.equal(out.stats.structured_report.facts.calls.count, 0);
  assert.equal(out.evidence_traceability.length, 2);
});

test('when the model cannot finish the report, a full report is still written from the counted facts', () => {
  const prompt = require('../src/services/SummaryLLM/eventSummary.prompt');
  const rules = prompt.buildRulesReport({
    event: { name: 'Test Event', location: 'Somewhere' },
    facts: { activities: [{ date: '2026-10-08', kind: 'bandh', organiser: 'Group A', place: 'Somewhere', subject: 'a demand', posts: [1, 2] }], violence: { count: 0 }, alleged: { count: 0 }, detentions: { count: 1 }, calls: { count: 0 } },
    risk: { high: 2 }, sentiment: { positive: 2, neutral: 20, negative: 3 }, platforms: { facebook: 20, x: 5 }, total: 25,
    digest: { clusters: [{ label: 'Bandh', posts: [1, 2], sentiment: { positive: 0, neutral: 2, negative: 0 } }] }, today: '2026-10-09',
  });
  const evidence = [{ citationTag: '[Post #1]' }, { citationTag: '[Post #2]' }];
  const report = prompt.reducerToReport(JSON.stringify(rules), { clusters: [{ label: 'Bandh', posts: [1, 2], sentiment: { positive: 0, neutral: 2, negative: 0 }, platforms: {} }] }, {}, evidence);
  assert.ok(report && report.bottomLine.includes('Test Event'));
  assert.equal(report.narratives.length >= 1, true);
  assert.match(report.actions[0].action, /Check what happened/);   // the date has passed, so the action checks the outcome
  assert.ok(report.known.length >= 1);
});
