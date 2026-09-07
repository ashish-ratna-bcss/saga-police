const cleanUsername = (raw) => {
  let s = String(raw || '').trim();
  if (!s) return '';
  s = s.replace(/^@/, '');
  s = s.replace(/^https?:\/\/(www\.)?t\.me\//i, '');
  s = s.split(/[/?#]/)[0];
  return s.replace(/^@/, '').trim();
};

const listItems = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.items)) return raw.items;
  if (Array.isArray(raw.results)) return raw.results;
  if (Array.isArray(raw.messages)) return raw.messages;
  return [];
};

const resolveChannelRef = (data = {}) => {
  const d = data && typeof data === 'object' ? data : {};
  const channel_id = d.channel_id ? String(d.channel_id).trim() : '';
  const url = String(d.url || d.channel_url || '').trim();
  const username = cleanUsername(d.username || d.handle || '');
  const body = {};
  if (channel_id) body.channel_id = channel_id;
  if (username) body.username = username;
  if (url) body.url = url;
  return body;
};

const mapMessageToUpsert = (msg, accountId) => {
  if (!msg) return null;
  const id = msg.id ?? msg.message_id ?? msg.msg_id;
  if (id == null || id === '') return null;

  const postedAt = msg.date || msg.posted_at || msg.created_at || null;
  const media = Array.isArray(msg.media) ? msg.media : [];
  const mediaItems = media
    .map((m) => {
      if (!m) return null;
      if (typeof m === 'string') return { type: 'photo', url: m };
      const url = m.url || m.src || m.file_url || m.thumb_url || m.thumbnail || null;
      return {
        type: String(m.type || 'photo').toLowerCase(),
        url,
        mime_type: m.mime_type || null,
        filename: m.filename || null,
      };
    })
    .filter(Boolean);
  const mediaUrls = mediaItems.map((m) => m.url).filter(Boolean);

  const text = String(
    msg.text ||
      msg.message ||
      msg.caption ||
      msg.message_text ||
      msg.content ||
      ''
  ).trim();

  return {
    account_id: accountId,
    platform: 'telegram',
    external_id: String(id),
    url: msg.url || null,
    text: text || null,
    author_name: msg.author?.name || msg.author_name || null,
    author_handle: msg.author?.username || msg.author_handle || null,
    media_type: mediaItems[0]?.type || (mediaUrls.length ? 'media' : 'text'),
    media_urls: mediaUrls,
    media_items: mediaItems,
    engagement: {
      views: msg.views ?? msg.views_count ?? 0,
      forwards: msg.forwards ?? msg.forwards_count ?? 0,
      replies: msg.replies_count ?? msg.replies ?? 0,
    },
    posted_at: postedAt ? new Date(postedAt) : null,
    raw_data: msg,
  };
};

module.exports = {
  cleanUsername,
  listItems,
  resolveChannelRef,
  mapMessageToUpsert,
};
