const { runCheck } = require('./_runCheck');

// Public probe channel — change via TELEGRAM_CHECK_USERNAME if needed
const username = String(process.env.TELEGRAM_CHECK_USERNAME || 'telegram').replace(/^@/, '');

runCheck({
  endpoint: 'CHANNEL_INFO',
  params: { username },
  outputName: 'channelInfo',
  assertFn: (data) => {
    const ch = data?.channel && typeof data.channel === 'object' ? data.channel : data;
    if (!ch || (!ch.id && !ch.username && !ch.title)) {
      throw new Error(`CHANNEL_INFO missing channel fields: ${JSON.stringify(data)?.slice(0, 300)}`);
    }
  },
});
