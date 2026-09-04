// Catalog of the twitter241 (X/Twitter) endpoints this app actually uses. Each
// entry names the route, what it's for, the params it takes, and a real
// example response — verified live against the provider. Paths are used
// without a leading slash, matching this provider's own convention.
// blugate.x.api_client.js looks these up by key to build and send the request.

const X_ENDPOINTS = {
    USER: {
        method: 'GET',
        path: 'user',
        usedFor: 'Find a person by their @handle — used the first time an account is looked up',
        params: [
            { name: 'username', in: 'query', required: true, type: 'string', description: 'X/Twitter username, without @' }
        ],
        example: {
            result: {
                data: {
                    user: {
                        result: {
                            rest_id: '44196397',
                            core: { name: 'Elon Musk', screen_name: 'elonmusk', created_at: 'Tue Jun 02 20:12:29 +0000 2009' },
                            legacy: { followers_count: 241559070 },
                            is_blue_verified: true
                        }
                    }
                }
            }
        }
    },
    GET_USERS: {
        method: 'GET',
        path: 'get-users',
        usedFor: "Find a person (or several) by their numeric rest_id — used when the handle isn't known, or to keep tracking someone after a handle change",
        params: [
            { name: 'users', in: 'query', required: true, type: 'string', description: 'Comma-separated numeric rest_ids' }
        ],
        example: {
            result: {
                data: {
                    users: [{
                        result: {
                            rest_id: '44196397',
                            legacy: { screen_name: 'elonmusk', followers_count: 241559030 }
                        }
                    }]
                }
            }
        }
    },
    USER_TWEETS: {
        method: 'GET',
        path: 'user-tweets',
        usedFor: "Fetch a user's recent tweets — used for monitoring, engager analysis, and event scans",
        params: [
            { name: 'user', in: 'query', required: true, type: 'string', description: 'Numeric rest_id (from USER or GET_USERS)' },
            { name: 'count', in: 'query', required: true, type: 'string', description: 'Requested number of tweets' },
            { name: 'cursor', in: 'query', required: false, type: 'string', description: 'Pagination cursor' }
        ],
        example: {
            cursor: { top: 'DAAHCgABHRXaOE6...', bottom: 'DAAHCgABHRXaOE5...' },
            result: { timeline: { instructions: ['(tweet entries, one per pinned/recent post)'] } }
        }
    },
    SEARCH: {
        method: 'GET',
        path: 'search',
        usedFor: 'Search tweets or people by keyword — used by Global Search and event scans',
        params: [
            { name: 'type', in: 'query', required: true, type: 'string', description: 'Top / Latest / Videos / Photos / People' },
            { name: 'count', in: 'query', required: true, type: 'string', description: 'Result count' },
            { name: 'query', in: 'query', required: true, type: 'string', description: 'Search keyword' },
            { name: 'cursor', in: 'query', required: false, type: 'string', description: 'Pagination cursor' }
        ],
        example: {
            cursor: { top: 'DAACCgACHRXaW4...', bottom: 'DAACCgACHRXaW4...' },
            result: { timeline: { instructions: ['(matching tweet/user entries)'] } }
        }
    },
    TWEET_DETAILS: {
        method: 'GET',
        path: 'tweet-v2',
        usedFor: 'Fetch one specific tweet by its ID — used by Alerts "Investigate URL" and Post Location Lookup',
        params: [
            { name: 'pid', in: 'query', required: true, type: 'string', description: 'Numeric tweet id' }
        ],
        example: {
            result: {
                tweetResult: {
                    result: {
                        __typename: 'Tweet',
                        core: { user_results: { result: { legacy: { screen_name: 'elonmusk' } } } }
                    }
                }
            }
        }
    },
    RETWEETS: {
        method: 'GET',
        path: 'retweets',
        usedFor: 'List who retweeted a tweet with no added text — used by Engager Analysis',
        params: [
            { name: 'pid', in: 'query', required: true, type: 'string', description: 'Numeric tweet id' },
            { name: 'count', in: 'query', required: false, type: 'string', description: 'Result count' },
            { name: 'cursor', in: 'query', required: false, type: 'string', description: 'Pagination cursor' }
        ],
        example: {
            cursor: { top: 'HCaAgIDHmtffhjQ...', bottom: 'HBaAgID06cnfhjQ...' },
            result: { timeline: { instructions: ['(retweeter user entries, e.g. screen_name: "elonrevmuskl31")'] } }
        }
    },
    COMMENTS: {
        method: 'GET',
        path: 'comments-v2',
        usedFor: 'List the replies posted under a tweet — new, standalone tweets responding to it',
        params: [
            { name: 'pid', in: 'query', required: true, type: 'string', description: 'Numeric tweet id' },
            { name: 'count', in: 'query', required: false, type: 'string', description: 'Result count' },
            { name: 'cursor', in: 'query', required: false, type: 'string', description: 'Pagination cursor' }
        ],
        example: {
            cursor: { top: 'DAAKCgABHRXaaLP...', bottom: 'DAAKCgABHRXaaLP...' },
            result: { instructions: ['(reply-tweet entries — note: unlike the other endpoints, this one nests instructions directly under result, not result.timeline)'], metadata: {} }
        }
    },
    QUOTES: {
        method: 'GET',
        path: 'quotes',
        usedFor: 'List quote-tweets of a tweet — reposts with the poster\'s own comment added on top',
        params: [
            { name: 'pid', in: 'query', required: true, type: 'string', description: 'Numeric tweet id' },
            { name: 'count', in: 'query', required: false, type: 'string', description: 'Result count' },
            { name: 'cursor', in: 'query', required: false, type: 'string', description: 'Pagination cursor' }
        ],
        example: {
            cursor: { top: 'DAACCgACHRXaa5y...', bottom: 'DAACCgACHRXaa5y...' },
            result: { timeline: { instructions: ['(quote-tweet entries)'] } }
        }
    }
};

module.exports = { X_ENDPOINTS };
