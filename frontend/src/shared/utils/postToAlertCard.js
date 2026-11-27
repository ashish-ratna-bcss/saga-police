import { proxyMediaUrl } from './mediaProxy';

const isVideoUrl = (url) =>
  typeof url === 'string' &&
  (/video\.twimg\.com/i.test(url) ||
    /\.(mp4|m3u8|webm|mov)(\?|$)/i.test(url) ||
    /video\.cdninstagram\.com/i.test(url) ||
    /video[^.]*\.fbcdn\.net/i.test(url) ||
    /youtube\.com\/watch|youtu\.be\//i.test(url));

const toMediaList = (mediaUrls, platform) => {
  if (!Array.isArray(mediaUrls)) return [];
  return mediaUrls
    .map((m) => {
      let url = null;
      let typeHint = null;
      if (typeof m === 'string' && m.trim()) {
        url = m.trim();
      } else if (m && typeof m === 'object') {
        url = m.url || m.src || m.thumbnail || m.preview_url || m.media_url || null;
        typeHint = m.type || m.media_type || null;
      }
      if (!url || typeof url !== 'string') return null;
      const isVideo =
        ['video', 'animated_gif', 'gifv'].includes(String(typeHint || '').toLowerCase()) ||
        isVideoUrl(url);
      // YouTube watch URLs are embeds, not image thumbs — skip as grid media;
      // YoutubeAlertCard uses content_url for the player.
      if (platform === 'youtube' && /youtube\.com\/watch|youtu\.be\//i.test(url)) {
        return null;
      }
      const proxied = proxyMediaUrl(url) || url;
      return {
        type: isVideo ? 'video' : 'photo',
        url: proxied,
        // Never use an mp4/video URL as poster — that paints a black frame.
        preview: isVideo ? '' : proxied,
        fallbackUrls: proxied !== url ? [url] : [],
        original_url: url,
      };
    })
    .filter(Boolean);
};

/**
 * Map a catalog / profile post → alert/content/source props for AlertCards
 * (same shape Top 50 / Alerts cards expect, including analysis for the Eye popup).
 */
export const postToAlertCardProps = (post) => {
  const platform = String(post.platform || '')
    .toLowerCase()
    .replace(/^twitter$/, 'x');
  const media = toMediaList(post.media_urls, platform);
  const engagement = post.engagement && typeof post.engagement === 'object' ? post.engagement : {};
  const analysis =
    post.analysis_result && typeof post.analysis_result === 'object' && !Array.isArray(post.analysis_result)
      ? post.analysis_result
      : post.analysis && typeof post.analysis === 'object' && !Array.isArray(post.analysis)
        ? post.analysis
        : {};
  const avatarRaw = post.profile_image_url || null;
  const avatar = avatarRaw ? proxyMediaUrl(avatarRaw) || avatarRaw : null;

  const content = {
    text: post.text || '',
    url: post.url || null,
    link: post.url || null,
    content_url: post.url || null,
    published_at: post.posted_at || post.fetched_at || null,
    author_handle: post.author_handle || null,
    media,
    media_url: media[0]?.url || null,
    media_urls: media.map((m) => m.url).filter(Boolean),
    thumbnail: media.find((m) => m.type === 'photo')?.url || media[0]?.preview || null,
    media_type: post.media_type || null,
    analysis_status: post.analysis_status || null,
    analysis,
    analysis_result: analysis,
    // Keep platform-native keys so PlatformEngagementBar matches Alerts.
    engagement: {
      ...engagement,
      views:
        engagement.views ??
        engagement.video_view_count ??
        engagement.view ??
        engagement.view_count ??
        engagement.play_count,
      video_view_count: engagement.video_view_count,
      likes: engagement.likes ?? engagement.reactions ?? engagement.like_count ?? engagement.favorites,
      comments: engagement.comments ?? engagement.comment_count ?? engagement.replies ?? engagement.reply,
      shares: engagement.shares ?? engagement.retweets ?? engagement.reposts,
      replies: engagement.replies ?? engagement.comments ?? engagement.reply_count,
      retweets: engagement.retweets ?? engagement.reposts ?? engagement.shares,
      quotes: engagement.quotes,
      saves: engagement.saves,
    },
  };

  const alert = {
    id: post.id,
    platform,
    author: post.author_name || post.profile_name || post.author_handle || 'Unknown',
    author_handle: post.author_handle || null,
    risk_level: post.risk_level || analysis.risk_level || analysis.riskLevel || 'low',
    sentiment: post.sentiment || analysis.sentiment || null,
    content_url: post.url || null,
    description: post.text || '',
    content_details: content,
    analysis_result: analysis,
    analysis_status: post.analysis_status || null,
    status: 'active',
    account_id: post.account_id || null,
  };

  const source = {
    name: post.author_name || post.profile_name || post.author_handle || 'Unknown',
    handle: post.author_handle || null,
    profile_image_url: avatar,
  };

  return { alert, content, source };
};

export default postToAlertCardProps;
