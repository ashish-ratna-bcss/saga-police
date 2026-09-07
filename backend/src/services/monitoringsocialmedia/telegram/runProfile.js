const prisma = require('../../../../prisma/client');
const { upsertPost } = require('../upsertPost');
const { fetchTelegramPosts } = require('./fetch');

const HISTORY_CAP = 200;

const appendFetchHistory = (existing, entry) => {
  const list = Array.isArray(existing) ? existing : [];
  return [...list, entry].slice(-HISTORY_CAP);
};

const stillStarted = async (id) => {
  const row = await prisma.social_media_accounts.findUnique({
    where: { id },
    select: { monitoring_status: true },
  });
  return row?.monitoring_status === 'started';
};

const runTelegramProfile = async (accountId, opts = {}) => {
  const account = await prisma.social_media_accounts.findUnique({
    where: { id: accountId },
    include: { platforms: { select: { slug: true } } },
  });

  if (!account) return { ok: false, skipped: true, reason: 'not_found' };
  if (account.platforms?.slug !== 'telegram') {
    return { ok: false, skipped: true, reason: 'not_telegram' };
  }
  if (account.monitoring_status !== 'started') {
    return { ok: false, skipped: true, reason: 'stopped' };
  }

  if (!opts.force && account.last_fetched_at) {
    const intervalMs = Math.max(1, Number(account.poll_interval_minutes) || 30) * 60_000;
    const elapsed = Date.now() - new Date(account.last_fetched_at).getTime();
    if (elapsed < intervalMs) {
      return { ok: true, skipped: true, reason: 'not_due' };
    }
  }

  const at = new Date().toISOString();
  let apiHits = 0;
  let postsReturned = 0;
  let postsNew = 0;
  let postsUpdated = 0;

  try {
    if (!(await stillStarted(accountId))) {
      return { ok: false, skipped: true, reason: 'stopped' };
    }

    const { posts, apiHits: hits, dataPatch } = await fetchTelegramPosts(account);
    apiHits = hits;
    postsReturned = posts.length;

    if (!(await stillStarted(accountId))) {
      return { ok: false, skipped: true, reason: 'stopped_mid_fetch' };
    }

    for (const post of posts) {
      if (!(await stillStarted(accountId))) break;
      const result = await upsertPost(post);
      if (result.created) postsNew += 1;
      else postsUpdated += 1;
    }

    const historyEntry = {
      at,
      api_hits: apiHits,
      posts_returned: postsReturned,
      posts_new: postsNew,
      posts_updated: postsUpdated,
      ok: true,
      message: null,
    };

    const updateData = {
      last_fetched_at: new Date(at),
      last_fetched_history: appendFetchHistory(account.last_fetched_history, historyEntry),
    };
    if (dataPatch) updateData.data = dataPatch;

    await prisma.social_media_accounts.update({
      where: { id: accountId },
      data: updateData,
    });

    return { ok: true, apiHits, postsReturned, postsNew, postsUpdated };
  } catch (error) {
    const historyEntry = {
      at,
      api_hits: apiHits,
      posts_returned: postsReturned,
      posts_new: postsNew,
      posts_updated: postsUpdated,
      ok: false,
      message: error.message || 'fetch failed',
    };

    try {
      await prisma.social_media_accounts.update({
        where: { id: accountId },
        data: {
          last_fetched_history: appendFetchHistory(account.last_fetched_history, historyEntry),
        },
      });
    } catch (_) {}

    return { ok: false, error: error.message };
  }
};

module.exports = { runTelegramProfile };
