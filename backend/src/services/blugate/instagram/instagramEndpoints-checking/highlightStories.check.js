// Checks HIGHLIGHT_STORIES against IG Downloader API.
// Saves result to output/output.highlightStories.json
// Run: node highlightStories.check.js
const { runCheck } = require('./_runCheck');

(async () => {
  await runCheck({
    endpoint: 'HIGHLIGHT_STORIES',
    params: {"highlightId":"highlight:17936913893330057"},
    outputName: 'highlightStories',
    assertFn: (data) => {
      if (data == null) throw new Error('empty highlightStories'); console.log('  highlightStories ok');
    },
  });
})();
