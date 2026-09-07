// Checks PROFILE against IG Downloader API.
// Saves result to output/output.profile.json
// Run: node profile.check.js
const { runCheck } = require('./_runCheck');

(async () => {
  await runCheck({
    endpoint: 'PROFILE',
    params: {"username":"instagram"},
    outputName: 'profile',
    assertFn: (data) => {
      if (!data) throw new Error('empty response'); console.log('  profile payload ok');
    },
  });
})();
