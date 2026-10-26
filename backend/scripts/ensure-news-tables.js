/**
 * Create the Tools → News tables (news_articles, news_searches, news_search_articles)
 * on the application database.
 *
 * The News module also creates them on first use, so this is only needed to provision
 * them up front. Idempotent (CREATE TABLE IF NOT EXISTS) — safe to re-run.
 *
 * Usage:
 *   node scripts/ensure-news-tables.js           # dry run
 *   node scripts/ensure-news-tables.js --apply   # create them
 */
require('dotenv').config();
const mainPrisma = require('../prisma/client');
const { ensureNewsTables } = require('../src/modules/news/news.store.service');

const TOOLS_PAGE = '/analysis-tools';

const normalizePath = (value) => {
  if (!value || typeof value !== 'string') return '/';
  const path = value.replace(/\/+$/, '') || '/';
  return path.startsWith('/') ? path : `/${path}`;
};
const hasToolsAccess = (user) => {
  const allowed = (user.allowed_pages || []).map(normalizePath);
  return allowed.includes(TOOLS_PAGE) || allowed.some((p) => TOOLS_PAGE.startsWith(`${p}/`));
};

(async () => {
  const apply = process.argv.includes('--apply');
  const users = await mainPrisma.users.findMany({
    select: { username: true, allowed_pages: true, roles: { select: { slug: true } } },
  });
  const withAccess = users.filter(hasToolsAccess).map((user) => user.username);

  console.log(
    `${withAccess.length} user(s) with ${TOOLS_PAGE} access${apply ? '' : ' (dry run — pass --apply to create tables)'}: ${withAccess.join(', ') || '(none)'}`
  );
  if (!apply) return;

  try {
    await ensureNewsTables(mainPrisma);
    console.log('news tables ready');
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
})()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mainPrisma.$disconnect());
