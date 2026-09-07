// Checks REELS against IG Downloader API.
// Saves result to output/output.reels.json
// Run: node reels.check.js
const { runCheck } = require('./_runCheck');

(async () => {
  await runCheck({
    endpoint: 'REELS',
    params: {"username":"instagram","maxId":""},
    outputName: 'reels',
    assertFn: (data) => {
      if (!data) throw new Error('empty response'); console.log('  reels payload ok');
    },
  });
})();
