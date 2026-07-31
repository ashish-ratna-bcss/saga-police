// Decide whether a piece of content is about Hyderabad / Telangana.
//
// Strategy:
//   1. Cheap regex pre-check on a curated keyword list — most positive cases
//      are caught here without touching the network.
//   2. Fall back to the NER-style extractor + Nominatim resolver, then check
//      whether any resolved location's bounding box is contained inside the
//      cached Telangana state bounds (mirrors the python `is_inside` logic).


const { resolveLocation } = require('./locationResolver');
const { fetchLocations, isInside } = require('./locationExtractor');


// Heuristic keywords — Hyderabad, Telangana, and the major
// districts/landmarks people actually mention on social media. A regex hit
// here is enough to skip the (slow) Nominatim path.
const FAST_KEYWORDS = [
 'hyderabad', 'hyd\\b', 'telangana', 'secunderabad', 'cyberabad', 'hitec city',
 'hitech city', 'gachibowli', 'madhapur', 'kondapur', 'banjara hills',
 'jubilee hills', 'kukatpally', 'begumpet', 'ameerpet', 'dilsukhnagar',
 'lb nagar', 'charminar', 'tank bund', 'hussain sagar', 'shamshabad',
 'warangal', 'karimnagar', 'khammam', 'nizamabad', 'nalgonda', 'medak',
 'adilabad', 'mahbubnagar', 'siddipet', 'rangareddy', 'medchal', 'sangareddy',
 'kcr', 'brs party', 'trs party', 'osmania', 'telugu state'
];
const FAST_REGEX = new RegExp(`(${FAST_KEYWORDS.join('|')})`, 'i');


let telanganaBoundsPromise = null;
async function getTelanganaBounds() {
 if (!telanganaBoundsPromise) {
   telanganaBoundsPromise = (async () => {
     const rec = await resolveLocation('Telangana, India');
     return rec?.Bounds || null;
   })();
 }
 return telanganaBoundsPromise;
}


// Public API: returns { isRelated, matchedLocation, method }.
async function classifyContent({ text, scraped, tags, location, media_location } = {}) {
 const blob = [
   text || '',
   scraped || '',
   Array.isArray(tags) ? tags.join(' ') : '',
   location?.name || '', location?.city || '', location?.address || '',
   media_location?.name || ''
 ].join(' \n ').trim();


 if (!blob) return { isRelated: false, matchedLocation: null, method: 'empty' };


 // Stage 1: cheap regex pre-check.
 const fastHit = blob.match(FAST_REGEX);
 if (fastHit) {
   return { isRelated: true, matchedLocation: fastHit[1], method: 'keyword' };
 }


 // Stage 2: structured geotag fields, if any.
 for (const candidate of [location?.city, location?.name, location?.address, media_location?.name]) {
   if (!candidate) continue;
   const rec = await resolveLocation(candidate);
   if (!rec) continue;
   const bounds = await getTelanganaBounds();
   if (bounds && rec.Bounds && isInside(rec, { Bounds: bounds })) {
     return { isRelated: true, matchedLocation: candidate, method: 'geotag' };
   }
 }


 // Stage 3: NER-style extraction across the full text.
 const resolved = await fetchLocations(blob);
 const bounds = await getTelanganaBounds();
 if (!bounds) return { isRelated: false, matchedLocation: null, method: 'no_bounds' };
 for (const [name, rec] of Object.entries(resolved)) {
   if (isInside(rec, { Bounds: bounds })) {
     return { isRelated: true, matchedLocation: name, method: 'ner' };
   }
 }
 return { isRelated: false, matchedLocation: null, method: 'ner' };
}


module.exports = { classifyContent, getTelanganaBounds, FAST_REGEX };


