/**
 * Ensure Postgres has tables matching prisma/schema.prisma.
 * Handles the roles + users.role_id migration without force-reset.
 */
require('dotenv').config();

const path = require('path');
const { execSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');
const { ACCESS_FEATURES } = require('../src/modules/auth/access_features');

const BACKEND_ROOT = path.join(__dirname, '..');
const EXPECTED_TABLES = 48;

async function countPublicTables(prisma) {
  const rows = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS count
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
  `;
  return rows[0]?.count ?? 0;
}

async function hasRolesTable(prisma) {
  const rows = await prisma.$queryRaw`
    SELECT to_regclass('public.roles') IS NOT NULL AS exists
  `;
  return Boolean(rows[0]?.exists);
}

async function hasUsersRoleId(prisma) {
  const rows = await prisma.$queryRaw`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'role_id'
    ) AS exists
  `;
  return Boolean(rows[0]?.exists);
}

const pagesFor = (role) => (ACCESS_FEATURES[role] || []).map((item) => item.path);

/**
 * Create roles + backfill users.role_id before prisma db push can set NOT NULL.
 */
async function migrateRolesAndRoleId(prisma) {
  console.log('[postgres] preparing roles + users.role_id…');

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS roles (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      allowed_pages TEXT[] NOT NULL DEFAULT '{}',
      assignable_by TEXT[] NOT NULL DEFAULT '{superadmin}',
      can_manage_users BOOLEAN NOT NULL DEFAULT false,
      can_manage_roles BOOLEAN NOT NULL DEFAULT false,
      is_system BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Add assignable_by column if the table already existed without it
  await prisma.$executeRawUnsafe(`
    ALTER TABLE roles
    ADD COLUMN IF NOT EXISTS assignable_by TEXT[] NOT NULL DEFAULT '{superadmin}'
  `);

  const systemRoles = [
    {
      slug: 'superadmin',
      name: 'Super Admin',
      pages: pagesFor('superadmin'),
      assignable_by: ['superadmin'],
      can_manage_users: true,
      can_manage_roles: true,
    },
    {
      slug: 'admin',
      name: 'Admin',
      pages: pagesFor('admin'),
      assignable_by: ['superadmin'],
      can_manage_users: true,
      can_manage_roles: false,
    },
    {
      slug: 'user',
      name: 'User',
      pages: pagesFor('user'),
      assignable_by: ['superadmin', 'admin'],
      can_manage_users: false,
      can_manage_roles: false,
    },
  ];

  for (const role of systemRoles) {
    await prisma.$executeRawUnsafe(
      `
      INSERT INTO roles (name, slug, allowed_pages, assignable_by, can_manage_users, can_manage_roles, is_system)
      VALUES ($1, $2, $3::text[], $4::text[], $5, $6, true)
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        allowed_pages = EXCLUDED.allowed_pages,
        can_manage_users = EXCLUDED.can_manage_users,
        can_manage_roles = EXCLUDED.can_manage_roles,
        is_system = true,
        updated_at = NOW()
      `,
      role.name,
      role.slug,
      role.pages,
      role.assignable_by,
      role.can_manage_users,
      role.can_manage_roles
    );
  }

  // Add nullable role_id first (existing rows need a value before NOT NULL)
  await prisma.$executeRawUnsafe(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role_id INTEGER
  `);

  // Backfill any users missing role_id → superadmin
  await prisma.$executeRawUnsafe(`
    UPDATE users
    SET role_id = (SELECT id FROM roles WHERE slug = 'superadmin' LIMIT 1)
    WHERE role_id IS NULL
  `);

  // Enforce NOT NULL + FK
  await prisma.$executeRawUnsafe(`
    ALTER TABLE users
    ALTER COLUMN role_id SET NOT NULL
  `);

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_role_id_fkey'
      ) THEN
        ALTER TABLE users
        ADD CONSTRAINT users_role_id_fkey
        FOREIGN KEY (role_id) REFERENCES roles(id);
      END IF;
    END $$;
  `);

  // Drop legacy enum role column if present
  await prisma.$executeRawUnsafe(`
    ALTER TABLE users DROP COLUMN IF EXISTS role
  `);

  console.log('[postgres] roles + users.role_id ready');
}

async function ensureUserThemeColumns(prisma) {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS ui_mode TEXT NOT NULL DEFAULT 'light'
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE users
    ALTER COLUMN ui_mode SET DEFAULT 'light'
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS theme_color TEXT NOT NULL DEFAULT '#1e3a8a'
  `);
}

async function main() {
  if (process.env.SKIP_PG_ENSURE === 'true') {
    console.log('[postgres] SKIP_PG_ENSURE=true — skipping schema check');
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.warn('[postgres] DATABASE_URL not set — skipping schema check');
    return;
  }

  const prisma = new PrismaClient();

  try {
    const count = await countPublicTables(prisma);
    const rolesReady = count > 0 ? await hasRolesTable(prisma) : false;
    const roleIdReady = count > 0 ? await hasUsersRoleId(prisma) : false;

    if (!rolesReady || !roleIdReady) {
      await migrateRolesAndRoleId(prisma);
    }

    if ((await countPublicTables(prisma)) > 0) {
      await ensureUserThemeColumns(prisma);
    }

    const afterMigrate = await countPublicTables(prisma);
    const rolesOk = await hasRolesTable(prisma);
    const roleIdOk = await hasUsersRoleId(prisma);

    if (afterMigrate >= EXPECTED_TABLES && rolesOk && roleIdOk) {
      console.log(`[postgres] schema ready (${afterMigrate} tables)`);
      return;
    }

    console.log(
      `[postgres] found ${afterMigrate}/${EXPECTED_TABLES} tables (roles=${rolesOk}) — syncing Prisma schema…`
    );

    execSync('npx prisma db push --skip-generate --accept-data-loss', {
      cwd: BACKEND_ROOT,
      stdio: 'inherit',
      env: process.env,
    });

    const after = await countPublicTables(prisma);
    console.log(`[postgres] schema synced (${after} tables)`);
  } catch (error) {
    console.error('[postgres] schema ensure failed:', error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main();
