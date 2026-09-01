const assert = require('assert');
const {
  resolveFacebookInvestigation,
  pageUrlMatchesTarget,
  postMatchesInvestigation,
  buildPostFromCanonicalSnapshot,
  identityIsCanonical
} = require('./facebookInvestigationService');
const {
  extractPfbidFromText,
  buildCanonicalPfbidUrl
} = require('./facebookCanonicalResolver');

const PFBID = 'pfbid02LnRd8kKFNy4iYMyrkC1bLbVvX12UTQvWx4KWCYGEDnNWbdpSW2bKTT2sio5fyCvRl';
const CANONICAL = `https://www.facebook.com/Sreenivastekumatla/posts/${PFBID}`;
const SHARE_URL = 'https://www.facebook.com/share/p/1EaP2MtgCS/';
const NUMERIC_URL = 'https://www.facebook.com/somepage/posts/123456789012345';
const TELUGU = 'నిజంగా అంబేద్కర్ ను గౌరవించేవాళ్ళు';

const verifiedPost = {
  id: PFBID,
  url: CANONICAL,
  text: TELUGU,
  author: 'Sreenivas Tekumatla',
  author_handle: 'Sreenivastekumatla',
  media: [{ type: 'photo', url: 'https://scontent.xx.fbcdn.net/v/example.jpg' }],
  metrics: { likes: 10 },
  verification_source: 'rapidapi_post'
};

const canonicalResolution = {
  canonicalUrl: CANONICAL,
  pfbid: PFBID,
  numericId: '122121215859044050',
  resolvedVia: 'crawler_ua',
  description: TELUGU,
  author: 'Sreenivas Tekumatla',
  title: 'Sreenivas Tekumatla',
  media: [{ type: 'photo', url: 'https://scontent.xx.fbcdn.net/v/example.jpg' }],
  snapshot: {
    canonicalUrl: CANONICAL,
    pfbid: PFBID,
    description: TELUGU,
    author: 'Sreenivas Tekumatla',
    title: 'Sreenivas Tekumatla',
    media: [{ type: 'photo', url: 'https://scontent.xx.fbcdn.net/v/example.jpg' }]
  }
};

const run = async (name, fn) => {
  await fn();
  console.log(`  ok: ${name}`);
};

const main = async () => {
  await run('identityIsCanonical accepts resolved pfbid URL', async () => {
    assert.strictEqual(identityIsCanonical(CANONICAL, PFBID), true);
    assert.strictEqual(identityIsCanonical(SHARE_URL, PFBID), false);
  });

  await run('buildCanonicalPfbidUrl strips query params', async () => {
    const built = buildCanonicalPfbidUrl(
      `${CANONICAL}/?rdid=abc&share_url=x`,
      PFBID
    );
    assert.strictEqual(built, CANONICAL);
  });

  await run('postMatchesInvestigation accepts exact pfbid match', async () => {
    assert.strictEqual(
      postMatchesInvestigation(verifiedPost, SHARE_URL, CANONICAL, PFBID),
      true
    );
  });

  await run('postMatchesInvestigation rejects unrelated post for share URL', async () => {
    assert.strictEqual(
      postMatchesInvestigation(
        { id: '999', url: 'https://www.facebook.com/other/posts/pfbidOTHER', text: 'wrong' },
        SHARE_URL,
        CANONICAL,
        PFBID
      ),
      false
    );
  });

  await run('verified via RapidAPI /post', async () => {
    const result = await resolveFacebookInvestigation({
      originalUrl: SHARE_URL,
      canonicalUrl: CANONICAL,
      contentId: PFBID,
      canonicalResolution,
      fetchPostFromApi: async () => verifiedPost
    });

    assert.strictEqual(result.status, 'verified');
    assert.strictEqual(result.metadata.text, TELUGU);
    assert.strictEqual(result.metadata.verification_source, 'rapidapi_post');
  });

  await run('verified via crawler snapshot when API unavailable', async () => {
    const result = await resolveFacebookInvestigation({
      originalUrl: SHARE_URL,
      canonicalUrl: CANONICAL,
      contentId: PFBID,
      canonicalResolution,
      fetchPostFromApi: async () => null
    });

    assert.strictEqual(result.status, 'verified');
    assert.strictEqual(result.metadata.text, TELUGU);
    assert.strictEqual(result.metadata.verification_source, 'facebook_crawler_og');
    assert.ok(result.metadata.media.length > 0);
  });

  await run('mismatched API result rejected', async () => {
    const result = await resolveFacebookInvestigation({
      originalUrl: SHARE_URL,
      canonicalUrl: CANONICAL,
      contentId: PFBID,
      canonicalResolution,
      fetchPostFromApi: async () => ({
        id: '999',
        url: 'https://www.facebook.com/other/posts/pfbidWRONG',
        text: 'transcription networks'
      })
    });

    assert.strictEqual(result.status, 'verified');
    assert.notStrictEqual(result.metadata.text, 'transcription networks');
    assert.strictEqual(result.metadata.text, TELUGU);
  });

  await run('unresolved when canonical identity missing', async () => {
    const result = await resolveFacebookInvestigation({
      originalUrl: SHARE_URL,
      canonicalUrl: SHARE_URL,
      contentId: '1EaP2MtgCS',
      canonicalResolution: {
        canonicalUrl: SHARE_URL,
        pfbid: '',
        resolvedVia: 'unresolved'
      },
      fetchPostFromApi: async () => null
    });

    assert.strictEqual(result.status, 'unresolved');
    assert.strictEqual(result.partial.reason, 'canonical_unresolved');
  });

  await run('unresolved when API and crawler both empty', async () => {
    const result = await resolveFacebookInvestigation({
      originalUrl: SHARE_URL,
      canonicalUrl: CANONICAL,
      contentId: PFBID,
      canonicalResolution: {
        ...canonicalResolution,
        snapshot: { canonicalUrl: CANONICAL, pfbid: PFBID, description: '', media: [] }
      },
      fetchPostFromApi: async () => null
    });

    assert.strictEqual(result.status, 'unresolved');
    assert.strictEqual(result.partial.reason, 'no_verified_post');
  });

  await run('numeric id verified via API', async () => {
    const result = await resolveFacebookInvestigation({
      originalUrl: NUMERIC_URL,
      canonicalUrl: NUMERIC_URL,
      contentId: '123456789012345',
      canonicalResolution: {
        canonicalUrl: NUMERIC_URL,
        pfbid: '',
        numericId: '123456789012345',
        resolvedVia: 'browser_ua'
      },
      fetchPostFromApi: async () => ({
        id: '123456789012345',
        url: NUMERIC_URL,
        text: 'numeric caption',
        media: [{ type: 'photo', url: 'https://scontent.xx.fbcdn.net/v/numeric.jpg' }],
        verification_source: 'rapidapi_post'
      })
    });

    assert.strictEqual(result.status, 'verified');
    assert.strictEqual(result.metadata.text, 'numeric caption');
  });

  await run('pageUrlMatchesTarget requires same verified page for og fallback', async () => {
    assert.strictEqual(pageUrlMatchesTarget(CANONICAL, SHARE_URL, CANONICAL, PFBID), true);
    assert.strictEqual(
      pageUrlMatchesTarget('https://www.facebook.com/other/posts/pfbidOTHER', SHARE_URL, CANONICAL, PFBID),
      false
    );
  });

  await run('buildPostFromCanonicalSnapshot uses same-page og content', async () => {
    const post = buildPostFromCanonicalSnapshot(canonicalResolution.snapshot, CANONICAL, PFBID);
    assert.strictEqual(post.text, TELUGU);
    assert.strictEqual(post.verification_source, 'facebook_crawler_og');
  });

  await run('extractPfbidFromText', async () => {
    assert.strictEqual(extractPfbidFromText(CANONICAL), PFBID);
  });

  console.log('facebookInvestigationService.test.js: all tests passed');
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
