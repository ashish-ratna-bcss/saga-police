/**
 * Quality + curation checks for Suggest Keywords & Hashtags enhancements.
 * Run: node tests/eventHashtag.quality.test.js
 */
const assert = require('assert');
const {
  isSentenceFragment,
  isRawDescriptionSlice,
  isWeakSearchTerm,
  deriveEntityTerms,
  qualityScore,
  eventTextWords,
} = require('../src/services/eventHashtag/eventHashtag.quality');
const { curateEventTerms } = require('../src/services/eventHashtag/eventHashtag.curator');
const { applyLanguageChoice } = require('../src/services/eventHashtag/eventHashtag.client');

const event = {
  event: 'JPSC & JSSC Recruitment Exam Controversies',
  location: 'Jharkhand',
  description:
    'jharkhand has been rocked by allegations of paper leaks and large-scale irregularities in recruitment exams conducted by JPSC and JSSC, especially the JSSC-CGL and 14th JPSC civil services exams.',
};

const ev = eventTextWords({
  name: event.event,
  location: event.location,
  description: event.description,
});

assert.strictEqual(isSentenceFragment('rocked by allegations of paper'), true);
assert.strictEqual(isSentenceFragment('paper leaks and large'), true);
assert.strictEqual(isSentenceFragment('allegations of paper leaks'), true);
assert.strictEqual(isSentenceFragment('JPSC paper leak'), false);
assert.strictEqual(isSentenceFragment('#JPSCJharkhand'), false);
assert.strictEqual(isRawDescriptionSlice('rocked by allegations of paper', ev), true);

assert.strictEqual(isWeakSearchTerm('nisha bhagat case details'), true);
assert.strictEqual(isWeakSearchTerm('nisha bhagat incident'), true);
assert.strictEqual(isWeakSearchTerm('nisha bhagat death news'), true);
assert.strictEqual(isWeakSearchTerm('nisha bhagat case update'), true);
assert.strictEqual(isWeakSearchTerm('#निशाकुमारीभगतलगभग38वर्ष'), true);
assert.strictEqual(isWeakSearchTerm('nisha bhagat suicide'), false);
assert.strictEqual(isWeakSearchTerm('nisha bhagat pithoria ranchi'), false);
assert.strictEqual(isWeakSearchTerm('#NishaBhagatDeathCase'), false);

const derived = deriveEntityTerms(event);
assert.ok(derived.keywords.some((k) => /jpsc/i.test(k.term)));
assert.ok(derived.hashtags.some((h) => /#JPSC/i.test(h.term)));
assert.ok(
  qualityScore('JPSC paper leak', ev, new Set(), 'derived') >
    qualityScore('rocked by allegations of paper', ev, new Set(), 'web')
);

(async () => {
  const raw = {
    hashtags: [
      '#जेपीएससीऔरजेएसएससीभर्ती',
      '#झारखंड',
      '#JPSC',
      '#JPSCJharkhand',
      '#JSSC',
      '#JSSCJharkhand',
      '#Jharkhand',
    ],
    keywords: [
      'जेपीएससी और जेएसएससी भर्ती परीक्षा विवाद',
      'झारखंड',
      'rocked by allegations of paper',
      'allegations of paper leaks',
      'paper leaks and large',
      'jpsc & jssc recruitment exam controversies jharkhand',
    ],
  };

  // Skip LLM in this unit test
  process.env.EVENT_TERMS_LLM_RERANK = 'false';

  const curated = await curateEventTerms(null, event, raw, {
    acceptOtherScripts: true,
    includeSocial: true,
  });

  assert.ok(!curated.keywords.some((k) => /rocked by allegations/i.test(k)));
  assert.ok(!curated.keywords.some((k) => /paper leaks and large/i.test(k)));
  assert.ok(curated.hashtags.some((h) => /#JPSC/i.test(h)));
  assert.ok(curated.items.keywords.every((i) => i.source && i.term));
  assert.ok(curated.meta.sources_used.length >= 1);

  const filtered = applyLanguageChoice(curated, { wantEnglish: true, onlyEnglish: false, codes: ['hi'] });
  assert.ok(Array.isArray(filtered.hashtags));
  assert.ok(filtered.items);

  console.log('OK eventHashtag.quality.test.js');
  console.log(
    JSON.stringify(
      {
        keywords: curated.keywords.slice(0, 12),
        hashtags: curated.hashtags.slice(0, 12),
        sources: curated.meta.sources_used,
      },
      null,
      2
    )
  );
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
