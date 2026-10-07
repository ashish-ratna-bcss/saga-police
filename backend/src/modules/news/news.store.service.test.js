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
