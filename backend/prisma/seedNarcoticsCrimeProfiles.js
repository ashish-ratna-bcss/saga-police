/**
 * Seed Social Profiles for narcotics + robbery/crime monitoring (AP SOC).
 * Official / public high-visibility accounts only — no invented suspect handles.
 *
 * Usage:
 *   node prisma/seedNarcoticsCrimeProfiles.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/** @type {{ display_name: string, notes: string, accounts: { platform: string, handle: string, data: object }[] }[]} */
const PROFILES = [
  // ── Narcotics — government ───────────────────────────────────────────
  {
    display_name: 'EAGLE AP Anti-Narcotics',
    notes: '[narcotics] Elite Anti-Narcotics Group for Law Enforcement (AP) — helpline 1972',
    accounts: [
      { platform: 'x', handle: 'EagleAP1972', data: { username: 'EagleAP1972' } },
      { platform: 'instagram', handle: 'eagleap1972', data: { username: 'eagleap1972' } },
    ],
  },
  {
    display_name: 'Narcotics Control Bureau India',
    notes: '[narcotics] National Narcotics Control Bureau (NCB)',
    accounts: [
      { platform: 'x', handle: 'narcoticsbureau', data: { username: 'narcoticsbureau' } },
      { platform: 'instagram', handle: 'india.ncb', data: { username: 'india.ncb' } },
    ],
  },
  {
    display_name: 'Ministry of Home Affairs India',
    notes: '[narcotics] Union Home Ministry — NDPS / internal security policy (high market)',
    accounts: [
      { platform: 'x', handle: 'HMOIndia', data: { username: 'HMOIndia' } },
    ],
  },
  {
    display_name: 'AP Police Women Child Safety Wing',
    notes: '[narcotics] WCSW AP Police — linked EAGLE awareness campaigns',
    accounts: [
      { platform: 'instagram', handle: 'appolicewcsw', data: { username: 'appolicewcsw' } },
      { platform: 'x', handle: 'appolicewcsw', data: { username: 'appolicewcsw' } },
    ],
  },

  // ── Robbery / theft / crime — government ─────────────────────────────
  {
    display_name: 'AP CID',
    notes: '[robbery/crime] Crime Investigation Department Andhra Pradesh',
    accounts: [
      { platform: 'x', handle: 'CIDOfficial2', data: { username: 'CIDOfficial2' } },
      {
        platform: 'facebook',
        handle: 'https://www.facebook.com/ap.cid.9',
        data: { url: 'https://www.facebook.com/ap.cid.9' },
      },
    ],
  },
  {
    display_name: 'AP Cyber Crimes CID',
    notes: '[robbery/crime] Cyber crime / theft / fraud — CID AP',
    accounts: [
      { platform: 'x', handle: 'cybercrimecidap', data: { username: 'cybercrimecidap' } },
      { platform: 'instagram', handle: 'cybercrimescidap', data: { username: 'cybercrimescidap' } },
      {
        platform: 'youtube',
        handle: 'https://www.youtube.com/@cybercrimescidap',
        data: { channel_url: 'https://www.youtube.com/@cybercrimescidap' },
      },
    ],
  },
  {
    display_name: 'DGP Andhra Pradesh',
    notes: '[robbery/crime] Director General of Police AP — statewide crime ops',
    accounts: [
      { platform: 'x', handle: 'dgpapofficial', data: { username: 'dgpapofficial' } },
    ],
  },
  {
    display_name: 'Vijayawada City Police',
    notes: '[robbery/crime] NTR / Vijayawada City Police — theft & narcotics posts',
    accounts: [
      { platform: 'x', handle: 'VjaCityPolice', data: { username: 'VjaCityPolice' } },
    ],
  },
  {
    display_name: 'Visakhapatnam City Police',
    notes: '[robbery/crime] Vizag City Police — high market coastal crime coverage',
    accounts: [
      { platform: 'instagram', handle: 'cpvizag', data: { username: 'cpvizag' } },
      { platform: 'x', handle: 'vizagcitypolice', data: { username: 'vizagcitypolice' } },
    ],
  },
  {
    display_name: 'Tirupati District Police',
    notes: '[robbery/crime] Tirupati Police — theft recovery / temple town security',
    accounts: [
      { platform: 'x', handle: 'tirupatipolice', data: { username: 'tirupatipolice' } },
      { platform: 'instagram', handle: 'tirupatipolice', data: { username: 'tirupatipolice' } },
    ],
  },
  {
    display_name: 'Guntur District Police',
    notes: '[robbery/crime] Guntur Police — robbery / bike theft / NDPS busts',
    accounts: [
      { platform: 'instagram', handle: 'police_guntur', data: { username: 'police_guntur' } },
    ],
  },
  {
    display_name: 'Kurnool District Police',
    notes: '[robbery/crime] Kurnool Police — mobile theft recovery & crime alerts',
    accounts: [
      { platform: 'x', handle: 'PoliceKurnool', data: { username: 'PoliceKurnool' } },
      { platform: 'instagram', handle: 'kurnoolpolice', data: { username: 'kurnoolpolice' } },
    ],
  },
  {
    display_name: 'YSR Kadapa District Police',
    notes: '[robbery/crime] Kadapa / YSR District Police',
    accounts: [
      { platform: 'x', handle: 'Kadapa_Police', data: { username: 'Kadapa_Police' } },
      {
        platform: 'instagram',
        handle: 'kadapa_district_police',
        data: { username: 'kadapa_district_police' },
      },
      {
        platform: 'facebook',
        handle: 'https://www.facebook.com/kadapapolice/',
        data: { url: 'https://www.facebook.com/kadapapolice/' },
      },
    ],
  },
  {
    display_name: 'Anakapalli District Police',
    notes: '[robbery/crime] Anakapalli Police — theft recovery drives',
    accounts: [
      {
        platform: 'instagram',
        handle: 'anakapallidistrictpolice',
        data: { username: 'anakapallidistrictpolice' },
      },
      { platform: 'instagram', handle: 'AKPPolice', data: { username: 'AKPPolice' } },
    ],
  },
  {
    display_name: 'East Godavari District Police',
    notes: '[robbery/crime] East Godavari District Police',
    accounts: [
      {
        platform: 'instagram',
        handle: 'eastgodavaridistrictpolice',
        data: { username: 'eastgodavaridistrictpolice' },
      },
    ],
  },
  {
    display_name: 'West Godavari District Police',
    notes: '[robbery/crime] West Godavari District Police',
    accounts: [
      {
        platform: 'instagram',
        handle: 'westgodavaripolice',
        data: { username: 'westgodavaripolice' },
      },
    ],
  },
  {
    display_name: 'Krishna District Police',
    notes: '[robbery/crime] Krishna District Police',
    accounts: [
      {
        platform: 'instagram',
        handle: 'krishnadistrictpolice',
        data: { username: 'krishnadistrictpolice' },
      },
    ],
  },
  {
    display_name: 'Chittoor District Police',
    notes: '[robbery/crime] Chittoor District Police',
    accounts: [{ platform: 'instagram', handle: 'spchittoor', data: { username: 'spchittoor' } }],
  },
  {
    display_name: 'Anantapur District Police',
    notes: '[robbery/crime] Anantapur District Police',
    accounts: [
      { platform: 'instagram', handle: 'anantapurpolice', data: { username: 'anantapurpolice' } },
    ],
  },
  {
    display_name: 'SPSR Nellore District Police',
    notes: '[robbery/crime] SPSR Nellore District Police',
    accounts: [
      {
        platform: 'instagram',
        handle: 'spsnellorepolice',
        data: { username: 'spsnellorepolice' },
      },
    ],
  },
  {
    display_name: 'Eluru District Police',
    notes: '[robbery/crime] Eluru District Police',
    accounts: [{ platform: 'instagram', handle: 'elurupolice', data: { username: 'elurupolice' } }],
  },
  {
    display_name: 'Nandyal District Police',
    notes: '[robbery/crime] Nandyal District Police',
    accounts: [
      { platform: 'instagram', handle: 'nandyalpolice', data: { username: 'nandyalpolice' } },
    ],
  },
  {
    display_name: 'Palnadu District Police',
    notes: '[robbery/crime] Palnadu District Police',
    accounts: [
      { platform: 'instagram', handle: 'palnadu_police', data: { username: 'palnadu_police' } },
    ],
  },
  {
    display_name: 'Kakinada District Police',
    notes: '[robbery/crime] Kakinada District Police',
    accounts: [
      {
        platform: 'instagram',
        handle: 'kakinada_district_police',
        data: { username: 'kakinada_district_police' },
      },
    ],
  },
  {
    display_name: 'Prakasam District Police',
    notes: '[robbery/crime] Prakasam District Police',
    accounts: [
      { platform: 'instagram', handle: 'prakasampolice', data: { username: 'prakasampolice' } },
    ],
  },
  {
    display_name: 'Srikakulam District Police',
    notes: '[robbery/crime] Srikakulam District Police',
    accounts: [{ platform: 'instagram', handle: 'sklmpolice', data: { username: 'sklmpolice' } }],
  },
  {
    display_name: 'Vizianagaram District Police',
    notes: '[robbery/crime] Vizianagaram District Police',
    accounts: [{ platform: 'instagram', handle: 'vzmpolice', data: { username: 'vzmpolice' } }],
  },

  // ── High-market news (crime / narcotics coverage) ────────────────────
  {
    display_name: 'News18 Telugu',
    notes: '[narcotics/robbery] High-market Telugu news — NDPS & crime coverage',
    accounts: [
      { platform: 'x', handle: 'News18Telugu', data: { username: 'News18Telugu' } },
      { platform: 'instagram', handle: 'news18telugu', data: { username: 'news18telugu' } },
      {
        platform: 'youtube',
        handle: 'https://www.youtube.com/@news18telugu',
        data: { channel_url: 'https://www.youtube.com/@news18telugu' },
      },
    ],
  },
  {
    display_name: 'India Today Telugu',
    notes: '[narcotics/robbery] High-market Telugu news — crime & drugs',
    accounts: [
      { platform: 'x', handle: 'IndiaTodayTe', data: { username: 'IndiaTodayTe' } },
      {
        platform: 'youtube',
        handle: 'https://www.youtube.com/@IndiaTodayTelugu',
        data: { channel_url: 'https://www.youtube.com/@IndiaTodayTelugu' },
      },
    ],
  },
  {
    display_name: 'BBC News Telugu',
    notes: '[narcotics/robbery] High-market Telugu news — investigations & crime',
    accounts: [
      { platform: 'x', handle: 'bbctelugu', data: { username: 'bbctelugu' } },
      {
        platform: 'youtube',
        handle: 'https://www.youtube.com/@bbctelugu',
        data: { channel_url: 'https://www.youtube.com/@bbctelugu' },
      },
    ],
  },
  {
    display_name: 'The Hindu Andhra Pradesh',
    notes: '[narcotics/robbery] High-market English/AP crime & NDPS reporting',
    accounts: [
      { platform: 'x', handle: 'th_andhrapradesh', data: { username: 'th_andhrapradesh' } },
    ],
  },
  {
    display_name: 'Deccan Chronicle',
    notes: '[narcotics/robbery] High-market South India crime & narcotics news',
    accounts: [
      { platform: 'x', handle: 'DeccanChronicle', data: { username: 'DeccanChronicle' } },
    ],
  },
];

async function ensurePlatforms() {
  const rows = await prisma.platforms.findMany({ where: { is_active: true } });
  const bySlug = {};
  for (const row of rows) bySlug[row.slug] = row;
  const required = ['x', 'instagram', 'facebook', 'youtube', 'telegram'];
  const missing = required.filter((s) => !bySlug[s]);
  if (missing.length) {
    throw new Error(
      `Missing platforms: ${missing.join(', ')}. Run npm run db:seed:ap first.`
    );
  }
  return bySlug;
}

async function seed() {
  const platformsBySlug = await ensurePlatforms();
  let createdProfiles = 0;
  let createdAccounts = 0;
  let skippedAccounts = 0;
  let updatedProfiles = 0;

  for (const item of PROFILES) {
    let profile = await prisma.social_media_profiles.findFirst({
      where: { display_name: item.display_name },
    });
    if (!profile) {
      profile = await prisma.social_media_profiles.create({
        data: {
          display_name: item.display_name,
          notes: item.notes,
          is_active: true,
        },
      });
      createdProfiles += 1;
    } else {
      await prisma.social_media_profiles.update({
        where: { id: profile.id },
        data: { notes: item.notes, is_active: true },
      });
      updatedProfiles += 1;
    }

    // Anakapalli has two IG handles — only create unique ones; skip duplicate platform slots carefully
    const seenPlatformHandles = new Set();
    for (const acc of item.accounts) {
      const platform = platformsBySlug[acc.platform];
      if (!platform) {
        skippedAccounts += 1;
        continue;
      }
      const key = `${platform.id}::${acc.handle}`;
      if (seenPlatformHandles.has(key)) {
        skippedAccounts += 1;
        continue;
      }
      seenPlatformHandles.add(key);

      const existing = await prisma.social_media_accounts.findUnique({
        where: {
          platform_id_handle: { platform_id: platform.id, handle: acc.handle },
        },
      });

      const preview_data = {
        seeded: true,
        category_hint: item.notes.startsWith('[narcotics')
          ? 'narcotics'
          : item.notes.startsWith('[robbery')
            ? 'robbery_crime'
            : 'mixed',
        summary: {
          display_name: item.display_name,
          note: item.notes,
        },
        fetched_at: new Date().toISOString(),
      };

      if (existing) {
        // Do not steal accounts from other profiles — only refresh if already ours
        if (existing.profile_id === profile.id) {
          await prisma.social_media_accounts.update({
            where: { id: existing.id },
            data: {
              data: acc.data || {},
              preview_data,
              is_active: true,
            },
          });
        } else {
          skippedAccounts += 1;
        }
        continue;
      }

      await prisma.social_media_accounts.create({
        data: {
          profile_id: profile.id,
          platform_id: platform.id,
          handle: acc.handle,
          data: acc.data || {},
          preview_data,
          is_active: true,
          poll_interval_minutes: 30,
          monitoring_status: 'stopped',
          monitoring_logs: [
            {
              at: new Date().toISOString(),
              action: 'seeded',
              by: 'seedNarcoticsCrimeProfiles',
              note: item.notes,
            },
          ],
        },
      });
      createdAccounts += 1;
    }
  }

  return {
    totalDefined: PROFILES.length,
    createdProfiles,
    updatedProfiles,
    createdAccounts,
    skippedAccounts,
  };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }
  console.log(`[seed] narcotics + robbery/crime profiles (${PROFILES.length} defined)…`);
  const result = await seed();
  console.log(
    `[seed] done — profiles defined ${result.totalDefined}, +${result.createdProfiles} created, ${result.updatedProfiles} updated, accounts +${result.createdAccounts}, skipped ${result.skippedAccounts}`
  );
  console.log('[seed] monitoring left stopped — Start profiles when ready');
}

main()
  .catch((err) => {
    console.error('[seed] failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect().catch(() => {}));
