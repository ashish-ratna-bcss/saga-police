// Checks SEARCH_PEOPLE with a name that should always return results ("mark zuckerberg").
// Saves its result to output/output.search_people.json (overwritten each run).
// Run: node search_people.check.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../../.env') });
const fs = require('fs');
const path = require('path');
const callFacebookApi = require('../blugate.facebook.api_client');

const ENDPOINT = 'SEARCH_PEOPLE';
const PARAMS = { query: 'mark zuckerberg' };
const OUTPUT_FILE = path.join(__dirname, 'output', 'output.search_people.json');

(async () => {
    let result;
    try {
        const data = await callFacebookApi(ENDPOINT, PARAMS);
        const people = data?.results;

        if (!Array.isArray(people) || people.length === 0) throw new Error('no results in response');
        if (!people[0]?.profile_id) throw new Error('first result has no profile_id');

        result = { endpoint: ENDPOINT, params: PARAMS, status: 'PASS', checkedAt: new Date().toISOString(), response: data };
        console.log('SEARCH_PEOPLE: PASS');
        console.log('  results returned:', people.length);
        console.log('  first result name:', people[0].name);
    } catch (err) {
        result = { endpoint: ENDPOINT, params: PARAMS, status: 'FAIL', checkedAt: new Date().toISOString(), error: err.message };
        console.error('SEARCH_PEOPLE: FAIL —', err.message);
        process.exitCode = 1;
    } finally {
        fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
    }
})();
