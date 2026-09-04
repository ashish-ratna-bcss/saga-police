// Checks SEARCH_LIST with a keyword that should always return results ("nike").
// Note: this endpoint costs 100 quota units per call (vs 1 for the others) —
// it can legitimately fail with a 429/quotaExceeded if the daily project
// quota is already used up. That is a real, expected failure mode, not a bug.
// Saves its result to output/output.search_list.json (overwritten each run).
// Run: node search_list.check.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../../.env') });
const fs = require('fs');
const path = require('path');
const callYouTubeApi = require('../blugate.youtube.api_client');

const ENDPOINT = 'SEARCH_LIST';
const PARAMS = { part: 'snippet', q: 'nike', type: 'video', maxResults: 3 };
const OUTPUT_FILE = path.join(__dirname, 'output', 'output.search_list.json');

(async () => {
    let result;
    try {
        const data = await callYouTubeApi(ENDPOINT, PARAMS);
        const items = data?.items;

        if (!Array.isArray(items) || items.length === 0) throw new Error('no results in response');

        result = { endpoint: ENDPOINT, params: PARAMS, status: 'PASS', checkedAt: new Date().toISOString(), response: data };
        console.log('SEARCH_LIST: PASS');
        console.log('  results returned:', items.length);
        console.log('  first title:', items[0].snippet?.title);
    } catch (err) {
        result = { endpoint: ENDPOINT, params: PARAMS, status: 'FAIL', checkedAt: new Date().toISOString(), error: err.message };
        console.error('SEARCH_LIST: FAIL —', err.message);
        process.exitCode = 1;
    } finally {
        fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
    }
})();
