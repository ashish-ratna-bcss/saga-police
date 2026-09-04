// Checks GET_USERS against a real, known-public account's rest_id (elonmusk = 44196397).
// Saves its result to output/output.get_users.json (overwritten each run).
// Run: node get_users.check.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../../.env') });
const fs = require('fs');
const path = require('path');
const callXApi = require('../blugate.x.api_client');

const ENDPOINT = 'GET_USERS';
const PARAMS = { users: '44196397' };
const OUTPUT_FILE = path.join(__dirname, 'output', 'output.get_users.json');

(async () => {
    let result;
    try {
        const data = await callXApi(ENDPOINT, PARAMS);
        const users = data?.result?.data?.users;

        if (!Array.isArray(users) || users.length === 0) throw new Error('no users in response');
        if (!users[0]?.result?.rest_id) throw new Error('first user has no rest_id');

        result = { endpoint: ENDPOINT, params: PARAMS, status: 'PASS', checkedAt: new Date().toISOString(), response: data };
        console.log('GET_USERS: PASS');
        console.log('  users returned:', users.length);
        console.log('  first rest_id:', users[0].result.rest_id);
        console.log('  first screen_name:', users[0].result.legacy?.screen_name);
    } catch (err) {
        result = { endpoint: ENDPOINT, params: PARAMS, status: 'FAIL', checkedAt: new Date().toISOString(), error: err.message };
        console.error('GET_USERS: FAIL —', err.message);
        process.exitCode = 1;
    } finally {
        fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
    }
})();
