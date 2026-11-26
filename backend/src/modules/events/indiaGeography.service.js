const fs = require('fs');
const path = require('path');

let geographyData = null;

const loadGeographyData = () => {
  if (geographyData) return geographyData;
  try {
    const jsonPath = path.join(__dirname, '../../data/indiaGeographies.json');
    const content = fs.readFileSync(jsonPath, 'utf8');
    geographyData = JSON.parse(content);
  } catch (err) {
    geographyData = { states: {} };
  }
  return geographyData;
};

/**
 * Normalizes a state name string (e.g. "odisha", "odisha police", "orissa" -> "Odisha")
 */
const normalizeStateName = (input = '') => {
  const s = String(input || '').toLowerCase().trim();
  if (!s) return null;

  if (s.includes('odisha') || s.includes('orissa')) return 'Odisha';
  if (s.includes('delhi')) return 'Delhi';
  if (s.includes('andhra') || s === 'ap') return 'Andhra Pradesh';
  if (s.includes('jharkhand')) return 'Jharkhand';
  if (s.includes('uttarakhand') || s.includes('uttaranchal')) return 'Uttarakhand';
  if (s.includes('maharashtra') || s.includes('mumbai')) return 'Maharashtra';
  if (s.includes('karnataka') || s.includes('bengaluru') || s.includes('bangalore')) return 'Karnataka';
  if (s.includes('tamil') || s.includes('chennai')) return 'Tamil Nadu';
  if (s.includes('west bengal') || s.includes('kolkata') || s.includes('bengal')) return 'West Bengal';
  if (s.includes('gujarat')) return 'Gujarat';
  if (s.includes('rajasthan') || s.includes('jaipur')) return 'Rajasthan';
  if (s.includes('madhya pradesh') || s.includes('bhopal') || s.includes('indore')) return 'Madhya Pradesh';
  if (s.includes('uttar pradesh') || s.includes('lucknow') || s.includes('noida')) return 'Uttar Pradesh';
  if (s.includes('bihar') || s.includes('patna')) return 'Bihar';
  if (s.includes('punjab') || s.includes('amritsar')) return 'Punjab';
  if (s.includes('haryana') || s.includes('gurugram') || s.includes('gurgaon')) return 'Haryana';
  if (s.includes('kerala') || s.includes('kochi') || s.includes('trivandrum')) return 'Kerala';
  if (s.includes('telangana') || s.includes('hyderabad')) return 'Telangana';
  if (s.includes('assam') || s.includes('guwahati')) return 'Assam';
  if (s.includes('chhattisgarh') || s.includes('raipur')) return 'Chhattisgarh';
  if (s.includes('himachal') || s.includes('shimla')) return 'Himachal Pradesh';
  if (s.includes('goa')) return 'Goa';
  if (s.includes('jammu') || s.includes('kashmir') || s.includes('srinagar')) return 'Jammu and Kashmir';
  if (s.includes('ladakh') || s.includes('leh')) return 'Ladakh';
  if (s.includes('chandigarh')) return 'Chandigarh';
  if (s.includes('puducherry') || s.includes('pondicherry')) return 'Puducherry';
  if (s.includes('tripura')) return 'Tripura';
  if (s.includes('meghalaya') || s.includes('shillong')) return 'Meghalaya';
  if (s.includes('manipur') || s.includes('imphal')) return 'Manipur';
  if (s.includes('nagaland') || s.includes('kohima')) return 'Nagaland';
  if (s.includes('mizoram') || s.includes('aizawl')) return 'Mizoram';
  if (s.includes('arunachal')) return 'Arunachal Pradesh';
  if (s.includes('sikkim')) return 'Sikkim';

  const data = loadGeographyData();
  for (const stateName of Object.keys(data.states || {})) {
    if (stateName.toLowerCase() === s) return stateName;
  }
  return null;
};

const splitLocationParts = (value = '') =>
  String(value || '')
    .split(/[,;|/]+|\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

/**
 * Resolves all known cities, districts, and landmarks for a state.
 * Accepts one place or several (comma / semicolon / pipe separated) so
 * multi-location events expand every mentioned state.
 */
const resolveStatePlaces = (stateOrLocation = '') => {
  const parts = splitLocationParts(stateOrLocation);
  if (!parts.length) {
    const state = normalizeStateName(stateOrLocation);
    if (!state) return [];
    parts.push(state);
  }

  const data = loadGeographyData();
  const places = [];
  for (const part of parts) {
    const state = normalizeStateName(part) || findStateForLocation(part);
    if (!state) {
      places.push(part);
      continue;
    }
    const stateObj = data.states?.[state];
    if (!stateObj) {
      places.push(state, part);
      continue;
    }
    places.push(
      state,
      stateObj.capital,
      ...(stateObj.districts || []),
      ...(stateObj.major_cities_and_towns || []),
      ...(stateObj.key_landmarks_and_institutions || []),
      part
    );
  }

  return Array.from(new Set(places.filter(Boolean)));
};

/**
 * Checks if a given place name belongs to the specified target state.
 */
const isPlaceInState = (placeName = '', targetState = '') => {
  const state = normalizeStateName(targetState);
  if (!state || !placeName) return false;

  const places = resolveStatePlaces(state);
  const targetLower = placeName.toLowerCase().trim();

  return places.some((p) => p.toLowerCase() === targetLower);
};

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Determines which Indian state a location string belongs to.
 */
const findStateForLocation = (location = '') => {
  const directState = normalizeStateName(location);
  if (directState) return directState;

  const data = loadGeographyData();
  const locLower = String(location || '').toLowerCase().trim();
  if (!locLower) return null;

  // Build candidate place list: { place, state, length } sorted longest first
  const candidates = [];
  for (const [stateName, stateObj] of Object.entries(data.states || {})) {
    const list = [
      stateName,
      stateObj.capital,
      ...(stateObj.districts || []),
      ...(stateObj.major_cities_and_towns || []),
      ...(stateObj.key_landmarks_and_institutions || []),
    ].filter(Boolean);

    for (const p of list) {
      candidates.push({ place: p.toLowerCase(), state: stateName, len: p.length });
    }
  }

  candidates.sort((a, b) => b.len - a.len);

  for (const c of candidates) {
    if (c.len < 3) continue;
    const re = new RegExp(`(?:^|[^\\p{L}\\p{M}\\p{N}])${escapeRe(c.place)}(?=[^\\p{L}\\p{M}\\p{N}]|$)`, 'iu');
    if (re.test(locLower)) {
      return c.state;
    }
  }

  return null;
};

module.exports = {
  loadGeographyData,
  normalizeStateName,
  splitLocationParts,
  resolveStatePlaces,
  isPlaceInState,
  findStateForLocation,
};
