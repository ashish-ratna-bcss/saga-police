/**
 * Tools → Profile Report: collect a profile's whole post history.
 *
 * Fetch on an account queues it (status 'pending'). Any API process picks queued accounts up (claimed in the
 * database, so only one works on an account at a time), walks the platform's timeline page by page, and stores
 * every page as it arrives together with the cursor, so a restart or a crash continues from the last saved page.
 * There is no cap on the number of posts; the loop ends when the platform has no older posts. Safety stops:
 * an empty page, a cursor that repeats, several pages with nothing new, or an absurd page count.
 *
 * Each page is one BluGate call on the tenant's own platform key, spaced by the same per-platform gap monitoring uses.
 */
const logger = require('../../lib/logger');
const { authForPlatform } = require('../../services/blugate/authForPlatform');
const { fetchXPostsPage } = require('../../services/monitoringsocialmedia/x/fetch');
const { fetchFacebookPostsPage } = require('../../services/monitoringsocialmedia/facebook/fetch');
const { fetchInstagramPostsPage } = require('../../services/monitoringsocialmedia/instagram/fetch');
const { fetchYouTubePostsPage } = require('../../services/monitoringsocialmedia/youtube/fetch');
const { fetchTelegramPostsPage } = require('../../services/monitoringsocialmedia/telegram/fetch');
const store = require('./profileReport.store');
const { json, encodeCursor, decodeCursor, kindOf } = require('./profileReport.util');

/** Platforms whose full history can be walked. Reddit only offers keyword search, not a user's timeline. */
const PAGERS = {
  x: fetchXPostsPage,
  twitter: fetchXPostsPage,
  facebook: fetchFacebookPostsPage,
  instagram: fetchInstagramPostsPage,
  youtube: fetchYouTubePostsPage,
  telegram: fetchTelegramPostsPage,
};
const SUPPORTED_PLATFORMS = ['x', 'facebook', 'instagram', 'youtube', 'telegram'];

const MAX_PAGES = Math.max(10, Number(process.env.PROFILE_REPORT_MAX_PAGES) || 5000);
const MAX_CONCURRENT = Math.max(1, Number(process.env.PROFILE_REPORT_FETCH_CONCURRENCY) || 2);
const STALE_CLAIM_MINUTES = 5;
const NOTHING_NEW_PAGES = 3;
const RETRY_PAUSES_MS = [5000, 15000, 45000];

const running = new Set(); // "<db>:<account id>" being collected by this process

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const statusOf = (err) => Number(err?.status || err?.response?.status) || 0;
const isRetryable = (err) => {
  const s = statusOf(err);
  if (s === 429 || s >= 500 || s === 0) return true;
  return /timeout|rate|too many|ECONNRESET|socket hang up/i.test(String(err?.message || ''));
};

/** What a person sees when a collection stops. Provider details stay in the server log. */
const plainFetchError = (err, collected) => {
  const s = statusOf(err);
  const got = collected > 0 ? ` ${collected.toLocaleString('en-IN')} posts were saved; Retry continues from there.` : '';
  if (s === 404) return 'The account was not found on the platform. Check the handle and fetch it again.';
  if (s === 401 || s === 403) return `The platform did not accept the request. Check this platform's key in Settings.${got}`;
  if (s === 429 || /rate|too many/i.test(String(err?.message || ''))) return `The platform kept limiting requests.${got || ' Try again in a few minutes.'}`;
  return `The platform stopped returning posts.${got || ' Try again in a moment.'}`;
};

const claimAccounts = (prisma, limit) =>
  store.q(
    prisma,
    `UPDATE profile_report_accounts
        SET fetch_status = 'running', claimed_at = NOW(), started_at = COALESCE(started_at, NOW()), updated_at = NOW()
      WHERE id IN (
        SELECT id FROM profile_report_accounts
         WHERE fetch_status = 'pending'
            OR (fetch_status = 'running' AND claimed_at < NOW() - INTERVAL '${STALE_CLAIM_MINUTES} minutes')
         ORDER BY id LIMIT $1
         FOR UPDATE SKIP LOCKED)
      RETURNING id, subject_id, platform, handle, data, preview_data, fetch_cursor, fetch_mode, fetch_pages, posts_fetched`,
    limit
  );

/** Save one page's progress. Returns false when the account is gone or no longer running (deleted, cancelled). */
const saveProgress = async (prisma, id, { cursor, inserted, dataPatch }) => {
  const rows = await store.q(
    prisma,
    `UPDATE profile_report_accounts
        SET fetch_cursor = $2, fetch_pages = fetch_pages + 1, posts_fetched = posts_fetched + $3,
            data = COALESCE($4::jsonb, data), claimed_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND fetch_status = 'running' RETURNING id`,
    id, encodeCursor(cursor), inserted, dataPatch ? json(dataPatch, {}) : null
  );
  return rows.length > 0;
};

const finish = (prisma, id) =>
  store.exec(
    prisma,
    `UPDATE profile_report_accounts
        SET fetch_status = 'done', fetch_cursor = NULL, fetch_error = NULL, finished_at = NOW(), last_fetched_at = NOW(), claimed_at = NULL, updated_at = NOW()
      WHERE id = $1 AND fetch_status = 'running'`,
    id
  );

const fail = (prisma, id, message) =>
  store.exec(
    prisma,
    `UPDATE profile_report_accounts SET fetch_status = 'failed', fetch_error = $2, claimed_at = NULL, updated_at = NOW()
      WHERE id = $1 AND fetch_status = 'running'`,
    id, message
  );

/** One page, with retries for rate limits and server errors. */
const fetchPageWithRetry = async (pager, account, cursor, auth) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await pager(account, { cursor, auth });
    } catch (err) {
      if (!isRetryable(err) || attempt >= RETRY_PAUSES_MS.length) throw err;
      logger.warn(`[ProfileReport] page failed (${statusOf(err) || err.code || err.message}); retry ${attempt + 1} in ${RETRY_PAUSES_MS[attempt] / 1000}s`);
      await sleep(RETRY_PAUSES_MS[attempt]);
    }
  }
};

/**
 * Collect one claimed account to the end of its history (or, in refresh mode, up to the first page with nothing new).
 * @param {object} prisma tenant client
 * @param {object} row    claimed account row
 */
const collectAccount = async (prisma, dbName, row) => {
  const tag = `account=${row.id} ${row.platform}:${row.handle}`;
  const slug = String(row.platform || '').toLowerCase();
  const pager = PAGERS[slug];
  if (!pager) {
    await fail(prisma, row.id, 'Posts for this platform cannot be collected here.');
    return { ok: false };
  }

  let pages = 0;
  let collected = Number(row.posts_fetched) || 0;
  try {
    const platformRow = await prisma.platforms.findFirst({ where: { slug: slug === 'twitter' ? 'x' : slug } })
      || await prisma.platforms.findFirst({ where: { slug } });
    const auth = authForPlatform(platformRow, { tenantKey: dbName });
    const account = {
      id: row.id,
      handle: row.handle,
      data: row.data && typeof row.data === 'object' ? { ...row.data } : {},
      platforms: platformRow,
    };
    const refresh = row.fetch_mode === 'refresh';
    let cursor = decodeCursor(row.fetch_cursor);
    let nothingNew = 0;
    logger.info(`[ProfileReport] collecting ${tag} mode=${refresh ? 'refresh' : 'full'} resume=${cursor ? 'yes' : 'no'}`);

    for (;;) {
      const page = await fetchPageWithRetry(pager, account, cursor, auth);
      pages += 1;
      const { inserted } = await store.upsertPosts(
        prisma,
        { subjectId: row.subject_id, accountId: row.id, platform: slug === 'twitter' ? 'x' : slug },
        page.posts,
        kindOf
      );
      collected += inserted;
      if (page.dataPatch) account.data = page.dataPatch;
      cursor = page.next;

      const alive = await saveProgress(prisma, row.id, { cursor, inserted, dataPatch: page.dataPatch });
      if (!alive) {
        logger.info(`[ProfileReport] ${tag} stopped: removed or cancelled after ${pages} pages`);
        return { ok: false, stopped: true, pages };
      }

      nothingNew = inserted === 0 ? nothingNew + 1 : 0;
      const exhausted = !cursor || page.posts.length === 0;
      const caughtUp = refresh && inserted === 0;
      const looping = nothingNew >= NOTHING_NEW_PAGES;
      if (exhausted || caughtUp || looping || pages >= MAX_PAGES) {
        await finish(prisma, row.id);
        logger.info(`[ProfileReport] done ${tag} pages=${pages} posts=${collected} (${exhausted ? 'end of history' : caughtUp ? 'caught up' : looping ? 'nothing new' : 'page limit'})`);
        return { ok: true, pages, posts: collected };
      }
    }
  } catch (err) {
    // Cancel / delete while a page was being saved: the account (and with it the profile) is gone. Not an error.
    if (/foreign key constraint/i.test(String(err?.message || ''))) {
      logger.info(`[ProfileReport] ${tag} stopped: removed while collecting (${pages} pages)`);
      return { ok: false, stopped: true, pages };
    }
    logger.error(`[ProfileReport] ${tag} failed after ${pages} pages: ${err.message}`);
    await fail(prisma, row.id, plainFetchError(err, collected)).catch(() => {});
    return { ok: false, error: err.message, pages };
  }
};

/** Poller entry for one tenant: start collecting queued accounts, up to this process's limit. Returns how many started. */
const pollCollections = async (prisma, dbName) => {
  const room = MAX_CONCURRENT - running.size;
  if (room <= 0) return 0;
  const claimed = await claimAccounts(prisma, room);
  for (const row of claimed) {
    const key = `${dbName}:${row.id}`;
    running.add(key);
    collectAccount(prisma, dbName, row)
      .catch((err) => logger.error(`[ProfileReport] collect ${key}: ${err.message}`))
      .finally(() => running.delete(key));
  }
  return claimed.length;
};

module.exports = {
  SUPPORTED_PLATFORMS,
  PAGERS,
  collectAccount,
  pollCollections,
  plainFetchError,
  __test: { running, claimAccounts, MAX_PAGES },
};
