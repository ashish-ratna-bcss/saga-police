const dbOf = require('../../lib/dbOf');
const {
  fetchCatalogAccountGrievances,
  fetchAllCatalogGrievances,
} = require('./grievance.service');
const { normalizePlatform, pickAvatar } = require('./grievance.utils');
const { resolvePagePlatformSlugs } = require('../../lib/pagePlatforms');
const logger = require('../../lib/logger');

/** DB may store X as slug `x` or `twitter` — query both. */
const platformSlugsForQuery = async (prisma, canonicalOrAll) => {
  const active = await resolvePagePlatformSlugs(prisma, 'grievances', {
    includeTwitterAlias: true,
  });
  if (!canonicalOrAll || canonicalOrAll === 'all') {
    return active;
  }
  const p = normalizePlatform(canonicalOrAll, canonicalOrAll);
  if (p === 'x') {
    return active.filter((s) => s === 'x' || s === 'twitter');
  }
  return active.includes(p) ? [p] : [];
};

const shapeCatalogAccount = (account, grievanceCount = 0) => {
  const platform = normalizePlatform(account.platforms?.slug, 'x');
  const handleRaw = String(account.handle || '').trim();
  const handle =
    platform === 'x'
      ? handleRaw.startsWith('@')
        ? handleRaw
        : `@${handleRaw.replace(/^@/, '')}`
      : handleRaw;

  return {
    id: String(account.id),
    catalog_account_id: account.id,
    handle,
    display_name: account.profile?.display_name || handleRaw,
    profile_image_url: pickAvatar(account.preview_data),
    platform,
    is_active: Boolean(account.is_active),
    department: 'Government',
    total_grievances: grievanceCount,
    last_fetched: account.last_fetched_at || null,
    created_at: account.created_at,
    updated_at: account.updated_at,
    store: 'catalog',
  };
};

const listCatalogSources = async (platformFilter = 'all', { db } = {}) => {
  const prisma = dbOf(db);
  const platform = normalizePlatform(platformFilter, 'all');
  const platformSlugs = await platformSlugsForQuery(prisma, platform);
  if (!platformSlugs.length) return [];

  const accounts = await prisma.social_media_accounts.findMany({
    where: {
      is_active: true,
      type: 'grievance',
      platforms: { slug: { in: platformSlugs } },
    },
    include: {
      profile: { select: { display_name: true } },
      platforms: { select: { slug: true } },
      _count: { select: { grievances: true } },
    },
    orderBy: { updated_at: 'desc' },
  });

  return accounts.map((a) => shapeCatalogAccount(a, a._count?.grievances || 0));
};

const getCatalogAccount = async (id, { db } = {}) => {
  const prisma = dbOf(db);
  const accountId = Number(id);
  if (!Number.isInteger(accountId)) return null;

  const platformSlugs = await platformSlugsForQuery(prisma, 'all');
  if (!platformSlugs.length) return null;

  return prisma.social_media_accounts.findFirst({
    where: {
      id: accountId,
      is_active: true,
      type: 'grievance',
      platforms: { slug: { in: platformSlugs } },
    },
    include: {
      profile: { select: { display_name: true } },
      platforms: { select: { slug: true, api_key: true, blugate_client_key: true } },
    },
  });
};

const fetchCatalogSourceGrievances = async (catalogAccountId, startDate, endDate, { db } = {}) => {
  const account = await getCatalogAccount(catalogAccountId, { db });
  if (!account) {
    const err = new Error('Catalog source not found');
    err.status = 404;
    throw err;
  }

  return fetchCatalogAccountGrievances(account, startDate, endDate, { db });
};

const fetchAllSources = async (startDate, endDate, { db } = {}) => {
  try {
    return await fetchAllCatalogGrievances(startDate, endDate, { db });
  } catch (error) {
    logger.error('[CatalogGrievances] fetchAllSources failed:', error.message);
    throw error;
  }
};

module.exports = {
  listCatalogSources,
  getCatalogAccount,
  fetchCatalogSourceGrievances,
  fetchAllSources,
  shapeCatalogAccount,
};
