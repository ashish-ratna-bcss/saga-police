const { runCheck } = require('./_runCheck');

runCheck({
  endpoint: 'SEARCH_MESSAGES',
  params: { q: 'news', limit: 5 },
  outputName: 'searchMessages',
  assertFn: (data) => {
    if (!data || typeof data !== 'object') throw new Error('Empty SEARCH_MESSAGES body');
  },
});
