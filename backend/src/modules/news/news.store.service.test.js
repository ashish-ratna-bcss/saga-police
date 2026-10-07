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

  try {
    for (const t of [tenantA, tenantB]) {
      await t.$executeRawUnsafe('DROP TABLE IF EXISTS news_search_articles, news_searches, news_articles');
    }

    console.log('Testing first page creates a search and stores its articles...');
    const page1 = await store.recordSearchPage(tenantA, {
      user: asha,
      query: { state: 'Telangana', keyword: '', limit: '2', offset: '0' },
      data: { count: 3, limit: 2, offset: 0, articles: [article('a1'), article('a2')] },
    });
    assert.match(page1.search_id, /^\d+$/);
    assert.strictEqual(page1.stored, 2);
    console.log('✅ search + 2 articles stored.');

    console.log('Testing next page joins the same search...');
    const page2 = await store.recordSearchPage(tenantA, {
      user: asha,
      query: { state: 'Telangana', limit: '2', offset: '2', search_id: page1.search_id },
      data: { count: 3, limit: 2, offset: 2, articles: [article('a3', { published_at: '2026-09-01T00:00:00Z' })] },
    });
    assert.strictEqual(page2.search_id, page1.search_id);
    const resized = await store.recordSearchPage(tenantA, {
      user: asha,
      query: { state: 'Telangana', limit: '50', offset: '0', search_id: page1.search_id },
      data: { count: 3, limit: 50, offset: 0, articles: [article('a1'), article('a2')] },
    });
    assert.strictEqual(resized.search_id, page1.search_id, 'page-size change is the same search');
    await store.recordSearchPage(tenantA, {
      user: asha,
      query: { state: 'Telangana', offset: '0', search_id: page1.search_id },
      data: { count: 2, offset: 0, articles: [] },
    });
    const kept = (await store.listSearches(tenantA, {}, asha)).items.find((x) => x.id === page1.search_id);
    assert.strictEqual(kept.result_count, 3, 're-run keeps the larger total, never shrinks it');
    const bogus = await store.recordSearchPage(tenantA, {
      user: asha,
      query: { state: 'Telangana', search_id: '999999' },
      data: { count: 0, offset: 0, articles: [] },
    });
    assert.notStrictEqual(bogus.search_id, page1.search_id, 'unknown search_id starts a new search');
    await store.deleteSearch(tenantA, bogus.search_id, asha);
    console.log('✅ page 2 and page-size change linked to the same search.');

    console.log('Testing search history (tenant-wide, with owner flag)...');
    let searches = await store.listSearches(tenantA, {}, asha);
    assert.strictEqual(searches.count, 1);
    const [s] = searches.items;
    assert.deepStrictEqual(s.filters, { state: 'Telangana' }, 'blank and paging params are not stored as filters');
    assert.strictEqual(s.result_count, 3);
    assert.strictEqual(s.stored_count, 3);
    assert.strictEqual(s.user_name, 'Asha');
    assert.strictEqual(s.mine, true);
    assert.strictEqual((await store.listSearches(tenantA, {}, ravi)).items[0].mine, false);
    JSON.stringify(searches); // BIGSERIAL ids must not leak out as BigInt
    await store.recordSearchPage(tenantA, {
      user: asha,
      query: { state: 'Telangana', offset: '0', search_id: page1.search_id },
      data: { count: 4, offset: 0, articles: [] },
    });
    const raised = (await store.listSearches(tenantA, {}, asha)).items.find((x) => x.id === page1.search_id);
    assert.strictEqual(raised.result_count, 4, '"load the rest" raises the total when late sources add matches');
    console.log('✅ history correct.');

    console.log('Testing a stored search reopens in original order...');
    const reopened = await store.listSearchArticles(tenantA, page1.search_id, { limit: 10 });
    assert.deepStrictEqual(reopened.articles.map((a) => a.id), ['a1', 'a2', 'a3']);
    assert.strictEqual(reopened.count, 3);
    JSON.stringify(reopened);
    console.log('✅ reopened in order.');

    console.log('Testing a thinner re-scrape keeps stored text and counts the sighting...');
    await store.recordSearchPage(tenantA, {
      user: ravi,
      query: { language: 'Telugu' },
      data: { count: 1, offset: 0, articles: [article('a1', { content: '', title: 'Updated title' })] },
    });
    const a1 = await store.getSavedArticle(tenantA, 'a1');
    assert.strictEqual(a1.content, 'Body of a1 about narcotics');
    assert.strictEqual(a1.title, 'Updated title');
    assert.strictEqual(a1.seen_count, 3, 'seen on page 1, the page-size change, and this re-scrape');
    console.log('✅ upsert merges correctly.');

    console.log('Testing saved-article filters mirror the live API...');
    const saved = (q) => store.listSavedArticles(tenantA, q);
    assert.strictEqual((await saved({})).count, 3);
    assert.strictEqual((await saved({ state: 'telangana' })).count, 3, 'substring + case-insensitive');
    assert.strictEqual((await saved({ source: 'eenadu' })).count, 3);
    assert.strictEqual((await saved({ source: 'bbc_news,eenadu' })).count, 3, 'OR within a filter');
    assert.strictEqual((await saved({ language: 'English' })).count, 0);
    assert.strictEqual((await saved({ keyword: 'narcotics' })).count, 3, 'keyword searches body text');
    assert.strictEqual((await saved({ from: '2026-10-01' })).count, 2);
    assert.strictEqual((await saved({ to: '2026-09-01' })).count, 1, 'date-only "to" covers the whole day');
    const paged = await saved({ limit: 1, offset: 1 });
    assert.strictEqual(paged.articles.length, 1);
    assert.strictEqual(paged.articles[0].content, undefined, 'list omits full text');
    assert.strictEqual(paged.articles[0].word_count, 5, 'but reports its word count ("Body of aN about narcotics")');
    console.log('✅ filters, dates and paging work.');

    console.log('Testing tenant isolation...');
    assert.strictEqual((await store.listSavedArticles(tenantB, {})).count, 0);
    assert.strictEqual((await store.listSearches(tenantB, {}, asha)).count, 0);
    assert.strictEqual(await store.getSavedArticle(tenantB, 'a1'), null);
    await assert.rejects(store.listSearchArticles(tenantB, page1.search_id), { status: 404 });
    console.log('✅ tenant B sees nothing from tenant A.');

    console.log('Testing delete: owner only, articles kept...');
    await assert.rejects(store.deleteSearch(tenantA, page1.search_id, ravi), { status: 403 });
    await store.deleteSearch(tenantA, page1.search_id, asha);
    searches = await store.listSearches(tenantA, {}, asha);
    assert.strictEqual(searches.count, 1, 'only the Ravi search remains');
    assert.strictEqual((await store.listSavedArticles(tenantA, {})).count, 3);
    console.log('✅ delete enforced and archive kept.');

    console.log('Testing multi-word keyword ranking on saved articles...');
    const kw = 'CJP School Thik Karo';
    const ranked = await store.recordSearchPage(tenantA, {
      user: asha,
      query: { keyword: kw },
      data: {
        count: 5,
        offset: 0,
        articles: [
          article('k_one', { title: 'New school building opened', content: 'Classes begin.', published_at: '2026-10-06T12:00:00Z' }),
          article('k_all', { title: 'CJP school thik karo campaign', content: 'Workers asked to thik karo.', published_at: '2026-10-01T00:00:00Z' }),
          article('k_two', { title: 'Leaders visit', content: 'CJP leaders at a school.', published_at: '2026-10-03T00:00:00Z' }),
          article('k_skill', { title: "Bowler's skill praised", content: 'Cricket.', published_at: '2026-10-06T00:00:00Z' }),
        ],
      },
    });
    const byKw = await store.listSavedArticles(tenantA, { keyword: kw });
    assert.deepStrictEqual(byKw.query_terms, ['cjp', 'school', 'thik', 'karo']);
    assert.deepStrictEqual(byKw.articles.map((a) => a.id), ['k_all', 'k_two', 'k_one'],
      'more matched terms first, partial matches still shown, non-matches excluded');
    assert.strictEqual(byKw.count, 3);
    assert.deepStrictEqual(byKw.articles[0].matched_terms, ['cjp', 'school', 'thik', 'karo']);
    assert.deepStrictEqual(byKw.articles[1].matched_terms, ['cjp', 'school']);
    assert.ok(byKw.articles[0].match_score > byKw.articles[1].match_score);
    assert.strictEqual((await store.listSavedArticles(tenantA, { keyword: 'kill' })).count, 0, "'kill' must not match 'skill'");
    assert.deepStrictEqual(
      (await store.listSavedArticles(tenantA, { keyword: '"thik karo"' })).articles.map((a) => a.id), ['k_all'],
      'quoted phrase is required');
    const plain = await store.listSavedArticles(tenantA, {});
    assert.strictEqual(plain.articles[0].match_score, 0, 'no keyword → no score, newest first');
    assert.deepStrictEqual(plain.query_terms, []);
    const reopenedKw = await store.listSearchArticles(tenantA, ranked.search_id, {});
    assert.deepStrictEqual(reopenedKw.articles.map((a) => a.id), ['k_one', 'k_all', 'k_two', 'k_skill'], 'stored order kept');
    assert.deepStrictEqual(reopenedKw.articles[1].matched_terms, ['cjp', 'school', 'thik', 'karo']);
    assert.deepStrictEqual(reopenedKw.articles[3].matched_terms, []);
    const stored = (await store.listSearches(tenantA, {}, asha)).items.find((x) => x.id === ranked.search_id);
    assert.deepStrictEqual(stored.filters, { keyword: kw }, 'keyword stored as typed, not split on commas');
    console.log('✅ keyword ranking, phrases and badges match the live API rules.');

    console.log('Testing keyword lists (comma-separated phrases) and min_match...');
    const list = 'textbook errors, NYCS, Sourav Das, cockroach janata party, education minister resignation, '
      + 'odisha government, initiated';
    const listSearch = await store.recordSearchPage(tenantA, {
      user: asha,
      query: { keyword: list, min_match: '2' },
      data: {
        count: 2,
        offset: 0,
        articles: [
          article('l_story', {
            title: 'Cockroach Janata Party backs NYCS over textbook errors',
            summary: 'Students demand the education minister resignation.',
            content: 'Co-convenor Sourav Das said errors in the textbook must be fixed.',
            published_at: '2026-09-21T10:00:00Z',
          }),
          article('l_generic', {
            title: 'Odisha government routes', summary: '', content: 'New routes initiated today.',
            published_at: '2026-10-06T10:00:00Z',
          }),
          article('l_partial', {
            title: 'Textbook prices rise', summary: '', content: 'Only the word textbook.',
            published_at: '2026-10-07T10:00:00Z',
          }),
        ],
      },
    });
    const listed = await store.listSavedArticles(tenantA, { keyword: list });
    assert.deepStrictEqual(listed.query_phrases,
      ['textbook errors', 'nycs', 'sourav das', 'cockroach janata party', 'education minister resignation', 'odisha government', 'initiated']);
    assert.deepStrictEqual(listed.articles.map((a) => a.id), ['l_story', 'l_generic'],
      'story (5 phrases) above the generic article (2) despite being older; "textbook" alone matches no phrase');
    assert.deepStrictEqual(listed.articles[0].matched_phrases,
      ['textbook errors', 'nycs', 'sourav das', 'cockroach janata party', 'education minister resignation']);
    assert.deepStrictEqual(listed.articles[1].matched_phrases, ['odisha government', 'initiated']);
    assert.ok(listed.articles[0].match_score > listed.articles[1].match_score);
    assert.ok(!Object.keys(listed.articles[0]).some((k) => /^k[thrp]\d*$/.test(k)), 'internal flag columns are stripped');
    const strict = await store.listSavedArticles(tenantA, { keyword: list, min_match: '3' });
    assert.deepStrictEqual(strict.articles.map((a) => a.id), ['l_story']);
    assert.strictEqual(strict.count, 1, 'count respects min_match too');
    const reopenedList = await store.listSearchArticles(tenantA, listSearch.search_id, {});
    assert.deepStrictEqual(reopenedList.query_phrases, listed.query_phrases);
    assert.deepStrictEqual(reopenedList.articles.map((a) => a.id), ['l_story', 'l_generic', 'l_partial'], 'stored order kept');
    assert.strictEqual(reopenedList.articles[0].matched_phrases.length, 5);
    assert.deepStrictEqual(reopenedList.articles[2].matched_phrases, []);
    assert.strictEqual(reopenedList.articles[0].position, undefined, 'position is internal');
    const storedList = (await store.listSearches(tenantA, {}, asha)).items.find((x) => x.id === listSearch.search_id);
    assert.deepStrictEqual(storedList.filters, { keyword: list, min_match: '2' }, 'list and min_match stored as typed');
    console.log('✅ keyword lists rank by phrases matched; min_match filters; badges on reopen.');

    console.log('Testing accounts without a tenant DB are refused...');
    await assert.rejects(store.listSavedArticles(null, {}), { code: 'NO_TENANT_DB' });
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
