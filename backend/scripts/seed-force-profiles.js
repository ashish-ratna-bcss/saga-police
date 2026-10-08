/**
 * One-time move of the force profiles from config/tenant_profiles.json into each tenant's settings record
 * (users.application_details.force_profile). After this, admins change them through the user update API and the file is no longer needed.
 * Usage: node scripts/seed-force-profiles.js           (shows what would change)
 *        node scripts/seed-force-profiles.js --apply   (writes; keeps a backup file in the home folder)
 *        node scripts/seed-force-profiles.js --merge   (also fills fields an existing profile lacks, e.g. timezone; never overwrites a saved value)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const APPLY = process.argv.includes('--apply');
const MERGE = process.argv.includes('--merge');
const fold = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

(async () => {
  const prisma = new PrismaClient();
  const profiles = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/tenant_profiles.json'), 'utf8')).profiles;
  const users = await prisma.users.findMany({ where: { db_name: { not: null } }, select: { id: true, username: true, db_name: true, application_details: true } });
  const backup = [];
  for (const u of users) {
    const label = fold(`${u.db_name} ${u.username}`);
    const hit = profiles.find((p) => p.keys.some((k) => label.includes(fold(k))));
    const ad = u.application_details && typeof u.application_details === 'object' ? u.application_details : {};
    if (!hit) { console.log(`${u.username} (${u.db_name}): no profile matches; skipped`); continue; }
    const { keys, ...profile } = hit;
    if (ad.force_profile) {
      // Existing profile: only add the settings it does not have yet. A value an admin saved is never replaced.
      const missing = Object.keys(profile).filter((k) => ad.force_profile[k] === undefined || ad.force_profile[k] === '');
      if (!MERGE || !missing.length) { console.log(`${u.username}: already has a force profile${missing.length ? ` (missing: ${missing.join(', ')}; run with --merge to fill)` : ''}; skipped`); continue; }
      console.log(`${u.username} (${u.db_name}): adds ${missing.join(', ')}${APPLY ? ' [APPLIED]' : ' [dry run]'}`);
      backup.push({ id: u.id, application_details: u.application_details });
      if (APPLY) await prisma.users.update({ where: { id: u.id }, data: { application_details: { ...ad, force_profile: { ...Object.fromEntries(missing.map((k) => [k, profile[k]])), ...ad.force_profile } } } });
      continue;
    }
    console.log(`${u.username} (${u.db_name}) -> ${profile.force}${APPLY ? ' [APPLIED]' : ' [dry run]'}`);
    backup.push({ id: u.id, application_details: u.application_details });
    if (APPLY) await prisma.users.update({ where: { id: u.id }, data: { application_details: { ...ad, force_profile: profile } } });
  }
  if (APPLY && backup.length) fs.writeFileSync(`${process.env.HOME}/users_application_details_backup_${Date.now()}.json`, JSON.stringify(backup));
  process.exit(0);
})();
