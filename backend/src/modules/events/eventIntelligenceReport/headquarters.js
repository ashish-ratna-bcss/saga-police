/**
 * Force headquarters used on the crime-branch brief.
 * Street lines are included only where a fetched page stated them.
 * Office-holder names are omitted: they change, and a brief must not go stale.
 *
 * Checked 1 Oct 2026:
 * - Odisha street and DGP desk: police.odisha.gov.in contact page and the
 *   Odisha Police citizen directory (both official).
 * - Delhi, Uttarakhand, Jharkhand, Andhra Pradesh: Wikipedia agency infoboxes.
 *   Official homepages were opened and did not print a street, so those
 *   streets stay marked secondary. Delhi is a commissionerate: Commissioner
 *   of Police, not a DGP.
 */

const DIRECTORY = [
  {
    keys: ['odisha'],
    force: 'Odisha Police',
    head: 'Director General of Police',
    headquarters: 'State Police Headquarters, Buxi Bazar, Cuttack (Kataka)',
    pin: '753001',
    phone: 'Control Room 0671-2304001 · DGP office 0671-2306501',
    official: true,
    sources: [
      { label: 'Odisha Police contact page', url: 'https://police.odisha.gov.in/en/sun/contact-us' },
      { label: 'Odisha Police citizen directory', url: 'https://services-op.odisha.gov.in/Citizen/ContentHtm/ContactUs1.htm' },
    ],
    note: 'State Police Headquarters is at Cuttack. Bhubaneswar is the state capital and the police academy; it is not this headquarters.',
  },
  {
    keys: ['delhi', 'delhipolice'],
    force: 'Delhi Police',
    head: 'Commissioner of Police',
    headquarters: 'Police Headquarters, Jai Singh Marg, New Delhi',
    pin: '',
    phone: '',
    official: false,
    sources: [
      { label: 'Delhi Police agency record', url: 'https://en.wikipedia.org/wiki/Delhi_Police' },
      { label: 'Delhi Police official site', url: 'https://delhipolice.gov.in/' },
    ],
    note: 'Delhi Police is headed by the Commissioner of Police, not a Director General. The street is from the agency record; the official home page did not print it.',
  },
  {
    keys: ['uttarakhand'],
    force: 'Uttarakhand Police',
    head: 'Director General of Police',
    headquarters: 'Police Headquarters, Dehradun',
    pin: '',
    phone: '',
    official: false,
    sources: [
      { label: 'Uttarakhand Police agency record', url: 'https://en.wikipedia.org/wiki/Uttarakhand_Police' },
    ],
    note: 'The agency record gives the headquarters city as Dehradun and does not give a street. No street is added.',
  },
  {
    keys: ['jharkhand'],
    force: 'Jharkhand Police',
    head: 'Director General of Police',
    headquarters: 'Jharkhand Police Headquarters, Dhurwa, Ranchi',
    pin: '834004',
    phone: '',
    official: false,
    sources: [
      { label: 'Jharkhand Police agency record', url: 'https://en.wikipedia.org/wiki/Jharkhand_Police' },
      { label: 'Jharkhand Police headquarters page', url: 'https://jhpolice.gov.in/districts-locations/police-headquarter-915-1367828523' },
    ],
    note: 'The street and PIN are from the agency record. The official headquarters page confirms the headquarters and does not print the street.',
  },
  {
    keys: ['andhrapradesh', 'andhra'],
    force: 'Andhra Pradesh Police',
    head: 'Director General of Police',
    headquarters: 'Police Headquarters, Mangalagiri, Amaravati',
    pin: '522502',
    phone: '',
    official: false,
    sources: [
      { label: 'Andhra Pradesh Police agency record', url: 'https://en.wikipedia.org/wiki/Andhra_Pradesh_Police' },
      { label: 'Andhra Pradesh Police official site', url: 'https://www.appolice.gov.in/' },
    ],
    note: 'Andhra Pradesh Police headquarters is at Mangalagiri. Hyderabad is not this headquarters.',
  },
];

const fold = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');

/**
 * Match a tenant label to a force headquarters.
 * Returns null when nothing matches, so an unknown account is not given a guessed city.
 * Longer keys are tried first so "andhrapradesh" wins over a shorter neighbour.
 */
const resolveHeadquarters = (label) => {
  const folded = fold(label);
  if (!folded) return null;
  const ranked = [...DIRECTORY].sort(
    (a, b) => Math.max(...b.keys.map((k) => k.length)) - Math.max(...a.keys.map((k) => k.length))
  );
  const hit = ranked.find((row) => row.keys.some((k) => folded.includes(fold(k))));
  if (!hit) return null;
  return {
    force: hit.force,
    head: hit.head,
    headquarters: hit.headquarters,
    pin: hit.pin,
    phone: hit.phone,
    official: hit.official,
    sources: hit.sources,
    note: hit.note,
    addressLine: [hit.headquarters, hit.pin].filter(Boolean).join(', PIN '),
  };
};

/** One sentence for the summary prompt. Does not name the current office-holder. */
const headquartersPromptLine = (hq) => {
  if (!hq) {
    return 'ADDRESSEE: No verified headquarters record matched this account. Do not invent a headquarters street, city, PIN, or office-holder.';
  }
  return `ADDRESSEE: The ${hq.head}, ${hq.force}. Headquarters: ${hq.addressLine}. ${hq.note} This address is the force headquarters. Do not move it to a city named in a post, and do not name the current office-holder.`;
};

module.exports = { resolveHeadquarters, headquartersPromptLine, DIRECTORY };
