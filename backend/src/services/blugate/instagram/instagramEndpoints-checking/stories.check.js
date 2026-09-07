// Checks STORIES against IG Downloader API.
// Saves result to output/output.stories.json
// Run: node stories.check.js
const { runCheck } = require('./_runCheck');

(async () => {
  await runCheck({
    endpoint: 'STORIES',
    params: {"username":"natgeo"},
    outputName: 'stories',
    assertFn: (data) => {
      if (data == null) throw new Error('empty stories'); console.log('  stories payload ok');
    },
  });
})();
