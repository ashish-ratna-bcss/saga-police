// Checks SEARCH_POSTS with a keyword that should always return results ("cricket").
// Saves its result to output/output.search_posts.json (overwritten each run).
// Run: node search_posts.check.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../../.env') });
const fs = require('fs');
const path = require('path');
const callFacebookApi = require('../blugate.facebook.api_client');

const ENDPOINT = 'SEARCH_POSTS';
const PARAMS = { query: 'cricket' };
const OUTPUT_FILE = path.join(__dirname, 'output', 'output.search_posts.json');

(async () => {
    let result;
    try {
        const data = await callFacebookApi(ENDPOINT, PARAMS);
        const posts = data?.results;

        if (!Array.isArray(posts) || posts.length === 0) throw new Error('no results in response');
        if (!posts[0]?.post_id) throw new Error('first result has no post_id');

        result = { endpoint: ENDPOINT, params: PARAMS, status: 'PASS', checkedAt: new Date().toISOString(), response: data };
        console.log('SEARCH_POSTS: PASS');
        console.log('  results returned:', posts.length);
        console.log('  first post message:', posts[0].message);
    } catch (err) {
        result = { endpoint: ENDPOINT, params: PARAMS, status: 'FAIL', checkedAt: new Date().toISOString(), error: err.message };
        console.error('SEARCH_POSTS: FAIL —', err.message);
        process.exitCode = 1;
    } finally {
        fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
    }
})();
