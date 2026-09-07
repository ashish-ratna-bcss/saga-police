/**
 * Run all Telegram Blugate endpoint checks sequentially.
 * Usage (from backend/):
 *   node src/services/blugate/telegram/telegramEndpoints-checking/run_all.check.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../../.env') });
const { spawnSync } = require('child_process');
const path = require('path');
const { getTelegramBaseUrl } = require('../blugate.telegram.env');

const CHECKS = [
  'health.check.js',
  'ready.check.js',
  'status.check.js',
  'channelInfo.check.js',
  'channelMessages.check.js',
  'searchMessages.check.js',
  'searchChannels.check.js',
  'resolveLink.check.js',
  'checkAccess.check.js',
];

const base = getTelegramBaseUrl();
console.log(`Telegram checks → ${base || '(TELEGRAM_BASE_URL not set)'}\n`);

let failed = 0;
for (const file of CHECKS) {
  const full = path.join(__dirname, file);
  console.log(`── ${file} ──`);
  const r = spawnSync(process.execPath, [full], { stdio: 'inherit', env: process.env });
  if (r.status !== 0) failed += 1;
  console.log('');
}

console.log(failed === 0 ? 'All Telegram checks PASS' : `${failed} check(s) FAILED`);
process.exit(failed === 0 ? 0 : 1);
