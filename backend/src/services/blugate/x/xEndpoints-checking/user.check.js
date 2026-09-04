// Checks USER against a real, known-public account (@elonmusk).
// Saves its result to output/output.user.json (overwritten each run).
// Run: node user.check.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../../.env') });
const fs = require('fs');
const path = require('path');
const callXApi = require('../blugate.x.api_client');

const ENDPOINT = 'USER';
const PARAMS = { username: 'elonmusk' };
const OUTPUT_FILE = path.join(__dirname, 'output', 'output.user.json');

(async () => {
    let result;
    try {
        const data = await callXApi(ENDPOINT, PARAMS);
        const user = data?.result?.data?.user?.result;

        if (!user?.rest_id) throw new Error('no rest_id in response');
        if (!user?.core?.screen_name) throw new Error('no screen_name in response');

        result = { endpoint: ENDPOINT, params: PARAMS, status: 'PASS', checkedAt: new Date().toISOString(), response: data };
        console.log('USER: PASS');
        console.log('  rest_id:', user.rest_id);
        console.log('  screen_name:', user.core.screen_name);
        console.log('  followers:', user.legacy?.followers_count);
    } catch (err) {
        result = { endpoint: ENDPOINT, params: PARAMS, status: 'FAIL', checkedAt: new Date().toISOString(), error: err.message };
        console.error('USER: FAIL —', err.message);
        process.exitCode = 1;
    } finally {
        fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
    }
})();
