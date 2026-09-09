const prisma = require('../../../prisma/client');
const logger = require('../../lib/logger');
const { searchMentions } = require('./grievance.mentions');
const {
  fetchFacebookPosts,
} = require('../../services/monitoringsocialmedia/facebook/fetch');
const {
  fetchInstagramPosts,
} = require('../../services/monitoringsocialmedia/instagram/fetch');
const {
  fetchTelegramPosts,
} = require('../../services/monitoringsocialmedia/telegram/fetch');
const { cleanUsername: cleanTelegramUsername } = require('../../services/blugate/telegram/blugate.telegram.helpers');
const callFacebookApi = require('../../services/blugate/facebook/blugate.facebook.api_client');
const callInstagramApi = require('../../services/blugate/instagram/blugate.instagram.api_client');
const { unwrapPayload } = require('../../services/blugate/instagram/blugate.instagram.helpers');
const {
  normalizePlatform,
  asJson,
  serialize,
  pickAvatar,
} = require('./grievance.utils');

const asObject = (value, fallback = {}) => {
  const parsed = asJson(value, fallback);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
};

const hydrateCatalogGrievance = (row) => {
  const postedBy = asObject(row.posted_by);
  const content = asObject(row.content);
  const engagement = asObject(row.engagement);
  const context = asObject(row.context);
  const text = row.text || content.full_text || content.text || '';
  const handle = postedBy.handle || row.author_handle || '';
  const name = postedBy.display_name || row.author_name || handle || 'Unknown';

  return serialize({
    id: String(row.id),
    store: 'catalog',
    complaint_code: row.complaint_code || `G-${row.id}`,
    tweet_id: row.external_id,
    platform: normalizePlatform(row.platform),
    tagged_account: row.tagged_account,
    grievance_source_id: String(row.account_id),
    posted_by: {
      handle,
      display_name: name,
      profile_image_url: postedBy.profile_image_url || null,
      is_verified: Boolean(postedBy.is_verified),
      follower_count: postedBy.follower_count || 0,
    },
    content: {
      text,
      full_text: content.full_text || text,
      media: Array.isArray(content.media) ? content.media : [],
    },
    content_text: text,
    engagement,
    context,
    tweet_url: row.content_url || null,
    url: row.content_url || null,
    post_date: row.posted_at,
    detected_date: row.detected_at,
    workflow_status: row.workflow_status || 'received',
    classification: row.classification || 'unclassified',
    grievance_workflow: asObject(context.grievance_workflow),
    suggestion: asObject(context.suggestion),
    criticism: asObject(context.criticism),
    query_workflow: asObject(context.query_workflow),
    is_active: row.is_active !== false,
    escalation_count: 0,
    can_convert_to_fir: false,
    complainant: { name, handle, phone: '' },
    source_summary: {
      grievance_source_id: String(row.account_id),
      tagged_account: row.tagged_account,
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
};

const buildWhere = (query = {}) => {
  const where = { is_active: true };
  const platform = normalizePlatform(query.platform, 'all');
  if (platform && platform !== 'all') where.platform = platform;

  const handle = String(query.handle || query.tagged_account || '')
    .replace(/^@/, '')
    .trim()
    .toLowerCase();
  if (handle) {
    where.tagged_account = { contains: handle, mode: 'insensitive' };
  }

  if (query.source_id && query.source_id !== 'all') {
    const accountId = Number(query.source_id);
    if (Number.isInteger(accountId)) where.account_id = accountId;
  }

  const status = String(query.status_filter || query.tab || '')
    .trim()
    .toLowerCase();
  if (status === 'criticism' || status === 'suggestion') {
    return { __empty: true };
  }
  if (status && status !== 'all' && status !== 'total' && status !== 'reports') {
    if (status === 'fir') where.workflow_status = 'converted_to_fir';
    else if (status === 'pending') where.workflow_status = { in: ['pending', 'PENDING', 'received'] };
    else if (status === 'escalated') where.workflow_status = { in: ['escalated', 'ESCALATED'] };
    else if (status === 'closed') where.workflow_status = { in: ['closed', 'CLOSED'] };
  }

  if (query.from || query.to) {
    where.posted_at = {};
    if (query.from) {
      const d = new Date(query.from);
      if (!Number.isNaN(d.getTime())) where.posted_at.gte = d;
    }
    if (query.to) {
      const d = new Date(query.to);
      if (!Number.isNaN(d.getTime())) where.posted_at.lte = d;
    }
  }

  const search = String(query.search || '').trim();
  if (search) {
    where.OR = [
      { text: { contains: search, mode: 'insensitive' } },
      { author_handle: { contains: search, mode: 'insensitive' } },
      { author_name: { contains: search, mode: 'insensitive' } },
      { complaint_code: { contains: search, mode: 'insensitive' } },
      { tagged_account: { contains: search, mode: 'insensitive' } },
    ];
  }

  return where;
};

const listCatalogGrievances = async (query = {}) => {
  const limit = Math.min(Math.max(Number(query.limit) || 30, 1), 100);
  const where = buildWhere(query);
  if (where.__empty) {
    return {
      grievances: [],
      pagination: { page: 1, limit, total: 0, pages: 0, hasMore: false, nextCursor: null },
    };
  }

  const rows = await prisma.social_media_grievances.findMany({
    where,
    orderBy: [{ posted_at: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const total = await prisma.social_media_grievances.count({ where });

  return {
    grievances: pageRows.map(hydrateCatalogGrievance),
    pagination: {
      page: Number(query.page) || 1,
      limit,
      total,
      pages: Math.ceil(total / limit),
      hasMore,
      nextCursor: null,
    },
  };
};

const getCatalogGrievance = async (id) => {
  const rowId = BigInt(id);
  const row = await prisma.social_media_grievances.findFirst({
    where: { id: rowId, is_active: true },
  });
  return row ? hydrateCatalogGrievance(row) : null;
};

const getCatalogStats = async (query = {}) => {
  const base = buildWhere({ ...query, tab: 'all', status_filter: undefined });
  const [total, received, escalated, closed, fir] = await Promise.all([
    prisma.social_media_grievances.count({ where: base }),
    prisma.social_media_grievances.count({
      where: { ...base, workflow_status: { in: ['received', 'pending', 'PENDING'] } },
    }),
    prisma.social_media_grievances.count({
      where: { ...base, workflow_status: { in: ['escalated', 'ESCALATED'] } },
    }),
    prisma.social_media_grievances.count({
      where: { ...base, workflow_status: { in: ['closed', 'CLOSED'] } },
    }),
    prisma.social_media_grievances.count({
      where: { ...base, workflow_status: 'converted_to_fir' },
    }),
  ]);

  return {
    total,
    pending: received,
    escalated,
    closed,
    converted_to_fir: fir,
    by_platform: {},
  };
};

const createGrievanceIfNew = async ({
  accountId,
  platform,
  externalId,
  taggedAccount,
  postedBy,
  content,
  engagement = {},
  context = {},
  contentUrl = null,
  text = '',
  postedAt = null,
}) => {
  if (!externalId) return { created: false };

  const existing = await prisma.social_media_grievances.findUnique({
    where: { platform_external_id: { platform, external_id: externalId } },
  });
  if (existing) return { created: false };

  const row = await prisma.social_media_grievances.create({
    data: {
      account_id: accountId,
      platform,
      external_id: externalId,
      tagged_account: taggedAccount,
      workflow_status: 'received',
      classification: 'unclassified',
      author_name: postedBy.display_name || null,
      author_handle: postedBy.handle || null,
      content_url: contentUrl,
      text: text || content.full_text || content.text || '',
      posted_by: postedBy,
      content,
      engagement,
      context,
      posted_at: postedAt || new Date(),
      detected_at: new Date(),
    },
  });

  await prisma.social_media_grievances.update({
    where: { id: row.id },
    data: { complaint_code: `G-${row.id}` },
  });

  return { created: true };
};

const upsertMentionRow = async ({ account, taggedHandle, mention }) =>
  createGrievanceIfNew({
    accountId: account.id,
    platform: 'x',
    externalId: String(mention.tweet_id || '').trim(),
    taggedAccount: taggedHandle,
    postedBy: {
      handle: mention.author?.handle || '',
      display_name: mention.author?.display_name || mention.author?.handle || 'Unknown',
      profile_image_url: mention.author?.profile_image_url || null,
      is_verified: Boolean(mention.author?.is_verified),
      follower_count: mention.author?.follower_count || 0,
    },
    content: {
      text: mention.text || '',
      full_text: mention.text || '',
      media: Array.isArray(mention.media) ? mention.media : [],
    },
    engagement: mention.engagement || {},
    context: mention.context || {},
    contentUrl: mention.url || null,
    text: mention.text || '',
    postedAt: mention.created_at ? new Date(mention.created_at) : new Date(),
  });

const fetchFacebookComments = async (postId) => {
  try {
    const response = await callFacebookApi('POST_COMMENTS', { post_id: String(postId) });
    return Array.isArray(response?.results) ? response.results : [];
  } catch (err) {
    logger.error(`[CatalogGrievances] POST_COMMENTS failed for ${postId}: ${err.message}`);
    return [];
  }
};

const fetchInstagramComments = async (postUrl) => {
  const url = String(postUrl || '').trim();
  if (!url) return [];
  try {
    const response = await callInstagramApi('COMMENTS', { url });
    const raw = unwrapPayload(response);
    if (Array.isArray(raw?.comments)) return raw.comments;
    if (Array.isArray(raw)) return raw;
    return [];
  } catch (err) {
    logger.error(`[CatalogGrievances] IG COMMENTS failed for ${url}: ${err.message}`);
    return [];
  }
};

const fetchCatalogFacebookGrievances = async (account, startDate, endDate) => {
  const taggedHandle = String(account.handle || '').trim();
  const displayName = account.profile?.display_name || taggedHandle;

  logger.info(`[CatalogGrievances] Fetching Facebook posts/comments for ${taggedHandle}`);

  const accountForFetch = {
    id: account.id,
    data: asObject(account.data),
  };
  if (!accountForFetch.data.url && !accountForFetch.data.page_id) {
    if (/^https?:\/\//i.test(taggedHandle)) {
      accountForFetch.data.url = taggedHandle;
    }
  }

  const { posts, dataPatch } = await fetchFacebookPosts(accountForFetch);
  if (dataPatch) {
    await prisma.social_media_accounts.update({
      where: { id: account.id },
      data: { data: { ...accountForFetch.data, ...dataPatch } },
    });
  }

  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  const inRange = (date) => {
    if (!date) return true;
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return true;
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  };

  let newCount = 0;
  let total = 0;
  const postsToScan = posts.slice(0, 20);

  for (const post of postsToScan) {
    const postId = String(post.external_id || '').trim();
    if (!postId) continue;
    if (!inRange(post.posted_at)) continue;

    total += 1;
    const canonicalPostId = `facebook:post:${postId}`;
    const postUrl = post.url || `https://facebook.com/${postId}`;
    const postText = String(post.text || '').trim() || '[Facebook post without text]';
    const postAuthorName = post.author_name || displayName;
    const postAuthorHandle = post.author_handle || taggedHandle;

    const postResult = await createGrievanceIfNew({
      accountId: account.id,
      platform: 'facebook',
      externalId: canonicalPostId,
      taggedAccount: taggedHandle,
      postedBy: {
        handle: postAuthorHandle,
        display_name: postAuthorName,
        profile_image_url: null,
        is_verified: false,
        follower_count: 0,
      },
      content: { text: postText, full_text: postText, media: [] },
      engagement: {
        likes: post.engagement?.reactions || 0,
        replies: post.engagement?.comments || 0,
        retweets: post.engagement?.shares || 0,
        views: 0,
        quotes: 0,
      },
      contentUrl: postUrl,
      text: postText,
      postedAt: post.posted_at || new Date(),
    });
    if (postResult.created) newCount += 1;

    const comments = await fetchFacebookComments(postId);
    for (const comment of comments.slice(0, 50)) {
      const commentId = String(comment.comment_id || comment.legacy_comment_id || '').trim();
      if (!commentId) continue;

      const commentDate =
        comment.created_time != null && Number.isFinite(Number(comment.created_time))
          ? new Date(Number(comment.created_time) * 1000)
          : post.posted_at;
      if (!inRange(commentDate)) continue;

      total += 1;
      const commentText = String(comment.message || '').trim() || '[Facebook comment without text]';
      const commentUrl = postUrl.includes('?')
        ? `${postUrl}&comment_id=${encodeURIComponent(commentId)}`
        : `${postUrl}?comment_id=${encodeURIComponent(commentId)}`;

      const commentResult = await createGrievanceIfNew({
        accountId: account.id,
        platform: 'facebook',
        externalId: `facebook:comment:${commentId}`,
        taggedAccount: taggedHandle,
        postedBy: {
          handle: comment.author?.url || comment.author?.id || '',
          display_name: comment.author?.name || 'Facebook User',
          profile_image_url: comment.author?.profile_picture_url || null,
          is_verified: false,
          follower_count: 0,
        },
        content: { text: commentText, full_text: commentText, media: [] },
        engagement: {},
        context: {
          in_reply_to: {
            tweet_id: canonicalPostId,
            tweet_url: postUrl,
            posted_by: {
              handle: postAuthorHandle,
              display_name: postAuthorName,
            },
            content: { text: postText, full_text: postText, media: [] },
          },
        },
        contentUrl: commentUrl,
        text: commentText,
        postedAt: commentDate || new Date(),
      });
      if (commentResult.created) newCount += 1;
    }
  }

  await prisma.social_media_accounts.update({
    where: { id: account.id },
    data: { last_fetched_at: new Date() },
  });

  return {
    newGrievances: newCount,
    total,
    source: {
      id: String(account.id),
      handle: taggedHandle,
      display_name: displayName,
      platform: 'facebook',
      avatar: pickAvatar(account.preview_data),
      store: 'catalog',
    },
  };
};

const fetchCatalogInstagramGrievances = async (account, startDate, endDate) => {
  const taggedHandle = String(account.handle || '')
    .replace(/^@/, '')
    .trim();
  const displayName = account.profile?.display_name || taggedHandle;

  logger.info(`[CatalogGrievances] Fetching Instagram posts/comments for @${taggedHandle}`);

  const accountForFetch = {
    id: account.id,
    handle: taggedHandle,
    data: asObject(account.data),
  };

  const { posts, dataPatch } = await fetchInstagramPosts(accountForFetch);
  if (dataPatch) {
    await prisma.social_media_accounts.update({
      where: { id: account.id },
      data: { data: { ...accountForFetch.data, ...dataPatch } },
    });
  }

  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  const inRange = (date) => {
    if (!date) return true;
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return true;
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  };

  let newCount = 0;
  let total = 0;
  const postsToScan = posts.slice(0, 20);

  for (const post of postsToScan) {
    const postId = String(post.external_id || '').trim();
    if (!postId) continue;
    if (!inRange(post.posted_at)) continue;

    total += 1;
    const canonicalPostId = `instagram:post:${postId}`;
    const postUrl = post.url || `https://www.instagram.com/p/${postId}/`;
    const postText = String(post.text || '').trim() || '[Instagram post without text]';
    const postAuthorName = post.author_name || displayName;
    const postAuthorHandle = post.author_handle || taggedHandle;

    const postResult = await createGrievanceIfNew({
      accountId: account.id,
      platform: 'instagram',
      externalId: canonicalPostId,
      taggedAccount: taggedHandle,
      postedBy: {
        handle: postAuthorHandle,
        display_name: postAuthorName,
        profile_image_url: null,
        is_verified: false,
        follower_count: 0,
      },
      content: { text: postText, full_text: postText, media: [] },
      engagement: {
        likes: post.engagement?.likes || 0,
        replies: post.engagement?.comments || 0,
        retweets: 0,
        views: post.engagement?.views || 0,
        quotes: 0,
      },
      contentUrl: postUrl,
      text: postText,
      postedAt: post.posted_at || new Date(),
    });
    if (postResult.created) newCount += 1;

    const comments = await fetchInstagramComments(postUrl);
    for (const comment of comments.slice(0, 50)) {
      const commentId = String(comment.pk || comment.id || comment.strong_id__ || '').trim();
      if (!commentId) continue;

      const createdRaw = comment.created_at || comment.created_at_utc;
      const commentDate =
        createdRaw != null && Number.isFinite(Number(createdRaw))
          ? new Date(Number(createdRaw) > 1e12 ? Number(createdRaw) : Number(createdRaw) * 1000)
          : post.posted_at;
      if (!inRange(commentDate)) continue;

      total += 1;
      const commentText = String(comment.text || '').trim() || '[Instagram comment without text]';
      const user = comment.user || {};
      const commentUrl = `${postUrl.replace(/\/$/, '')}/c/${encodeURIComponent(commentId)}/`;

      const commentResult = await createGrievanceIfNew({
        accountId: account.id,
        platform: 'instagram',
        externalId: `instagram:comment:${commentId}`,
        taggedAccount: taggedHandle,
        postedBy: {
          handle: user.username || user.pk || '',
          display_name: user.full_name || user.username || 'Instagram User',
          profile_image_url: user.profile_pic_url || null,
          is_verified: Boolean(user.is_verified),
          follower_count: 0,
        },
        content: { text: commentText, full_text: commentText, media: [] },
        engagement: {
          likes: comment.comment_like_count || 0,
        },
        context: {
          in_reply_to: {
            tweet_id: canonicalPostId,
            tweet_url: postUrl,
            posted_by: {
              handle: postAuthorHandle,
              display_name: postAuthorName,
            },
            content: { text: postText, full_text: postText, media: [] },
          },
        },
        contentUrl: commentUrl,
        text: commentText,
        postedAt: commentDate || new Date(),
      });
      if (commentResult.created) newCount += 1;
    }
  }

  await prisma.social_media_accounts.update({
    where: { id: account.id },
    data: { last_fetched_at: new Date() },
  });

  return {
    newGrievances: newCount,
    total,
    source: {
      id: String(account.id),
      handle: taggedHandle,
      display_name: displayName,
      platform: 'instagram',
      avatar: pickAvatar(account.preview_data),
      store: 'catalog',
    },
  };
};

const fetchCatalogTelegramGrievances = async (account, startDate, endDate) => {
  const data = asObject(account.data);
  const taggedHandle =
    cleanTelegramUsername(data.username || data.handle || account.handle) ||
    String(account.handle || '').trim();
  const displayName = account.profile?.display_name || taggedHandle || 'Telegram';

  logger.info(`[CatalogGrievances] Fetching Telegram channel posts for ${taggedHandle || account.id}`);

  const accountForFetch = {
    id: account.id,
    handle: taggedHandle,
    data,
  };

  const { posts, dataPatch } = await fetchTelegramPosts(accountForFetch);
  if (dataPatch) {
    await prisma.social_media_accounts.update({
      where: { id: account.id },
      data: { data: { ...data, ...dataPatch } },
    });
  }

  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  const inRange = (date) => {
    if (!date) return true;
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return true;
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  };

  let newCount = 0;
  let total = 0;
  const postsToScan = posts.slice(0, 50);

  for (const post of postsToScan) {
    const postId = String(post.external_id || '').trim();
    if (!postId) continue;
    if (!inRange(post.posted_at)) continue;

    total += 1;
    const canonicalPostId = `telegram:msg:${postId}`;
    const postUrl =
      post.url ||
      (taggedHandle ? `https://t.me/${taggedHandle}/${postId}` : null);

    const mediaItems = Array.isArray(post.media_items) && post.media_items.length
      ? post.media_items
      : Array.isArray(post.media_urls)
        ? post.media_urls.map((url) => ({ type: 'photo', url }))
        : [];
    const hasMedia = mediaItems.length > 0;
    const mediaLabel = hasMedia
      ? mediaItems.some((m) => String(m.type || '').includes('video'))
        ? '[Telegram video]'
        : '[Telegram photo]'
      : '[Telegram post without text]';
    const postText = String(post.text || '').trim() || mediaLabel;

    const payload = {
      accountId: account.id,
      platform: 'telegram',
      externalId: canonicalPostId,
      taggedAccount: taggedHandle,
      postedBy: {
        handle: post.author_handle || taggedHandle,
        display_name: post.author_name || displayName,
        profile_image_url: pickAvatar(account.preview_data),
        is_verified: false,
        follower_count: 0,
      },
      content: { text: postText, full_text: postText, media: mediaItems },
      engagement: {
        likes: 0,
        replies: post.engagement?.replies || 0,
        retweets: post.engagement?.forwards || 0,
        views: post.engagement?.views || 0,
        quotes: 0,
        forwards: post.engagement?.forwards || 0,
      },
      contentUrl: postUrl,
      text: postText,
      postedAt: post.posted_at || new Date(),
    };

    const existing = await prisma.social_media_grievances.findUnique({
      where: { platform_external_id: { platform: 'telegram', external_id: canonicalPostId } },
    });
    if (existing) {
      const stalePlaceholder =
        !existing.text ||
        existing.text === '[Telegram post without text]' ||
        String(existing.text).startsWith('[Telegram ');
      const betterText = postText && !postText.startsWith('[Telegram ');
      if (stalePlaceholder || betterText || hasMedia) {
        await prisma.social_media_grievances.update({
          where: { id: existing.id },
          data: {
            text: betterText || stalePlaceholder ? postText : existing.text,
            content: payload.content,
            engagement: payload.engagement,
            content_url: postUrl || existing.content_url,
            author_name: payload.postedBy.display_name,
            author_handle: payload.postedBy.handle,
            posted_by: payload.postedBy,
          },
        });
      }
      continue;
    }

    const postResult = await createGrievanceIfNew(payload);
    if (postResult.created) newCount += 1;
  }

  await prisma.social_media_accounts.update({
    where: { id: account.id },
    data: { last_fetched_at: new Date() },
  });

  return {
    newGrievances: newCount,
    total,
    source: {
      id: String(account.id),
      handle: taggedHandle,
      display_name: displayName,
      platform: 'telegram',
      avatar: pickAvatar(account.preview_data),
      store: 'catalog',
    },
  };
};

const fetchCatalogXGrievances = async (account, startDate, endDate) => {
  const clean = String(account.handle || '')
    .replace(/^@/, '')
    .trim();
  const taggedHandle = `@${clean}`;

  logger.info(`[CatalogGrievances] Searching mentions for ${taggedHandle}`);
  const mentions = await searchMentions(taggedHandle, 100, startDate, endDate);

  let newCount = 0;
  for (const mention of mentions) {
    try {
      const result = await upsertMentionRow({ account, taggedHandle, mention });
      if (result.created) newCount += 1;
    } catch (err) {
      logger.error(
        `[CatalogGrievances] upsert failed for ${mention?.tweet_id}: ${err.message}`
      );
    }
  }

  await prisma.social_media_accounts.update({
    where: { id: account.id },
    data: { last_fetched_at: new Date() },
  });

  return {
    newGrievances: newCount,
    total: mentions.length,
    source: {
      id: String(account.id),
      handle: taggedHandle,
      display_name: account.profile?.display_name || clean,
      platform: 'x',
      avatar: pickAvatar(account.preview_data),
      store: 'catalog',
    },
  };
};

const fetchCatalogAccountGrievances = async (account, startDate, endDate) => {
  const platform = normalizePlatform(account.platforms?.slug, 'x');
  if (platform === 'facebook') {
    return fetchCatalogFacebookGrievances(account, startDate, endDate);
  }
  if (platform === 'instagram') {
    return fetchCatalogInstagramGrievances(account, startDate, endDate);
  }
  if (platform === 'x') {
    return fetchCatalogXGrievances(account, startDate, endDate);
  }
  if (platform === 'telegram') {
    return fetchCatalogTelegramGrievances(account, startDate, endDate);
  }
  const err = new Error(`Catalog grievance fetch does not support platform: ${platform}`);
  err.status = 400;
  throw err;
};

const fetchAllCatalogGrievances = async (startDate, endDate) => {
  const accounts = await prisma.social_media_accounts.findMany({
    where: {
      is_active: true,
      platforms: { slug: { in: ['x', 'facebook', 'instagram', 'telegram'] } },
    },
    include: {
      profile: { select: { display_name: true } },
      platforms: { select: { slug: true } },
    },
  });

  let newGrievances = 0;
  let total = 0;
  for (const account of accounts) {
    try {
      const result = await fetchCatalogAccountGrievances(account, startDate, endDate);
      newGrievances += result.newGrievances || 0;
      total += result.total || 0;
    } catch (err) {
      logger.error(
        `[CatalogGrievances] fetch-all failed for ${account.handle}: ${err.message}`
      );
    }
  }

  return { newGrievances, total };
};

module.exports = {
  listCatalogGrievances,
  getCatalogGrievance,
  getCatalogStats,
  fetchCatalogAccountGrievances,
  fetchAllCatalogGrievances,
  hydrateCatalogGrievance,
};
