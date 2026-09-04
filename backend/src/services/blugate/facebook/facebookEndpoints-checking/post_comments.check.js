// Checks POST_COMMENTS against a real Nike post_id.
// If this post ever gets deleted, grab a fresh post_id from page_posts.check.js's output.
// Saves its result to output/output.post_comments.json (overwritten each run).
// Run: node post_comments.check.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../../.env') });
const fs = require('fs');
const path = require('path');
const callFacebookApi = require('../blugate.facebook.api_client');

const ENDPOINT = 'POST_COMMENTS';
const PARAMS = { post_id: '1393461115481927' };
const OUTPUT_FILE = path.join(__dirname, 'output', 'output.post_comments.json');

(async () => {
    let result;
    try {
        const data = await callFacebookApi(ENDPOINT, PARAMS);
        const comments = data?.results;

        if (!Array.isArray(comments) || comments.length === 0) throw new Error('no comments in response');
        if (!comments[0]?.comment_id) throw new Error('first comment has no comment_id');

        result = { endpoint: ENDPOINT, params: PARAMS, status: 'PASS', checkedAt: new Date().toISOString(), response: data };
        console.log('POST_COMMENTS: PASS');
        console.log('  comments returned:', comments.length);
        console.log('  first comment message:', comments[0].message);
    } catch (err) {
        result = { endpoint: ENDPOINT, params: PARAMS, status: 'FAIL', checkedAt: new Date().toISOString(), error: err.message };
        console.error('POST_COMMENTS: FAIL —', err.message);
        process.exitCode = 1;
    } finally {
        fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
    }
})();
