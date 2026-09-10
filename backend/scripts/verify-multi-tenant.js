/**
 * Verify Database-per-Admin isolation.
 *
 * Usage (from backend/):
 *   node scripts/verify-multi-tenant.js
 *
 * Requires DATABASE_URL and a role that can CREATE DATABASE
 * (or TENANT_PROVISION_DATABASE_URL). Exits 0 on success.
 */
require('dotenv').config();

const jwt = require('jsonwebtoken');
const mainPrisma = require('../prisma/client');
const { createUserAccount } = require('../src/modules/user/user.service');
const { generateToken } = require('../src/modules/auth/auth.service');
const {
  getTenantPrisma,
  getMainDatabaseName,
  buildAdminDatabaseName,
} = require('../src/lib/tenantDatabase.service');
const { ROLE_SLUGS } = require('../src/modules/role/role.utils');

const stamp = Date.now();
const createdUserIds = [];
const createdDbNames = [];

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.isAssert = true;
    throw err;
  }
}

async function databaseExists(dbName) {
  const rows = await mainPrisma.$queryRawUnsafe(
    `SELECT 1 FROM pg_database WHERE datname = $1`,
    dbName
  );
  return rows.length > 0;
}

async function loadSuperadminActor() {
  const row = await mainPrisma.users.findFirst({
    where: { roles: { slug: ROLE_SLUGS.SUPERADMIN } },
    include: { roles: true },
  });
  assert(row, 'No superadmin user found — seed or create one first');
  return {
    id: row.id,
    role: row.roles.slug,
    can_manage_users: row.roles.can_manage_users,
    db_name: row.db_name,
  };
}

async function cleanup() {
  for (const dbName of createdDbNames) {
    try {
      const client = getTenantPrisma(dbName);
      if (client && client !== mainPrisma) {
        await client.$disconnect().catch(() => {});
      }
    } catch {
      /* ignore */
    }
  }
  for (const id of createdUserIds.slice().reverse()) {
    try {
      await mainPrisma.users.delete({ where: { id } }).catch(() => {});
    } catch {
      /* ignore */
    }
  }
  for (const dbName of createdDbNames) {
    try {
      await mainPrisma.$executeRawUnsafe(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        dbName
      ).catch(() => {});
      await mainPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}"`);
    } catch (err) {
      console.warn(`[verify-multi-tenant] could not drop ${dbName}:`, err.message);
    }
  }
}

async function main() {
  assert(process.env.DATABASE_URL, 'DATABASE_URL is required');
  console.log(`[verify-multi-tenant] main db=${getMainDatabaseName()}`);

  const superadmin = await loadSuperadminActor();

  const adminA = await createUserAccount(superadmin, {
    name: `Verify Admin A ${stamp}`,
    email: `verify_admin_a_${stamp}@example.com`,
    username: `verify_admin_a_${stamp}`,
    password: 'VerifyPass123!',
    role: ROLE_SLUGS.ADMIN,
  });
  createdUserIds.push(adminA.id);
  const expectedA = buildAdminDatabaseName({
    id: adminA.id,
    username: adminA.username,
    blurasagatitle: adminA.blurasagatitle || 'BLURA SAGA',
  });
  assert(adminA.db_name === expectedA, `admin A db_name expected ${expectedA}, got ${adminA.db_name}`);
  createdDbNames.push(adminA.db_name);

  const adminB = await createUserAccount(superadmin, {
    name: `Verify Admin B ${stamp}`,
    email: `verify_admin_b_${stamp}@example.com`,
    username: `verify_admin_b_${stamp}`,
    password: 'VerifyPass123!',
    role: ROLE_SLUGS.ADMIN,
  });
  createdUserIds.push(adminB.id);
  const expectedB = buildAdminDatabaseName({
    id: adminB.id,
    username: adminB.username,
    blurasagatitle: adminB.blurasagatitle || 'BLURA SAGA',
  });
  assert(adminB.db_name === expectedB, `admin B db_name expected ${expectedB}, got ${adminB.db_name}`);
  createdDbNames.push(adminB.db_name);

  assert(await databaseExists(adminA.db_name), `missing physical DB ${adminA.db_name}`);
  assert(await databaseExists(adminB.db_name), `missing physical DB ${adminB.db_name}`);
  console.log('[verify-multi-tenant] physical tenant DBs exist');

  const dbA = getTenantPrisma(adminA.db_name);
  const dbB = getTenantPrisma(adminB.db_name);
  assert(dbA !== mainPrisma && dbB !== mainPrisma, 'tenant clients must not be mainPrisma');
  assert(dbA !== dbB, 'admin A and B must use different Prisma clients');

  const markerName = `mt-verify-marker-${stamp}`;
  const eventA = await dbA.social_media_events.create({
    data: {
      name: markerName,
      description: 'multi-tenant isolation probe',
      created_by: 'verify-multi-tenant',
    },
  });

  const foundInB = await dbB.social_media_events.findFirst({
    where: { name: markerName },
  });
  assert(!foundInB, 'marker event from Admin A must not appear in Admin B DB');

  const foundInA = await dbA.social_media_events.findUnique({ where: { id: eventA.id } });
  assert(foundInA?.name === markerName, 'marker event must be readable in Admin A DB');
  console.log('[verify-multi-tenant] event isolation OK');

  const actorA = {
    id: adminA.id,
    role: ROLE_SLUGS.ADMIN,
    can_manage_users: true,
    db_name: adminA.db_name,
  };
  const stdUser = await createUserAccount(actorA, {
    name: `Verify User A ${stamp}`,
    email: `verify_user_a_${stamp}@example.com`,
    username: `verify_user_a_${stamp}`,
    password: 'VerifyPass123!',
    role: ROLE_SLUGS.USER,
  });
  createdUserIds.push(stdUser.id);
  assert(
    stdUser.db_name === adminA.db_name,
    `standard user must inherit admin A db_name (${adminA.db_name}), got ${stdUser.db_name}`
  );
  console.log('[verify-multi-tenant] user inherits admin db_name OK');

  const token = generateToken(adminA.id, adminA.db_name);
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  assert(decoded.user_id === adminA.id, 'JWT user_id mismatch');
  assert(decoded.db_name === adminA.db_name, 'JWT must include db_name');
  assert(
    getTenantPrisma(decoded.db_name) === dbA,
    'getTenantPrisma(JWT db_name) must route to Admin A client'
  );
  console.log('[verify-multi-tenant] login token routing OK');

  console.log('[verify-multi-tenant] PASS');
}

main()
  .catch((err) => {
    console.error('[verify-multi-tenant] FAIL:', err.message);
    if (/permission denied to create database|CREATEDB/i.test(err.message)) {
      console.error(
        '[verify-multi-tenant] Hint: grant CREATEDB to the DATABASE_URL role, or set TENANT_PROVISION_DATABASE_URL to a privileged connection string.'
      );
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    await mainPrisma.$disconnect().catch(() => {});
  });
