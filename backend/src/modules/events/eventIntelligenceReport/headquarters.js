/**
 * Dynamic Force headquarters used on intelligence and executive briefs.
 * Allows tenant configuration to supply custom force, designation, and address,
 * while providing intelligent dynamic fallbacks based on tenant name.
 */

const KNOWN_DIRECTORIES = [
  {
    keys: ['odisha', 'orissa'],
    force: 'Odisha Police',
    head: 'Director General of Police',
    headquarters: 'State Police Headquarters, Buxi Bazar, Cuttack',
    pin: '753001',
    phone: 'Control Room: 0671-2304001',
    official: true,
  },
  {
    keys: ['delhi', 'delhipolice'],
    force: 'Delhi Police',
    head: 'Commissioner of Police',
    headquarters: 'Police Headquarters, Jai Singh Marg, New Delhi',
    pin: '110001',
    phone: '',
    official: true,
  },
  {
    keys: ['uttarakhand'],
    force: 'Uttarakhand Police',
    head: 'Director General of Police',
    headquarters: 'Police Headquarters, Dehradun',
    pin: '248001',
    phone: '',
    official: true,
  },
  {
    keys: ['jharkhand'],
    force: 'Jharkhand Police',
    head: 'Director General of Police',
    headquarters: 'Jharkhand Police Headquarters, Dhurwa, Ranchi',
    pin: '834004',
    phone: '',
    official: true,
  },
  {
    keys: ['andhrapradesh', 'andhra', 'ap'],
    force: 'Andhra Pradesh Police',
    head: 'Director General of Police',
    headquarters: 'Police Headquarters, Mangalagiri, Amaravati',
    pin: '522502',
    phone: '',
    official: true,
  },
  {
    keys: ['karnataka'],
    force: 'Karnataka Police',
    head: 'Director General of Police',
    headquarters: 'Police Headquarters, Nrupathunga Road, Bengaluru',
    pin: '560001',
    phone: '',
    official: true,
  },
  {
    keys: ['maharashtra', 'mumbai'],
    force: 'Maharashtra Police',
    head: 'Director General of Police',
    headquarters: 'Police Headquarters, Colaba, Mumbai',
    pin: '400001',
    phone: '',
    official: true,
  },
  {
    keys: ['tamilnadu', 'chennai'],
    force: 'Tamil Nadu Police',
    head: 'Director General of Police',
    headquarters: 'Police Headquarters, Radhakrishnan Salai, Mylapore, Chennai',
    pin: '600004',
    phone: '',
    official: true,
  },
  {
    keys: ['telangana', 'hyderabad'],
    force: 'Telangana Police',
    head: 'Director General of Police',
    headquarters: 'DGP Office, Saifabad, Hyderabad',
    pin: '500004',
    phone: '',
    official: true,
  },
  {
    keys: ['westbengal', 'bengal', 'kolkata'],
    force: 'West Bengal Police',
    head: 'Director General of Police',
    headquarters: 'Nabanna / Bhabani Bhawan, Alipore, Kolkata',
    pin: '700027',
    phone: '',
    official: true,
  },
];

const fold = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Dynamically resolves headquarters from tenant configuration or tenant name.
 * Accepts custom overrides from tenant settings if provided.
 */
const resolveHeadquarters = (label, customConfig = null) => {
  if (customConfig && typeof customConfig === 'object') {
    const force = customConfig.force || customConfig.force_name || customConfig.agency_name;
    const head = customConfig.head || customConfig.designation || customConfig.head_title || 'Director General of Police';
    const headquarters = customConfig.headquarters || customConfig.address || customConfig.hq_address;
    if (force || headquarters) {
      return {
        force: force || `${label || 'State'} Police`,
        head: head || 'Director General of Police',
        headquarters: headquarters || 'State Police Headquarters',
        pin: customConfig.pin || '',
        phone: customConfig.phone || '',
        official: true,
        addressLine: [headquarters, customConfig.pin].filter(Boolean).join(', PIN '),
      };
    }
  }

  const folded = fold(label);
  if (!folded) return null;

  const hit = KNOWN_DIRECTORIES.find((row) => row.keys.some((k) => folded.includes(fold(k))));
  if (hit) {
    return {
      force: hit.force,
      head: hit.head,
      headquarters: hit.headquarters,
      pin: hit.pin,
      phone: hit.phone,
      official: hit.official,
      addressLine: [hit.headquarters, hit.pin].filter(Boolean).join(', PIN '),
    };
  }

  // Generic dynamic fallback
  const cleanLabel = String(label || '')
    .replace(/[_]+/g, ' ')
    .replace(/\bblurasaga\b/gi, '')
    .replace(/\bblura\s+saga\b/gi, '')
    .trim();

  const titleCase = cleanLabel ? cleanLabel.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : 'State Intelligence Desk';

  return {
    force: `${titleCase} Force / Agency`,
    head: 'Director General of Police / Chief of Police',
    headquarters: 'State Headquarters',
    pin: '',
    phone: '',
    official: false,
    addressLine: `${titleCase} Headquarters`,
  };
};

/** One sentence for the summary prompt. */
const headquartersPromptLine = (hq) => {
  if (!hq) {
    return 'ADDRESSEE: State Police Headquarters / Law Enforcement Leadership.';
  }
  return `ADDRESSEE: The ${hq.head}, ${hq.force}. Headquarters: ${hq.addressLine}.`;
};

module.exports = { resolveHeadquarters, headquartersPromptLine, KNOWN_DIRECTORIES };

