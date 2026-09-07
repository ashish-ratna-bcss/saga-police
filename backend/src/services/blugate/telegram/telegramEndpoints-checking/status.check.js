const { runCheck } = require('./_runCheck');

runCheck({
  endpoint: 'STATUS',
  params: {},
  outputName: 'status',
  assertFn: (data) => {
    if (!data || typeof data !== 'object') {
      throw new Error('STATUS returned empty body');
    }
  },
});
