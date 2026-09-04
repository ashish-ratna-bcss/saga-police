// Checks VIDEOS_LIST against a real, known-public Nike video.
// Saves its result to output/output.videos_list.json (overwritten each run).
// Run: node videos_list.check.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../../.env') });
const fs = require('fs');
const path = require('path');
const callYouTubeApi = require('../blugate.youtube.api_client');

const ENDPOINT = 'VIDEOS_LIST';
const PARAMS = { part: 'snippet,statistics,contentDetails', id: 'Vf5vABEdVQ8' };
const OUTPUT_FILE = path.join(__dirname, 'output', 'output.videos_list.json');

(async () => {
    let result;
    try {
        const data = await callYouTubeApi(ENDPOINT, PARAMS);
        const video = data?.items?.[0];

        if (!video?.id) throw new Error('no video in response');
        if (!video?.snippet?.title) throw new Error('no title in response');

        result = { endpoint: ENDPOINT, params: PARAMS, status: 'PASS', checkedAt: new Date().toISOString(), response: data };
        console.log('VIDEOS_LIST: PASS');
        console.log('  title:', video.snippet.title);
        console.log('  views:', video.statistics?.viewCount);
        console.log('  likes:', video.statistics?.likeCount);
    } catch (err) {
        result = { endpoint: ENDPOINT, params: PARAMS, status: 'FAIL', checkedAt: new Date().toISOString(), error: err.message };
        console.error('VIDEOS_LIST: FAIL —', err.message);
        process.exitCode = 1;
    } finally {
        fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
    }
})();
