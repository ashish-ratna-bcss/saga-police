/**
 * Self-check for Instagram playback URL refresh helpers.
 * Run: node src/services/instagramMediaResolveService.test.js
 */
const assert = require('assert');
const {
  looksLikeInstagramVideoUrl,
  extractInstagramPostId,
  collectFromMediaItem,
  mergePlaybackSources,
  toPlaybackMediaItems,
  parseInstagramCdnExpiryMs,
  isPlayableMediaUrlFresh
} = require('./instagramMediaResolveLogic');

const run = () => {
  assert.strictEqual(
    extractInstagramPostId('https://www.instagram.com/p/AbC123_-xy/'),
    'AbC123_-xy',
    'post shortcode'
  );
  assert.strictEqual(
    extractInstagramPostId('https://www.instagram.com/reel/ReelCode99/?igsh=abc'),
    'ReelCode99',
    'reel shortcode'
  );
  assert.strictEqual(
    extractInstagramPostId('https://www.instagram.com/stories/demo_user/1234567890/'),
    '1234567890',
    'story pk'
  );

  assert.strictEqual(
    looksLikeInstagramVideoUrl('https://video.cdninstagram.com/o1/v/t16/f2/m86/abc'),
    true,
    'video.cdninstagram.com is video'
  );
  assert.strictEqual(
    looksLikeInstagramVideoUrl('https://scontent.cdninstagram.com/o1/v/t16/f2/m86/abc'),
    true,
    '/o1/v/t path is video'
  );
  assert.strictEqual(
    looksLikeInstagramVideoUrl('https://scontent.cdninstagram.com/v/t51.2885-15/123_n.jpg'),
    false,
    'jpg thumb is not video'
  );
  assert.strictEqual(
    looksLikeInstagramVideoUrl('https://bhaskar-media-storage.s3.eu-north-1.amazonaws.com/instagram-content/1.mp4'),
    true,
    'archived mp4 is video'
  );

  const collected = collectFromMediaItem({
    type: 'video',
    url: 'https://scontent.cdninstagram.com/v/t51.2885-15/expired.jpg',
    preview: 'https://scontent.cdninstagram.com/v/t51.2885-15/thumb.jpg',
    s3_url: 'https://bhaskar-media-storage.s3.eu-north-1.amazonaws.com/instagram-content/1.mp4',
    video_versions: [{ url: 'https://video.cdninstagram.com/o1/v/t16/fresh' }]
  });
  assert.deepStrictEqual(collected.archivedVideos, [
    'https://bhaskar-media-storage.s3.eu-north-1.amazonaws.com/instagram-content/1.mp4'
  ]);
  assert.ok(collected.liveVideos.includes('https://video.cdninstagram.com/o1/v/t16/fresh'));
  assert.ok(!collected.liveVideos.includes('https://scontent.cdninstagram.com/v/t51.2885-15/expired.jpg'));

  const merged = mergePlaybackSources({
    archived: collected.archivedVideos,
    live: ['https://video.cdninstagram.com/o1/v/t16/fresh'],
    stored: ['https://scontent.cdninstagram.com/v/t51.2885-15/expired.mp4']
  });
  assert.strictEqual(merged[0], collected.archivedVideos[0], 'archived video is preferred');
  assert.strictEqual(merged[1], 'https://video.cdninstagram.com/o1/v/t16/fresh', 'fresh RapidAPI next');

  const playback = toPlaybackMediaItems({
    archivedVideos: [],
    liveVideos: ['https://video.cdninstagram.com/o1/v/t16/fresh', 'https://video.cdninstagram.com/o1/v/t16/alt'],
    images: ['https://scontent.cdninstagram.com/v/t51.2885-15/thumb.jpg']
  });
  assert.strictEqual(playback[0].type, 'video');
  assert.strictEqual(playback[0].url, 'https://video.cdninstagram.com/o1/v/t16/fresh');
  assert.deepStrictEqual(playback[0].fallbackUrls, ['https://video.cdninstagram.com/o1/v/t16/alt']);
  assert.strictEqual(playback[0].preview, 'https://scontent.cdninstagram.com/v/t51.2885-15/thumb.jpg');

  const futureOe = Math.floor(Date.now() / 1000 + 6 * 60 * 60).toString(16).toUpperCase();
  const expiredOe = Math.floor(Date.now() / 1000 - 60).toString(16).toUpperCase();
  assert.ok(
    isPlayableMediaUrlFresh(`https://scontent.cdninstagram.com/o1/v/t16/abc?oe=${futureOe}`),
    'future oe is still playable'
  );
  assert.strictEqual(
    isPlayableMediaUrlFresh(`https://scontent.cdninstagram.com/o1/v/t16/abc?oe=${expiredOe}`),
    false,
    'expired oe is not playable'
  );
  assert.ok(
    parseInstagramCdnExpiryMs(`https://scontent.cdninstagram.com/v/t51.jpg?oe=${futureOe}`) > Date.now(),
    'oe hex decodes to a future timestamp'
  );
  assert.ok(
    isPlayableMediaUrlFresh('https://bhaskar-media-storage.s3.eu-north-1.amazonaws.com/instagram-content/1.mp4'),
    'archived mp4 is always fresh'
  );

  console.log('instagramMediaResolveService.test.js: all assertions passed');
};

run();
