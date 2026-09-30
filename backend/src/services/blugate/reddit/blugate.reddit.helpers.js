// Reddit username helpers + map RSS posts into social_media_posts rows.

const USERNAME_RE = /^[A-Za-z0-9_-]{3,20}$/;

const isValidUsername = (value) => USERNAME_RE.test(String(value || ''));

const cleanUsername = (raw) => {
  let s = String(raw || '').trim();
  if (!s) return '';
  s = s.replace(/^https?:\/\/(www\.)?reddit\.com\/(user|u)\//i, '');
  s = s.replace(/^\/?(user|u)\//i, '');
  s = s.split(/[/?#]/)[0];
  return s.replace(/^u\//i, '').replace(/^@/, '').trim();
};

const listPosts = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.posts)) return raw.posts;
  if (Array.isArray(raw.items)) return raw.items;
  if (Array.isArray(raw.results)) return raw.results;
  return [];
};

const mapPostToUpsert = (post, accountId, username = null) => {
  if (!post) return null;
  const id = post.id || post.guid || post.name;
  if (id == null || id === '') return null;
  // Skip subreddit directory entries (guid t5_…).
  if (String(post.guid || id).startsWith('t5_')) return null;

  const title = String(post.title || '').trim();
  const content = String(post.content || post.selftext || post.body || post.text || '').trim();
  const text = [title, content].filter(Boolean).join('\n').trim();

  const author =
    post.author ||
    post.author_name ||
    (typeof post.author === 'object' ? post.author?.name : null) ||
    username ||
    null;

  const postedAt = post.published_at || post.created_utc || post.created_at || post.date || null;

  return {
    account_id: accountId,
    platform: 'reddit',
    external_id: String(id),
    url: post.url || post.link || post.permalink || null,
    text: text || null,
    author_name: author ? String(author) : null,
    author_handle: author ? String(author).replace(/^u\//, '') : null,
    media_type: 'text',
    media_urls: [],
    engagement: {
      score: post.score ?? post.ups ?? 0,
      comments: post.num_comments ?? post.comments ?? post.replies ?? 0,
    },
    posted_at: postedAt ? new Date(postedAt) : null,
    raw_data: post,
  };
};

module.exports = {
  cleanUsername,
  isValidUsername,
  listPosts,
  mapPostToUpsert,
};
