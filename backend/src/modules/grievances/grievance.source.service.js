const prisma = require('../../../prisma/client');
const {
  fetchCatalogAccountGrievances,
  fetchAllCatalogGrievances,
} = require('./grievance.service');
const { normalizePlatform, pickAvatar } = require('./grievance.utils');
const logger = require('../../utils/logger');

const GRIEVANCE_PLATFORMS = ['x', 'facebook'];

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

const listCatalogSources = async (platformFilter = 'all') => {
  const platform = normalizePlatform(platformFilter, 'all');
  const platformSlugs =
    platform && platform !== 'all' ? [platform] : GRIEVANCE_PLATFORMS;

  const accounts = await prisma.social_media_accounts.findMany({
    where: {
      is_active: true,
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

const getCatalogAccount = async (id) => {
  const accountId = Number(id);
  if (!Number.isInteger(accountId)) return null;

  return prisma.social_media_accounts.findFirst({
    where: {
      id: accountId,
      is_active: true,
      platforms: { slug: { in: GRIEVANCE_PLATFORMS } },
    },
    include: {
      profile: { select: { display_name: true } },
      platforms: { select: { slug: true } },
    },
  });
};

const fetchCatalogSourceGrievances = async (catalogAccountId, startDate, endDate) => {
  const account = await getCatalogAccount(catalogAccountId);
  if (!account) {
    const err = new Error('Catalog source not found');
    err.status = 404;
    throw err;
  }

  return fetchCatalogAccountGrievances(account, startDate, endDate);
};

const fetchAllSources = async (startDate, endDate) => {
  try {
    return await fetchAllCatalogGrievances(startDate, endDate);
  } catch (error) {
    logger.error('[CatalogGrievances] fetchAllSources failed:', error.message);
    throw error;
  }
};

module.exports = {
  GRIEVANCE_PLATFORMS,
  listCatalogSources,
  getCatalogAccount,
  fetchCatalogSourceGrievances,
  fetchAllSources,
  shapeCatalogAccount,
};
