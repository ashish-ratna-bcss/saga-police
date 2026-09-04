// Checks PROFILE_DETAILS against a real, known-public personal profile (Mark Zuckerberg, profile_id 4).
// Saves its result to output/output.profile_details.json (overwritten each run).
// Run: node profile_details.check.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../../.env') });
const fs = require('fs');
const path = require('path');
const callFacebookApi = require('../blugate.facebook.api_client');

const ENDPOINT = 'PROFILE_DETAILS';
const PARAMS = { profile_id: '4' };
const OUTPUT_FILE = path.join(__dirname, 'output', 'output.profile_details.json');

(async () => {
    let result;
    try {
        const data = await callFacebookApi(ENDPOINT, PARAMS);
        const profile = data?.profile;

        if (!profile?.name) throw new Error('no name in response');
        if (profile?.type === 'private_profile') throw new Error('profile came back private/unreadable — endpoint may be broken again');

        result = { endpoint: ENDPOINT, params: PARAMS, status: 'PASS', checkedAt: new Date().toISOString(), response: data };
        console.log('PROFILE_DETAILS: PASS');
        console.log('  name:', profile.name);
        console.log('  profile_id:', profile.profile_id);
    } catch (err) {
        result = { endpoint: ENDPOINT, params: PARAMS, status: 'FAIL', checkedAt: new Date().toISOString(), error: err.message };
        console.error('PROFILE_DETAILS: FAIL —', err.message);
        process.exitCode = 1;
    } finally {
        fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
    }
})();
