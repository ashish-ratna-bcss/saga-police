// Catalog of the YouTube Data API v3 methods this app actually uses. Checked
// against the full 83-method catalog: only these 5 are ever called anywhere
// in the live app (every method in youtube.service.js was audited to confirm
// this). `path` is the SDK method name — YouTube is reached through the
// `googleapis` SDK, not raw HTTP paths like the RapidAPI providers.
// blugate.youtube.api_client.js looks these up by key to build and send the request.

const YOUTUBE_ENDPOINTS = {
    CHANNELS_LIST: {
        method: 'GET',
        path: 'youtube.channels.list',
        usedFor: 'Find/validate a channel and read its details (name, thumbnail, uploads playlist id) — used by "Add Channel", "Sync", and Global Search',
        params: [
            { name: 'part', in: 'query', required: true, type: 'string', description: "Comma-separated resource parts to include, e.g. 'snippet,statistics,contentDetails'" },
            { name: 'id', in: 'query', required: false, type: 'string', description: 'Channel id (use this or forHandle/forUsername)' },
            { name: 'forHandle', in: 'query', required: false, type: 'string', description: "Channel's @handle, e.g. @nike" },
            { name: 'maxResults', in: 'query', required: false, type: 'integer', description: 'Default 5' }
        ],
        example: {
            kind: 'youtube#channelListResponse',
            pageInfo: { totalResults: 1, resultsPerPage: 5 },
            items: [{
                id: 'UCUFgkRb0ZHc4Rpq15VRCICA',
                snippet: { title: 'Nike', description: 'Just Do It.', customUrl: '@nike', publishedAt: '2006-03-08T03:18:02Z' },
                contentDetails: { relatedPlaylists: { uploads: 'UUUFgkRb0ZHc4Rpq15VRCICA' } }
            }]
        }
    },
    SEARCH_LIST: {
        method: 'GET',
        path: 'youtube.search.list',
        usedFor: 'Search channels or videos by keyword — costs 100 quota units (vs 1 for everything else here). Used by "Add Channel" and Global Search',
        params: [
            { name: 'part', in: 'query', required: true, type: 'string', description: "Set to 'snippet'" },
            { name: 'q', in: 'query', required: false, type: 'string', description: 'Search keyword' },
            { name: 'type', in: 'query', required: false, type: 'string', description: "'channel' or 'video'" },
            { name: 'maxResults', in: 'query', required: false, type: 'integer', description: 'Default 5' }
        ],
        example: {
            kind: 'youtube#searchListResponse',
            items: [{
                id: { kind: 'youtube#video', videoId: 'Vf5vABEdVQ8' },
                snippet: { title: 'CREASED Tour rolled through Asia...', channelTitle: 'Nike' }
            }]
        }
    },
    VIDEOS_LIST: {
        method: 'GET',
        path: 'youtube.videos.list',
        usedFor: 'Fetch video details/statistics, up to 50 ids at once — used by "Transcribe & Analyze" and Global Search',
        params: [
            { name: 'part', in: 'query', required: true, type: 'string', description: "e.g. 'snippet,statistics,contentDetails'" },
            { name: 'id', in: 'query', required: false, type: 'string', description: 'Comma-separated video ids' },
            { name: 'maxResults', in: 'query', required: false, type: 'integer', description: 'Default 5' }
        ],
        example: {
            kind: 'youtube#videoListResponse',
            items: [{
                id: 'Vf5vABEdVQ8',
                snippet: { title: 'CREASED Tour rolled through Asia making stops in Japan, China, and Korea.' },
                statistics: { viewCount: '1969', likeCount: '74' }
            }]
        }
    },
    PLAYLIST_ITEMS_LIST: {
        method: 'GET',
        path: 'youtube.playlistItems.list',
        usedFor: "List the videos in a channel's uploads playlist — used by the \"Sync\" button to pull recent uploads",
        params: [
            { name: 'part', in: 'query', required: true, type: 'string', description: "e.g. 'snippet,contentDetails'" },
            { name: 'playlistId', in: 'query', required: false, type: 'string', description: "The channel's uploads playlist id, from CHANNELS_LIST's contentDetails.relatedPlaylists.uploads" },
            { name: 'maxResults', in: 'query', required: false, type: 'integer', description: 'Default 5' }
        ],
        example: {
            kind: 'youtube#playlistItemListResponse',
            items: [{
                snippet: { title: 'Sabrina vs. The Rider | Nike' },
                contentDetails: { videoId: 'jx3yiH1M0lc' }
            }]
        }
    },
    COMMENT_THREADS_LIST: {
        method: 'GET',
        path: 'youtube.commentThreads.list',
        usedFor: "Fetch a video's top-level comments — used when opening a video's comments in YouTube Monitor / Sources",
        params: [
            { name: 'part', in: 'query', required: true, type: 'string', description: "Set to 'snippet'" },
            { name: 'videoId', in: 'query', required: false, type: 'string', description: 'Video id to fetch comments for' },
            { name: 'maxResults', in: 'query', required: false, type: 'integer', description: 'Default 20' }
        ],
        example: {
            kind: 'youtube#commentThreadListResponse',
            items: [{
                snippet: {
                    topLevelComment: {
                        snippet: { authorDisplayName: '@ILoveDogs110', textDisplay: 'Supporting small brands!!' }
                    }
                }
            }]
        }
    }
};

module.exports = { YOUTUBE_ENDPOINTS };
