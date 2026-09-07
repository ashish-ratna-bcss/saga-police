// Checks LINKS against IG Downloader API.
// Saves result to output/output.links.json
// Run: node links.check.js
const { runCheck } = require('./_runCheck');

(async () => {
  await runCheck({
    endpoint: 'LINKS',
    params: {"url":"https://www.instagram.com/reel/Dc30nJeRKKz/"},
    outputName: 'links',
    assertFn: (data) => {
      if (!data) throw new Error('empty links'); console.log('  links ok');
    },
  });
})();
