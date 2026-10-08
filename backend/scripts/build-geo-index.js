/**
 * Builds backend/data/geo/places.json from GeoNames dumps (https://download.geonames.org/export/dump/).
 * Usage: node scripts/build-geo-index.js <folder with cities15000.txt, admin1CodesASCII.txt, countryInfo.txt>
 * Cities carry their names in many scripts, so a post in any language can be matched to a real place.
 */
const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
if (!dir) { console.error('Usage: node scripts/build-geo-index.js <geonames folder>'); process.exit(1); }
const lines = (f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));

const countries = {};
lines('countryInfo.txt').forEach((l) => { const c = l.split('\t'); countries[c[0]] = c[4]; });
const admin1 = {};
lines('admin1CodesASCII.txt').forEach((l) => { const c = l.split('\t'); admin1[c[0]] = c[1]; });

const places = [];
lines('cities15000.txt').forEach((l) => {
  const c = l.split('\t');
  const names = [...new Set([c[1], c[2], ...(c[3] || '').split(',')].map((x) => x.trim()).filter(Boolean))];
  places.push({ n: c[1], a: names.filter((x) => x !== c[1]).slice(0, 1000), c: c[8], r: admin1[`${c[8]}.${c[10]}`] || '', p: Number(c[14]) || 0 });
});
const regions = Object.entries(admin1).map(([k, name]) => ({ name, c: k.split('.')[0] }));
fs.writeFileSync(path.join(__dirname, '../data/geo/places.json'), JSON.stringify({ countries, regions, places }));
console.log(`places=${places.length} regions=${regions.length} countries=${Object.keys(countries).length}`);
