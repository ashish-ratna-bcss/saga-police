// Checks CHANNELS_LIST against a real, known-public channel (@nike).
// Saves its result to output/output.channels_list.json (overwritten each run).
// Run: node channels_list.check.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../../.env') });
const fs = require('fs');
const path = require('path');
const callYouTubeApi = require('../blugate.youtube.api_client');

const ENDPOINT = 'CHANNELS_LIST';
const PARAMS = { part: 'snippet,statistics,contentDetails', forHandle: '@nike' };
const OUTPUT_FILE = path.join(__dirname, 'output', 'output.channels_list.json');

(async () => {
    let result;
    try {
        const data = await callYouTubeApi(ENDPOINT, PARAMS);
        const channel = data?.items?.[0];

        if (!channel?.id) throw new Error('no channel in response');
        if (!channel?.snippet?.title) throw new Error('no title in response');

        result = { endpoint: ENDPOINT, params: PARAMS, status: 'PASS', checkedAt: new Date().toISOString(), response: data };
        console.log('CHANNELS_LIST: PASS');
        console.log('  channel id:', channel.id);
        console.log('  title:', channel.snippet.title);
        console.log('  uploads playlist:', channel.contentDetails?.relatedPlaylists?.uploads);
    } catch (err) {
        result = { endpoint: ENDPOINT, params: PARAMS, status: 'FAIL', checkedAt: new Date().toISOString(), error: err.message };
        console.error('CHANNELS_LIST: FAIL —', err.message);
        process.exitCode = 1;
    } finally {
        fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
    }
})();
