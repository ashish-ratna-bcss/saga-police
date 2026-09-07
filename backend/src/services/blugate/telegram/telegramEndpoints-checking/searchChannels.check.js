const { runCheck } = require('./_runCheck');

runCheck({
  endpoint: 'SEARCH_CHANNELS',
  params: { q: 'news', limit: 5 },
  outputName: 'searchChannels',
  assertFn: (data) => {
    if (!data || typeof data !== 'object') throw new Error('Empty SEARCH_CHANNELS body');
  },
});
