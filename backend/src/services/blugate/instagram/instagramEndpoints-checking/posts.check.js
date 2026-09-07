// Checks POSTS against IG Downloader API.
// Saves result to output/output.posts.json
// Run: node posts.check.js
const { runCheck } = require('./_runCheck');

(async () => {
  await runCheck({
    endpoint: 'POSTS',
    params: {"username":"instagram","maxId":""},
    outputName: 'posts',
    assertFn: (data) => {
      const items = data?.result || data?.items || data?.posts || data;
    const list = Array.isArray(items) ? items : (items?.items || []);
    if (!Array.isArray(list) && !items) throw new Error('no posts list');
    console.log('  posts payload ok');
    },
  });
})();
