/**
 * Seed Andhra Pradesh SOC starter data with verified public handles.
 * YouTube entries include live channel_id + uploads_playlist_id (playlist API checked).
 *
 *   node prisma/seedApSoc.js
 *   node prisma/seedApSoc.js --reset   # remove prior seed rows, then re-seed
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const RESET = process.argv.includes('--reset');

/** Shared Meta/X/YouTube rule packs for AP-priority categories not in mapping_data.json */
const RULES = {
  violence: {
    youtube: [{ id: 'VIOLENT_GRAPHIC_CONTENT', name: 'Violent or Graphic Content' }],
    x: [{ id: 'VIOLENT_SPEECH', name: 'Violent Speech' }],
    facebook: [{ id: 'VIOLENCE_INCITEMENT', name: 'Violence and Incitement' }],
    instagram: [{ id: 'VIOLENCE_INCITEMENT', name: 'Violence and Incitement' }],
  },
  fraud: {
    youtube: [{ id: 'SPAM_DECEPTIVE', name: 'Spam, Deceptive Practices & Scams' }],
    x: [{ id: 'PLATFORM_MANIPULATION', name: 'Platform Manipulation and Spam' }],
    facebook: [{ id: 'FRAUD_SCAMS', name: 'Fraud and Scams' }],
    instagram: [{ id: 'FRAUD_SCAMS', name: 'Fraud and Scams' }],
  },
  illegal: {
    youtube: [{ id: 'ILLEGAL_ACTIVITIES', name: 'Illegal Activities' }],
    x: [{ id: 'ILLEGAL_GOODS', name: 'Illegal or Certain Regulated Goods' }],
    facebook: [{ id: 'RESTRICTED_GOODS', name: 'Restricted Goods and Services' }],
    instagram: [{ id: 'RESTRICTED_GOODS', name: 'Restricted Goods and Services' }],
  },
  harassment: {
    youtube: [{ id: 'HARASSMENT_CYBERBULLYING', name: 'Harassment & Cyberbullying' }],
    x: [{ id: 'ABUSE_HARASSMENT', name: 'Abuse and Harassment' }],
    facebook: [{ id: 'BULLYING_HARASSMENT', name: 'Bullying and Harassment' }],
    instagram: [{ id: 'BULLYING_HARASSMENT', name: 'Bullying and Harassment' }],
  },
};

/**
 * AP SOC policy categories — AI definitions + keywords.
 * Legal/platform maps for overlapping ids are taken from mapping_data.json when present.
 */
const AP_POLICY_DEFS = [
  {
    category_id: 'Hate_Speech',
    severity_level: 'High',
    definition:
      'Content that attacks, degrades, or calls for exclusion of people in Andhra Pradesh based on religion, caste, language, ethnicity, gender, or community identity. Include dehumanising labels, slurs, and coordinated hate campaigns targeting AP communities.',
    keywords: ['hate speech', 'caste slur', 'religious hate', 'ద్వేషపూరిత'],
  },
  {
    category_id: 'Communal_Violence',
    severity_level: 'High',
    definition:
      'Posts that promote enmity between communities, threaten or celebrate communal violence, or urge riots, arson, or mob action in Andhra Pradesh. Prioritise location cues (districts, towns, temples/mosques) and calls to gather for violence.',
    keywords: ['communal clash', 'riot', 'mob violence', 'కమ్యూనల్', 'గొడవ'],
  },
  {
    category_id: 'Misinformation',
    severity_level: 'High',
    definition:
      'False or misleading claims circulated to create panic, damage reputation, or distort public events in Andhra Pradesh — including fake orders, forged FIR/notices, rumour about police action, health scares, and doctored media. Distinguish satire when clearly labelled.',
    keywords: ['fake news', 'rumour', 'నకిలీ న్యూస్', 'పుకార్లు', 'forward'],
  },
  {
    category_id: 'Harassment',
    severity_level: 'Medium',
    definition:
      'Targeted abuse, doxxing, sustained insults, or coordinated pile-ons against individuals (officers, journalists, civilians) that are not primarily group-based hate. Include cyberbullying and reputational attacks with identifiable victims.',
    keywords: ['harassment', 'doxxing', 'troll', 'వేధింపు'],
  },
  {
    category_id: 'Sexual_Harassment',
    severity_level: 'High',
    definition:
      'Unwanted sexual advances, sexualised threats, non-consensual intimate imagery discussion, or sexual humiliation directed at a person. Flag for triage; escalate graphic sexual violence to Crime_Against_Women when assault is alleged.',
    keywords: ['sexual harassment', 'molestation', 'అత్యాచారం attempt', 'modesty'],
  },
  {
    category_id: 'threat',
    severity_level: 'High',
    definition:
      'Direct threats of violence, harm, or criminal acts against a person, group, or institution (including AP Police). Credible intent language such as kill, bomb, burn, attack — even if conditional.',
    keywords: ['threat', 'kill you', 'bomb', 'బెదిరింపు', 'చంపుతా'],
  },
  {
    category_id: 'threat_incitement',
    severity_level: 'High',
    definition:
      'Calls to others to commit violence, vandalism, or public disorder in Andhra Pradesh — “gather and attack”, “burn the office”, “lynch”, “stone pelting” instructions. Includes coded mobilisation when clearly urging illegal force.',
    keywords: ['incitement', 'stone pelting', 'lynch', 'దాడి చేయండి', 'రాళ్లు విసరండి'],
  },
  {
    category_id: 'Cyber_Fraud',
    severity_level: 'High',
    definition:
      'OTP phishing, fake KYC, investment scams, impersonation of banks/UPI/govt/AP Police to steal money or credentials, and recruitment into fraud networks targeting Andhra users.',
    keywords: ['OTP scam', 'cyber fraud', 'phishing', 'సైబర్ మోసం', 'UPI fraud'],
    legal_sections: [
      { id: 'IT_66C', code: 'IT Act 66C', title: 'Identity theft' },
      { id: 'IT_66D', code: 'IT Act 66D', title: 'Cheating by personation using computer resource' },
      { id: 'BNS_318', code: '318', title: 'Cheating' },
    ],
    platform_policies: RULES.fraud,
  },
  {
    category_id: 'Drugs_Narcotics',
    severity_level: 'High',
    definition:
      'Sale, peddling, trafficking, or open solicitation of ganja/narcotics and related logistics in Andhra Pradesh. Include coded slang when clearly about drug trade; exclude medical/news reporting without solicitation.',
    keywords: ['ganja', 'drug peddling', 'NDPS', 'గంజాయి', 'మాదక ద్రవ్యాలు'],
    legal_sections: [
      { id: 'NDPS_20', code: 'NDPS 20', title: 'Punishment for cannabis-related offences' },
      { id: 'NDPS_21', code: 'NDPS 21', title: 'Punishment for manufactured drugs' },
    ],
    platform_policies: RULES.illegal,
  },
  {
    category_id: 'Protest_Public_Order',
    severity_level: 'Medium',
    definition:
      'Calls for bandh, raasta roko, road blockade, unlawful assembly, or disruption of public order in Andhra Pradesh. Include violent protest planning; peaceful protest announcements without illegal obstruction stay lower priority / Normal if clearly lawful.',
    keywords: ['bandh', 'raasta roko', 'road blockade', 'బంద్', 'రోడ్డు దిగ్బంధం'],
    legal_sections: [
      { id: 'BNS_189', code: '189', title: 'Unlawful assembly' },
      { id: 'BNS_191', code: '191', title: 'Rioting' },
      { id: 'BNS_223', code: '223', title: 'Disobedience to order duly promulgated by public servant' },
    ],
    platform_policies: RULES.violence,
  },
  {
    category_id: 'Crime_Against_Women',
    severity_level: 'High',
    definition:
      'Reports or glorification of rape, sexual assault, domestic violence, dowry-related harm, acid attack, or trafficking of women/girls in Andhra Pradesh. Prioritise actionable victim/location details for SOC triage; do not treat advocacy against violence as the offence.',
    keywords: ['rape', 'dowry death', 'domestic violence', 'అత్యాచారం', 'వధువు హింస'],
    legal_sections: [
      { id: 'BNS_64', code: '64', title: 'Rape' },
      { id: 'BNS_70', code: '70', title: 'Gang rape' },
      { id: 'BNS_80', code: '80', title: 'Dowry death' },
      { id: 'BNS_85', code: '85', title: 'Husband or relative subjecting woman to cruelty' },
    ],
    platform_policies: RULES.harassment,
  },
  {
    category_id: 'Normal',
    severity_level: 'Low',
    definition:
      'Benign content with no credible AP public-order, crime, hate, fraud, or safety signal — routine news, greetings, sports, entertainment, or official awareness without actionable offence. Use when no other category applies.',
    keywords: [],
    legal_sections: [],
    platform_policies: { youtube: [], x: [], facebook: [], instagram: [] },
  },
];

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

function loadMappingByCategory() {
  try {
    const raw = fs.readFileSync(
      path.join(__dirname, '../src/data/mapping_data.json'),
      'utf8'
    );
    const data = JSON.parse(raw);
    const map = new Map();
    for (const row of data.category_mappings || []) {
      if (row?.category_id) map.set(row.category_id, row);
    }
    return map;
  } catch (_) {
    return new Map();
  }
}

/**
 * Upsert AP SOC policy_mappings (safe re-run). Merges legal/platform from
 * mapping_data.json when the category already exists there.
 */
async function seedPolicyMappings() {
  const fromFile = loadMappingByCategory();
  let created = 0;
  let updated = 0;

  for (const def of AP_POLICY_DEFS) {
    const base = fromFile.get(def.category_id);
    const legal_sections =
      def.legal_sections !== undefined
        ? def.legal_sections
        : Array.isArray(base?.legal_sections)
          ? base.legal_sections
          : [];
    const platform_policies =
      def.platform_policies !== undefined
        ? def.platform_policies
        : base?.platform_policies && typeof base.platform_policies === 'object'
          ? base.platform_policies
          : { youtube: [], x: [], facebook: [], instagram: [] };

    const data = {
      definition: def.definition,
      legal_sections,
      platform_policies,
      keywords: Array.isArray(def.keywords) ? def.keywords : [],
      severity_level: def.severity_level || 'Medium',
      is_active: true,
    };

    const existing = await prisma.policy_mappings.findUnique({
      where: { category_id: def.category_id },
    });

    if (existing) {
      await prisma.policy_mappings.update({
        where: { category_id: def.category_id },
        data,
      });
      updated += 1;
    } else {
      await prisma.policy_mappings.create({
        data: {
          category_id: def.category_id,
          ...data,
        },
      });
      created += 1;
    }
  }

  return { created, updated, total: AP_POLICY_DEFS.length };
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

  const policies = await seedPolicyMappings();
  console.log(
    `[seed] policy mappings +${policies.created} updated ${policies.updated} (list ${policies.total})`
  );

  console.log('[seed] done — monitoring left stopped; use Start all services when ready');
}

main()
  .catch((err) => {
    console.error('[seed] failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect().catch(() => {}));
