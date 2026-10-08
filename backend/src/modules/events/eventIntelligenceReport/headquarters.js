/**
 * Dynamic Force headquarters used on intelligence and executive briefs.
 * Allows tenant configuration to supply custom force, designation, and address,
 * while providing intelligent dynamic fallbacks based on tenant name.
 */

// Per-tenant force details live in backend/config/tenant_profiles.json (or the file named by TENANT_PROFILES_FILE),
// so adding or changing a tenant never needs a code change.
const fs = require('fs');
const path = require('path');

const loadProfiles = () => {
  try {
    const file = process.env.TENANT_PROFILES_FILE || path.join(__dirname, '../../../../config/tenant_profiles.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(data.profiles) ? data.profiles.map((p) => ({ ...p, official: true })) : [];
  } catch (e) {
    return [];
  }
};
const KNOWN_DIRECTORIES = loadProfiles();


// Report settings that come from the force profile: timezone, classification marking, unit names and sign-off roles.
// Lists are kept as comma-separated text in the profile so an admin can edit them as plain text.
const list = (v) => String(v || '').split(',').map((t) => t.trim()).filter(Boolean);
const extras = (src) => ({
  display_name: src.display_name || '',
  timezone: src.timezone || '',
  classification: src.classification || '',
  units: list(src.units),
  signoff: list(src.signoff),
});

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
        ...extras(customConfig),
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
      ...extras(hit),
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

/** Display name for the page footer, from the tenant profile; generic fallback for unknown tenants. */
const tenantDisplayName = (label, profile = null) => {
  if (profile && (profile.display_name || profile.force)) return profile.display_name || String(profile.force).toUpperCase();
  const folded = fold(label);
  const hit = folded && KNOWN_DIRECTORIES.find((row) => row.keys.some((k) => folded.includes(fold(k))));
  if (hit) return hit.display_name || String(hit.force || '').toUpperCase();
  const s = String(label || '').replace(/[_]+/g, ' ').replace(/\bblura\s*saga\b/gi, '').trim();
  return s ? s.toUpperCase() : 'DIGITAL INTELLIGENCE PLATFORM';
};

/** Language the tenant wants its reports written in (profile field report_language); English when not set. */
const reportLanguageFor = (label, profile = null) => {
  if (profile && profile.report_language) return profile.report_language;
  const folded = fold(label);
  const hit = folded && KNOWN_DIRECTORIES.find((row) => row.keys.some((k) => folded.includes(fold(k))));
  return (hit && hit.report_language) || 'English';
};

module.exports = { reportLanguageFor, resolveHeadquarters, headquartersPromptLine, tenantDisplayName, KNOWN_DIRECTORIES };

