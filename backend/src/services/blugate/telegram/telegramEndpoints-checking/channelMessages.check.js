const { runCheck } = require('./_runCheck');

const username = String(process.env.TELEGRAM_CHECK_USERNAME || 'telegram').replace(/^@/, '');

runCheck({
  endpoint: 'CHANNEL_MESSAGES',
  params: { username, limit: 10 },
  outputName: 'channelMessages',
  assertFn: (data) => {
    const items = Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data)
          ? data
          : null;
    if (!items) {
      throw new Error(`CHANNEL_MESSAGES missing items: ${JSON.stringify(data)?.slice(0, 300)}`);
    }
  },
});
