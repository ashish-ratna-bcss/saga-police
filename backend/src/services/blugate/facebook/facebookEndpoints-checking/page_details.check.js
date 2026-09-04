// Checks PAGE_DETAILS against a real, known-public Facebook Page (Nike).
// Saves its result to output/output.page_details.json (overwritten each run).
// Run: node page_details.check.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../../.env') });
const fs = require('fs');
const path = require('path');
const callFacebookApi = require('../blugate.facebook.api_client');

const ENDPOINT = 'PAGE_DETAILS';
const PARAMS = { url: 'https://www.facebook.com/nike' };
const OUTPUT_FILE = path.join(__dirname, 'output', 'output.page_details.json');

(async () => {
    let result;
    try {
        const data = await callFacebookApi(ENDPOINT, PARAMS);
        const page = data?.results;

        if (!page?.page_id) throw new Error('no page_id in response');
        if (!page?.name) throw new Error('no name in response');

        result = { endpoint: ENDPOINT, params: PARAMS, status: 'PASS', checkedAt: new Date().toISOString(), response: data };
        console.log('PAGE_DETAILS: PASS');
        console.log('  name:', page.name);
        console.log('  page_id:', page.page_id);
        console.log('  followers:', page.followers);
    } catch (err) {
        result = { endpoint: ENDPOINT, params: PARAMS, status: 'FAIL', checkedAt: new Date().toISOString(), error: err.message };
        console.error('PAGE_DETAILS: FAIL —', err.message);
        process.exitCode = 1;
    } finally {
        fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
    }
})();
