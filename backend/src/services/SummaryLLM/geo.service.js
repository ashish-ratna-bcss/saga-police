/**
 * Place lookup from GeoNames (backend/data/geo/places.json, built by scripts/build-geo-index.js).
 * Matches a place name written in any script to a real city or region and says which region and country it is in.
 * If the data file is missing, every lookup returns null and the report falls back to the model's own region label.
 */
const fs = require('fs');
const path = require('path');

const FILE = process.env.GEO_DATA_FILE || path.join(__dirname, '../../../data/geo/places.json');
const fold = (s) => String(s || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();

let index = null;
const load = () => {
  if (index !== null) return index;
  index = false;
  try {
    const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    const byName = new Map();
    const add = (key, entry) => {
      const k = fold(key);
      if (!k) return;
      const list = byName.get(k) || [];
      list.push(entry);
      byName.set(k, list);
    };
    data.places.forEach((p) => {
      const entry = { name: p.n, region: p.r, country: data.countries[p.c] || p.c, pop: p.p, kind: 'city' };
      add(p.n, entry);
      p.a.forEach((a) => add(a, entry));
    });
    data.regions.forEach((r) => add(r.name, { name: r.name, region: r.name, country: data.countries[r.c] || r.c, pop: 0, kind: 'region' }));
    Object.values(data.countries).forEach((c) => add(c, { name: c, region: '', country: c, pop: 0, kind: 'country' }));
    index = { byName };
  } catch (e) {
    index = false;
  }
  return index;
};

/**
 * Looks one place name up. `eventRegion` (the event's location text) breaks ties between places of the same name
 * (e.g. several "Aurangabad"): a candidate inside the event region wins, otherwise the most populated one.
 * Returns { name, region, country, kind, label } or null when GeoNames does not know the name.
 */
const lookupPlace = (name, eventRegion = '', hint = '') => {
  const idx = load();
  if (!idx) return null;
  const list = idx.byName.get(fold(name));
  if (!list || !list.length) return null;
  const words = fold(eventRegion).split(' ').filter((w) => w.length > 2);
  const inEvent = (e) => { const h = ` ${fold(`${e.region} ${e.country}`)} `; return words.some((w) => h.includes(` ${w} `)); };
  // The model's own region label ("Odisha, India") is a hint: a candidate that matches none of it is a different place with the same name
  // (e.g. Umarkot in Odisha vs Umarkot in Pakistan), so it is rejected rather than guessed.
  // The most specific part of the hint ("Odisha" in "Odisha, India") must match the candidate's own region; "India" alone is not enough.
  const hintParts = String(hint || '').split(',').map((x) => fold(x)).filter((x) => x.length > 2);
  const first = hintParts[0] || '';
  const matchesHint = (e) => {
    const h = ` ${fold(hintParts.length > 1 ? `${e.name} ${e.region}` : `${e.name} ${e.region} ${e.country}`)} `;
    return h.includes(` ${first} `);
  };
  let pool = list;
  if (first) { pool = list.filter(matchesHint); if (!pool.length) return null; }
  const best = pool.slice().sort((a, b) => (inEvent(b) - inEvent(a)) || (b.pop - a.pop))[0];
  const label = [best.name, best.kind === 'city' ? best.region : '', best.kind === 'country' ? '' : best.country].filter(Boolean).join(', ');
  return { ...best, label };
};

/**
 * Resolves a place the model named. Tries the place itself; if GeoNames does not know it (a landmark, a locality), tries the
 * region the model gave for it ("Jantar Mantar" -> "New Delhi, India" -> New Delhi), so the region is still a real one.
 */
const resolvePlace = (name, modelRegion = '', eventRegion = '') => {
  const direct = lookupPlace(name, eventRegion, modelRegion);
  if (direct) return { ...direct, via: 'name' };
  for (const part of String(modelRegion || '').split(',').map((x) => x.trim()).filter(Boolean)) {
    const g = lookupPlace(part, eventRegion);
    if (g) return { ...g, via: 'region' };
  }
  return null;
};

module.exports = { lookupPlace, resolvePlace, fold };
