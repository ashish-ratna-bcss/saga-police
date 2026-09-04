// Catalog of the Facebook Scraper endpoints this app actually uses. Each
// entry names the route, what it's for, the params it takes, and a real
// example response — verified live against the provider, not copied from
// its docs. blugate.facebook.api_client.js looks these up by key to build
// and send the request.

const FACEBOOK_ENDPOINTS = {
    PAGE_DETAILS: {
        method: 'GET',
        path: '/page/details',
        usedFor: "Page metadata (name, avatar, followers, verified) by URL — response also includes page_id inline, so no separate resolve call is needed",
        params: [
            { name: 'url', in: 'query', required: true, type: 'string', description: 'Facebook Page URL' }
        ],
        example: {
            results: {
                name: 'Nike',
                type: 'page',
                page_id: '100044541544829',
                url: 'https://www.facebook.com/nike',
                image: 'https://scontent.../284964043_...jpg',
                intro: null,
                followers: 39000000,
                following: 24,
                categories: ['Page', 'Sportswear shop'],
                website: 'nike.com'
            }
        }
    },
    PAGE_POSTS: {
        method: 'GET',
        path: '/page/posts',
        usedFor: "Fetch a Page's recent posts by numeric page_id",
        params: [
            { name: 'page_id', in: 'query', required: true, type: 'string', description: 'Numeric Facebook page id (from PAGE_DETAILS response)' },
            { name: 'cursor', in: 'query', required: false, type: 'string', description: 'Pagination cursor' }
        ],
        example: {
            results: [{
                post_id: '1393461115481927',
                type: 'post',
                url: 'https://www.facebook.com/reel/2166091230582141/',
                message: 'Leave your limits at the surface. #JustDoIt',
                timestamp: 1757952119,
                comments_count: 2383,
                reactions_count: 7790,
                reshare_count: 1113,
                reactions: { angry: 33, care: 135, haha: 22, like: 6411, love: 1141, sad: 4, wow: 44 },
                author: { id: '100044541544829', name: 'Nike', url: 'https://www.facebook.com/nike' }
            }]
        }
    },
    PROFILE_ID: {
        method: 'GET',
        path: '/profile/profile_id',
        usedFor: "Resolve a personal profile's numeric profile_id from its URL — required before profile/details_id and profile/posts",
        params: [
            { name: 'url', in: 'query', required: true, type: 'string', description: 'Facebook personal profile URL' }
        ],
        example: { profile_id: '4' }
    },
    PROFILE_DETAILS: {
        method: 'GET',
        path: '/profile/details_id',
        usedFor: 'Personal profile metadata (name, avatar, intro) by profile_id — used for POI Facebook tracking',
        params: [
            { name: 'profile_id', in: 'query', required: true, type: 'string', description: 'Numeric profile id (from PROFILE_ID response)' }
        ],
        example: {
            profile: {
                name: 'Mark Zuckerberg',
                profile_id: '4',
                url: 'https://www.facebook.com/zuck',
                image: 'https://scontent.../632598281_...jpg',
                intro: 'Bringing the world closer together...'
            }
        }
    },
    PROFILE_POSTS: {
        method: 'GET',
        path: '/profile/posts',
        usedFor: "Fetch a personal profile's recent posts by profile_id",
        params: [
            { name: 'profile_id', in: 'query', required: true, type: 'string', description: 'Numeric profile id (from PROFILE_ID response)' },
            { name: 'cursor', in: 'query', required: false, type: 'string', description: 'Pagination cursor' }
        ],
        example: {
            results: [{
                post_id: '10117844921640781',
                type: 'post',
                url: 'https://www.facebook.com/reel/1370929081132805/',
                message: "I believe everyone should have access to superintelligence...",
                timestamp: 1786356329
            }]
        }
    },
    POST_COMMENTS: {
        method: 'GET',
        path: '/post/comments',
        usedFor: 'Fetch comments for a specific post by post_id',
        params: [
            { name: 'post_id', in: 'query', required: true, type: 'string', description: 'Numeric post id' },
            { name: 'cursor', in: 'query', required: false, type: 'string', description: 'Pagination cursor' }
        ],
        example: {
            results: [{
                type: 'comment',
                comment_id: 'Y29tbWVudDoxMzkzNDYxMTE1NDgxOTI3XzE2MjQ4NDAzMTkyNTk2NTM=',
                legacy_comment_id: '1624840319259653',
                depth: 0,
                created_time: 1788492744,
                message: 'nike sb XS',
                author: { id: '100088272944795', name: 'Xawier Stonethmann', url: 'https://www.facebook.com/people/Xawier-Stonethmann/100088272944795/' }
            }]
        }
    },
    POST: {
        method: 'GET',
        path: '/post',
        usedFor: 'Fetch a single post by post_id (or url) — used by the Alerts "Investigate URL" feature',
        params: [
            { name: 'post_id', in: 'query', required: false, type: 'string', description: 'Numeric post id (used if set — preferred over url)' },
            { name: 'url', in: 'query', required: false, type: 'string', description: 'Post URL (used if post_id not set)' }
        ],
        example: {
            results: {
                type: 'reel',
                video_id: '2166091230582141',
                post_id: '1393461115481927',
                description: 'Leave your limits at the surface. #JustDoIt',
                timestamp: 1757952115,
                comments_count: 2383,
                reactions_count: 7791,
                reshare_count: 1100,
                author: { id: '100044541544829', name: 'Nike', url: 'https://www.facebook.com/nike' }
            }
        }
    },
    SEARCH_PAGES: {
        method: 'GET',
        path: '/search/pages',
        usedFor: 'Search Facebook Pages/organizations by keyword',
        params: [
            { name: 'query', in: 'query', required: true, type: 'string', description: 'Search keyword' },
            { name: 'cursor', in: 'query', required: false, type: 'string', description: 'Pagination cursor' }
        ],
        example: {
            results: [{
                type: 'page',
                profile_url: 'https://www.facebook.com/people/Nike-show/100071219001975/',
                url: 'https://www.facebook.com/people/Nike-show/100071219001975/',
                image: { uri: 'https://scontent.../453178253_...png' }
            }]
        }
    },
    SEARCH_POSTS: {
        method: 'GET',
        path: '/search/posts',
        usedFor: 'Search Facebook posts by keyword',
        params: [
            { name: 'query', in: 'query', required: true, type: 'string', description: 'Search keyword' },
            { name: 'cursor', in: 'query', required: false, type: 'string', description: 'Pagination cursor' },
            { name: 'start_date', in: 'query', required: false, type: 'date', description: 'Optional date filter, yyyy-mm-dd' },
            { name: 'end_date', in: 'query', required: false, type: 'date', description: 'Optional date filter, yyyy-mm-dd' }
        ],
        example: {
            results: [{
                post_id: '1492713159552736',
                type: 'post',
                url: 'https://www.facebook.com/IndianCricketTeam/posts/pfbid0QEVz...',
                message: 'Edged & taken! Wicket No. 2 for Manav Suthar! ...'
            }]
        }
    },
    SEARCH_PEOPLE: {
        method: 'GET',
        path: '/search/people',
        usedFor: 'Search individual Facebook profiles by name — used for finding a Person of Interest',
        params: [
            { name: 'query', in: 'query', required: true, type: 'string', description: 'Search keyword (name)' },
            { name: 'cursor', in: 'query', required: false, type: 'string', description: 'Pagination cursor' }
        ],
        example: {
            results: [{
                type: 'search_profile',
                profile_id: 'pfbid02ZAozxqX9YzwoV9mdJUZsY9DDtYHziMA6hBxfgsAHP3gHnRqY5tTW1fbLjvwLggzkl',
                url: 'https://www.facebook.com/mark.raptors.2025',
                name: 'Mark Raptors',
                is_verified: false,
                profile_picture: { uri: 'https://scontent.../788033384_...jpg', width: 120, height: 120 }
            }],
            cursor: '{"page_number": 0, ...}'
        }
    }
};

module.exports = { FACEBOOK_ENDPOINTS };
