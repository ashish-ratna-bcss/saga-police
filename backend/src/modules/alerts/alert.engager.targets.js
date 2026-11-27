/**
 * Curated Frequent Engagers targets — only profiles the user added via the
 * card Users icon. Distinct from “all monitored profiles with posts”.
 */
const dbOf = require('../../lib/dbOf');

const normalizeHandle = (value) =>
  String(value || '')
    .replace(/^@/, '')
    .trim()
    .toLowerCase();

const normalizePlatform = (value) => {
  const p = String(value || '')
    .trim()
    .toLowerCase();
  if (p === 'twitter') return 'x';
  return p || 'x';
};

const ready = new WeakMap();

const DDL = [
  `CREATE TABLE IF NOT EXISTS frequent_engager_targets (
     id           SERIAL PRIMARY KEY,
     platform     TEXT NOT NULL,
     handle       TEXT NOT NULL,
     display_name TEXT,
     avatar       TEXT,
     profile_id   INT,
     account_id   INT,
     created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (platform, handle)
   )`,
  `CREATE INDEX IF NOT EXISTS frequent_engager_targets_profile_id_idx
     ON frequent_engager_targets (profile_id)`,
];

const run = async (prisma, sql) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await prisma.$executeRawUnsafe(sql);
      return;
    } catch (err) {
      const raced = /already exists|duplicate key|tuple concurrently updated/i.test(
        String(err?.message || '')
      );
      if (!raced || attempt >= 2) throw err;
      await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
    }
  }
};

const ensureTable = (prisma) => {
  if (!ready.has(prisma)) {
    const p = (async () => {
      for (const sql of DDL) await run(prisma, sql);
    })();
    p.catch(() => ready.delete(prisma));
    ready.set(prisma, p);
  }
  return ready.get(prisma);
};

const listTargets = async ({ db } = {}) => {
  const prisma = dbOf(db);
  await ensureTable(prisma);
  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, platform, handle, display_name, avatar, profile_id, account_id, created_at
     FROM frequent_engager_targets
     ORDER BY created_at DESC`
  );
  return Array.isArray(rows) ? rows : [];
};

const findAccount = async (prisma, platform, handle) => {
  const h = normalizeHandle(handle);
  if (!h) return null;
  const slug = normalizePlatform(platform);
  const platformFilter =
    slug === 'x'
      ? { platforms: { slug: { in: ['x', 'twitter'] } } }
      : slug
        ? { platforms: { slug } }
        : {};
  return prisma.social_media_accounts.findFirst({
    where: {
      OR: [
        { handle: { equals: h, mode: 'insensitive' } },
        { handle: { equals: `@${h}`, mode: 'insensitive' } },
      ],
      ...platformFilter,
    },
    select: {
      id: true,
      profile_id: true,
      handle: true,
      preview_data: true,
      platforms: { select: { slug: true } },
      profile: { select: { display_name: true } },
    },
    orderBy: { updated_at: 'desc' },
  });
};

const pickAvatar = (previewData) => {
  const preview = previewData && typeof previewData === 'object' ? previewData : {};
  const summary = preview.summary && typeof preview.summary === 'object' ? preview.summary : {};
  return summary.image || preview.image || preview.profile_image_url || summary.profile_image_url || null;
};

const addTarget = async ({ platform, handle, display_name, avatar, db } = {}) => {
  const prisma = dbOf(db);
  await ensureTable(prisma);
  const slug = normalizePlatform(platform);
  const h = normalizeHandle(handle);
  if (!h) {
    const err = new Error('handle is required');
    err.status = 400;
    throw err;
  }

  const account = await findAccount(prisma, slug, h);
  const profileId = account?.profile_id || null;
  const accountId = account?.id || null;
  const resolvedName =
    display_name ||
    account?.profile?.display_name ||
    account?.handle ||
    h;
  const resolvedAvatar = avatar || pickAvatar(account?.preview_data) || null;

  await prisma.$executeRawUnsafe(
    `INSERT INTO frequent_engager_targets
       (platform, handle, display_name, avatar, profile_id, account_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (platform, handle) DO UPDATE SET
       display_name = COALESCE(EXCLUDED.display_name, frequent_engager_targets.display_name),
       avatar = COALESCE(EXCLUDED.avatar, frequent_engager_targets.avatar),
       profile_id = COALESCE(EXCLUDED.profile_id, frequent_engager_targets.profile_id),
       account_id = COALESCE(EXCLUDED.account_id, frequent_engager_targets.account_id)`,
    slug,
    h,
    resolvedName,
    resolvedAvatar,
    profileId,
    accountId
  );

  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, platform, handle, display_name, avatar, profile_id, account_id, created_at
     FROM frequent_engager_targets
     WHERE platform = $1 AND handle = $2
     LIMIT 1`,
    slug,
    h
  );
  return Array.isArray(rows) ? rows[0] : null;
};

const removeTarget = async ({ platform, handle, id, db } = {}) => {
  const prisma = dbOf(db);
  await ensureTable(prisma);
  if (id != null && Number.isFinite(Number(id))) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM frequent_engager_targets WHERE id = $1`,
      Number(id)
    );
    return { removed: true };
  }
  const slug = normalizePlatform(platform);
  const h = normalizeHandle(handle);
  if (!h) {
    const err = new Error('handle or id is required');
    err.status = 400;
    throw err;
  }
  await prisma.$executeRawUnsafe(
    `DELETE FROM frequent_engager_targets WHERE platform = $1 AND handle = $2`,
    slug,
    h
  );
  return { removed: true };
};

/** Profile ids the curated list cares about (for filtering engagers-db list). */
const listTargetProfileIds = async ({ db } = {}) => {
  const targets = await listTargets({ db });
  return [
    ...new Set(
      targets
        .map((t) => Number(t.profile_id))
        .filter((id) => Number.isInteger(id) && id > 0)
    ),
  ];
};

module.exports = {
  ensureTable,
  listTargets,
  addTarget,
  removeTarget,
  listTargetProfileIds,
  normalizeHandle,
  normalizePlatform,
};
