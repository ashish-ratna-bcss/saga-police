/**
 * Instagram Blugate gateway routes (ig-downloader-api docs only).
 * Base: https://blugate.blurasaga.com/api/gateway/instagram/api/instagram
 * Full paths are /api/instagram/<name> (see blugateapis/ig-downloader-api-*.json).
 * Profile preview uses USER_INFO only.
 */
const INSTAGRAM_ENDPOINTS = {
  LINKS: {
    method: 'POST',
    path: '/links',
    usedFor: 'Direct media download links from a post/reel URL',
  },
  MEDIA_BY_SHORTCODE: {
    method: 'POST',
    path: '/mediaByShortcode',
    usedFor: 'Post/reel detail by shortcode',
  },
  PROFILE: {
    method: 'POST',
    path: '/profile',
    usedFor: 'Public profile by username',
  },
  USER_INFO: {
    method: 'POST',
    path: '/userInfo',
    usedFor: 'Public profile by username or userId — preview identity',
  },
  POSTS: {
    method: 'POST',
    path: '/posts',
    usedFor: 'User posts feed (paginate with maxId)',
  },
  REELS: {
    method: 'POST',
    path: '/reels',
    usedFor: 'User reels feed (paginate with maxId)',
  },
  TAGGED_POSTS: {
    method: 'POST',
    path: '/taggedPosts',
    usedFor: 'Posts tagging a user',
  },
  STORIES: {
    method: 'POST',
    path: '/stories',
    usedFor: 'Active stories for a username',
  },
  STORY: {
    method: 'POST',
    path: '/story',
    usedFor: 'Single story by username + storyId',
  },
  HIGHLIGHTS: {
    method: 'POST',
    path: '/highlights',
    usedFor: 'Highlight collections for a username',
  },
  HIGHLIGHT_STORIES: {
    method: 'POST',
    path: '/highlightStories',
    usedFor: 'Stories inside a highlight collection',
  },
  COMMENTS: {
    method: 'POST',
    path: '/comments',
    usedFor: 'Comments on a post URL',
  },
  FOLLOWERS: {
    method: 'POST',
    path: '/followers',
    usedFor: 'Followers of a user',
  },
  FOLLOWINGS: {
    method: 'POST',
    path: '/followings',
    usedFor: 'Accounts a user follows',
  },
};

module.exports = { INSTAGRAM_ENDPOINTS };
