// Checks COMMENT_THREADS_LIST against a real Nike video with comments.
// Saves its result to output/output.comment_threads_list.json (overwritten each run).
// Run: node comment_threads_list.check.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../../.env') });
const fs = require('fs');
const path = require('path');
const callYouTubeApi = require('../blugate.youtube.api_client');

const ENDPOINT = 'COMMENT_THREADS_LIST';
const PARAMS = { part: 'snippet', videoId: 'Vf5vABEdVQ8', maxResults: 3 };
const OUTPUT_FILE = path.join(__dirname, 'output', 'output.comment_threads_list.json');

(async () => {
    let result;
    try {
        const data = await callYouTubeApi(ENDPOINT, PARAMS);
        const items = data?.items;

        if (!Array.isArray(items) || items.length === 0) throw new Error('no comments in response');

        const firstComment = items[0].snippet.topLevelComment.snippet;
        result = { endpoint: ENDPOINT, params: PARAMS, status: 'PASS', checkedAt: new Date().toISOString(), response: data };
        console.log('COMMENT_THREADS_LIST: PASS');
        console.log('  comments returned:', items.length);
        console.log('  first author:', firstComment.authorDisplayName);
        console.log('  first text:', firstComment.textDisplay);
    } catch (err) {
        result = { endpoint: ENDPOINT, params: PARAMS, status: 'FAIL', checkedAt: new Date().toISOString(), error: err.message };
        console.error('COMMENT_THREADS_LIST: FAIL —', err.message);
        process.exitCode = 1;
    } finally {
        fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
    }
})();
