// Checks COMMENTS (replies) against a real tweet id pulled from @elonmusk's timeline.
// If this tweet is ever deleted, grab a fresh id from user_tweets.check.js's output.
// Saves its result to output/output.comments.json (overwritten each run).
// Run: node comments.check.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../../.env') });
const fs = require('fs');
const path = require('path');
const callXApi = require('../blugate.x.api_client');

const ENDPOINT = 'COMMENTS';
const PARAMS = { pid: '2095608838837731528', count: '5' };
const OUTPUT_FILE = path.join(__dirname, 'output', 'output.comments.json');

(async () => {
    let result;
    try {
        const data = await callXApi(ENDPOINT, PARAMS);
        const instructions = data?.result?.instructions;

        if (!Array.isArray(instructions) || instructions.length === 0) throw new Error('no instructions in response');

        result = { endpoint: ENDPOINT, params: PARAMS, status: 'PASS', checkedAt: new Date().toISOString(), response: data };
        console.log('COMMENTS: PASS');
        console.log('  timeline instructions:', instructions.length);
    } catch (err) {
        result = { endpoint: ENDPOINT, params: PARAMS, status: 'FAIL', checkedAt: new Date().toISOString(), error: err.message };
        console.error('COMMENTS: FAIL —', err.message);
        process.exitCode = 1;
    } finally {
        fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
    }
})();
