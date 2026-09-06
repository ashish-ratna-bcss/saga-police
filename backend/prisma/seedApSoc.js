/**
 * Seed Andhra Pradesh SOC starter data with verified public handles.
 * YouTube entries include live channel_id + uploads_playlist_id (playlist API checked).
 *
 *   node prisma/seedApSoc.js
 *   node prisma/seedApSoc.js --reset   # remove prior seed rows, then re-seed
 */
require('dotenv').config();

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const RESET = process.argv.includes('--reset');

const PLATFORM_DEFS = [
  {
    slug: 'x',
    name: 'X (Twitter)',
    icon: 'Twitter',
    color: '#000000',
    fields: [
      { key: 'username', label: 'Username', type: 'text', required: true, placeholder: 'e.g. APPOLICE100' },
    ],
  },
  {
    slug: 'facebook',
    name: 'Facebook',
    icon: 'Facebook',
    color: '#1877F2',
    fields: [
      { key: 'url', label: 'Page URL', type: 'url', required: true, placeholder: 'https://facebook.com/...' },
      { key: 'page_id', label: 'Page ID', type: 'text', required: false, placeholder: 'optional numeric id' },
    ],
  },
  {
    slug: 'youtube',
    name: 'YouTube',
    icon: 'Youtube',
    color: '#FF0000',
    fields: [
      { key: 'channel_url', label: 'Channel URL', type: 'url', required: true, placeholder: 'https://youtube.com/@...' },
      { key: 'channel_id', label: 'Channel ID', type: 'text', required: false, placeholder: 'UCxxxxxxxx' },
    ],
  },
  {
    slug: 'instagram',
    name: 'Instagram',
    icon: 'Instagram',
    color: '#E4405F',
    fields: [
      { key: 'username', label: 'Username', type: 'text', required: true, placeholder: 'e.g. appolice' },
    ],
  },
];

/**
 * Verified public accounts for AP police SOC monitoring.
 * YouTube: resolved via Data API (CHANNELS_LIST + PLAYLIST_ITEMS_LIST OK).
 */
const PROFILES = [
  {
    display_name: 'Andhra Pradesh Police',
    notes: 'Official state police — public alerts & advisories',
    accounts: [
      { platform: 'x', handle: 'APPOLICE100', data: { username: 'APPOLICE100' } },
      {
        platform: 'facebook',
        handle: 'https://www.facebook.com/AndhraPradeshPolice',
        data: { url: 'https://www.facebook.com/AndhraPradeshPolice' },
      },
      { platform: 'instagram', handle: 'andhrapolice', data: { username: 'andhrapolice' } },
    ],
  },
  {
    display_name: 'TV9 Telugu Live',
    notes: 'Regional news — verified YouTube uploads playlist',
    accounts: [
      { platform: 'x', handle: 'TV9Telugu', data: { username: 'TV9Telugu' } },
      {
        platform: 'facebook',
        handle: 'https://www.facebook.com/TV9Telugu',
        data: { url: 'https://www.facebook.com/TV9Telugu' },
      },
      { platform: 'instagram', handle: 'tv9telugu', data: { username: 'tv9telugu' } },
      {
        platform: 'youtube',
        handle: 'https://www.youtube.com/@tv9telugulive',
        data: {
          channel_url: 'https://www.youtube.com/@tv9telugulive',
          channel_id: 'UCPXTXMecYqnRKNdqdVOGSFg',
          uploads_playlist_id: 'UUPXTXMecYqnRKNdqdVOGSFg',
        },
      },
    ],
  },
  {
    display_name: 'Sakshi TV',
    notes: 'Regional news — verified YouTube uploads playlist',
    accounts: [
      { platform: 'x', handle: 'SakshiTelugu', data: { username: 'SakshiTelugu' } },
      {
        platform: 'facebook',
        handle: 'https://www.facebook.com/sakshinews',
        data: { url: 'https://www.facebook.com/sakshinews' },
      },
      { platform: 'instagram', handle: 'sakshitv', data: { username: 'sakshitv' } },
      {
        platform: 'youtube',
        handle: 'https://www.youtube.com/@sakshitv',
        data: {
          channel_url: 'https://www.youtube.com/@sakshitv',
          channel_id: 'UCZ9m4KOh8Ei60428xeGYDCQ',
          uploads_playlist_id: 'UUZ9m4KOh8Ei60428xeGYDCQ',
        },
      },
    ],
  },
  {
    display_name: 'NTV Telugu',
    notes: 'Regional news — verified YouTube uploads playlist',
    accounts: [
      { platform: 'x', handle: 'ntvtelugu', data: { username: 'ntvtelugu' } },
      {
        platform: 'facebook',
        handle: 'https://www.facebook.com/ntvtelugu',
        data: { url: 'https://www.facebook.com/ntvtelugu' },
      },
      {
        platform: 'youtube',
        handle: 'https://www.youtube.com/@ntvtelugu',
        data: {
          channel_url: 'https://www.youtube.com/@ntvtelugu',
          channel_id: 'UCumtYpCY26F6Jr3satUgMvA',
          uploads_playlist_id: 'UUumtYpCY26F6Jr3satUgMvA',
        },
      },
    ],
  },
  {
    display_name: '10TV News Telugu',
    notes: 'Regional news — verified YouTube uploads playlist',
    accounts: [
      { platform: 'x', handle: '10TVNews', data: { username: '10TVNews' } },
      {
        platform: 'youtube',
        handle: 'https://www.youtube.com/@10tvnewstelugu',
        data: {
          channel_url: 'https://www.youtube.com/@10tvnewstelugu',
          channel_id: 'UCfymZbh17_3T_UhgjkQ9fRQ',
          uploads_playlist_id: 'UUfymZbh17_3T_UhgjkQ9fRQ',
        },
      },
    ],
  },
  {
    display_name: 'V6 News',
    notes: 'Regional news — verified YouTube uploads playlist',
    accounts: [
      { platform: 'x', handle: 'v6_news', data: { username: 'v6_news' } },
      {
        platform: 'youtube',
        handle: 'https://www.youtube.com/@v6news',
        data: {
          channel_url: 'https://www.youtube.com/@v6news',
          channel_id: 'UC239yTgdQbce3omeOjCt8_A',
          uploads_playlist_id: 'UU239yTgdQbce3omeOjCt8_A',
        },
      },
    ],
  },
  {
    display_name: 'T News Telugu',
    notes: 'Regional news — verified YouTube uploads playlist',
    accounts: [
      { platform: 'x', handle: 'tnewstelugu', data: { username: 'tnewstelugu' } },
      {
        platform: 'youtube',
        handle: 'https://www.youtube.com/@tnewstelugu',
        data: {
          channel_url: 'https://www.youtube.com/@tnewstelugu',
          channel_id: 'UCu6edg8_eu3-A8ylgaWereA',
          uploads_playlist_id: 'UUu6edg8_eu3-A8ylgaWereA',
        },
      },
    ],
  },
  {
    display_name: 'Mahaa News',
    notes: 'Regional news — verified YouTube uploads playlist',
    accounts: [
      { platform: 'x', handle: 'mahaanews', data: { username: 'mahaanews' } },
      {
        platform: 'youtube',
        handle: 'https://www.youtube.com/@mahaanews',
        data: {
          channel_url: 'https://www.youtube.com/@mahaanews',
          channel_id: 'UCDKjhgRoPF1CQk7HluMz23A',
          uploads_playlist_id: 'UUDKjhgRoPF1CQk7HluMz23A',
        },
      },
    ],
  },
  {
    display_name: 'TV5 News',
    notes: 'Regional news — verified YouTube uploads playlist',
    accounts: [
      { platform: 'x', handle: 'TV5News', data: { username: 'TV5News' } },
      {
        platform: 'youtube',
        handle: 'https://www.youtube.com/@tv5news',
        data: {
          channel_url: 'https://www.youtube.com/@tv5news',
          channel_id: 'UCAR3h_9fLV82N2FH4cE4RKw',
          uploads_playlist_id: 'UUAR3h_9fLV82N2FH4cE4RKw',
        },
      },
    ],
  },
  {
    display_name: 'Eenadu',
    notes: 'Regional newspaper / digital (X + Facebook)',
    accounts: [
      { platform: 'x', handle: 'eenadunews', data: { username: 'eenadunews' } },
      {
        platform: 'facebook',
        handle: 'https://www.facebook.com/eenadu',
        data: { url: 'https://www.facebook.com/eenadu' },
      },
    ],
  },
];

const now = new Date();
const daysFromNow = (n) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000);

const EVENTS = [
  {
    name: 'AP Law & Order Watch',
    description:
      'Statewide listening for protests, clashes, bandhs, and public-order keywords (EN + TE).',
    location: 'Andhra Pradesh',
    platforms: ['x', 'facebook', 'youtube', 'instagram'],
    keywords: [
      { keyword: 'Andhra Pradesh protest', language: 'en' },
      { keyword: 'AP bandh', language: 'en' },
      { keyword: 'road block AP', language: 'en' },
      { keyword: 'ఆంధ్రప్రదేశ్ ఆందోళన', language: 'te' },
      { keyword: 'బంద్', language: 'te' },
      { keyword: 'గొడవ', language: 'te' },
    ],
    high_risk_threshold: 70,
    medium_risk_threshold: 40,
    polling_interval_minutes: 30,
    start_date: daysFromNow(-7),
    end_date: daysFromNow(90),
  },
  {
    name: 'Coastal Weather & Disaster (AP)',
    description:
      'Cyclone / flood / evacuation chatter for coastal districts.',
    location: 'AP Coast',
    platforms: ['x', 'facebook', 'youtube'],
    keywords: [
      { keyword: 'Andhra cyclone', language: 'en' },
      { keyword: 'Vizag flood', language: 'en' },
      { keyword: 'తుఫాను ఆంధ్ర', language: 'te' },
      { keyword: 'వరద', language: 'te' },
    ],
    high_risk_threshold: 75,
    medium_risk_threshold: 45,
    polling_interval_minutes: 20,
    start_date: daysFromNow(-3),
    end_date: daysFromNow(120),
  },
  {
    name: 'Pilgrimage Crowd — Tirupati / Temples',
    description: 'Crowd surge and safety chatter around Tirumala / temple towns.',
    location: 'Tirupati / Tirumala',
    platforms: ['x', 'facebook', 'instagram', 'youtube'],
    keywords: [
      { keyword: 'Tirumala rush', language: 'en' },
      { keyword: 'Tirupati queue', language: 'en' },
      { keyword: 'తిరుమల భక్తులు', language: 'te' },
      { keyword: 'దర్శనం', language: 'te' },
    ],
    high_risk_threshold: 65,
    medium_risk_threshold: 35,
    polling_interval_minutes: 45,
    start_date: daysFromNow(-1),
    end_date: daysFromNow(60),
  },
  {
    name: 'Rumour / Fake News Monitor (AP)',
    description: 'Viral rumour keyword watch for early intervention.',
    location: 'Andhra Pradesh',
    platforms: ['x', 'facebook', 'instagram', 'youtube'],
    keywords: [
      { keyword: 'AP fake news', language: 'en' },
      { keyword: 'communal tension AP', language: 'en' },
      { keyword: 'పుకార్లు', language: 'te' },
      { keyword: 'నకిలీ వార్త', language: 'te' },
    ],
    high_risk_threshold: 80,
    medium_risk_threshold: 50,
    polling_interval_minutes: 15,
    start_date: daysFromNow(-7),
    end_date: daysFromNow(180),
  },
  {
    name: 'Traffic & VIP Bandobast (AP Cities)',
    description: 'City traffic / accident / bandobast mentions.',
    location: 'Vizag / Vijayawada / Guntur',
    platforms: ['x', 'facebook', 'instagram'],
    keywords: [
      { keyword: 'Vijayawada traffic', language: 'en' },
      { keyword: 'Vizag accident', language: 'en' },
      { keyword: 'బందోబస్తు', language: 'te' },
      { keyword: 'ట్రాఫిక్ జామ్', language: 'te' },
    ],
    high_risk_threshold: 60,
    medium_risk_threshold: 35,
    polling_interval_minutes: 30,
    start_date: daysFromNow(-2),
    end_date: daysFromNow(90),
  },
  {
    name: 'Festival Season Public Order (AP)',
    description: 'Sankranti / Ugadi / jathara crowd keywords.',
    location: 'Andhra Pradesh',
    platforms: ['x', 'facebook', 'instagram', 'youtube'],
    keywords: [
      { keyword: 'Sankranti Andhra', language: 'en' },
      { keyword: 'Ugadi celebration', language: 'en' },
      { keyword: 'సంక్రాంతి', language: 'te' },
      { keyword: 'ఉగాది', language: 'te' },
      { keyword: 'జాతర', language: 'te' },
    ],
    high_risk_threshold: 70,
    medium_risk_threshold: 40,
    polling_interval_minutes: 30,
    start_date: daysFromNow(0),
    end_date: daysFromNow(150),
  },
];

const OCCASIONS = [
  {
    sl_no: 1,
    title: 'Makara Sankranti / Kanuma',
    date_label: 'Mid January',
    monitoring_range: 'Jan 13–16',
    suggested_keywords: 'సంక్రాంతి, కనుమ, పండుగ, jathara, kite',
    remarks: 'Harvest festival — rural gatherings, highway traffic',
    platforms: ['x', 'facebook', 'instagram', 'youtube'],
  },
  {
    sl_no: 2,
    title: 'Ugadi',
    date_label: 'March / April (lunar)',
    monitoring_range: 'Ugadi ±2 days',
    suggested_keywords: 'ఉగాది, Telugu New Year, pachadi',
    remarks: 'Telugu New Year — city processions',
    platforms: ['x', 'facebook', 'instagram'],
  },
  {
    sl_no: 3,
    title: 'Tirumala Brahmotsavam',
    date_label: 'Annual (varies)',
    monitoring_range: 'Festival fortnight',
    suggested_keywords: 'Brahmotsavam, తిరుమల, darshan, queue',
    remarks: 'Peak pilgrim density',
    platforms: ['x', 'facebook', 'youtube', 'instagram'],
  },
  {
    sl_no: 4,
    title: 'Cyclone season (Bay of Bengal)',
    date_label: 'Apr–Jun & Oct–Dec',
    monitoring_range: 'Storm alerts window',
    suggested_keywords: 'cyclone, తుఫాను, IMD, evacuation, flood',
    remarks: 'Coastal AP preparedness',
    platforms: ['x', 'facebook', 'youtube'],
  },
];

/** Catalog keywords (Alerts → Manage keywords) — drives post matching / alert creation. */
const EXTRA_CATALOG_KEYWORDS = [
  'Andhra Pradesh Police',
  'APPOLICE',
  'AP Police',
  'law and order',
  'communal clash',
  'stone pelting',
  'mob violence',
  'road blockade',
  'raasta roko',
  'bandh call',
  'curfew',
  'Section 144',
  'illegal arms',
  'drug peddling',
  'ganja',
  'cyber fraud',
  'OTP scam',
  'fake news',
  'rumour',
  'hate speech',
  'rioting',
  'FIR',
  'encounter',
  'Naxal',
  'Maoist',
  'bomb threat',
  'IED',
  'suicide',
  'missing person',
  'kidnap',
  'rape',
  'molestation',
  'dowry death',
  'honour killing',
  'child trafficking',
  'human trafficking',
  'gold smuggling',
  'cattle theft',
  'sand mining',
  'illegal mining',
  'election violence',
  'booth capturing',
  'Vizag',
  'Visakhapatnam',
  'Vijayawada',
  'Guntur',
  'Tirupati',
  'Tirumala',
  'Rajahmundry',
  'Kakinada',
  'Nellore',
  'Kurnool',
  'Anantapur',
  'Ongole',
  'ఆంధ్రప్రదేశ్ పోలీస్',
  'హింస',
  'రాత్రి కార్ఫ్యూ',
  'అక్రమ మాదక ద్రవ్యాలు',
  'సైబర్ మోసం',
  'నకిలీ న్యూస్',
  'దాడి',
  'హత్య',
  'అపహరణ',
  'అత్యాచారం',
];

function collectCatalogKeywords() {
  const set = new Set();
  for (const ev of EVENTS) {
    for (const k of ev.keywords || []) {
      const t = String(k.keyword || '').trim();
      if (t) set.add(t);
    }
  }
  for (const oc of OCCASIONS) {
    String(oc.suggested_keywords || '')
      .split(/[,|]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((t) => set.add(t));
  }
  for (const t of EXTRA_CATALOG_KEYWORDS) {
    const v = String(t || '').trim();
    if (v) set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'en'));
}

const SEED_PROFILE_NAMES = PROFILES.map((p) => p.display_name);
const LEGACY_DUMMY_NAMES = [
  'Visakhapatnam City Police',
  'Vijayawada City Police',
  'Tirupati City Police',
  'Guntur City Police',
  'Government of Andhra Pradesh',
  'ABN Andhra Jyothi',
  'TV9 Telugu',
];

async function ensurePlatforms() {
  const bySlug = {};
  for (const def of PLATFORM_DEFS) {
    const row = await prisma.platforms.upsert({
      where: { slug: def.slug },
      create: {
        name: def.name,
        slug: def.slug,
        icon: def.icon,
        color: def.color,
        fields: def.fields,
        is_active: true,
      },
      update: {
        name: def.name,
        icon: def.icon,
        color: def.color,
        fields: def.fields,
        is_active: true,
      },
    });
    bySlug[def.slug] = row;
  }
  return bySlug;
}

async function resetSeededProfiles() {
  const names = [...new Set([...SEED_PROFILE_NAMES, ...LEGACY_DUMMY_NAMES])];
  const profiles = await prisma.social_media_profiles.findMany({
    where: { display_name: { in: names } },
    select: { id: true, display_name: true },
  });
  if (!profiles.length) return 0;
  const ids = profiles.map((p) => p.id);
  await prisma.social_media_accounts.deleteMany({ where: { profile_id: { in: ids } } });
  await prisma.social_media_profiles.deleteMany({ where: { id: { in: ids } } });
  return profiles.length;
}

async function seedProfiles(platformsBySlug) {
  let createdProfiles = 0;
  let createdAccounts = 0;
  let updatedAccounts = 0;

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
    }

    for (const acc of item.accounts) {
      const platform = platformsBySlug[acc.platform];
      if (!platform) continue;

      const existing = await prisma.social_media_accounts.findUnique({
        where: {
          platform_id_handle: { platform_id: platform.id, handle: acc.handle },
        },
      });

      const preview_data = {
        seeded: true,
        verified: true,
        summary: {
          display_name: item.display_name,
          note: 'Verified AP SOC seed',
          ...(acc.data.channel_id ? { channel_id: acc.data.channel_id } : {}),
        },
        fetched_at: new Date().toISOString(),
      };

      if (existing) {
        await prisma.social_media_accounts.update({
          where: { id: existing.id },
          data: {
            profile_id: profile.id,
            data: acc.data || {},
            preview_data,
            is_active: true,
            monitoring_status: 'stopped',
          },
        });
        updatedAccounts += 1;
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
              by: 'seedApSoc',
              note: 'Verified Andhra Pradesh SOC profile',
            },
          ],
        },
      });
      createdAccounts += 1;
    }
  }

  return { createdProfiles, createdAccounts, updatedAccounts };
}

async function seedEvents() {
  let created = 0;
  for (const ev of EVENTS) {
    const existing = await prisma.social_media_events.findFirst({
      where: { name: ev.name },
    });
    if (existing) continue;
    await prisma.social_media_events.create({
      data: {
        name: ev.name,
        description: ev.description,
        location: ev.location,
        platforms: ev.platforms,
        keywords: ev.keywords,
        high_risk_threshold: ev.high_risk_threshold,
        medium_risk_threshold: ev.medium_risk_threshold,
        polling_interval_minutes: ev.polling_interval_minutes,
        start_date: ev.start_date,
        end_date: ev.end_date,
        monitoring_status: 'stopped',
        monitoring_logs: [
          { at: new Date().toISOString(), action: 'seeded', by: 'seedApSoc' },
        ],
        last_fetched_history: [],
        origin: 'manual',
        created_by: 'seedApSoc',
      },
    });
    created += 1;
  }
  return created;
}

async function seedOccasions() {
  let created = 0;
  for (const oc of OCCASIONS) {
    const existing = await prisma.social_media_occasion_calendar.findFirst({
      where: { title: oc.title },
    });
    if (existing) continue;
    await prisma.social_media_occasion_calendar.create({
      data: {
        sl_no: oc.sl_no,
        title: oc.title,
        date_label: oc.date_label,
        monitoring_range: oc.monitoring_range,
        suggested_keywords: oc.suggested_keywords,
        remarks: oc.remarks,
        platforms: oc.platforms,
        is_recurring: true,
      },
    });
    created += 1;
  }
  return created;
}

async function seedCatalogKeywords() {
  const list = collectCatalogKeywords();
  let created = 0;
  let skipped = 0;
  for (const keyword of list) {
    try {
      await prisma.keywords.create({ data: { keyword } });
      created += 1;
    } catch (err) {
      if (err?.code === 'P2002') {
        skipped += 1;
        continue;
      }
      throw err;
    }
  }
  return { created, skipped, total: list.length };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  console.log('[seed] Andhra Pradesh SOC — verified public profiles…');
  const platforms = await ensurePlatforms();
  console.log(`[seed] platforms: ${Object.keys(platforms).join(', ')}`);

  if (RESET) {
    const removed = await resetSeededProfiles();
    console.log(`[seed] reset removed ${removed} profile(s)`);
  }

  const profiles = await seedProfiles(platforms);
  console.log(
    `[seed] profiles +${profiles.createdProfiles}, accounts +${profiles.createdAccounts}, updated ${profiles.updatedAccounts}`
  );

  const events = await seedEvents();
  console.log(`[seed] events +${events}`);

  const occasions = await seedOccasions();
  console.log(`[seed] occasion calendar +${occasions}`);

  const keywords = await seedCatalogKeywords();
  console.log(
    `[seed] catalog keywords +${keywords.created} (skipped ${keywords.skipped}, list ${keywords.total})`
  );

  console.log('[seed] done — monitoring left stopped; use Start all services when ready');
}

main()
  .catch((err) => {
    console.error('[seed] failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect().catch(() => {}));
