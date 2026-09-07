// Telegram OSINT / provider base URL (Blugate-style data API).
// Set in .env:
//   TELEGRAM_BASE_URL   e.g. http://172.16.x.x:8000

const getTelegramBaseUrl = () =>
  String(process.env.TELEGRAM_BASE_URL || '').trim().replace(/\/$/, '');

module.exports = {
  getTelegramBaseUrl,
};
