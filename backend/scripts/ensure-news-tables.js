/**
 * Create the Tools → News tables (news_articles, news_searches, news_search_articles)
 * in every tenant DB that has at least one user with Analysis Tools access.
 *
 * The News module also creates them on first use, so this is only needed to provision
 * them up front. Idempotent (CREATE TABLE IF NOT EXISTS) — safe to re-run.
 *
 * Usage:
 *   node scripts/ensure-news-tables.js           # dry run: list tenants that would get the tables
 *   node scripts/ensure-news-tables.js --apply   # create them
 */
require('dotenv').config();
const mainPrisma = require('../prisma/client');
const { getTenantPrisma } = require('../src/lib/tenantDatabase.service');
const { ensureNewsTables } = require('../src/modules/news/news.store.service');

const TOOLS_PAGE = '/analysis-tools';

// Same rule as pageAllowed() in auth.middleware.js.
const normalizePath = (value) => {
  if (!value || typeof value !== 'string') return '/';
  const path = value.replace(/\/+$/, '') || '/';
  return path.startsWith('/') ? path : `/${path}`;
};
const hasToolsAccess = (user) => {
  if (user.roles?.slug === 'superadmin') return true;
  const allowed = (user.allowed_pages || []).map(normalizePath);
  return allowed.includes(TOOLS_PAGE) || allowed.some((p) => TOOLS_PAGE.startsWith(`${p}/`));
};

(async () => {
  const apply = process.argv.includes('--apply');
  const users = await mainPrisma.users.findMany({
    where: { db_name: { not: null } },
    select: { username: true, db_name: true, allowed_pages: true, roles: { select: { slug: true } } },
  });

  const tenants = new Map(); // db_name -> usernames with access
  for (const user of users) {
    if (!hasToolsAccess(user)) continue;
    if (!tenants.has(user.db_name)) tenants.set(user.db_name, []);
    tenants.get(user.db_name).push(user.username);
  }

  console.log(`${tenants.size} tenant DB(s) with ${TOOLS_PAGE} access${apply ? '' : ' (dry run — pass --apply to create tables)'}:`);
  let failed = 0;
  for (const [dbName, usernames] of tenants) {
    const label = `  ${dbName}  (users: ${usernames.join(', ')})`;
    if (!apply) {
      console.log(label);
      continue;
    }
    const tenantPrisma = getTenantPrisma(dbName);
    try {
      await ensureNewsTables(tenantPrisma);
      console.log(`${label}  ✓ tables ready`);
    } catch (err) {
      failed += 1;
      console.error(`${label}  ✗ ${err.message}`);
    } finally {
      await tenantPrisma?.$disconnect().catch(() => {});
    }
  }
  process.exitCode = failed ? 1 : 0;
})()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mainPrisma.$disconnect());
