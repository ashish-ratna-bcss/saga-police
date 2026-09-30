// Telegram Blugate gateway base URL (credentials come from the platforms table, not .env).
// Set BLUGATE_BASE_URL=https://blugate.blurasaga.com once and this becomes
//   https://blugate.blurasaga.com/api/gateway/telegram
// TELEGRAM_BASE_URL still works as an override (e.g. a self-hosted Telegram data API).

const { resolveGatewayBaseUrl } = require('../blugate.http');

const getTelegramBaseUrl = () =>
  String(resolveGatewayBaseUrl('telegram', ['TELEGRAM_BASE_URL']) || '').trim().replace(/\/$/, '');

module.exports = {
  getTelegramBaseUrl,
};
