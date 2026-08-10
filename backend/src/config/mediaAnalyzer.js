/**
 * Single source of truth for the media-download Python service URL.
 * Previously duplicated across 3 files with 3 different fallback ports
 * (8002 in mediaAnalyzerService.js, 8005 in contentS3Service.js/storyS3Service.js)
 * — consolidated here so the default can never drift again.
 */
const MEDIA_ANALYZER_URL = (process.env.MEDIA_ANALYZER_URL || 'http://172.16.212.229:8000').replace(/\/+$/, '');

module.exports = { MEDIA_ANALYZER_URL };
