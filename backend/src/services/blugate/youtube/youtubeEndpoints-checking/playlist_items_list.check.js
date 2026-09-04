// Checks PLAYLIST_ITEMS_LIST against Nike's real uploads playlist.
// Saves its result to output/output.playlist_items_list.json (overwritten each run).
// Run: node playlist_items_list.check.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../../.env') });
const fs = require('fs');
const path = require('path');
const callYouTubeApi = require('../blugate.youtube.api_client');

const ENDPOINT = 'PLAYLIST_ITEMS_LIST';
const PARAMS = { part: 'snippet,contentDetails', playlistId: 'UUUFgkRb0ZHc4Rpq15VRCICA', maxResults: 3 };
const OUTPUT_FILE = path.join(__dirname, 'output', 'output.playlist_items_list.json');

(async () => {
    let result;
    try {
        const data = await callYouTubeApi(ENDPOINT, PARAMS);
        const items = data?.items;

        if (!Array.isArray(items) || items.length === 0) throw new Error('no items in response');
        if (!items[0]?.contentDetails?.videoId) throw new Error('first item has no videoId');

        result = { endpoint: ENDPOINT, params: PARAMS, status: 'PASS', checkedAt: new Date().toISOString(), response: data };
        console.log('PLAYLIST_ITEMS_LIST: PASS');
        console.log('  items returned:', items.length);
        console.log('  first video id:', items[0].contentDetails.videoId);
        console.log('  first title:', items[0].snippet?.title);
    } catch (err) {
        result = { endpoint: ENDPOINT, params: PARAMS, status: 'FAIL', checkedAt: new Date().toISOString(), error: err.message };
        console.error('PLAYLIST_ITEMS_LIST: FAIL —', err.message);
        process.exitCode = 1;
    } finally {
        fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
    }
})();
