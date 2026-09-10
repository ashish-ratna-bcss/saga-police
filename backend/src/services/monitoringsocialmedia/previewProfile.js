const callFacebookApi = require('../blugate/facebook/blugate.facebook.api_client');
const callXApi = require('../blugate/x/blugate.x.api_client');
const callYouTubeApi = require('../blugate/youtube/blugate.youtube.api_client');
const callInstagramApi = require('../blugate/instagram/blugate.instagram.api_client');
const callTelegramApi = require('../blugate/telegram/blugate.telegram.api_client');
const { pickUser } = require('../blugate/instagram/blugate.instagram.helpers');
const {
  cleanUsername: cleanTelegramUsername,
  resolveChannelRef,
} = require('../blugate/telegram/blugate.telegram.helpers');
const { parseChannelRef } = require('./youtube/fetch');

/**
 * Resolve identity + preview for Add/Edit profile form.
 * Returns preview_data (JSONB shape to store on profile) + data_patch for form fields.
 * Does NOT save posts.
 */
const previewFacebook = async (data = {}, auth = null) => {
  const url = String(data.url || data.page_url || '').trim();
  const existingPageId = data.page_id ? String(data.page_id).trim() : '';

  if (!url && !existingPageId) {
    const err = new Error('Enter a Facebook page URL (or page_id)');
    err.status = 400;
    throw err;
  }

  if (!url) {
    const preview_data = {
      fetched_at: new Date().toISOString(),
      platform: 'facebook',
      summary: {
        name: null,
        image: null,
        url: null,
        page_id: existingPageId,
        followers: null,
        note: 'page_id already set — add a URL to refresh preview',
      },
      raw: { page_id: existingPageId },
    };
    return {
      platform: 'facebook',
      preview: preview_data.summary,
      preview_data,
      data_patch: { page_id: existingPageId },
    };
  }

  const details = await callFacebookApi('PAGE_DETAILS', { url }, auth);
  const results =
    details?.results && typeof details.results === 'object'
      ? details.results
      : details && typeof details === 'object'
        ? details
        : {};
  const pageId = String(results.page_id || existingPageId || '').trim();
  if (!pageId) {
    const err = new Error('Could not resolve page_id from this URL');
    err.status = 400;
    throw err;
  }

  const summary = {
    name: results.name || null,
    image: results.image || null,
    url: results.url || url,
    page_id: pageId,
    followers: results.followers ?? null,
    following: results.following ?? null,
    type: results.type || null,
    categories: Array.isArray(results.categories) ? results.categories : [],
    website: results.website || null,
    intro: results.intro || null,
  };

  const preview_data = {
    fetched_at: new Date().toISOString(),
    platform: 'facebook',
    summary,
    raw: results,
  };

  return {
    platform: 'facebook',
    preview: summary,
    preview_data,
    data_patch: {
      url: summary.url,
      page_id: pageId,
    },
  };
};

const previewX = async (data = {}, auth = null) => {
  let username = String(data.username || '').trim().replace(/^@/, '');
  if (!username) {
    const err = new Error('Enter an X username');
    err.status = 400;
    throw err;
  }

  const res = await callXApi('USER', { username }, auth);
  const user =
    res?.result?.data?.user?.result ||
    res?.data?.user?.result ||
    null;
  if (!user?.rest_id) {
    const err = new Error('Could not resolve this X username');
    err.status = 400;
    throw err;
  }

  const screenName = user.core?.screen_name || user.legacy?.screen_name || username;
  const name = user.core?.name || user.legacy?.name || screenName;
  const summary = {
    name,
    image: user.avatar?.image_url || user.legacy?.profile_image_url_https || null,
    url: `https://x.com/${screenName}`,
    username: screenName,
    user_id: String(user.rest_id),
    followers: user.legacy?.followers_count ?? null,
    following: user.legacy?.friends_count ?? null,
    verified: Boolean(user.is_blue_verified),
    description: user.legacy?.description || null,
  };

  const preview_data = {
    fetched_at: new Date().toISOString(),
    platform: 'x',
    summary,
    raw: user,
  };

  return {
    platform: 'x',
    preview: summary,
    preview_data,
    data_patch: {
      username: screenName,
      user_id: String(user.rest_id),
    },
  };
};

const previewYouTube = async (data = {}, auth = null) => {
  const { channelId: existingId, handle } = parseChannelRef(data || {});
  if (!existingId && !handle) {
    const err = new Error('Enter a YouTube channel URL, @handle, or channel_id');
    err.status = 400;
    throw err;
  }

  const params = {
    part: 'snippet,statistics,contentDetails',
    maxResults: 1,
  };
  if (existingId) params.id = existingId;
  else params.forHandle = handle.startsWith('@') ? handle : `@${handle}`;

  const res = await callYouTubeApi('CHANNELS_LIST', params, auth);
  const channel = res?.items?.[0];
  if (!channel?.id) {
    const err = new Error('Could not resolve this YouTube channel');
    err.status = 400;
    throw err;
  }

  const uploads = channel.contentDetails?.relatedPlaylists?.uploads || null;
  const customUrl = channel.snippet?.customUrl || null;
  const thumb =
    channel.snippet?.thumbnails?.high?.url ||
    channel.snippet?.thumbnails?.medium?.url ||
    channel.snippet?.thumbnails?.default?.url ||
    null;

  const summary = {
    name: channel.snippet?.title || null,
    image: thumb,
    url: customUrl
      ? `https://www.youtube.com/${customUrl.startsWith('@') ? customUrl : `@${customUrl}`}`
      : `https://www.youtube.com/channel/${channel.id}`,
    channel_id: channel.id,
    uploads_playlist_id: uploads,
    followers: channel.statistics?.subscriberCount
      ? Number(channel.statistics.subscriberCount)
      : null,
    video_count: channel.statistics?.videoCount
      ? Number(channel.statistics.videoCount)
      : null,
    description: channel.snippet?.description || null,
  };

  const preview_data = {
    fetched_at: new Date().toISOString(),
    platform: 'youtube',
    summary,
    raw: channel,
  };

  return {
    platform: 'youtube',
    preview: summary,
    preview_data,
    data_patch: {
      channel_id: channel.id,
      channel_url: summary.url,
      ...(uploads ? { uploads_playlist_id: uploads } : {}),
    },
  };
};

const previewProfile = async (platformSlug, data, auth = null) => {
  const slug = String(platformSlug || '').toLowerCase();
  if (slug === 'facebook') return previewFacebook(data, auth);
  if (slug === 'x' || slug === 'twitter') return previewX(data, auth);
  if (slug === 'youtube') return previewYouTube(data, auth);
  if (slug === 'instagram') return previewInstagram(data, auth);
  if (slug === 'telegram') return previewTelegram(data);

  const err = new Error(
    `Preview/fetch is not set up for "${slug}" yet. Supported: facebook, x, youtube, instagram, telegram`
  );
  err.status = 400;
  throw err;
};

const previewInstagram = async (data = {}, auth = null) => {
  const username = String(data.username || data.handle || '')
    .trim()
    .replace(/^@/, '')
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .split(/[/?#]/)[0];

  if (!username) {
    const err = new Error('Enter an Instagram username');
    err.status = 400;
    throw err;
  }

  const raw = await callInstagramApi('USER_INFO', { username }, auth);
  const user = pickUser(raw);
  if (!user) {
    const err = new Error(`Could not load Instagram profile for @${username}`);
    err.status = 404;
    throw err;
  }

  const handle = String(user.username || username).replace(/^@/, '');
  const summary = {
    name: user.full_name || user.fullName || user.name || handle,
    biography: user.biography || user.bio || null,
    image: user.profile_pic_url || user.profilePicUrl || user.avatar || null,
    url: `https://www.instagram.com/${handle}/`,
    username: handle,
    user_id: user.pk || user.id || user.userId || null,
    followers: user.follower_count ?? user.followers ?? null,
    following: user.following_count ?? user.following ?? null,
    posts: user.media_count ?? user.posts ?? null,
    is_verified: Boolean(user.is_verified || user.isVerified),
    is_private: Boolean(user.is_private || user.isPrivate),
  };

  const preview_data = {
    fetched_at: new Date().toISOString(),
    platform: 'instagram',
    summary,
    raw: user,
  };

  return {
    platform: 'instagram',
    preview: summary,
    preview_data,
    data_patch: {
      username: handle,
      ...(summary.user_id ? { user_id: String(summary.user_id) } : {}),
    },
  };
};

const previewTelegram = async (data = {}) => {
  const body = resolveChannelRef({
    username: data.username || data.handle,
    url: data.url || data.channel_url,
    channel_id: data.channel_id,
  });
  if (!body.username && !body.url && !body.channel_id) {
    const err = new Error('Enter a Telegram username, t.me URL, or channel id');
    err.status = 400;
    throw err;
  }

  const raw = await callTelegramApi('CHANNEL_INFO', body);
  const channel = raw?.channel && typeof raw.channel === 'object' ? raw.channel : raw;
  if (!channel || (!channel.id && !channel.username && !channel.title)) {
    const err = new Error('Could not load Telegram channel');
    err.status = 404;
    throw err;
  }

  const handle = cleanTelegramUsername(channel.username || body.username || '');
  const channelId = channel.id != null ? String(channel.id) : body.channel_id || null;
  const url =
    channel.url ||
    (handle ? `https://t.me/${handle}` : body.url) ||
    null;

  const summary = {
    name: channel.title || channel.name || handle || channelId || 'Telegram',
    biography: channel.description || channel.about || null,
    image: channel.photo_url || channel.photo || null,
    url,
    username: handle || null,
    channel_id: channelId,
    members: channel.members_count ?? channel.participants_count ?? null,
    type: channel.type || 'channel',
    is_public: channel.is_public,
  };

  const preview_data = {
    fetched_at: new Date().toISOString(),
    platform: 'telegram',
    summary,
    raw: channel,
  };

  return {
    platform: 'telegram',
    preview: summary,
    preview_data,
    data_patch: {
      ...(handle ? { username: handle } : {}),
      ...(channelId ? { channel_id: channelId } : {}),
      ...(url ? { url } : {}),
    },
  };
};

module.exports = {
  previewProfile,
  previewFacebook,
  previewX,
  previewYouTube,
  previewInstagram,
  previewTelegram,
};
