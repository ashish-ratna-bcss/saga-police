// Checks STORY against IG Downloader API.
// Resolves a live storyId from STORIES first (docs sample IDs expire).
// Saves result to output/output.story.json
// Run: node story.check.js
const { runCheck, callInstagramApi } = require('./_runCheck');

(async () => {
  const username = 'natgeo';
  const stories = await callInstagramApi('STORIES', { username });
  const list = Array.isArray(stories?.result) ? stories.result : [];
  const storyId = String(list[0]?.pk || list[0]?.id || '').trim();
  if (!storyId) {
    throw new Error(`No active stories for @${username} — cannot check STORY`);
  }

  await runCheck({
    endpoint: 'STORY',
    params: { username, storyId },
    outputName: 'story',
    assertFn: (data) => {
      if (data == null) throw new Error('empty story');
      console.log('  story payload ok');
    },
  });
})().catch((err) => {
  console.error('STORY: FAIL —', err.message);
  process.exitCode = 1;
});
