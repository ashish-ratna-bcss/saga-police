const Counter = require('../../../models/Counter');
const env = require('./blugate.instagram.env');
const { INSTAGRAM_ENDPOINTS } = require('./blugate.instagram.endpoints');

// Self-contained request counter for this provider — no shared blugate helper.
const COUNTER_KEY = 'api_calls_instagram';
let totalCalls = 0;

(async () => {
    try {
        const doc = await Counter.findOne({ key: COUNTER_KEY });
        if (doc) totalCalls = doc.seq;
    } catch (_) {}
})();

const incrementCalls = (amount = 1) => {
    totalCalls += amount;
    Counter.findOneAndUpdate({ key: COUNTER_KEY }, { $inc: { seq: amount } }, { upsert: true }).catch(() => {});
};

const getTotalCalls = () => totalCalls;

const isApiPrefixedHost = () => {
    const host = String(env.getInstagramRapidApiHost() || '').toLowerCase();
    return host.includes('instagram120') || host.includes('instagram-scraper');
};

module.exports = {
    env,
    endpoints: { INSTAGRAM_ENDPOINTS },
    incrementCalls,
    getTotalCalls,
    isApiPrefixedHost
};
