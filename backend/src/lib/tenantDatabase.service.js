const mainPrisma = require('../../prisma/client');
const { PrismaClient: TenantPrismaClient, createTenantPrisma } = require('../../prisma/tenantClient');
const { ensureOpsSchema } = require('../../prisma/ensureOpsSchema');
const { readApplicationDetails } = require('../modules/user/user.application');

// Map to cache tenant PrismaClient instances per dbName
const tenantPrismaPool = new Map();

// dbName -> { name, expiresAt }. Tenant display name rarely changes; avoids a
// main-DB round trip on every single post analyzed for the same tenant.
// ponytail: process-local TTL cache, no cross-process invalidation on rename —
// upgrade to event-based invalidation if a renamed tenant's stale name in the
// intelligence pipeline ever becomes an actual complaint.
const TENANT_NAME_CACHE_TTL_MS = 5 * 60 * 1000;
const tenantNameCache = new Map();

/**
 * Database name from a Postgres connection URL (pathname without leading /).
 */
function parseDatabaseNameFromUrl(connectionUrl) {
  if (!connectionUrl) return null;
  try {
    const urlObj = new URL(connectionUrl);
    const name = decodeURIComponent(urlObj.pathname.replace(/^\//, '').split('/')[0] || '');
    return name || null;
  } catch {
    const match = String(connectionUrl).match(/\/([a-zA-Z0-9_\-]+)(\?|$)/);
    return match ? match[1] : null;
  }
}

/**
 * Main registry database name from DATABASE_URL.
 */
function getMainDatabaseName() {
  return parseDatabaseNameFromUrl(process.env.DATABASE_URL);
}

/**
 * Constructs dynamic connection string for tenant database.
 */
function buildTenantConnectionString(dbName) {
  const mainUrl = process.env.DATABASE_URL;
  if (!mainUrl || !dbName) return mainUrl;

  try {
    const urlObj = new URL(mainUrl);
    urlObj.pathname = `/${dbName}`;
    return urlObj.toString();
  } catch (err) {
    return mainUrl.replace(/\/([a-zA-Z0-9_\-]+)(\?|$)/, `/${dbName}$2`);
  }
}

/**
 * Returns a tenant-schema PrismaClient for the given dbName.
 * null / "main" / main DATABASE_URL name → null (no ops DB; auth lives on main only).
 * Named tenant DBs → pooled TenantPrismaClient for that database.
 */
function getTenantPrisma(dbName) {
  const mainDbName = getMainDatabaseName();
  if (
    !dbName ||
    dbName === 'main' ||
    (mainDbName && dbName === mainDbName)
  ) {
    return null;
  }

  if (tenantPrismaPool.has(dbName)) {
    return tenantPrismaPool.get(dbName);
  }

  const tenantUrl = buildTenantConnectionString(dbName);
  const tenantClient = createTenantPrisma(tenantUrl);
  tenantPrismaPool.set(dbName, tenantClient);
  return tenantClient;
}

/**
 * Client used for CREATE DATABASE (raw SQL only). Prefers TENANT_PROVISION_DATABASE_URL.
 */
function getProvisionPrisma() {
  const provisionUrl = process.env.TENANT_PROVISION_DATABASE_URL;
  if (!provisionUrl) return mainPrisma;
  // Main client is enough for CREATE DATABASE; avoid pulling tenant models.
  const { PrismaClient } = require('@prisma/client');
  return new PrismaClient({
    datasources: {
      db: { url: provisionUrl },
    },
  });
}

/**
 * Postgres-safe slug fragment (lowercase, [a-z0-9_], no leading digits alone).
 */
function sanitizeDbFragment(value, fallback = 'tenant') {
  const raw = String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return raw || fallback;
}

/**
 * Tenant DB name: blurasaga_<username>_<blurasagatitle>_<id>
 * Truncated to Postgres NAMEDATALEN (63).
 */
function buildAdminDatabaseName({ id, username, blurasagatitle }) {
  const userPart = sanitizeDbFragment(username, 'user');
  const titlePart = sanitizeDbFragment(blurasagatitle, 'blurasaga');
  const idPart = String(Number(id) || 0);
  const prefix = 'blurasaga';
  // Reserve space for prefix + underscores + id
  const maxLen = 63;
  const fixedLen = prefix.length + 1 + 1 + 1 + idPart.length; // blurasaga_ _ _ <id>
  let budget = maxLen - fixedLen;
  if (budget < 4) budget = 4;

  let u = userPart.slice(0, Math.max(2, Math.floor(budget / 2)));
  let t = titlePart.slice(0, Math.max(2, budget - u.length));
  // If title ate less, give leftover to username
  if (u.length + t.length < budget) {
    u = userPart.slice(0, budget - t.length);
  }

  return `${prefix}_${u}_${t}_${idPart}`.replace(/_+/g, '_').slice(0, maxLen);
}

/**
 * Ensures physical Postgres tenant DB exists and has ops tables.
 * Name: blurasaga_<username>_<blurasagatitle>_<id>
 *
 * Requires CREATEDB on the DATABASE_URL role, or set TENANT_PROVISION_DATABASE_URL.
 *
 * @param {number|string} adminId
 * @param {{ username?: string, blurasagatitle?: string }} [meta]
 */
async function provisionAdminDatabase(adminId, meta = {}) {
  const dbName = buildAdminDatabaseName({
    id: adminId,
    username: meta.username,
    blurasagatitle: meta.blurasagatitle,
  });
  console.log(`[multi-tenant] Provisioning database "${dbName}"...`);

  const provisionPrisma = getProvisionPrisma();
  const shouldDisconnectProvision = provisionPrisma !== mainPrisma;

  try {
    const dbCheck = await provisionPrisma.$queryRawUnsafe(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      dbName
    );

    if (dbCheck.length === 0) {
      console.log(`[multi-tenant] Creating database "${dbName}"...`);
      await provisionPrisma.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
    }

    const tenantPrisma = getTenantPrisma(dbName);
    await ensureTenantSchema(tenantPrisma);

    console.log(`[multi-tenant] Database "${dbName}" provisioned successfully!`);
    return dbName;
  } catch (error) {
    console.error(`[multi-tenant] Error provisioning database "${dbName}":`, error.message);
    throw error;
  } finally {
    if (shouldDisconnectProvision) {
      await provisionPrisma.$disconnect().catch(() => {});
    }
  }
}

async function ensureTenantSchema(prisma) {
  await ensureOpsSchema(prisma);
}

/**
 * Distinct tenant database names from users.db_name (main registry).
 */
async function listTenantDbNames() {
  const rows = await mainPrisma.users.findMany({
    where: { db_name: { not: null } },
    select: { db_name: true },
    distinct: ['db_name'],
  });
  return rows.map((r) => r.db_name).filter(Boolean);
}

/**
 * Tenant display name (e.g. "Tenant 1 Police") for a given tenant database.
 *
 * Authoritative source: application_details.title on the admin `users` row
 * that owns this dbName (the same field the login branding UI already
 * reads — see user.application.js / branding.routes.js). Only the admin row
 * has `port` set (child users inherit branding but not a port), so filtering
 * on `port: { not: null }` picks the tenant's own admin row deterministically
 * instead of an arbitrary child user row.
 *
 * Resolved server-side from `dbName` only — never accept this as caller
 * input. This is what makes it safe to forward to the shared Sentiment API
 * as `tenant_name` without risking cross-tenant leakage.
 *
 * @param {string|null} dbName
 * @returns {Promise<string|null>}
 */
async function resolveTenantName(dbName) {
  if (!dbName) return null;

  const cached = tenantNameCache.get(dbName);
  if (cached && cached.expiresAt > Date.now()) return cached.name;

  const admin =
    (await mainPrisma.users.findFirst({
      where: { db_name: dbName, port: { not: null } },
      select: { application_details: true },
    })) ||
    (await mainPrisma.users.findFirst({
      where: { db_name: dbName },
      select: { application_details: true },
    }));

  const name = admin ? readApplicationDetails(admin).title || null : null;
  tenantNameCache.set(dbName, { name, expiresAt: Date.now() + TENANT_NAME_CACHE_TTL_MS });
  return name;
}

/**
 * Run fn(tenantPrisma, dbName) for each tenant; log and continue on failure.
 */
async function forEachTenant(fn) {
  const names = await listTenantDbNames();
  for (const dbName of names) {
    try {
      await fn(getTenantPrisma(dbName), dbName);
    } catch (err) {
      console.error(`[multi-tenant] tenant ${dbName} failed:`, err.message);
    }
  }
}

module.exports = {
  getTenantPrisma,
  provisionAdminDatabase,
  buildAdminDatabaseName,
  sanitizeDbFragment,
  buildTenantConnectionString,
  getMainDatabaseName,
  parseDatabaseNameFromUrl,
  ensureTenantSchema,
  listTenantDbNames,
  forEachTenant,
  resolveTenantName,
  TenantPrismaClient,
};
