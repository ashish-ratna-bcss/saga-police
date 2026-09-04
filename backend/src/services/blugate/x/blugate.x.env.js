// Reads the X (Twitter) provider's settings from the environment.
// Set these two in .env:
//   X_BASE_URL   e.g. https://twitter241.p.rapidapi.com
//   X_API_KEY    your RapidAPI key for that provider

const getXBaseUrl = () => process.env.X_BASE_URL;

const getXApiKey = () => process.env.X_API_KEY;

module.exports = {
    getXBaseUrl,
    getXApiKey
};
