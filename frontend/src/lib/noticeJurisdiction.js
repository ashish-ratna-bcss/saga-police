/**
 * Official-notice jurisdiction copy — derived from tenant branding / admin profile.
 * Prefer application_details.notice overrides; else host → port → title hints → presets.
 * Never use a personal login name (e.g. "Nandeep") as the government/state label.
 */

const TITLE_CASE = (s) =>
  String(s || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

const base = ({ government, department, unit, city, state, address, email, mobile }) => {
  const cityLabel = city || 'the City';
  const stateLabel = state || 'the State';
  return {
    government: government || 'Government of India',
    department: department || '(POLICE DEPARTMENT)',
    unit: unit || `IT Cell, ${cityLabel}`,
    city: cityLabel,
    state: stateLabel,
    regionPhrase: `${cityLabel} and across the State of ${stateLabel}, India`,
    address:
      address ||
      `IT Cell, Commissioner of Police office, ${cityLabel},\n${stateLabel}, India`,
    email: email || '',
    mobile: mobile || '',
    signatureUnit: unit || `IT Cell, ${cityLabel}`,
    signatureState: `${String(stateLabel).toUpperCase()}.`,
  };
};

/** Known tenant presets (host / port / username / title hints). */
const PRESETS = {
  delhi: base({
    government: 'Government of NCT of Delhi',
    unit: 'IT Cell, Delhi Police',
    city: 'Delhi',
    state: 'Delhi',
    address: 'IT Cell, Delhi Police Headquarters,\nDelhi, India',
  }),
  odisha: base({
    government: 'Government of Odisha',
    unit: 'IT Cell, Odisha Police',
    city: 'Bhubaneswar',
    state: 'Odisha',
    address: 'IT Cell, Odisha Police Headquarters,\nBhubaneswar, Odisha, India',
  }),
  uttarakhand: base({
    government: 'Government of Uttarakhand',
    unit: 'IT Cell, Uttarakhand Police',
    city: 'Dehradun',
    state: 'Uttarakhand',
    address: 'IT Cell, Uttarakhand Police Headquarters,\nDehradun, Uttarakhand, India',
  }),
  telangana: base({
    government: 'Government of Telangana',
    unit: 'IT Cell, Hyderabad City',
    city: 'Hyderabad',
    state: 'Telangana',
    address:
      'IT Cell, 4th Floor, Commissioner of Police office, Hyderabad City,\n' +
      'Telangana Integrated Command and Control Center (TGICCC) Road No. 12,\n' +
      'adj. Sri Puri Jagannath Temple, Bhavani Nagar, Banjara Hills, Hyderabad,\n' +
      'Telangana. India',
    email: 'smu-hyderabad@tspolice.gov.in',
    mobile: '8712660777',
  }),
  jharkhand: base({
    government: 'Government of Jharkhand',
    unit: 'IT Cell, Jharkhand Police',
    city: 'Ranchi',
    state: 'Jharkhand',
    address: 'IT Cell, Jharkhand Police Headquarters,\nRanchi, Jharkhand, India',
  }),
  andhra: base({
    government: 'Government of Andhra Pradesh',
    unit: 'IT Cell, Andhra Pradesh Police',
    city: 'Amaravati',
    state: 'Andhra Pradesh',
    address:
      'IT Cell, Andhra Pradesh Police Headquarters,\nAmaravati, Andhra Pradesh, India',
  }),
};

/**
 * Live multi-tenant sites (deploy/sites.json) + known aliases.
 * Host / frontend_port win over whoever is logged in.
 */
const SITE_HINTS = [
  { key: 'odisha', ports: [3000], hosts: ['odisha'], tokens: ['odisha'] },
  { key: 'delhi', ports: [3001], hosts: ['delhi', 'delhipolice'], tokens: ['delhi', 'delhipolice'] },
  {
    key: 'uttarakhand',
    ports: [3002],
    hosts: ['uttarakhand', 'ukpolice'],
    tokens: ['uttarakhand', 'ukpolice'],
  },
  // test (3003) — no police preset; falls back to org title
  {
    key: 'jharkhand',
    ports: [3004],
    hosts: ['jharkhand', 'jharkhandpolice'],
    tokens: ['jharkhand', 'jharkhandpolice'],
  },
  {
    key: 'andhra',
    ports: [3005],
    hosts: ['andhra', 'andhrapradesh', 'appolice'],
    tokens: ['andhra', 'andhrapradesh', 'amaravati', 'vizag', 'visakhapatnam'],
  },
  {
    key: 'telangana',
    ports: [],
    hosts: ['telangana', 'hyderabad', 'tspolice'],
    tokens: ['telangana', 'hyderabad', 'tspolice'],
  },
];

const matchHint = (haystack, { hosts, tokens }) => {
  const h = String(haystack || '').toLowerCase();
  if (!h) return false;
  return [...(hosts || []), ...(tokens || [])].some((t) => h.includes(String(t).toLowerCase()));
};

/** Host from the page wins over whoever is logged in (cross-tenant cookie mistakes). */
const detectKeyFromHost = (host = '') => {
  const h = String(host || '').toLowerCase();
  if (!h) return null;
  for (const hint of SITE_HINTS) {
    if (matchHint(h, hint)) return hint.key;
  }
  return null;
};

const detectKeyFromUser = (user = {}) => {
  const ad = user.application_details || {};
  const port = Number(user.port);
  for (const hint of SITE_HINTS) {
    if (hint.ports.includes(port)) return hint.key;
  }

  const blob = [
    user.username,
    user.name,
    user.full_name,
    ad.title,
    ad.application_name,
    user.db_name,
    ...(Array.isArray(ad.domains) ? ad.domains : []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  for (const hint of SITE_HINTS) {
    if (matchHint(blob, hint)) return hint.key;
  }
  return null;
};

/** Prefer tenant/org title over personal login name (e.g. "Nandeep"). */
const orgLabelFromUser = (user = {}) => {
  const ad = user.application_details || {};
  const strip = (raw) =>
    String(raw || '')
      .replace(/\b(blura\s*saga|police|digital\s*intelligence\s*platform)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  for (const raw of [ad.title, ad.application_name]) {
    const cleaned = strip(raw);
    if (cleaned) return cleaned;
  }

  // Only use personal display name when no org title exists and it looks institutional
  for (const raw of [user.name, user.full_name]) {
    const cleaned = strip(raw);
    if (cleaned && cleaned.split(' ').length > 1) return cleaned;
  }
  return '';
};

const detectKey = (user = {}) => {
  const host =
    typeof window !== 'undefined'
      ? String(window.location.hostname || '').toLowerCase()
      : '';
  return detectKeyFromHost(host) || detectKeyFromUser(user);
};

/** Replace Telangana/Hyderabad boilerplate in saved HTML/text with current jurisdiction. */
export function rewriteStaleJurisdictionText(text, jurisdiction) {
  if (!text || typeof text !== 'string') return text;
  if (!/hyderabad|telangana/i.test(text)) return text;
  const j = jurisdiction || {};
  const city = j.city || 'the City';
  const state = j.state || 'the State';
  const unit = j.unit || `IT Cell, ${city}`;
  const government = j.government || `Government of ${state}`;
  return text
    .replace(/Government of Telangana/gi, government)
    .replace(/GOVERNMENT OF TELANGANA/g, String(government).toUpperCase())
    .replace(/IT Cell,\s*Hyderabad City/gi, unit)
    .replace(/IT Cell,\s*Hyderabad/gi, unit)
    .replace(/Hyderabad City/gi, city)
    .replace(/Hyderabad/gi, city)
    .replace(/State of Telangana/gi, `State of ${state}`)
    .replace(/Telangana(?!\s*Integrated)/gi, state)
    .replace(/TELANGANA\./g, `${String(state).toUpperCase()}.`)
    .replace(/\bTELANGANA\b/g, String(state).toUpperCase());
}

/**
 * @param {object} user — /api/me (or branding) payload
 * @returns {object} notice jurisdiction fields
 */
export function resolveNoticeJurisdiction(user = {}) {
  const ad = user.application_details || {};
  const notice = (ad.notice && typeof ad.notice === 'object' ? ad.notice : {}) || {};
  const key = detectKey(user);
  const preset = (key && PRESETS[key]) || null;

  // Infer city/state from tenant title when no preset — never from a personal login name alone
  let inferredCity = '';
  let inferredState = '';
  const nm = orgLabelFromUser(user);
  if (nm) {
    inferredState = TITLE_CASE(nm);
    inferredCity = TITLE_CASE(nm);
  }

  const fallback = base({
    government: inferredState ? `Government of ${inferredState}` : 'Government of India',
    unit: inferredCity ? `IT Cell, ${inferredCity} Police` : 'IT Cell',
    city: inferredCity || 'the City',
    state: inferredState || 'the State',
  });

  const src = { ...(preset || fallback), ...notice };

  // Keep derived phrases consistent if city/state overridden
  if (notice.city || notice.state || !src.regionPhrase) {
    src.regionPhrase =
      notice.regionPhrase ||
      `${src.city} and across the State of ${src.state}, India`;
  }
  if (!notice.signatureUnit) src.signatureUnit = src.unit;
  if (!notice.signatureState) src.signatureState = `${String(src.state).toUpperCase()}.`;

  return src;
}

export function buildNoticeDefaults(user, { platform, operator, sectionsList, postDateStr, intent, domain } = {}) {
  const j = resolveNoticeJurisdiction(user);
  const plat = platform || 'X';
  const op = operator || 'X Corp.';
  const sections = sectionsList || '505, 353, 153A, 196';
  const when = postDateStr || 'recent date';
  const why = intent || 'circulation of sensitive content';

  const addressLines = [j.address];
  if (j.mobile) addressLines[addressLines.length - 1] += `, Mobile No: ${j.mobile}`;
  if (j.email) addressLines.push(`e-mail ID: ${j.email}`);

  return {
    headerGovt: j.government,
    headerDept: j.department,
    subject: `NOTICE: U/Sec: 69(A) & 79(3) Information Technology Amendment Act 2008 and 94 BNSS of India. (Cr.No 11/2026, U/Sec ${sections} of BNS of ${j.unit})`,
    introText: `I am the Inspector of Police, presently working at ${j.unit}, ${j.city}, ${j.state}, India. I am investigating the above-referenced crime, which pertains to the circulation of objectionable and communally sensitive content on the social media platform ${plat} (formerly Twitter) operated by ${op}.`,
    bodyText: `It is brought to notice that on ${when}, posts/videos were uploaded through the below-mentioned ${plat} account, containing content relating to the ${why}. The said content is highly sensitive in nature, and its continued circulation is likely to incite communal disharmony, thereby posing a serious threat to public order and law & order in ${j.regionPhrase}.`,
    addressBlock: addressLines.join('\n'),
    signatureBlock: `Inspector of Police,\n${j.signatureUnit}\n${j.signatureState}`,
    jurisdiction: j,
  };
}
