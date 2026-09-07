// Checks HIGHLIGHTS against IG Downloader API.
// Saves result to output/output.highlights.json
// Run: node highlights.check.js
const { runCheck } = require('./_runCheck');

(async () => {
  await runCheck({
    endpoint: 'HIGHLIGHTS',
    params: {"username":"instagram"},
    outputName: 'highlights',
    assertFn: (data) => {
      if (data == null) throw new Error('empty highlights'); console.log('  highlights ok');
    },
  });
})();
