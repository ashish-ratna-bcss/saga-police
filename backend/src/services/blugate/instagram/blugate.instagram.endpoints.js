// Each entry is one concrete RapidAPI Instagram route. Different provider
// listings expose the same operation (posts, profile, etc.) under different
// paths, so several keys below map to the same logical operation — the
// try-order between them is decided in rapidApiInstagramService.js, not here.
const INSTAGRAM_ENDPOINTS = {
    POSTS_LEGACY_POST: {
        method: 'POST',
        path: '/posts',
        usedFor: "Fetch a user's posts (legacy provider route, POST)"
    },
    POSTS_LEGACY_GET: {
        method: 'GET',
        path: '/posts',
        usedFor: "Fetch a user's posts (legacy provider route, GET fallback)"
    },
    POSTS_API: {
        method: 'POST',
        path: '/api/instagram/posts',
        usedFor: "Fetch a user's posts (api-prefixed provider route)"
    },
    POSTS_API_USER_POSTS: {
        method: 'POST',
        path: '/api/instagram/user/posts',
        usedFor: "Fetch a user's posts (api-prefixed provider route, alt path)"
    },
    POSTS_API_MEDIA: {
        method: 'POST',
        path: '/api/instagram/media',
        usedFor: "Fetch a user's media items (api-prefixed provider route, media-only variant)"
    },

    USER_INFO_LEGACY_POST: {
        method: 'POST',
        path: '/userInfo',
        usedFor: 'Fetch profile info (legacy provider route, POST)'
    },
    USER_INFO_LEGACY_GET: {
        method: 'GET',
        path: '/userInfo',
        usedFor: 'Fetch profile info (legacy provider route, GET fallback)'
    },
    PROFILE_LEGACY_POST: {
        method: 'POST',
        path: '/profile',
        usedFor: 'Fetch profile info (legacy provider route, alt path, POST)'
    },
    PROFILE_LEGACY_GET: {
        method: 'GET',
        path: '/profile',
        usedFor: 'Fetch profile info (legacy provider route, alt path, GET fallback)'
    },
    USER_INFO_API: {
        method: 'POST',
        path: '/api/instagram/userInfo',
        usedFor: 'Fetch profile info (api-prefixed provider route)'
    },
    USER_INFO_API_ALT: {
        method: 'POST',
        path: '/api/instagram/user/info',
        usedFor: 'Fetch profile info (api-prefixed provider route, alt path)'
    },
    USER_INFO_API_ALT_GET: {
        method: 'GET',
        path: '/api/instagram/user/info',
        usedFor: 'Fetch profile info by user id (api-prefixed provider route, alt path, GET fallback — used by fetchUserProfileById)'
    },
    PROFILE_API: {
        method: 'POST',
        path: '/api/instagram/profile',
        usedFor: 'Fetch profile info (api-prefixed provider route, alt path 2)'
    },
    PROFILE_API_GET: {
        method: 'GET',
        path: '/api/instagram/profile',
        usedFor: 'Fetch profile info by user id (api-prefixed provider route, alt path 2, GET fallback — used by fetchUserProfileById)'
    },
    USER_INFO_BY_ID_API_POST: {
        method: 'POST',
        path: '/api/instagram/userInfoById',
        usedFor: "Fetch a user's profile info by numeric user id (api-prefixed provider route, dedicated by-id path — used by fetchUserProfileById)"
    },
    USER_INFO_BY_ID_API_ALT_POST: {
        method: 'POST',
        path: '/api/instagram/user/info/by/id',
        usedFor: "Fetch a user's profile info by numeric user id (api-prefixed provider route, dedicated by-id path, alt — used by fetchUserProfileById)"
    },
    USER_INFO_BY_ID_API_GET: {
        method: 'GET',
        path: '/api/instagram/userInfoById',
        usedFor: "Fetch a user's profile info by numeric user id (api-prefixed provider route, dedicated by-id path, GET fallback — used by fetchUserProfileById)"
    },
    USER_INFO_BY_ID_API_ALT_GET: {
        method: 'GET',
        path: '/api/instagram/user/info/by/id',
        usedFor: "Fetch a user's profile info by numeric user id (api-prefixed provider route, dedicated by-id path, alt, GET fallback — used by fetchUserProfileById)"
    },

    MEDIA_BY_SHORTCODE_POST: {
        method: 'POST',
        path: '/mediaByShortcode',
        usedFor: 'Fetch post/reel detail by shortcode (legacy provider route, POST)'
    },
    MEDIA_BY_SHORTCODE_GET: {
        method: 'GET',
        path: '/mediaByShortcode',
        usedFor: 'Fetch post/reel detail by shortcode (legacy provider route, GET fallback)'
    },
    REELS_POST: {
        method: 'POST',
        path: '/reels',
        usedFor: 'Fetch reel detail by shortcode (legacy provider route, reels-specific, POST)'
    },
    REELS_GET: {
        method: 'GET',
        path: '/reels',
        usedFor: 'Fetch reel detail by shortcode (legacy provider route, reels-specific, GET fallback)'
    },
    POST_INFO_API: {
        method: 'POST',
        path: '/api/instagram/postInfo',
        usedFor: 'Fetch post detail by shortcode (api-prefixed provider route)'
    },
    POST_INFO_API_ALT: {
        method: 'POST',
        path: '/api/instagram/post/info',
        usedFor: 'Fetch post detail by shortcode (api-prefixed provider route, alt path)'
    },
    MEDIA_INFO_API: {
        method: 'POST',
        path: '/api/instagram/media/info',
        usedFor: 'Fetch post detail by shortcode (api-prefixed provider route, alt path 2)'
    },

    LINKS_API: {
        method: 'POST',
        path: '/api/instagram/links',
        usedFor: "Resolve a profile's canonical username from its bio-link tracking data (api-prefixed provider route)"
    },
    LINKS_LEGACY: {
        method: 'POST',
        path: '/links',
        usedFor: "Resolve a profile's canonical username from its bio-link tracking data (legacy provider route)"
    }
};

module.exports = { INSTAGRAM_ENDPOINTS };
