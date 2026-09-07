const { runCheck } = require('./_runCheck');

runCheck({
  endpoint: 'CHECK_ACCESS',
  params: { username: String(process.env.TELEGRAM_CHECK_USERNAME || 'telegram').replace(/^@/, '') },
  outputName: 'checkAccess',
  assertFn: (data) => {
    if (!data || typeof data !== 'object') throw new Error('Empty CHECK_ACCESS body');
  },
});
