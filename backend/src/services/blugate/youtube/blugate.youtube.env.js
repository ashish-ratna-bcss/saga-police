// Reads the YouTube Data API v3 settings from the environment.
// Unlike Facebook/X, this isn't a RapidAPI provider — it's Google's own API,
// accessed through the `googleapis` SDK, authenticated with a single key.
// Set this one in .env:
//   YOUTUBE_API_KEY   from Google Cloud Console (project "soceye")

const getYouTubeApiKey = () => process.env.YOUTUBE_API_KEY;

module.exports = { getYouTubeApiKey };
