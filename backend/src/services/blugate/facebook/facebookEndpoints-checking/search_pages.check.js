// Checks SEARCH_PAGES with a keyword that should always return results ("nike").
// Saves its result to output/output.search_pages.json (overwritten each run).
// Run: node search_pages.check.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../../.env') });
const fs = require('fs');
const path = require('path');
const callFacebookApi = require('../blugate.facebook.api_client');

const ENDPOINT = 'SEARCH_PAGES';
const PARAMS = { query: 'nike' };
const OUTPUT_FILE = path.join(__dirname, 'output', 'output.search_pages.json');

(async () => {
    let result;
    try {
        const data = await callFacebookApi(ENDPOINT, PARAMS);
        const pages = data?.results;

        if (!Array.isArray(pages) || pages.length === 0) throw new Error('no results in response');

        result = { endpoint: ENDPOINT, params: PARAMS, status: 'PASS', checkedAt: new Date().toISOString(), response: data };
        console.log('SEARCH_PAGES: PASS');
        console.log('  results returned:', pages.length);
        console.log('  first result url:', pages[0].url);
    } catch (err) {
        result = { endpoint: ENDPOINT, params: PARAMS, status: 'FAIL', checkedAt: new Date().toISOString(), error: err.message };
        console.error('SEARCH_PAGES: FAIL —', err.message);
        process.exitCode = 1;
    } finally {
        fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
    }
})();
