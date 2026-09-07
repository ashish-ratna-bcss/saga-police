const { runCheck } = require('./_runCheck');

runCheck({
  endpoint: 'RESOLVE_LINK',
  params: { url: 'https://t.me/telegram' },
  outputName: 'resolveLink',
  assertFn: (data) => {
    if (!data || typeof data !== 'object') throw new Error('Empty RESOLVE_LINK body');
  },
});
