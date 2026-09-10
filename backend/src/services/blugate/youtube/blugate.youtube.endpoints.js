// YouTube Blugate gateway routes (youtube-data-api-v3 list ops = GET).
// Example host: https://blugate.blurasaga.com/api/gateway/youtube
// Docs: GET /channels, /search, /videos, /playlistItems, /commentThreads

const YOUTUBE_ENDPOINTS = {
  CHANNELS_LIST: {
    method: 'GET',
    path: '/channels',
    usedFor: 'Find/validate a channel and read its details',
  },
  SEARCH_LIST: {
    method: 'GET',
    path: '/search',
    usedFor: 'Search channels or videos by keyword',
  },
  VIDEOS_LIST: {
    method: 'GET',
    path: '/videos',
    usedFor: 'Fetch video details/statistics',
  },
  PLAYLIST_ITEMS_LIST: {
    method: 'GET',
    path: '/playlistItems',
    usedFor: "List videos in a channel's uploads playlist",
  },
  COMMENT_THREADS_LIST: {
    method: 'GET',
    path: '/commentThreads',
    usedFor: "Fetch a video's top-level comments",
  },
};

module.exports = { YOUTUBE_ENDPOINTS };
