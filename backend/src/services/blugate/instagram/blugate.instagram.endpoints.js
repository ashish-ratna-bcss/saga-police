/**
 * IG Downloader API (RapidAPI: ig-downloader-api) — 14 routes.
 * (Provider `/likers` is broken — omitted.)
 * Host via INSTAGRAM_BASE_URL (see blugate.instagram.env.js).
 */
const INSTAGRAM_ENDPOINTS = {
  LINKS: {
    method: 'POST',
    path: '/api/instagram/links',
    usedFor: 'Direct media download links from a post/reel URL',
  },
  MEDIA_BY_SHORTCODE: {
    method: 'POST',
    path: '/api/instagram/mediaByShortcode',
    usedFor: 'Post/reel detail by shortcode',
  },
  PROFILE: {
    method: 'POST',
    path: '/api/instagram/profile',
    usedFor: 'Public profile by username',
  },
  USER_INFO: {
    method: 'POST',
    path: '/api/instagram/userInfo',
    usedFor: 'Public profile by username or userId',
  },
  POSTS: {
    method: 'POST',
    path: '/api/instagram/posts',
    usedFor: 'User posts feed (paginate with maxId)',
  },
  REELS: {
    method: 'POST',
    path: '/api/instagram/reels',
    usedFor: 'User reels feed (paginate with maxId)',
  },
  TAGGED_POSTS: {
    method: 'POST',
    path: '/api/instagram/taggedPosts',
    usedFor: 'Posts tagging a user',
  },
  STORIES: {
    method: 'POST',
    path: '/api/instagram/stories',
    usedFor: 'Active stories for a username',
  },
  STORY: {
    method: 'POST',
    path: '/api/instagram/story',
    usedFor: 'Single story by username + storyId',
  },
  HIGHLIGHTS: {
    method: 'POST',
    path: '/api/instagram/highlights',
    usedFor: 'Highlight collections for a username',
  },
  HIGHLIGHT_STORIES: {
    method: 'POST',
    path: '/api/instagram/highlightStories',
    usedFor: 'Stories inside a highlight collection',
  },
  COMMENTS: {
    method: 'POST',
    path: '/api/instagram/comments',
    usedFor: 'Comments on a post URL',
  },
  FOLLOWERS: {
    method: 'POST',
    path: '/api/instagram/followers',
    usedFor: 'Followers of a user',
  },
  FOLLOWINGS: {
    method: 'POST',
    path: '/api/instagram/followings',
    usedFor: 'Accounts a user follows',
  },
};

module.exports = { INSTAGRAM_ENDPOINTS };
