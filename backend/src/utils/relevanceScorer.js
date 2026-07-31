// Hyderabad / Telangana relevance scorer.
//
// Fast, deterministic, regex-based: returns a 0-100 score, a priority bucket
// (high / medium / hidden), a category, the detected location, and a
// human-readable reason. Runs at ingest time inside upsertEventContent —
// keep it cheap (no network).
//
// See classifyContent in ./hyderabadClassifier.js for the slower Nominatim-
// backed geotag verifier that still runs lazily.

const LOCATION_KEYWORDS = [
  // City + state
  { term: 'hyderabad', weight: 45 },
  { term: 'telangana', weight: 45 },
  { term: 'secunderabad', weight: 40 },
  { term: 'cyberabad', weight: 40 },
  { term: 'ghmc', weight: 35 },
  // Hyderabad neighbourhoods / landmarks
  { term: 'hitec city', weight: 32 }, { term: 'hitech city', weight: 32 },
  { term: 'gachibowli', weight: 32 }, { term: 'madhapur', weight: 30 },
  { term: 'kondapur', weight: 30 }, { term: 'banjara hills', weight: 32 },
  { term: 'jubilee hills', weight: 32 }, { term: 'kukatpally', weight: 30 },
  { term: 'begumpet', weight: 22 }, { term: 'ameerpet', weight: 22 },
  { term: 'dilsukhnagar', weight: 22 }, { term: 'lb nagar', weight: 25 },
  { term: 'uppal', weight: 22 }, { term: 'charminar', weight: 25 },
  { term: 'tank bund', weight: 22 }, { term: 'hussain sagar', weight: 22 },
  { term: 'shamshabad', weight: 22 }, { term: 'mehdipatnam', weight: 22 },
  { term: 'malakpet', weight: 20 }, { term: 'tolichowki', weight: 20 },
  { term: 'miyapur', weight: 20 }, { term: 'bowenpally', weight: 20 },
  // Telangana districts
  { term: 'warangal', weight: 35 }, { term: 'karimnagar', weight: 35 },
  { term: 'khammam', weight: 35 }, { term: 'nizamabad', weight: 35 },
  { term: 'nalgonda', weight: 35 }, { term: 'medak', weight: 35 },
  { term: 'adilabad', weight: 35 }, { term: 'mahabubnagar', weight: 35 },
  { term: 'mahbubnagar', weight: 35 }, { term: 'siddipet', weight: 35 },
  { term: 'rangareddy', weight: 30 }, { term: 'medchal', weight: 30 },
  { term: 'sangareddy', weight: 32 }, { term: 'jagtial', weight: 28 },
  { term: 'peddapalli', weight: 22 }, { term: 'mancherial', weight: 22 },
  { term: 'kothagudem', weight: 22 }, { term: 'suryapet', weight: 22 },
  { term: 'vikarabad', weight: 22 }, { term: 'wanaparthy', weight: 22 },
  { term: 'jogulamba', weight: 22 }, { term: 'gadwal', weight: 22 },
  { term: 'mulugu', weight: 22 }, { term: 'narayanpet', weight: 22 },
  // Telugu / Hindi script variants for the big two
  { term: 'హైదరాబాద్', weight: 50 }, { term: 'తెలంగాణ', weight: 50 },
  { term: 'हैदराबाद', weight: 50 }, { term: 'तेलंगाना', weight: 50 }
];

const CONTEXT_KEYWORDS = [
  // Politics & governance
  { term: 'telangana government', weight: 20, category: 'politics' },
  { term: 'telangana cabinet', weight: 20, category: 'politics' },
  { term: 'telangana cm', weight: 20, category: 'politics' },
  { term: 'telangana minister', weight: 18, category: 'politics' },
  { term: 'telangana elections', weight: 20, category: 'politics' },
  { term: 'trs', weight: 12, category: 'politics' },
  { term: 'brs', weight: 12, category: 'politics' },
  { term: 'kcr', weight: 15, category: 'politics' },
  { term: 'ktr', weight: 15, category: 'politics' },
  { term: 'revanth reddy', weight: 18, category: 'politics' },
  { term: 'congress telangana', weight: 16, category: 'politics' },
  // Infrastructure & development
  { term: 'hyderabad metro', weight: 18, category: 'infrastructure' },
  { term: 'hyderabad traffic', weight: 18, category: 'infrastructure' },
  { term: 'orr', weight: 10, category: 'infrastructure' },
  { term: 'outer ring road', weight: 15, category: 'infrastructure' },
  { term: 'infrastructure', weight: 8, category: 'infrastructure' },
  { term: 'hyderabad development', weight: 16, category: 'infrastructure' },
  { term: 'rrr project', weight: 15, category: 'infrastructure' },
  // Grievance / public issues
  { term: 'ghmc issues', weight: 18, category: 'grievance' },
  { term: 'public grievance', weight: 18, category: 'grievance' },
  { term: 'local protest', weight: 18, category: 'grievance' },
  { term: 'protest', weight: 12, category: 'grievance' },
  { term: 'water shortage', weight: 18, category: 'grievance' },
  { term: 'power cut', weight: 12, category: 'grievance' },
  { term: 'pothole', weight: 12, category: 'grievance' },
  { term: 'garbage', weight: 10, category: 'grievance' },
  { term: 'flooding', weight: 12, category: 'grievance' },
  // Schemes & news
  { term: 'telangana scheme', weight: 16, category: 'news' },
  { term: 'rythu bandhu', weight: 16, category: 'news' },
  { term: 'dalit bandhu', weight: 16, category: 'news' },
  { term: 'telangana news', weight: 15, category: 'news' },
  // Events
  { term: 'bonalu', weight: 14, category: 'event' },
  { term: 'bathukamma', weight: 14, category: 'event' }
];

// Strong negative signals — if the text is dominated by these and no Telangana
// signal is present, the post is almost certainly off-topic.
const EXCLUSION_KEYWORDS = [
  'mumbai', 'delhi', 'bengaluru', 'bangalore', 'chennai', 'kolkata', 'pune',
  'kerala', 'tamil nadu', 'karnataka', 'maharashtra', 'gujarat', 'punjab',
  'haryana', 'rajasthan', 'uttar pradesh', 'bihar', 'west bengal',
  'pakistan', 'china', 'usa', 'ukraine', 'israel', 'gaza',
  'bollywood', 'kollywood', 'ipl', 'cricket world cup'
];

const LANGUAGE_HINTS = [
  { re: /[ఀ-౿]/, lang: 'te', weight: 12 },  // Telugu script
  { re: /[ऀ-ॿ]/, lang: 'hi', weight: 4 }   // Devanagari (Hindi)
];

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildMatcher = (terms) => {
  const sorted = [...terms].sort((a, b) => b.term.length - a.term.length);
  return sorted.map((entry) => ({
    ...entry,
    regex: new RegExp(`(^|[^a-zA-Z0-9_])(${escapeRegex(entry.term)})(?=[^a-zA-Z0-9_]|$)`, 'i')
  }));
};

const LOCATION_MATCHERS = buildMatcher(LOCATION_KEYWORDS);
const CONTEXT_MATCHERS = buildMatcher(CONTEXT_KEYWORDS);
const EXCLUSION_REGEX = new RegExp(
  `(^|[^a-zA-Z0-9_])(${EXCLUSION_KEYWORDS.map(escapeRegex).join('|')})(?=[^a-zA-Z0-9_]|$)`,
  'i'
);

const buildBlob = ({ text, scraped, tags, hashtags, title, description, author, author_handle, user_bio, user_location, location, media_location } = {}) => {
  const parts = [
    text, scraped, title, description, author, author_handle, user_bio, user_location,
    Array.isArray(tags) ? tags.join(' ') : '',
    Array.isArray(hashtags) ? hashtags.join(' ') : '',
    location?.name, location?.city, location?.address,
    media_location?.name
  ];
  return parts.filter(Boolean).join(' \n ').trim();
};

const scoreRelevance = (input = {}) => {
  const blob = buildBlob(input);
  if (!blob) {
    return {
      score: 0, priority: 'hidden', category: null,
      detected_location: null, reason: 'empty content',
      matched_terms: [], languages: [], excluded: false, classified_at: new Date()
    };
  }

  let score = 0;
  const matchedLocations = [];
  const matchedContext = [];
  const categoryCounts = new Map();

  for (const m of LOCATION_MATCHERS) {
    if (m.regex.test(blob)) {
      score += m.weight;
      matchedLocations.push(m.term);
      if (matchedLocations.length >= 4) break; // diminishing returns
    }
  }
  for (const m of CONTEXT_MATCHERS) {
    if (m.regex.test(blob)) {
      score += m.weight;
      matchedContext.push(m.term);
      categoryCounts.set(m.category, (categoryCounts.get(m.category) || 0) + m.weight);
      if (matchedContext.length >= 5) break;
    }
  }

  const languages = [];
  for (const lh of LANGUAGE_HINTS) {
    if (lh.re.test(blob)) {
      languages.push(lh.lang);
      // Only credit language if we already have *some* TS signal — Telugu
      // alone could be from AP and Hindi is too broad.
      if (matchedLocations.length || matchedContext.length) score += lh.weight;
    }
  }

  // Structured location field (post geotag or user profile) lifts confidence.
  const geoBlob = [input.location?.name, input.location?.city, input.location?.address, input.media_location?.name, input.user_location]
    .filter(Boolean).join(' ').toLowerCase();
  if (geoBlob && /(hyderabad|telangana|secunderabad|warangal|karimnagar|nizamabad|khammam|nalgonda|adilabad|medak|siddipet|sangareddy|mahabubnagar|mahbubnagar)/i.test(geoBlob)) {
    score += 20;
    if (!matchedLocations.length) matchedLocations.push(geoBlob.slice(0, 60));
  }

  // Penalise off-topic dominance only if Telangana signal is weak.
  const excluded = EXCLUSION_REGEX.test(blob);
  if (excluded && matchedLocations.length === 0) {
    score -= 25;
  }

  // Cap and bucket.
  if (score < 0) score = 0;
  if (score > 100) score = 100;

  let priority;
  if (score > 80) priority = 'high';
  else if (score >= 60) priority = 'medium';
  else priority = 'hidden';

  // Pick category by highest weighted context match; fall back to 'news' /
  // 'location_only' / 'off_topic'.
  let category = null;
  if (categoryCounts.size) {
    category = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  } else if (matchedLocations.length) {
    category = 'location_only';
  } else if (score === 0) {
    category = 'off_topic';
  }

  const reasonParts = [];
  if (matchedLocations.length) reasonParts.push(`location: ${matchedLocations.slice(0, 3).join(', ')}`);
  if (matchedContext.length) reasonParts.push(`context: ${matchedContext.slice(0, 3).join(', ')}`);
  if (languages.length) reasonParts.push(`lang: ${languages.join('/')}`);
  if (excluded && !matchedLocations.length) reasonParts.push('off-topic terms dominate');
  if (!reasonParts.length) reasonParts.push('no Telangana signal');

  return {
    score,
    priority,
    category,
    detected_location: matchedLocations[0] || null,
    reason: reasonParts.join('; '),
    matched_terms: [...matchedLocations, ...matchedContext].slice(0, 8),
    languages,
    excluded,
    classified_at: new Date()
  };
};

const scoreContentDoc = (doc, extra = {}) => scoreRelevance({
  text: doc.text,
  scraped: doc.scraped_content,
  tags: doc.tags,
  title: doc.title || doc.raw_data?.title,
  description: doc.description || doc.raw_data?.description,
  author: doc.author,
  author_handle: doc.author_handle,
  user_bio: doc.raw_data?.user?.description || doc.raw_data?.author?.bio,
  user_location: doc.raw_data?.user?.location || doc.raw_data?.author?.location,
  location: doc.location,
  media_location: doc.media_location,
  hashtags: doc.raw_data?.hashtags,
  ...extra
});

module.exports = { scoreRelevance, scoreContentDoc };
