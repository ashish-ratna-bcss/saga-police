/**
 * Where a tenant is, and whether a piece of text is about that place.
 *
 * Nothing here is typed in by hand. It reuses what the app already keeps:
 *  - the tenant's force profile (name and time zone) from its settings, with the tenant profile file as fallback;
 *  - backend/src/data/indiaGeographies.json via the events geography service (every state, its districts, towns, landmarks);
 *  - the GeoNames place index used by the event reports (a place written in any script, with its region and country).
 */
const geography = require('../events/indiaGeography.service');
const { getTenantProfile } = require('../events/eventIntelligenceReport/tenantProfile');
const { resolveHeadquarters } = require('../events/eventIntelligenceReport/headquarters');
const geoNames = require('../../services/SummaryLLM/geo.service');

const fold = (s) => String(s || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const EDGE = '[\\p{L}\\p{M}\\p{N}]';

/* ───────────── time zone (any IANA zone, daylight saving included) ───────────── */

const tzOffsetMs = (date, tz) => {
  try {
    const f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
    const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
    return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second))
      - Math.floor(date.getTime() / 1000) * 1000;
  } catch {
    return 330 * 60000; // India, when a zone name is not recognised
  }
};

/* ───────────── places of the tenant's state ───────────── */

const stateRegexCache = new Map();
const placeRegexFor = (state) => {
  if (stateRegexCache.has(state)) return stateRegexCache.get(state);
  const names = geography.resolveStatePlaces(state)
    .filter((p) => p && p.length >= 3 && fold(p) !== fold(state))
    .sort((a, b) => b.length - a.length);
  const re = names.length
    ? new RegExp(`(?<!${EDGE})(${names.map((n) => escapeRe(n).replace(/\s+/g, '\\s+')).join('|')})(?!${EDGE})`, 'iu')
    : null;
  stateRegexCache.set(state, re);
  return re;
};

// Every other state's places in one pattern, with the state each belongs to, built once.
let allStates = null;
const loadAllStates = () => {
  if (allStates) return allStates;
  const data = geography.loadGeographyData();
  const byPlace = new Map();
  Object.entries(data.states || {}).forEach(([state, obj]) => {
    [state, obj.capital, ...(obj.districts || []), ...(obj.major_cities_and_towns || [])].filter(Boolean).forEach((p) => {
      if (p.length >= 4 && !byPlace.has(fold(p))) byPlace.set(fold(p), state);
    });
  });
  const names = [...byPlace.keys()].sort((a, b) => b.length - a.length);
  const re = names.length
    ? new RegExp(`(?<!${EDGE})(${names.map((n) => escapeRe(n).replace(/\s+/g, '\\s+')).join('|')})(?!${EDGE})`, 'giu')
    : null;
  allStates = { byPlace, re };
  return allStates;
};

const wordsOf = (text) => [...new Set(String(text || '').normalize('NFKC').split(/[^\p{L}\p{M}\p{N}]+/u).filter((w) => w.length >= 3))].slice(0, 90);

const lookupCache = new Map();
/** GeoNames: a word in any script → { name, region, country, kind, pop } or null. Cached. */
const lookup = (word) => {
  if (lookupCache.has(word)) return lookupCache.get(word);
  let r = null;
  try { r = geoNames.lookupPlace(word, '', ''); } catch { r = null; }
  if (lookupCache.size > 5000) lookupCache.clear();
  lookupCache.set(word, r);
  return r;
};

/* ───────────── tenant ───────────── */

const cache = new Map();
const TTL_MS = 60 * 1000;

/**
 * { label, state, country, tz, places } for the tenant asking.
 *  - state: an Indian state from the data file when the force's name or database name carries one.
 *  - country: set for tenants outside India (found through GeoNames), so their relevance still works.
 */
const loadTenantGeo = async (tenant = {}) => {
  const key = tenant.dbName || tenant.title || '';
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.value;

  let saved = null;
  try { saved = await getTenantProfile(tenant.dbName); } catch { saved = null; }
  const label = (saved && saved.force) || tenant.title || tenant.dbName || '';
  let hq = null;
  try { hq = resolveHeadquarters(`${tenant.dbName || ''} ${label}`.trim(), saved); } catch { hq = null; }

  const state = geography.normalizeStateName(`${label} ${tenant.dbName || ''}`) || null;
  let country = null;
  if (!state) {
    for (const w of wordsOf(`${label} ${String(tenant.dbName || '').replace(/_/g, ' ')}`)) {
      const r = lookup(w);
      if (r && r.kind === 'country') { country = r.country || r.name; break; }
    }
  }
  const value = {
    label: state || country || String(label).replace(/\s*(police|blura\s*saga)\s*/gi, ' ').trim() || 'Your area',
    state,
    country,
    tz: (hq && hq.timezone) || (saved && saved.timezone) || process.env.DEFAULT_REPORT_TIMEZONE || 'Asia/Kolkata',
    hasPlaces: Boolean(state && geography.resolveStatePlaces(state).length),
  };
  cache.set(key, { value, until: Date.now() + TTL_MS });
  return value;
};

/* ───────────── reading a text ───────────── */

/** The district or town of the tenant's state named in the text (English names, or any script through GeoNames). */
const placeIn = (text, geo) => {
  if (!geo || !geo.state) return null;
  const re = placeRegexFor(geo.state);
  const m = re ? String(text || '').match(re) : null;
  if (m) return m[1].replace(/\s+/g, ' ');
  // Place names written in Hindi and other scripts
  const known = new Set(geography.resolveStatePlaces(geo.state).map(fold));
  for (const w of wordsOf(text)) {
    if (/^[\x00-\x7F]+$/.test(w)) continue;
    const r = lookup(w);
    if (r && r.name && (known.has(fold(r.name)) || (fold(r.region) === fold(geo.state) && r.kind === 'city' && r.pop > 20000))) return r.name;
  }
  return null;
};

/** Other Indian states named in the text, through their places. */
const otherStatesIn = (text, geo) => {
  const { byPlace, re } = loadAllStates();
  const found = new Set();
  if (re) {
    const t = String(text || '');
    re.lastIndex = 0;
    let m = re.exec(t);
    while (m && found.size < 3) {
      const st = byPlace.get(fold(m[1]));
      if (st && fold(st) !== fold(geo.state)) found.add(st);
      m = re.exec(t);
    }
  }
  return [...found];
};

/** A country other than the tenant's (India by default) that the text is about, if any. */
const foreignIn = (text, geo) => {
  const home = fold(geo.country || 'India');
  for (const w of wordsOf(text)) {
    if (/^[a-z]/.test(w)) continue; // proper names only: "Paris", not "paris"
    const r = lookup(w);
    if (!r) continue;
    const c = fold(r.country || r.name);
    if (c && c !== home && (r.kind === 'country' || (r.kind === 'city' && r.pop > 500000))) return r.kind === 'country' ? r.name : r.country || r.name;
  }
  return null;
};

/** How local a text is: 100 when it names the tenant's place, low when it is plainly about somewhere else. */
const relevance = (text, stateTag, geo) => {
  const body = `${text || ''} ${stateTag || ''}`;
  const where = geo.state || geo.country;
  if (!where) return { score: 60, why: null };
  if (geo.state) {
    const local = placeIn(body, geo);
    if (local) return { score: 100, why: `mentions ${local}` };
    if (new RegExp(`(?<!${EDGE})${escapeRe(geo.state)}(?!${EDGE})`, 'iu').test(body)) return { score: 100, why: `mentions ${geo.state}` };
    const other = otherStatesIn(body, geo);
    if (other.length) return { score: 12, why: `refers to ${other[0]}, outside ${geo.state}` };
  } else if (new RegExp(`(?<!${EDGE})${escapeRe(geo.country)}(?!${EDGE})`, 'iu').test(body)) {
    return { score: 100, why: `mentions ${geo.country}` };
  }
  const foreign = foreignIn(text, geo);
  if (foreign) return { score: 10, why: `is about ${foreign}, far from ${where}` };
  return { score: 50, why: 'no place named' };
};

module.exports = { loadTenantGeo, placeIn, relevance, tzOffsetMs };
