/**
 * The tenant's force profile (name, head, headquarters, PIN, phone, report language) lives in the tenant's own settings record
 * (users.application_details.force_profile), so an admin can change it without a developer. This reads it, with a short cache.
 */
const prisma = require('../../../../prisma/client');

const TTL_MS = 60 * 1000;
const cache = new Map();

const getTenantProfile = async (dbName) => {
  if (!dbName) return null;
  const hit = cache.get(dbName);
  if (hit && hit.until > Date.now()) return hit.value;
  let value = null;
  try {
    // Several users share one tenant database; the profile is whichever of them carries one (admins keep them the same).
    const users = await prisma.users.findMany({ where: { db_name: dbName, application_details: { not: null } }, select: { application_details: true }, take: 50 });
    const withProfile = users.map((u) => u.application_details).find((ad) => ad && typeof ad === 'object' && ad.force_profile && typeof ad.force_profile === 'object');
    // No saved profile: return null so the legacy profile file (or the generic header) applies; nothing is guessed here.
    value = withProfile ? withProfile.force_profile : null;
  } catch (e) {
    value = null;
  }
  cache.set(dbName, { value, until: Date.now() + TTL_MS });
  return value;
};

module.exports = { getTenantProfile };
