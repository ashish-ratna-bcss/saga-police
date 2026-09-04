// Checks SEARCH with a keyword that should always return results ("cricket").
// Saves its result to output/output.search.json (overwritten each run).
// Run: node search.check.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../../.env') });
const fs = require('fs');
const path = require('path');
const callXApi = require('../blugate.x.api_client');

const ENDPOINT = 'SEARCH';
const PARAMS = { type: 'Top', count: '5', query: 'cricket' };
const OUTPUT_FILE = path.join(__dirname, 'output', 'output.search.json');

(async () => {
    let result;
    try {
        const data = await callXApi(ENDPOINT, PARAMS);
        const instructions = data?.result?.timeline?.instructions;

        if (!Array.isArray(instructions) || instructions.length === 0) throw new Error('no timeline instructions in response');

        result = { endpoint: ENDPOINT, params: PARAMS, status: 'PASS', checkedAt: new Date().toISOString(), response: data };
        console.log('SEARCH: PASS');
        console.log('  timeline instructions:', instructions.length);
    } catch (err) {
        result = { endpoint: ENDPOINT, params: PARAMS, status: 'FAIL', checkedAt: new Date().toISOString(), error: err.message };
        console.error('SEARCH: FAIL —', err.message);
        process.exitCode = 1;
    } finally {
        fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
    }
})();
