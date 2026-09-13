/**
 * One-shot: upsert the superadmin user.
 * Usage: SUPERADMIN_PASSWORD=... node scripts/create-superadmin.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('../prisma/client');
const { getDefaultAccessForRole } = require('../src/modules/auth/access_features');

(async () => {
  const username = process.env.SUPERADMIN_USERNAME || 'superadmin';
  const password = String(process.env.SUPERADMIN_PASSWORD || '').trim();
  const email = process.env.SUPERADMIN_EMAIL || 'superadmin@blurasaga.local';
  const name = process.env.SUPERADMIN_NAME || 'Super Administrator';

  if (password.length < 12) {
    throw new Error(
      'SUPERADMIN_PASSWORD is required (min 12 chars). Set it in the environment — do not hardcode it.'
    );
  }

  let role = await prisma.roles.findUnique({ where: { slug: 'superadmin' } });
  if (!role) {
    for (const r of [
      { slug: 'superadmin', name: 'Super Admin' },
      { slug: 'admin', name: 'Admin' },
      { slug: 'user', name: 'User' },
    ]) {
      await prisma.roles.upsert({
        where: { slug: r.slug },
        create: { ...r, is_system: true },
        update: { name: r.name, is_system: true },
      });
    }
    role = await prisma.roles.findUnique({ where: { slug: 'superadmin' } });
  }
  if (!role) throw new Error('superadmin role missing — run ensureSchema / npm run dev first');

  const access = getDefaultAccessForRole('superadmin');
  const hashed = await bcrypt.hash(password, await bcrypt.genSalt(10));

  const existing = await prisma.users.findFirst({
    where: { OR: [{ username }, { email }] },
  });

  const data = {
    name,
    username,
    email,
    password: hashed,
    role_id: role.id,
    allowed_pages: access.allowed_pages,
    allowed_platforms: access.allowed_platforms,
    can_manage_users: true,
    can_manage_roles: true,
    db_name: null,
  };

  const user = existing
    ? await prisma.users.update({ where: { id: existing.id }, data })
    : await prisma.users.create({ data });

  console.log(existing ? 'Updated' : 'Created', 'superadmin id=' + user.id);
  console.log({ username: user.username, email: user.email, role: 'superadmin' });
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e.message || e);
  try {
    await prisma.$disconnect();
  } catch (_) {}
  process.exit(1);
});
