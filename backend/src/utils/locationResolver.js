// Port of RuleEngine/classification_google.py.  locationResolver.js
// Resolves a free-text location string against the OpenStreetMap Nominatim
// API and returns a normalised record with bounding-box + state/country.
//
// Nominatim usage policy requires a descriptive User-Agent and a hard cap of
// ~1 request/second. We funnel all calls through a small serial queue so the
// rest of the backend can call resolveLocation() freely without worrying
// about rate limits.


const axios = require('axios');


const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'Blura/1.0 (claudecodefordev@gmail.com)';
const MIN_INTERVAL_MS = 1100; // stay below Nominatim's 1 req/sec ceiling


const ALLOWED_TYPES = new Set([
 'city',
 'country',
 'state',
 'state_district',
 'village',
 'neighbourhood',
 'suburb',
 'town',
 'county'
]);


const TYPE_MAP = {
 state_district: 'District',
 state: 'State',
 city: 'City',
 town: 'City',
 village: 'City',
 suburb: 'City',
 neighbourhood: 'City',
 country: 'Country'
};


function mapType(t) {
 return TYPE_MAP[t] || 'Division';
}


function extractStateCountry(item) {
 const tokens = String(item.display_name || '')
   .split(',')
   .map((t) => t.trim())
   .filter(Boolean);
 const country = tokens.length ? tokens[tokens.length - 1] : '';
 let state = tokens.length >= 2 ? tokens[tokens.length - 2] : '';
 if (/^\d+$/.test(state) && tokens.length >= 3) {
   state = tokens[tokens.length - 3];
 }
 return { state, country };
}


let lastCallAt = 0;
let chain = Promise.resolve();
const memo = new Map(); // location-string → resolved record (or null)


function scheduleNominatim(location) {
 const job = chain.then(async () => {
   const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastCallAt));
   if (wait > 0) await new Promise((r) => setTimeout(r, wait));
   lastCallAt = Date.now();


   try {
     const res = await axios.get(NOMINATIM_URL, {
       params: { q: location, format: 'json', limit: 20 },
       headers: { 'User-Agent': USER_AGENT },
       timeout: 10000
     });
     return res.data || [];
   } catch (err) {
     // Fail soft — caller treats null as "could not resolve"
     return null;
   }
 });
 // Keep the chain alive even when a job rejects.
 chain = job.catch(() => undefined);
 return job;
}


async function resolveLocation(rawLocation) {
 if (!rawLocation || typeof rawLocation !== 'string') return null;
 const original = rawLocation.trim();
 if (!original) return null;
 const key = original.toLowerCase();
 if (memo.has(key)) return memo.get(key);


 const data = await scheduleNominatim(key);
 if (!Array.isArray(data)) {
   memo.set(key, null);
   return null;
 }


 let matched = null;
 for (const item of data) {
   if (ALLOWED_TYPES.has(item.addresstype)) {
     matched = item;
     break;
   }
 }
 if (!matched) {
   memo.set(key, null);
   return null;
 }


 let bounds = null;
 if (Array.isArray(matched.boundingbox) && matched.boundingbox.length === 4) {
   const [southLat, northLat, westLng, eastLng] = matched.boundingbox.map(Number);
   if ([southLat, northLat, westLng, eastLng].every((n) => Number.isFinite(n))) {
     bounds = {
       northeast: { lat: northLat, lng: eastLng },
       southwest: { lat: southLat, lng: westLng }
     };
   }
 }


 const mappedType = mapType(matched.addresstype);
 const { state, country } = extractStateCountry(matched);


 const record = {
   Original: original,
   'Mapped Types': mappedType,
   Bounds: bounds,
   additional: { type: mappedType }
 };
 if (state) record.additional[state] = ['state'];
 if (country) record.additional[country] = ['country'];


 memo.set(key, record);
 return record;
}


module.exports = {
 resolveLocation,
 mapType,
 extractStateCountry
};




