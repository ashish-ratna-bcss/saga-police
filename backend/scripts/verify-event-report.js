/**
 * Renders real PDFs of the event report for several tenants, languages and sizes, and checks the basics:
 * the tenant's own name and timezone, Odia and Hindi text, the evidence anchors, the draft mark, a large event.
 * It uses synthetic posts, needs no database or model, and writes the PDFs to a temporary folder.
 *
 * Usage: node scripts/verify-event-report.js            (400-post event)
 *        node scripts/verify-event-report.js 800        (another size)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildReportHtml } = require('../src/modules/events/eventIntelligenceReport/template');
const { resolveHeadquarters } = require('../src/modules/events/eventIntelligenceReport/headquarters');
const { renderHtmlToPdf } = require('../src/modules/events/eventIntelligenceReport/render');
const { runQualityChecks } = require('../src/modules/events/eventIntelligenceReport/quality');
const { classifyEvidence } = require('../src/modules/events/eventIntelligenceReport/scope');

const N = Math.max(10, Number(process.argv[2] || 400));
const OUT = path.join(os.tmpdir(), 'event-report-verify');
fs.mkdirSync(OUT, { recursive: true });

const TEXTS = [
  'INDIA bloc has called a 12-hour statewide bandh tomorrow from 6 AM to 6 PM #bandh',
  'ओडिशा बंद कल सुबह 6 बजे से शाम 6 बजे तक, जानिए क्या खुला रहेगा',
  'ଓଡ଼ିଶା ବନ୍ଦ ଆସନ୍ତାକାଲି, ବନ୍ଦକୁ ସଫଳ କରିବା ପାଇଁ ବିରୋଧୀଙ୍କ ଜୋରଦାର ପ୍ରସ୍ତୁତି',
  'Students submitted a memorandum to the Education Minister in Bhubaneswar',
  'Rally planned at Jantar Mantar in Delhi on 10 October by a national youth movement',
];
const PLACES = [['Bhubaneswar'], ['Rourkela'], ['Cuttack'], ['Delhi'], []];

const makeEvent = (n) => {
  const evidence = Array.from({ length: n }, (_, i) => ({
    citationTag: `[Post #${i + 1}]`, id: String(i + 1), platform: ['facebook', 'x', 'youtube', 'reddit'][i % 4], author: `account_${i % 37}`,
    text: `${TEXTS[i % TEXTS.length]} ${'more detail '.repeat(i % 7)}`, sentiment: ['neutral', 'neutral', 'positive', 'negative'][i % 4],
    target_entity: ['Government', 'Police', 'Political leader', 'Other'][i % 4], risk_level: i % 60 === 0 ? 'high' : 'low', url: `https://example.org/p/${i + 1}`,
    posted_at: new Date(Date.UTC(2026, 9, 1 + (i % 8), (i * 7) % 24, (i * 13) % 60)).toISOString(), likes: (i * 11) % 500, shares: i % 9, comments: i % 14, views: 0,
  }));
  const byPost = {}; evidence.forEach((e, i) => { byPost[i + 1] = { places: PLACES[i % PLACES.length] }; });
  const analysis = {
    bottomLine: 'A statewide bandh is called for tomorrow. [Post #1] Student groups separately ask the Minister to resign. [Post #4]',
    issueStrands: [{ title: 'Statewide bandh', who: 'INDIA bloc', demand: 'Repeal of a law and the CEC to resign', status: 'Called for tomorrow', posts: [1] }, { title: 'Minister resignation', who: 'Student groups', demand: 'The Education Minister to resign', status: 'Small protests', posts: [4] }],
    issueLink: 'Both ask the Chief Election Commissioner to resign.',
    known: [{ text: 'The bandh runs from 6 AM to 6 PM.', posts: [1] }], notKnown: ['How many people will take part.'],
    actions: [{ action: 'Watch roads and markets in Bhubaneswar: Traffic Police', detail: 'Report hourly from the main junctions. Escalate if a road is blocked for more than an hour.', posts: [1] }],
    narrativesToWatch: [{ narrative: 'Claim about a new law', riskNote: 'Verify with the department.', posts: [1] }],
    facts: { places: [{ name: 'Bhubaneswar', region: 'Odisha, India', mentioned: 10, active: 3, posts: [1] }, { name: 'Rourkela', region: 'Odisha, India', mentioned: 5, active: 1, posts: [2] }, { name: 'Cuttack', region: 'Odisha, India', mentioned: 5, active: 0, posts: [3] }, { name: 'Delhi', region: 'Delhi, India', mentioned: 8, active: 2, posts: [5] }], byPost, calls: { count: 3, posts: [1] }, violence: { count: 0, posts: [] }, accounts: [], activities: [] },
  };
  const summary = {
    event: { name: 'Statewide bandh and student demand', location: 'Odisha' }, generated_at: '2026-10-08T09:00:00Z',
    stats: { total_unique_posts: n * 3, relevant_posts_count: n, timeframe_label: 'Weekly Report (01/10/2026 – 08/10/2026)', platform_counts: { facebook: n, x: n, youtube: n }, sentiment_counts: { positive: n, neutral: n, negative: n }, risk_counts: { critical: 0, high: 5, medium: 10, low: n }, total_engagement: { likes: n * 100 } },
    evidence_traceability: evidence,
  };
  return { summary, analysis };
};

const TENANTS = [
  { name: 'odisha', hq: resolveHeadquarters('odisha'), labels: null, tz: 'Asia/Kolkata', expect: 'ODISHA POLICE' },
  { name: 'delhi', hq: resolveHeadquarters('delhi'), labels: null, tz: 'Asia/Kolkata', expect: 'DELHI POLICE' },
  { name: 'goa_test', hq: resolveHeadquarters('goa_test', { force: 'Goa Police', display_name: 'GOA POLICE', head: 'Director General of Police', headquarters: 'Panaji', timezone: 'Asia/Kolkata', classification: 'RESTRICTED', signoff: 'Analyst, SP, DIG' }), labels: null, tz: 'Asia/Kolkata', expect: 'GOA POLICE' },
  { name: 'hindi_tenant', hq: resolveHeadquarters('hindi_tenant', { force: 'राज्य पुलिस', display_name: 'राज्य पुलिस', head: 'पुलिस महानिदेशक', headquarters: 'मुख्यालय' }), labels: { 'What the Issue Is': 'मुद्दा क्या है', 'Evidence Annex': 'प्रमाण संलग्नक', 'What we know': 'हम क्या जानते हैं', 'Posts in {region}': '{region} में पोस्ट' }, tz: 'Asia/Kolkata', expect: 'राज्य पुलिस' },
];

const pagesIn = (buf) => (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

(async () => {
  const { summary, analysis } = makeEvent(N);
  const ev = summary.evidence_traceability.map((e, i) => ({ n: i + 1 }));
  const q = runQualityChecks({ summary, analysis, ev, scope: classifyEvidence(ev, analysis, summary.event) });
  console.log(`Event of ${N} posts. Quality check: ${q.ok ? 'ok' : 'errors'}, ${q.issues.length} note(s)${q.issues.length ? `: ${q.issues.map((i) => i.code).join(', ')}` : ''}`);
  let failed = 0;
  const check = (label, ok, extra = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ` (${extra})` : ''}`); if (!ok) failed += 1; };
  for (const t of TENANTS) {
    const review = t.name === 'odisha' ? { status: 'approved', version: 2, approvedBy: 'SP Rao', approvedAt: '2026-10-08T10:00:00Z', preparedBy: 'Analyst' } : { status: 'draft', version: 1, preparedBy: 'Analyst' };
    const html = buildReportHtml({ summary, keywordData: null, tenantName: t.name, analysis, headquarters: t.hq, includeEvidence: true, labels: t.labels, review, quality: q });
    const t0 = Date.now();
    const pdf = await renderHtmlToPdf(html, { footerLabel: `${t.expect} · verify` });
    const ms = Date.now() - t0;
    const file = path.join(OUT, `${t.name}.pdf`);
    fs.writeFileSync(file, pdf);
    console.log(`${t.name}: ${pagesIn(pdf)} pages, ${(pdf.length / 1024).toFixed(0)} KB, ${ms} ms -> ${file}`);
    check('own force name', html.includes(t.expect));
    check('every post has an anchor', (html.match(/<tr id="e\d+">/g) || []).length === N);
    check('approved/draft marking', t.name === 'odisha' ? /APPROVED/.test(html) && !/class="wm"/.test(html) : /class="wm">DRAFT/.test(html));
    check('Odia and Hindi fonts included', /Report Oriya/.test(html) && /Report Devanagari/.test(html));
    check('PDF rendered', pdf.length > 10000 && pagesIn(pdf) > 1, `${ms} ms`);
    if (t.labels) check('translated labels used', /प्रमाण संलग्नक/.test(html) && /Odisha में पोस्ट/.test(html));
  }
  console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
