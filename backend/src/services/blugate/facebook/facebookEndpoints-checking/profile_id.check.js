// Checks PROFILE_ID against a real, known-public personal profile (Mark Zuckerberg).
// Saves its result to output/output.profile_id.json (overwritten each run).
// Run: node profile_id.check.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../../.env') });
const fs = require('fs');
const path = require('path');
const callFacebookApi = require('../blugate.facebook.api_client');

const ENDPOINT = 'PROFILE_ID';
const PARAMS = { url: 'https://www.facebook.com/zuck' };
const OUTPUT_FILE = path.join(__dirname, 'output', 'output.profile_id.json');

(async () => {
    let result;
    try {
        const data = await callFacebookApi(ENDPOINT, PARAMS);

        if (!data?.profile_id) throw new Error('no profile_id in response');

        result = { endpoint: ENDPOINT, params: PARAMS, status: 'PASS', checkedAt: new Date().toISOString(), response: data };
        console.log('PROFILE_ID: PASS');
        console.log('  profile_id:', data.profile_id);
    } catch (err) {
        result = { endpoint: ENDPOINT, params: PARAMS, status: 'FAIL', checkedAt: new Date().toISOString(), error: err.message };
        console.error('PROFILE_ID: FAIL —', err.message);
        process.exitCode = 1;
    } finally {
        fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
    }
})();
