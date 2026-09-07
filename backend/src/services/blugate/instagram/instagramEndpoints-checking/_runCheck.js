// Shared runner for Instagram endpoint checks (mirrors facebookEndpoints-checking).
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../../.env') });
const fs = require('fs');
const path = require('path');
const callInstagramApi = require('../blugate.instagram.api_client');

const runCheck = async ({ endpoint, params, assertFn, outputName }) => {
  const OUTPUT_FILE = path.join(__dirname, 'output', `output.${outputName}.json`);
  let result;
  try {
    const data = await callInstagramApi(endpoint, params);
    if (typeof assertFn === 'function') assertFn(data);
    result = {
      endpoint,
      params,
      status: 'PASS',
      checkedAt: new Date().toISOString(),
      response: data,
    };
    console.log(`${endpoint}: PASS`);
  } catch (err) {
    const provider = err.response?.data;
    const statusCode = err.response?.status;
    result = {
      endpoint,
      params,
      status: 'FAIL',
      checkedAt: new Date().toISOString(),
      error: err.message,
      httpStatus: statusCode || null,
      providerError: provider || null,
    };
    console.error(`${endpoint}: FAIL —`, result.error);
    process.exitCode = 1;
  } finally {
    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
  }
  return result;
};

module.exports = { runCheck, callInstagramApi };
