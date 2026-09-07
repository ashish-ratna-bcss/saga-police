const { runCheck } = require('./_runCheck');

runCheck({
  endpoint: 'HEALTH',
  params: {},
  outputName: 'health',
  assertFn: (data) => {
    if (!data || (data.status !== 'ok' && data.status !== 'healthy')) {
      throw new Error(`Unexpected HEALTH body: ${JSON.stringify(data)}`);
    }
  },
});
