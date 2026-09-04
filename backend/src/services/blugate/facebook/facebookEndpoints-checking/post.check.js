// Checks POST (single post lookup) against a real Nike post_id.
// If this post ever gets deleted, grab a fresh post_id from page_posts.check.js's output.
// Saves its result to output/output.post.json (overwritten each run).
// Run: node post.check.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../../.env') });
const fs = require('fs');
const path = require('path');
const callFacebookApi = require('../blugate.facebook.api_client');

const ENDPOINT = 'POST';
const PARAMS = { post_id: '1393461115481927' };
const OUTPUT_FILE = path.join(__dirname, 'output', 'output.post.json');

(async () => {
    let result;
    try {
        const data = await callFacebookApi(ENDPOINT, PARAMS);
        const post = data?.results;

        if (!post?.post_id) throw new Error('no post_id in response');

        result = { endpoint: ENDPOINT, params: PARAMS, status: 'PASS', checkedAt: new Date().toISOString(), response: data };
        console.log('POST: PASS');
        console.log('  type:', post.type);
        console.log('  post_id:', post.post_id);
        console.log('  description:', post.description);
    } catch (err) {
        result = { endpoint: ENDPOINT, params: PARAMS, status: 'FAIL', checkedAt: new Date().toISOString(), error: err.message };
        console.error('POST: FAIL —', err.message);
        process.exitCode = 1;
    } finally {
        fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
    }
})();
