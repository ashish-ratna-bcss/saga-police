// Reads the Facebook Scraper provider's settings from the environment.
// Set these two in .env:
//   FACEBOOK_BASE_URL   e.g. https://facebook-scraper3.p.rapidapi.com
//   FACEBOOK_API_KEY    your RapidAPI key for that provider

const getFacebookBaseUrl = () => process.env.FACEBOOK_BASE_URL;

const getFacebookApiKey = () => process.env.FACEBOOK_API_KEY;

module.exports = {
    getFacebookBaseUrl,
    getFacebookApiKey
};
