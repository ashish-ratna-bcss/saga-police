const INSTAGRAM_DEFAULT_HOST = 'instagram120.p.rapidapi.com';

const getInstagramRapidApiKeys = () => {
    const key = String(process.env.RAPIDAPI_INSTAGRAM_KEY || process.env.RAPIDAPI_INSTAGRAM_KEYS).split(',')[0].trim();
    return key ? [key] : [];
};

const getInstagramRapidApiHost = () => {
    return process.env.RAPIDAPI_INSTAGRAM_HOST || INSTAGRAM_DEFAULT_HOST;
};

const getInstagramGlobalPauseMs = () => Number(process.env.RAPIDAPI_IG_GLOBAL_PAUSE_MS) || 60000;

const getInstagramMinRequestGapMs = () => Number(process.env.RAPIDAPI_IG_MIN_GAP_MS) || 500;

module.exports = {
    getInstagramRapidApiKeys,
    getInstagramRapidApiHost,
    getInstagramGlobalPauseMs,
    getInstagramMinRequestGapMs
};
