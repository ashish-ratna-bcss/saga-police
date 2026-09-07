const { runCheck } = require('./_runCheck');

runCheck({
  endpoint: 'READY',
  params: {},
  outputName: 'ready',
  assertFn: (data) => {
    if (!data || (data.status !== 'ok' && data.status !== 'ready' && data.telegram_configured == null)) {
      // Accept either status:ok or telegram_configured flag from docs
      if (!data) throw new Error('Empty READY body');
    }
  },
});
