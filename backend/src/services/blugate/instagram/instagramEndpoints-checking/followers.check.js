// Checks FOLLOWERS against IG Downloader API.
// Saves result to output/output.followers.json
// Run: node followers.check.js
const { runCheck } = require('./_runCheck');

(async () => {
  await runCheck({
    endpoint: 'FOLLOWERS',
    params: {"username":"instagram"},
    outputName: 'followers',
    assertFn: (data) => {
      if (data == null) throw new Error('empty followers'); console.log('  followers ok');
    },
  });
})();
