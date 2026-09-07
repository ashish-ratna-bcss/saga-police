// Checks USER_INFO against IG Downloader API.
// Saves result to output/output.userInfo.json
// Run: node userInfo.check.js
const { runCheck } = require('./_runCheck');

(async () => {
  await runCheck({
    endpoint: 'USER_INFO',
    params: {"username":"instagram"},
    outputName: 'userInfo',
    assertFn: (data) => {
      const u = data?.result || data?.user || data;
    if (!u && !data) throw new Error('empty response');
    const username = u?.username || u?.user?.username || data?.username;
    if (!username && !String(JSON.stringify(data)).includes('instagram')) throw new Error('no username in response');
    console.log('  username hint ok');
    },
  });
})();
