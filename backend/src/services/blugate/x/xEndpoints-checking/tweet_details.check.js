// Checks TWEET_DETAILS against a real tweet id pulled from @elonmusk's timeline.
// If this tweet is ever deleted, grab a fresh id from user_tweets.check.js's output.
// Saves its result to output/output.tweet_details.json (overwritten each run).
// Run: node tweet_details.check.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../../.env') });
const fs = require('fs');
const path = require('path');
const callXApi = require('../blugate.x.api_client');

const ENDPOINT = 'TWEET_DETAILS';
const PARAMS = { pid: '2095608838837731528' };
const OUTPUT_FILE = path.join(__dirname, 'output', 'output.tweet_details.json');

(async () => {
    let result;
    try {
        const data = await callXApi(ENDPOINT, PARAMS);
        const tweet = data?.result?.tweetResult?.result;

        if (!tweet?.__typename) throw new Error('no tweet data in response');

        result = { endpoint: ENDPOINT, params: PARAMS, status: 'PASS', checkedAt: new Date().toISOString(), response: data };
        console.log('TWEET_DETAILS: PASS');
        console.log('  type:', tweet.__typename);
        console.log('  author:', tweet.core?.user_results?.result?.core?.screen_name || tweet.core?.user_results?.result?.legacy?.screen_name);
    } catch (err) {
        result = { endpoint: ENDPOINT, params: PARAMS, status: 'FAIL', checkedAt: new Date().toISOString(), error: err.message };
        console.error('TWEET_DETAILS: FAIL —', err.message);
        process.exitCode = 1;
    } finally {
        fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
    }
})();
