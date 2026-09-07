// Checks MEDIA_BY_SHORTCODE against IG Downloader API.
// Saves result to output/output.mediaByShortcode.json
// Run: node mediaByShortcode.check.js
const { runCheck } = require('./_runCheck');

(async () => {
  await runCheck({
    endpoint: 'MEDIA_BY_SHORTCODE',
    params: {"shortcode":"Dc30nJeRKKz"},
    outputName: 'mediaByShortcode',
    assertFn: (data) => {
      if (!data || (Array.isArray(data) && !data.length)) throw new Error('empty media');
    console.log('  mediaByShortcode ok');
    },
  });
})();
