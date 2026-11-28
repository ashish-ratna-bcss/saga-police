const callYouTubeApi = require('../../blugate/youtube/blugate.youtube.api_client');
const { waitForSlot, noteRateLimit } = require('./rateLimit');

const isRateError = (err) => {
  const status = err?.response?.status || err?.code;
  const msg = String(err?.message || '').toLowerCase();
  return status === 429 || msg.includes('quota') || msg.includes('rate');
};

const callWithGap = async (endpointKey, params, auth = null) => {
  await waitForSlot();
  try {
    return await callYouTubeApi(endpointKey, params, auth);
  } catch (err) {
    if (isRateError(err)) noteRateLimit();
    throw err;
  }
};

/** Parse channel id / @handle from common YouTube URL shapes. */
const parseChannelRef = (raw = {}) => {
  const data = raw && typeof raw === 'object' ? raw : {};
  if (data.channel_id) {
    return { channelId: String(data.channel_id).trim(), handle: null };
  }

  const input = String(data.channel_url || data.url || data.username || '').trim();
  if (!input) return { channelId: null, handle: null };

  if (/^UC[\w-]{20,}$/i.test(input)) {
    return { channelId: input, handle: null };
  }

  const handleMatch = input.match(/@([\w.-]+)/);
  if (handleMatch) {
    return { channelId: null, handle: handleMatch[1] };
  }

  const channelMatch = input.match(/youtube\.com\/channel\/(UC[\w-]+)/i);
  if (channelMatch) {
    return { channelId: channelMatch[1], handle: null };
  }

  const cMatch = input.match(/youtube\.com\/c\/([\w.-]+)/i);
  if (cMatch) {
    return { channelId: null, handle: cMatch[1] };
  }

  if (input.startsWith('@')) {
    return { channelId: null, handle: input.slice(1) };
  }

  // bare handle
  if (/^[\w.-]+$/.test(input)) {
    return { channelId: null, handle: input };
  }

  return { channelId: null, handle: null };
};

const resolveChannel = async (accountData = {}, auth = null) => {
  const data = accountData && typeof accountData === 'object' ? accountData : {};
  const { channelId: existingId, handle } = parseChannelRef(data);

  if (existingId && data.uploads_playlist_id) {
    return {
      channelId: existingId,
      uploadsPlaylistId: String(data.uploads_playlist_id),
      apiHits: 0,
      dataPatch: null,
      channelMeta: null,
    };
  }

  const params = {
    part: 'snippet,statistics,contentDetails',
    maxResults: 1,
  };
  if (existingId) params.id = existingId;
  else if (handle) params.forHandle = handle.startsWith('@') ? handle : `@${handle}`;
  else {
    throw new Error('YouTube account needs channel_url, @handle, or channel_id');
  }

  const res = await callWithGap('CHANNELS_LIST', params, auth);
  const channel = res?.items?.[0];
  if (!channel?.id) {
    throw new Error('CHANNELS_LIST did not return a channel');
  }

  const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) {
    throw new Error('Channel has no uploads playlist');
  }

  const customUrl = channel.snippet?.customUrl || null;
  const dataPatch = {
    ...data,
    channel_id: channel.id,
    uploads_playlist_id: uploads,
    ...(customUrl ? { channel_url: `https://www.youtube.com/${customUrl.replace(/^@/, '@')}` } : {}),
  };
  if (!dataPatch.channel_url && handle) {
    dataPatch.channel_url = `https://www.youtube.com/@${handle.replace(/^@/, '')}`;
  }

  return {
    channelId: channel.id,
    uploadsPlaylistId: uploads,
    apiHits: 1,
    dataPatch,
    channelMeta: channel,
  };
};

const mapYouTubePost = (item, accountId, channelMeta) => {
  const videoId =
    item?.contentDetails?.videoId ||
    item?.snippet?.resourceId?.videoId ||
    item?.id ||
    null;
  if (!videoId) return null;

  const snippet = item.snippet || {};
  const published = snippet.publishedAt || item.contentDetails?.videoPublishedAt;
  let postedAt = null;
  if (published) {
    const d = new Date(published);
    if (!Number.isNaN(d.getTime())) postedAt = d;
  }

  const thumbs = snippet.thumbnails || {};
  const thumbUrl =
    thumbs.maxres?.url || thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url || null;

  return {
    account_id: accountId,
    platform: 'youtube',
    external_id: String(videoId),
    url: `https://www.youtube.com/watch?v=${videoId}`,
    text: [snippet.title, snippet.description].filter(Boolean).join('\n\n') || null,
    author_name: channelMeta?.snippet?.title || snippet.channelTitle || null,
    author_handle: channelMeta?.snippet?.customUrl || null,
    media_type: 'video',
    // Poster image only (no direct mp4 from Data API). Callers must not treat
    // this as a Whisper/ffmpeg input — event media mapping stores it as photo.
    media_urls: thumbUrl ? [thumbUrl] : [],
    engagement: {},
    posted_at: postedAt,
    raw_data: item,
  };
};

/**
 * Fetch recent uploads for one YouTube catalog account.
 */
const fetchYouTubePosts = async (account, auth = null) => {
  let resolved = await resolveChannel(account.data || {}, auth);

  const loadPlaylist = async (uploadsPlaylistId) => {
    const playlist = await callWithGap(
      'PLAYLIST_ITEMS_LIST',
      {
        part: 'snippet,contentDetails',
        playlistId: uploadsPlaylistId,
        maxResults: 15,
      },
      auth
    );
    const items = Array.isArray(playlist?.items) ? playlist.items : [];
    const seen = new Set();
    const posts = [];
    for (const item of items) {
      const mapped = mapYouTubePost(item, account.id, resolved.channelMeta);
      if (!mapped || seen.has(mapped.external_id)) continue;
      seen.add(mapped.external_id);
      posts.push(mapped);
    }
    return posts;
  };

  try {
    const posts = await loadPlaylist(resolved.uploadsPlaylistId);
    return {
      posts,
      apiHits: resolved.apiHits + 1,
      dataPatch: resolved.dataPatch,
    };
  } catch (err) {
    const reason = err?.response?.data?.error?.errors?.[0]?.reason;
    const msg = String(err?.message || '');
    const playlistMissing =
      reason === 'playlistNotFound' ||
      msg.includes('playlistId') ||
      msg.toLowerCase().includes('playlist cannot be found');

    // Stale/wrong uploads id — drop cache, re-resolve via CHANNELS_LIST, retry once.
    if (playlistMissing && account.data?.uploads_playlist_id) {
      const dataWithoutPlaylist = { ...(account.data || {}) };
      delete dataWithoutPlaylist.uploads_playlist_id;
      resolved = await resolveChannel(dataWithoutPlaylist, auth);
      const posts = await loadPlaylist(resolved.uploadsPlaylistId);
      return {
        posts,
        apiHits: resolved.apiHits + 2,
        dataPatch: resolved.dataPatch,
      };
    }
    throw err;
  }
};

/**
 * One page (up to 50 videos) of a channel's uploads, for walking back through the whole channel
 * (Tools → Profile Report). Adds view / like / comment counts, which playlist items do not carry.
 * @returns {{ posts: object[], next: string|null, apiHits: number, dataPatch: object|null }}
 */
const fetchYouTubePostsPage = async (account, { cursor = null, auth = null } = {}) => {
  let resolved = await resolveChannel(account.data || {}, auth);
  let apiHits = resolved.apiHits;
  let dataPatch = resolved.dataPatch;

  const loadPage = async (playlistId) => {
    const params = { part: 'snippet,contentDetails', playlistId, maxResults: 50 };
    if (cursor) params.pageToken = cursor;
    apiHits += 1;
    return callWithGap('PLAYLIST_ITEMS_LIST', params, auth);
  };

  let playlist;
  try {
    playlist = await loadPage(resolved.uploadsPlaylistId);
  } catch (err) {
    const reason = err?.response?.data?.error?.errors?.[0]?.reason;
    const msg = String(err?.message || '');
    const playlistMissing = reason === 'playlistNotFound' || msg.includes('playlistId') || msg.toLowerCase().includes('playlist cannot be found');
    if (!(playlistMissing && account.data?.uploads_playlist_id)) throw err;
    // A stale uploads id: drop it, look the channel up again and retry once.
    const stripped = { ...(account.data || {}) };
    delete stripped.uploads_playlist_id;
    resolved = await resolveChannel(stripped, auth);
    apiHits += resolved.apiHits;
    dataPatch = resolved.dataPatch;
    playlist = await loadPage(resolved.uploadsPlaylistId);
  }

  const seen = new Set();
  const posts = [];
  for (const item of Array.isArray(playlist?.items) ? playlist.items : []) {
    const mapped = mapYouTubePost(item, account.id, resolved.channelMeta);
    if (!mapped || seen.has(mapped.external_id)) continue;
    seen.add(mapped.external_id);
    posts.push(mapped);
  }

  if (posts.length) {
    try {
      apiHits += 1;
      const stats = await callWithGap('VIDEOS_LIST', { part: 'statistics', id: posts.map((p) => p.external_id).join(','), maxResults: 50 }, auth);
      const byId = new Map((Array.isArray(stats?.items) ? stats.items : []).map((v) => [String(v.id), v.statistics || {}]));
      for (const p of posts) {
        const s = byId.get(p.external_id);
        if (s) p.engagement = { views: Number(s.viewCount) || 0, likes: Number(s.likeCount) || 0, comments: Number(s.commentCount) || 0 };
      }
    } catch (err) {
      // Counts are a nice-to-have; the videos themselves are what matters.
      console.warn(`[youtube/fetch] statistics skipped: ${err.message}`);
    }
  }

  const next = playlist?.nextPageToken || null;
  return { posts, next: next && next !== cursor ? next : null, apiHits, dataPatch };
};

module.exports = {
  fetchYouTubePosts,
  fetchYouTubePostsPage,
  mapYouTubePost,
  resolveChannel,
  parseChannelRef,
};
