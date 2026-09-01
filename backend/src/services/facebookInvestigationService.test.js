const assert = require('assert');
const {
  resolveFacebookInvestigation,
  pageUrlMatchesTarget,
  postMatchesInvestigation
} = require('./facebookInvestigationService');

const PFBID = 'pfbid02LnRd8kKFNy4iYMyrkC1bLbVvX12UTQvWx4KWCYGEDnNWbdpSW2bKTT2sio5fyCvRl';
const CANONICAL = `https://www.facebook.com/Sreenivastekumatla/posts/${PFBID}`;
const SHARE_URL = 'https://www.facebook.com/share/p/1EaP2MtgCS/';
const NUMERIC_URL = 'https://www.facebook.com/somepage/posts/123456789012345';

const verifiedPost = {
  id: PFBID,
  url: CANONICAL,
  text: 'Telugu political caption',
  author: 'Sreenivas Tekumatla',
  author_handle: 'Sreenivastekumatla',
  media: [{ type: 'photo', url: 'https://scontent.xx.fbcdn.net/v/example.jpg' }],
  metrics: { likes: 10 }
};

const run = async (name, fn) => {
  try {
    await fn();
    console.log(`  ok: ${name}`);
  } catch (error) {
    console.error(`  FAIL: ${name}`);
    throw error;
  }
};

const main = async () => {
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
        '1EaP2MtgCS'
      ),
      false
    );
  });

  await run('postMatchesInvestigation accepts numeric post id', async () => {
    const numericPost = {
      id: '123456789012345',
      url: NUMERIC_URL,
      text: 'numeric post'
    };
    assert.strictEqual(
      postMatchesInvestigation(numericPost, NUMERIC_URL, NUMERIC_URL, '123456789012345'),
      true
    );
  });

  await run('pageUrlMatchesTarget requires same verified page for og fallback', async () => {
    assert.strictEqual(
      pageUrlMatchesTarget(CANONICAL, SHARE_URL, CANONICAL, PFBID),
      true
    );
    assert.strictEqual(
      pageUrlMatchesTarget('https://www.facebook.com/other/posts/pfbidOTHER', SHARE_URL, CANONICAL, PFBID),
      false
    );
  });

  await run('verified investigation returns metadata from /post only', async () => {
    const fetchPost = async (lookup) => {
      if (lookup === CANONICAL || lookup === PFBID) return verifiedPost;
      return null;
    };

    const result = await resolveFacebookInvestigation({
      originalUrl: SHARE_URL,
      canonicalUrl: CANONICAL,
      contentId: PFBID,
      fetchPost
    });

    assert.strictEqual(result.status, 'verified');
    assert.strictEqual(result.metadata.text, 'Telugu political caption');
    assert.strictEqual(result.metadata.original_url, SHARE_URL);
    assert.strictEqual(result.canonical_url, CANONICAL);
    assert.strictEqual(result.metadata.investigation_verified, true);
    assert.strictEqual(result.metadata.media.length, 1);
  });

  await run('mismatched /post result yields unresolved (never analyze unrelated content)', async () => {
    const fetchPost = async () => ({
      id: '999',
      url: 'https://www.facebook.com/other/posts/pfbidWRONGPOST',
      text: 'transcription networks scientific text'
    });

    const result = await resolveFacebookInvestigation({
      originalUrl: SHARE_URL,
      canonicalUrl: CANONICAL,
      contentId: PFBID,
      fetchPost
    });

    assert.strictEqual(result.status, 'unresolved');
    assert.strictEqual(result.metadata, null);
    assert.strictEqual(result.partial.reason, 'no_verified_post');
    assert.match(result.message, /not analyzed/i);
  });

  await run('unresolved when /post returns nothing', async () => {
    const result = await resolveFacebookInvestigation({
      originalUrl: SHARE_URL,
      canonicalUrl: SHARE_URL,
      contentId: '1EaP2MtgCS',
      fetchPost: async () => null
    });

    assert.strictEqual(result.status, 'unresolved');
    assert.strictEqual(result.original_url, SHARE_URL);
    assert.strictEqual(result.canonical_url, SHARE_URL);
  });

  await run('partial when verified post has no analyzable text or media', async () => {
    const result = await resolveFacebookInvestigation({
      originalUrl: CANONICAL,
      canonicalUrl: CANONICAL,
      contentId: PFBID,
      fetchPost: async () => ({
        id: PFBID,
        url: CANONICAL,
        text: '',
        author: 'Sreenivas Tekumatla',
        media: []
      })
    });

    assert.strictEqual(result.status, 'partial');
    assert.strictEqual(result.partial.reason, 'verified_empty_content');
    assert.strictEqual(result.metadata.investigation_verified, true);
  });

  await run('og:description fallback only from matching verified page', async () => {
    const fetchPost = async () => ({
      id: PFBID,
      url: CANONICAL,
      text: '',
      author: 'Sreenivas Tekumatla',
      media: []
    });

    const fetchPageMetadata = async (url) => {
      if (url === CANONICAL) {
        return {
          text: 'og description from verified page',
          canonical_url: CANONICAL,
          media: [{ type: 'photo', url: 'https://scontent.xx.fbcdn.net/v/og.jpg' }]
        };
      }
      return {
        text: 'wrong page og text',
        canonical_url: 'https://www.facebook.com/other/posts/pfbidOTHER'
      };
    };

    const result = await resolveFacebookInvestigation({
      originalUrl: SHARE_URL,
      canonicalUrl: CANONICAL,
      contentId: PFBID,
      fetchPost,
      fetchPageMetadata
    });

    assert.strictEqual(result.status, 'verified');
    assert.strictEqual(result.metadata.text, 'og description from verified page');
    assert.strictEqual(result.metadata.og_description_fallback, true);
    assert.strictEqual(result.metadata.media.length, 1);
    assert.strictEqual(result.metadata.media_og_fallback, true);
  });

  await run('og:description ignored when scrape page does not match target', async () => {
    const fetchPost = async () => ({
      id: PFBID,
      url: CANONICAL,
      text: '',
      author: 'Sreenivas Tekumatla',
      media: []
    });

    const fetchPageMetadata = async () => ({
      text: 'unrelated og description',
      canonical_url: 'https://www.facebook.com/other/posts/pfbidOTHER',
      media: [{ type: 'photo', url: 'https://scontent.xx.fbcdn.net/v/wrong.jpg' }]
    });

    const result = await resolveFacebookInvestigation({
      originalUrl: SHARE_URL,
      canonicalUrl: CANONICAL,
      contentId: PFBID,
      fetchPost,
      fetchPageMetadata
    });

    assert.strictEqual(result.status, 'partial');
    assert.strictEqual(result.metadata.text, '');
    assert.strictEqual(result.metadata.media.length, 0);
  });

  await run('numeric id investigation verified via /post', async () => {
    const fetchPost = async (lookup) => {
      if (lookup === NUMERIC_URL || lookup === '123456789012345') {
        return {
          id: '123456789012345',
          url: NUMERIC_URL,
          text: 'numeric caption',
          media: [{ type: 'photo', url: 'https://scontent.xx.fbcdn.net/v/numeric.jpg' }]
        };
      }
      return null;
    };

    const result = await resolveFacebookInvestigation({
      originalUrl: NUMERIC_URL,
      canonicalUrl: NUMERIC_URL,
      contentId: '123456789012345',
      fetchPost
    });

    assert.strictEqual(result.status, 'verified');
    assert.strictEqual(result.metadata.text, 'numeric caption');
    assert.strictEqual(result.original_url, NUMERIC_URL);
  });

  console.log('facebookInvestigationService.test.js: all tests passed');
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
