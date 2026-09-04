// Checks USER_TWEETS against a real, known-public account's timeline (elonmusk = 44196397).
// Saves its result to output/output.user_tweets.json (overwritten each run).
// Run: node user_tweets.check.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../../.env') });
const fs = require('fs');
const path = require('path');
const callXApi = require('../blugate.x.api_client');

const ENDPOINT = 'USER_TWEETS';
const PARAMS = { user: '44196397', count: '5' };
const OUTPUT_FILE = path.join(__dirname, 'output', 'output.user_tweets.json');

(async () => {
    let result;
    try {
        const data = await callXApi(ENDPOINT, PARAMS);
        const instructions = data?.result?.timeline?.instructions;

        if (!Array.isArray(instructions) || instructions.length === 0) throw new Error('no timeline instructions in response');

        result = { endpoint: ENDPOINT, params: PARAMS, status: 'PASS', checkedAt: new Date().toISOString(), response: data };
        console.log('USER_TWEETS: PASS');
        console.log('  timeline instructions:', instructions.length);
        console.log('  cursor.top present:', Boolean(data.cursor?.top));
    } catch (err) {
        result = { endpoint: ENDPOINT, params: PARAMS, status: 'FAIL', checkedAt: new Date().toISOString(), error: err.message };
        console.error('USER_TWEETS: FAIL —', err.message);
        process.exitCode = 1;
    } finally {
        fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
    }
})();
