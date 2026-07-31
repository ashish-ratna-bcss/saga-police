// Port of RuleEngine/locality_resolver.py (NER + Wikipedia + consolidation).
//
// We don't have spaCy in Node, so we approximate the GPE extraction by:
//   1. Splitting hashtags / mentions / camelCase tokens
//   2. Pulling capitalised n-grams (1-3 words) from the surrounding text
//   3. Skipping a stop-list of obviously non-place tokens
// Every candidate is then funnelled through the OpenStreetMap resolver. Items
// that resolve to a place inside a containing region are removed (the
// "consolidate" step from the original Python).


const { resolveLocation } = require('./locationResolver');


const STOPWORDS = new Set([
 'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'else', 'when', 'while',
 'this', 'that', 'these', 'those', 'is', 'are', 'was', 'were', 'be', 'been',
 'being', 'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'shall',
 'should', 'can', 'could', 'may', 'might', 'must', 'i', 'you', 'he', 'she',
 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his',
 'its', 'our', 'their', 'what', 'which', 'who', 'whom', 'whose', 'where',
 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other',
 'some', 'such', 'no', 'not', 'only', 'own', 'same', 'so', 'than', 'too',
 'very', 'just', 'now', 'today', 'tomorrow', 'yesterday', 'monday', 'tuesday',
 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'january',
 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september',
 'october', 'november', 'december', 'breaking', 'news', 'update', 'live',
 'video', 'photo', 'image', 'click', 'link', 'follow', 'share', 'like',
 'comment', 'subscribe', 'pm', 'cm', 'mla', 'mp', 'ips', 'ias', 'sp', 'dgp'
]);


// Expand "CamelCaseHashtag" → ["Camel", "Case", "Hashtag"]
function splitCamel(token) {
 return token
   .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
   .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
   .split(/\s+/)
   .filter(Boolean);
}


function pullHashtagCandidates(text) {
 const out = new Set();
 const re = /[#@]([A-Za-z][A-Za-z0-9_]{2,})/g;
 let m;
 while ((m = re.exec(text)) !== null) {
   const cleaned = m[1].replace(/_/g, ' ');
   const parts = splitCamel(cleaned);
   if (parts.length) out.add(parts.join(' '));
   // also try the full token as one phrase
   out.add(cleaned);
 }
 return out;
}


function pullCapitalisedCandidates(text) {
 const out = new Set();
 // strip urls + hashtags so they don't pollute the n-grams
 const cleaned = text
   .replace(/https?:\/\/\S+/g, ' ')
   .replace(/[#@][A-Za-z0-9_]+/g, ' ');


 // Split into sentences so the first word of a sentence isn't blindly treated
 // as a proper noun.
 const sentences = cleaned.split(/[.!?\n]+/);
 for (const sentence of sentences) {
   const tokens = sentence.split(/\s+/).filter(Boolean);
   // Skip first token of sentence when judging capitalisation.
   const usable = tokens.map((t, i) => ({ token: t, isFirst: i === 0 }));
   let buffer = [];
   const flush = () => {
     if (!buffer.length) return;
     // Emit 1-gram, 2-gram, 3-gram phrases.
     for (let n = 1; n <= Math.min(3, buffer.length); n++) {
       for (let i = 0; i + n <= buffer.length; i++) {
         const phrase = buffer.slice(i, i + n).join(' ');
         if (phrase.length >= 3) out.add(phrase);
       }
     }
     buffer = [];
   };
   for (const { token, isFirst } of usable) {
     const bare = token.replace(/[^A-Za-z'-]/g, '');
     if (!bare) { flush(); continue; }
     const isCap = /^[A-Z][a-zA-Z'-]*$/.test(bare) || /^[A-Z]{2,}$/.test(bare);
     if (isCap && !isFirst && !STOPWORDS.has(bare.toLowerCase())) {
       buffer.push(bare);
     } else {
       flush();
     }
   }
   flush();
 }
 return out;
}


function extractLocationCandidates(text) {
 if (!text || typeof text !== 'string') return [];
 const all = new Set([
   ...pullHashtagCandidates(text),
   ...pullCapitalisedCandidates(text)
 ]);
 // De-dupe case-insensitively, cap length so we don't hammer Nominatim.
 const seen = new Set();
 const out = [];
 for (const phrase of all) {
   const k = phrase.toLowerCase().trim();
   if (!k || k.length < 3 || seen.has(k)) continue;
   if (STOPWORDS.has(k)) continue;
   seen.add(k);
   out.push(phrase.trim());
 }
 return out.slice(0, 12);
}


function isInside(smaller, larger) {
 if (!smaller?.Bounds || !larger?.Bounds) return false;
 const s = smaller.Bounds;
 const l = larger.Bounds;
 return (
   l.southwest.lat <= s.southwest.lat &&
   l.northeast.lat >= s.northeast.lat &&
   l.southwest.lng <= s.southwest.lng &&
   l.northeast.lng >= s.northeast.lng
 );
}


function consolidateLocations(byName) {
 const names = Object.keys(byName);
 const drop = new Set();
 for (const a of names) {
   for (const b of names) {
     if (a === b || drop.has(a) || drop.has(b)) continue;
     if (isInside(byName[a], byName[b])) drop.add(a);
   }
 }
 const out = {};
 for (const n of names) if (!drop.has(n)) out[n] = byName[n];
 return out;
}


// Resolve every candidate location in `text` and return a map keyed by the
// matched phrase. Country-level matches are dropped when finer matches exist
// (mirrors the python `contains_non_country` cleanup).
async function fetchLocations(text) {
 const candidates = extractLocationCandidates(text);
 const resolved = {};
 for (const c of candidates) {
   const rec = await resolveLocation(c);
   if (rec && rec.Bounds) resolved[c] = rec;
 }


 const hasFineGrained = Object.values(resolved).some(
   (r) => r['Mapped Types'] !== 'Country' && r['Mapped Types'] !== 'Division'
 );
 if (hasFineGrained) {
   for (const k of Object.keys(resolved)) {
     if (resolved[k]['Mapped Types'] === 'Country') delete resolved[k];
   }
 }


 const consolidated = consolidateLocations(resolved);
 const out = {};
 for (const [k, v] of Object.entries(consolidated)) {
   out[k] = { Bounds: v.Bounds, additional: v.additional || {} };
 }
 return out;
}


module.exports = {
 extractLocationCandidates,
 fetchLocations,
 isInside,
 consolidateLocations
};




