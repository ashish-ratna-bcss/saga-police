// Checks COMMENTS against IG Downloader API.
// Saves result to output/output.comments.json
// Run: node comments.check.js
const { runCheck } = require('./_runCheck');

(async () => {
  await runCheck({
    endpoint: 'COMMENTS',
    params: {"url":"https://www.instagram.com/reel/Dc30nJeRKKz/"},
    outputName: 'comments',
    assertFn: (data) => {
      if (data == null) throw new Error('empty comments'); console.log('  comments ok');
    },
  });
})();
