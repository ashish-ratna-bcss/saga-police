// Checks FOLLOWINGS against IG Downloader API.
// Saves result to output/output.followings.json
// Run: node followings.check.js
const { runCheck } = require('./_runCheck');

(async () => {
  await runCheck({
    endpoint: 'FOLLOWINGS',
    params: {"username":"instagram"},
    outputName: 'followings',
    assertFn: (data) => {
      if (data == null) throw new Error('empty followings'); console.log('  followings ok');
    },
  });
})();
