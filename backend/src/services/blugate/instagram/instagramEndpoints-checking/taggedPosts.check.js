// Checks TAGGED_POSTS against IG Downloader API.
// Saves result to output/output.taggedPosts.json
// Run: node taggedPosts.check.js
const { runCheck } = require('./_runCheck');

(async () => {
  await runCheck({
    endpoint: 'TAGGED_POSTS',
    params: {"username":"instagram"},
    outputName: 'taggedPosts',
    assertFn: (data) => {
      if (data == null) throw new Error('empty response'); console.log('  taggedPosts payload ok');
    },
  });
})();
