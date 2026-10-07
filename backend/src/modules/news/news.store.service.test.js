/**
 * Integration test for per-tenant news storage against a real Postgres.
 * Needs two empty, disposable databases (it creates tables in them):
 *
 *   NEWS_TEST_TENANT_A_URL=postgresql://postgres@localhost:55432/tenant_a \
 *   NEWS_TEST_TENANT_B_URL=postgresql://postgres@localhost:55432/tenant_b \
 *   node src/modules/news/news.store.service.test.js
 */
const assert = require('assert');
const { createTenantPrisma } = require('../../../prisma/tenantClient');
const store = require('./news.store.service');

const article = (id, extra = {}) => ({
  id,
  title: `Title ${id}`,
  summary: `Summary ${id}`,
  content: `Body of ${id} about narcotics`,
  source: 'Eenadu',
  source_id: 'eenadu',
  source_url: `https://www.eenadu.net/${id}`,
  language: 'Telugu',
  country: 'India',
  state: 'Andhra Pradesh & Telangana',
  district: 'Hyderabad',
  location: 'Hyderabad',
  image_url: '',
  published_at: '2026-10-06T08:30:00Z',
  ...extra,
});

async function runTests() {
  const urlA = process.env.NEWS_TEST_TENANT_A_URL;
  const urlB = process.env.NEWS_TEST_TENANT_B_URL;
  if (!urlA || !urlB) {
    console.log('Skipping: set NEWS_TEST_TENANT_A_URL and NEWS_TEST_TENANT_B_URL to disposable databases.');
    return;
  }
  const tenantA = createTenantPrisma(urlA);
  const tenantB = createTenantPrisma(urlB);
  const asha = { id: 7, name: 'Asha' };
  const ravi = { id: 8, name: 'Ravi' };
  const list = (q = {}) => store.listArticles(tenantA, q);

  try {
    for (const t of [tenantA, tenantB]) {
      await t.$executeRawUnsafe('DROP TABLE IF EXISTS news_search_articles, news_searches, news_articles');
    }

    console.log('Testing a live fetch is saved and reports what was new...');
    const first = await store.saveCollected(tenantA, {
      user: asha,
      query: { state: 'Telangana', keyword: '' },
      articles: [article('a1'), article('a2'), article('a1')],
      liveCount: 3,
    });
    assert.match(first.search_id, /^\d+$/);
    assert.deepStrictEqual([first.fetched, first.new], [2, 2], 'duplicate ids in one fetch saved once');
    const again = await store.saveCollected(tenantA, {
      user: asha,
      query: { state: 'Telangana', search_id: first.search_id },
      articles: [article('a2'), article('a3', { published_at: '2026-09-01T00:00:00Z' })],
      liveCount: 4,
    });
    assert.strictEqual(again.search_id, first.search_id, 'known search_id updates that history row');
    assert.deepStrictEqual([again.fetched, again.new], [2, 1], 'only a3 is new');
    const newOnes = (await store.listArticles(tenantA, {})).articles
      .filter((a) => a.first_seen_at.getTime() >= again.collected_at.getTime()).map((a) => a.id);
    assert.deepStrictEqual(newOnes, ['a3'], 'collected_at marks exactly the articles that fetch added');
    console.log('✅ saved; new count correct; search_id reused.');

    console.log('Testing search history...');
    let searches = await store.listSearches(tenantA, {}, asha);
    assert.strictEqual(searches.count, 1);
    const [s] = searches.items;
    assert.deepStrictEqual(s.filters, { state: 'Telangana' }, 'blank and paging params are not stored');
    assert.strictEqual(s.result_count, 4, 'a re-fetch raises the live total');
    assert.strictEqual(s.user_name, 'Asha');
    assert.strictEqual(s.mine, true);
    assert.strictEqual(s.stored_count, undefined, 'no per-search article links any more');
    assert.strictEqual((await store.listSearches(tenantA, {}, ravi)).items[0].mine, false);
    JSON.stringify(searches); // BIGSERIAL ids must not leak out as BigInt
    console.log('✅ history correct.');

    console.log('Testing a thinner re-scrape keeps stored text and counts the sighting...');
    await store.saveCollected(tenantA, { user: ravi, query: { language: 'Telugu' }, articles: [article('a1', { content: '', title: 'Updated title' })], liveCount: 1 });
    const a1 = await store.getSavedArticle(tenantA, 'a1');
    assert.strictEqual(a1.content, 'Body of a1 about narcotics');
    assert.strictEqual(a1.title, 'Updated title');
    assert.strictEqual(a1.seen_count, 2);
    console.log('✅ upsert merges correctly.');

    console.log('Testing DB filters, dates and paging (what the page shows)...');
    assert.strictEqual((await list()).count, 3);
    assert.strictEqual((await list({ state: 'telangana' })).count, 3, 'substring + case-insensitive');
    assert.strictEqual((await list({ source: 'eenadu' })).count, 3);
    assert.strictEqual((await list({ source: 'bbc_news,eenadu' })).count, 3, 'OR within a filter');
    assert.strictEqual((await list({ language: 'English' })).count, 0);
    assert.strictEqual((await list({ keyword: 'narcotics' })).count, 3, 'keyword searches body text');
    assert.strictEqual((await list({ from: '2026-10-01' })).count, 2);
    assert.strictEqual((await list({ to: '2026-09-01' })).count, 1, 'date-only "to" covers the whole day');
    const paged = await list({ limit: 1, offset: 1 });
    assert.strictEqual(paged.articles.length, 1);
    assert.strictEqual(paged.count, 3);
    assert.strictEqual(paged.articles[0].content, undefined, 'list omits full text');
    assert.strictEqual(paged.articles[0].word_count, 5, 'but reports its word count');
    assert.ok(paged.articles[0].first_seen_at instanceof Date, 'first_seen_at drives the "New" tag');
    assert.strictEqual((await list({ offset: 10 })).count, 3, 'past the last page the total is still reported');
    console.log('✅ filters, dates and paging work.');

    console.log('Testing tenant isolation...');
    assert.strictEqual((await store.listArticles(tenantB, {})).count, 0);
    assert.strictEqual((await store.listSearches(tenantB, {}, asha)).count, 0);
    assert.strictEqual(await store.getSavedArticle(tenantB, 'a1'), null);
    console.log('✅ tenant B sees nothing from tenant A.');

    console.log('Testing delete: owner only, articles kept...');
    await assert.rejects(store.deleteSearch(tenantA, first.search_id, ravi), { status: 403 });
    await store.deleteSearch(tenantA, first.search_id, asha);
    searches = await store.listSearches(tenantA, {}, asha);
    assert.strictEqual(searches.count, 1, 'only the Ravi search remains');
    assert.strictEqual((await list()).count, 3, 'articles stay saved');
    console.log('✅ delete enforced and articles kept.');

    console.log('Testing a keyword is matched as a whole phrase from the DB...');
    const kw = 'CJP School Thik Karo';
    await store.saveCollected(tenantA, {
      user: asha,
      query: { keyword: kw },
      articles: [
        article('k_one', { title: 'New school building opened', content: 'Classes begin.', published_at: '2026-10-06T12:00:00Z' }),
        article('k_all', { title: 'CJP school thik karo campaign', content: 'Workers asked to thik karo.', published_at: '2026-10-01T00:00:00Z' }),
        article('k_body', { title: 'Campaign launched', content: "The CJP 'School-Thik Karo' team met.", published_at: '2026-10-05T00:00:00Z' }),
        article('k_two', { title: 'Leaders visit', content: 'CJP leaders at a school.', published_at: '2026-10-03T00:00:00Z' }),
        article('k_skill', { title: "Bowler's skill praised", content: 'Cricket.', published_at: '2026-10-06T00:00:00Z' }),
      ],
      liveCount: 5,
    });
    const byKw = await list({ keyword: kw });
    assert.deepStrictEqual(byKw.query_phrases, ['cjp school thik karo']);
    assert.deepStrictEqual(byKw.articles.map((a) => a.id), ['k_all', 'k_body'],
      'only the whole phrase matches (title hit first; punctuation between words ignored); "school" alone does not');
    assert.deepStrictEqual(byKw.articles[0].matched_phrases, ['cjp school thik karo']);
    assert.deepStrictEqual(byKw.articles[0].matched_terms, ['cjp', 'school', 'thik', 'karo']);
    assert.ok(byKw.articles[0].match_score > byKw.articles[1].match_score);
    assert.strictEqual((await list({ keyword: 'kill' })).count, 0, "'kill' must not match 'skill'");
    assert.deepStrictEqual((await list({ keyword: 'leaders visit, school building' })).articles.map((a) => a.id), ['k_one', 'k_two']);
    const stored = (await store.listSearches(tenantA, {}, asha)).items.find((x) => x.filters.keyword === kw);
    assert.ok(stored, 'keyword stored as typed');
    console.log('✅ whole-phrase keywords match the live API rules.');

    console.log('Testing keyword lists and min_match from the DB...');
    const kwList = 'textbook errors, NYCS, Sourav Das, cockroach janata party, education minister resignation, odisha government, initiated';
    await store.saveCollected(tenantA, {
      user: asha,
      query: { keyword: kwList, min_match: '2' },
      articles: [
        article('l_story', {
          title: 'Cockroach Janata Party backs NYCS over textbook errors',
          summary: 'Students demand the education minister resignation.',
          content: 'Co-convenor Sourav Das said errors in the textbook must be fixed.',
          published_at: '2026-09-21T10:00:00Z',
        }),
        article('l_generic', { title: 'Odisha government routes', summary: '', content: 'New routes initiated today.', published_at: '2026-10-06T10:00:00Z' }),
        article('l_partial', { title: 'Textbook prices rise', summary: '', content: 'Only the word textbook.', published_at: '2026-10-07T10:00:00Z' }),
      ],
      liveCount: 3,
    });
    const listed = await list({ keyword: kwList });
    assert.deepStrictEqual(listed.query_phrases,
      ['textbook errors', 'nycs', 'sourav das', 'cockroach janata party', 'education minister resignation', 'odisha government', 'initiated']);
    assert.deepStrictEqual(listed.articles.map((a) => a.id), ['l_story', 'l_generic'],
      'story (5 phrases) above the generic article (2) despite being older; "textbook" alone matches no phrase');
    assert.deepStrictEqual(listed.articles[0].matched_phrases,
      ['textbook errors', 'nycs', 'sourav das', 'cockroach janata party', 'education minister resignation']);
    assert.ok(!Object.keys(listed.articles[0]).some((k) => /^k[thrp]\d*$/.test(k)), 'internal flag columns are not returned');
    const strict = await list({ keyword: kwList, min_match: '3' });
    assert.deepStrictEqual(strict.articles.map((a) => a.id), ['l_story']);
    assert.strictEqual(strict.count, 1, 'count respects min_match too');
    const storedList = (await store.listSearches(tenantA, {}, asha)).items.find((x) => x.filters.keyword === kwList);
    assert.deepStrictEqual(storedList.filters, { keyword: kwList, min_match: '2' }, 'list and min_match stored as typed');
    console.log('✅ keyword lists rank by phrases matched; min_match filters.');

    console.log('Testing accounts without a tenant DB are refused...');
    await assert.rejects(store.listArticles(null, {}), { code: 'NO_TENANT_DB' });
    await assert.rejects(store.saveCollected(null, { articles: [] }), { code: 'NO_TENANT_DB' });
    console.log('✅ no fallback to a shared DB.');

    console.log('\nAll news store tests passed.');
  } finally {
    await tenantA.$disconnect();
    await tenantB.$disconnect();
  }
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
