// Shared runner for Telegram endpoint checks (mirrors instagramEndpoints-checking).
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../../.env') });
const fs = require('fs');
const path = require('path');
const callTelegramApi = require('../blugate.telegram.api_client');
const { getTelegramBaseUrl } = require('../blugate.telegram.env');

const runCheck = async ({ endpoint, params, assertFn, outputName }) => {
  const OUTPUT_FILE = path.join(__dirname, 'output', `output.${outputName}.json`);
  let result;
  try {
    const data = await callTelegramApi(endpoint, params || {});
    if (typeof assertFn === 'function') assertFn(data);
    result = {
      endpoint,
      params: params || {},
      status: 'PASS',
      checkedAt: new Date().toISOString(),
      baseUrl: getTelegramBaseUrl(),
      response: data,
    };
    console.log(`${endpoint}: PASS`);
  } catch (err) {
    const provider = err.response?.data;
    const statusCode = err.response?.status;
    result = {
      endpoint,
      params: params || {},
      status: 'FAIL',
      checkedAt: new Date().toISOString(),
      baseUrl: getTelegramBaseUrl(),
      error: err.message,
      httpStatus: statusCode || null,
      providerError: provider || null,
      code: err.code || null,
    };
    console.error(`${endpoint}: FAIL —`, result.error);
    process.exitCode = 1;
  } finally {
    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
  }
  return result;
};

module.exports = { runCheck, callTelegramApi, getTelegramBaseUrl };
