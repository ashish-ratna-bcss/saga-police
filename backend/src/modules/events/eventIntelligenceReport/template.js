/**
 * Event Intelligence PDF — senior brief style (navy hero, KPI strip, 7 sections).
 * Numbers come from summary/keyword data; analysis text from structured_report.
 */
const fs = require('fs');
const path = require('path');
const { esc } = require('./render');
const { classifyEvidence } = require('./scope');

/**
 * Bundled fonts (./fonts). Only the scripts that actually appear in a report are embedded,
 * so a mostly-English PDF stays small while Odia / Malayalam / Tamil / Arabic ... still render.
 * To support another script: drop a Noto Sans TTF in ./fonts and add one line here.
 */
const SCRIPT_FONTS = [
  { family: 'Report Devanagari', file: 'NotoSansDevanagari-Regular.ttf', re: /[\u0900-\u097F]/ },
  { family: 'Report Oriya', file: 'NotoSansOriya-Regular.ttf', re: /[\u0B00-\u0B7F]/ },
  { family: 'Report Bengali', file: 'NotoSansBengali-Regular.ttf', re: /[\u0980-\u09FF]/ },
  { family: 'Report Gurmukhi', file: 'NotoSansGurmukhi-Regular.ttf', re: /[\u0A00-\u0A7F]/ },
  { family: 'Report Gujarati', file: 'NotoSansGujarati-Regular.ttf', re: /[\u0A80-\u0AFF]/ },
  { family: 'Report Tamil', file: 'NotoSansTamil-Regular.ttf', re: /[\u0B80-\u0BFF]/ },
  { family: 'Report Telugu', file: 'NotoSansTelugu-Regular.ttf', re: /[\u0C00-\u0C7F]/ },
  { family: 'Report Kannada', file: 'NotoSansKannada-Regular.ttf', re: /[\u0C80-\u0CFF]/ },
  { family: 'Report Malayalam', file: 'NotoSansMalayalam-Regular.ttf', re: /[\u0D00-\u0D7F]/ },
  { family: 'Report Sinhala', file: 'NotoSansSinhala-Regular.ttf', re: /[\u0D80-\u0DFF]/ },
  { family: 'Report Thai', file: 'NotoSansThai-Regular.ttf', re: /[\u0E00-\u0E7F]/ },
  { family: 'Report Arabic', file: 'NotoSansArabic-Regular.ttf', re: /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/ },
  { family: 'Report Hebrew', file: 'NotoSansHebrew-Regular.ttf', re: /[\u0590-\u05FF]/ },
];
const FONT_STACK = SCRIPT_FONTS.map((f) => `'${f.family}'`).join(',');
const fontCache = new Map();
const fontFace = (family, file) => {
  if (fontCache.has(file)) return fontCache.get(file);
  let css = '';
  try {
    const b64 = fs.readFileSync(path.join(__dirname, 'fonts', file)).toString('base64');
    css = `@font-face{font-family:'${family}';src:url(data:font/ttf;base64,${b64}) format('truetype');font-display:swap;}`;
  } catch (e) {
    css = '';
  }
  fontCache.set(file, css);
  return css;
};
/** @font-face rules for the scripts present in `text`. */
const fontFacesFor = (text) => SCRIPT_FONTS.filter((f) => f.re.test(text)).map((f) => fontFace(f.family, f.file)).join('');

const PR = '#1B7A4E';
const NW = '#5B6B78';
const CR = '#B42318';
const INK = '#0B1F33';
const NAVY = '#12324D';
const MUT = '#6B7C8A';
const TEAL = '#1F6F6A';
const ACCENT = '#C45C26';
const LINE = '#D5DEE6';
const BG = '#F4F7FA';

const PLATFORM_LABELS = {
  x: 'X',
  twitter: 'X',
  youtube: 'YouTube',
  facebook: 'Facebook',
  instagram: 'Instagram',
  telegram: 'Telegram',
  reddit: 'Reddit',
  whatsapp: 'WhatsApp',
};

const n0 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const fmt = (v) => n0(v).toLocaleString('en-US');
const pct = (a, b, d = 0) => (n0(b) > 0 ? `${((100 * n0(a)) / n0(b)).toFixed(d)}%` : '0%');
const platLabel = (k) => PLATFORM_LABELS[String(k).toLowerCase()] || String(k || '').charAt(0).toUpperCase() + String(k || '').slice(1);
const platKey = (k) => {
  const s = String(k || '').toLowerCase();
  return s === 'twitter' ? 'x' : s;
};
const sentimentOf = (c = {}) => ({
  positive: n0(c.positive ?? c.praise),
  neutral: n0(c.neutral ?? c.news),
  negative: n0(c.negative ?? c.criticism),
});
const clip = (s, n = 160) => {
  const t = String(s || '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const shortAuthor = (a) => {
  const s = String(a || 'unknown');
  if (s.startsWith('http')) return s.replace(/\/$/, '').split('/').pop().slice(0, 32);
  return s.replace(/^@/, '').slice(0, 32);
};
const sentKey = (s) => {
  const x = String(s || '').toLowerCase();
  if (x.startsWith('pos') || x === 'praise') return 'positive';
  if (x.startsWith('neg') || x === 'criticism') return 'negative';
  if (x.startsWith('neu') || x === 'news' || x === 'mixed') return 'neutral';
  return null; // unknown — omit as a tone
};
const toneLabel = (k) => (k === 'positive' ? 'Positive' : k === 'negative' ? 'Negative' : k === 'neutral' ? 'Neutral' : '—');

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const { resolveStatePlaces } = require('../indiaGeography.service');

/**
 * Build a place lexicon from this event's location field + all state districts and cities.
 */
const buildPlaceLexicon = (event) => {
  const seen = new Map();
  const add = (raw) => {
    const s = String(raw || '').trim().replace(/^#/, '');
    if (!s || s.length < 2 || s.length > 80 || /^\d+$/.test(s)) return;
    String(s)
      .split(/[,;/|]+|\s+and\s+|\s*·\s*|\s+[—–-]\s+/i)
      .forEach((part) => {
        const cleaned = part.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
        if (cleaned.length >= 2 && cleaned.length <= 80 && !/^\d+$/.test(cleaned)) {
          const k = cleaned.toLowerCase();
          if (!seen.has(k) || cleaned.length > seen.get(k).length) seen.set(k, cleaned);
        }
        const paren = part.match(/\(([^)]+)\)/);
        if (paren) {
          paren[1].split(/[,;/]+/).forEach((inner) => {
            const t = inner.trim();
            if (t.length >= 2 && t.length <= 80) {
              const ik = t.toLowerCase();
              if (!seen.has(ik) || t.length > seen.get(ik).length) seen.set(ik, t);
            }
          });
        }
      });
  };
  add(event?.location);
  const statePlaces = resolveStatePlaces(event?.location);
  statePlaces.forEach(add);

  // Longest first so multi-word places match before shorter parts
  return [...seen.values()].sort((a, b) => b.length - a.length);
};

/** Match lexicon places in post text (unicode word boundaries). */
const placesIn = (text, lexicon) => {
  if (!text || !lexicon.length) return [];
  const hits = [];
  for (const name of lexicon) {
    try {
      const re = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRe(name)}(?=[^\\p{L}\\p{N}]|$)`, 'iu');
      if (re.test(text) && !hits.some((h) => h.toLowerCase() === name.toLowerCase())) hits.push(name);
    } catch {
      /* skip bad pattern */
    }
  }
  return hits;
};

/**
 * When event has no location lexicon, still surface place-like phrases
 * from visit/activity wording (Latin-script capitalised names only).
 */
const extractPlacePhrases = (text) => {
  const hits = [];
  const re =
    /\b(?:in|at|from|to|near|across|visited|touring)\s+([A-Z][\p{L}\p{M}']+(?:\s+[A-Z][\p{L}\p{M}']+){0,3})\b/gu;
  let m;
  while ((m = re.exec(text || '')) && hits.length < 4) {
    const p = m[1].trim();
    if (p.length >= 3 && !/^(The|This|That|Our|Their|His|Her|And|For|With|Today|Yesterday)$/i.test(p)) {
      if (!hits.some((h) => h.toLowerCase() === p.toLowerCase())) hits.push(p);
    }
  }
  return hits;
};

const VISIT_RE =
  /(?:visit(?:ed|ing)?|participat(?:ed|ing)|tour|press\s*conference|rally|protest|bandh|blockade|blocked|gherao|hunger\s*strike|inspected|inspection|meeting|yatra|padayatra|morcha|highway)/i;

const SKIP_PLACE = new Set([
  'the', 'this', 'that', 'today', 'yesterday', 'tomorrow', 'tonight', 'morning', 'afternoon', 'evening', 'night',
  'watch', 'students', 'student', 'protest', 'protests', 'protesting', 'massive', 'national', 'public', 'people',
  'letter', 'state', 'india', 'news', 'post', 'posts', 'call', 'called', 'bandh', 'rally', 'meeting', 'campaign',
  'minister', 'ministers', 'government', 'police', 'education', 'school', 'schools', 'assembly',
  // Days of week
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun',
  // Months
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
  // Foreign countries & out-of-scope non-places
  'france', 'paris', 'french', 'usa', 'uk', 'gaza', 'israel', 'palestine', 'australia', 'canada', 'germany', 'spain', 'italy',
  'russia', 'ukraine', 'china', 'pakistan', 'bangladesh', 'nepal', 'sri lanka', 'london', 'washington',
  'love', 'books', 'classes', 'corruption', 'easy', 'solution', 'farmer', 'farmers', 'drought', 'water',
  'bjd', 'bjp', 'congress', 'updates', 'live', 'breaking', 'report',
  'central university', 'supreme court', 'high court', 'election commission', 'delhi police'
]);

/** Places written in the post: datelines, institutions, highways, and specific place names. */
const specificPlaces = (text) => {
  const hits = [];
  const add = (raw) => {
    const p = String(raw || '')
      .replace(/^#/, '')
      .replace(/\s+/g, ' ')
      .replace(/[|.,;:]+$/g, '')
      .trim();
    if (p.length < 3 || p.length > 64) return;
    if (SKIP_PLACE.has(p.toLowerCase())) return;
    if (!hits.some((h) => h.toLowerCase() === p.toLowerCase())) hits.push(p);
  };
  const src = String(text || '');
  let m;
  const dateLine = /\b([A-Z][\p{L}]{2,}),\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b/gu;
  while ((m = dateLine.exec(src))) add(m[1]);
  const title = (s) => String(s).toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
  const placeTail = /(Sabha|Assembly|Chowk|Chhak|Nagar|Highway|District|Panchayat|University|College|Maidan|Road|Ghat|Bazar|Bazaar|Square|Junction|Pur|Garh)$/i;
  const fixed = /\b(national highway(?:\s*\d+)?|nh[-\s]?\d+|vidhan sabha|legislative assembly)\b/gi;
  while ((m = fixed.exec(src))) add(title(m[1]));
  const suffix = /\b([A-Z][\p{L}]+(?:\s+(?:of|the|[A-Z][\p{L}]+)){0,2}\s+(?:Sabha|Assembly|Chowk|Chhak|Nagar|Pur|Garh|Highway|District|Panchayat|University|College|Maidan|Square|Junction|Ghat|Bazar|Bazaar|Road))\b/gu;
  while ((m = suffix.exec(src))) add(m[1]);
  const caps = /\b[A-Z]{3,}(?:\s+[A-Z]{2,}){0,6}\b/g;
  while ((m = caps.exec(src))) {
    const words = m[0].trim().split(/\s+/);
    if (!placeTail.test(words[words.length - 1])) continue;
    const kept = words.slice(-3).filter((w) => !/^(THE|OF|AND|IN|AT|TO|FOR|ON)$/.test(w));
    if (kept.length) add(title(kept.join(' ').toLowerCase()));
  }
  const prep = /\b(?:in front of|outside|near|across|at|in|from)\s+(?:the\s+)?((?:[A-Z][\p{L}’']+|[A-Z]{2,})(?:\s+(?:[A-Z][\p{L}’']+|[A-Z]{2,})){0,3})/gu;
  while ((m = prep.exec(src))) {
    const phrase = m[1].trim();
    const words = phrase.split(/\s+/);
    if (placeTail.test(phrase) || words.length === 1) {
      if (!SKIP_PLACE.has(phrase.toLowerCase())) add(phrase);
    }
  }
  return hits.slice(0, 6);
};

const broadPlaces = (event) => new Set(
  String(event?.location || '')
    .split(/[,;/|]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length >= 2)
);

/**
 * Resolves a full, direct web URL for a social media post.
 */
const resolvePostUrl = (e = {}) => {
  if (e.url && /^https?:\/\//i.test(e.url)) return e.url;
  const plat = platKey(e.platform || e.plat);
  const author = shortAuthor(e.author || e.author_name || e.author_handle || '');
  const id = e.id || e.post_id || e.citationTag || '';
  if (plat === 'x' || plat === 'twitter') {
    if (author && id && /^\d+$/.test(id)) return `https://x.com/${author}/status/${id}`;
    if (author && author !== 'unknown') return `https://x.com/${author}`;
    return 'https://x.com';
  }
  if (plat === 'youtube') {
    if (id && String(id).length >= 8) return `https://www.youtube.com/watch?v=${id}`;
    if (author && author !== 'unknown') return `https://www.youtube.com/@${author}`;
    return 'https://youtube.com';
  }
  if (plat === 'facebook') {
    if (author && author !== 'unknown') {
      if (/\s/.test(author) || /[^A-Za-z0-9._-]/.test(author)) {
        return `https://www.facebook.com/search/top?q=${encodeURIComponent(author)}`;
      }
      return `https://www.facebook.com/${encodeURIComponent(author)}`;
    }
    return 'https://facebook.com';
  }
  if (plat === 'instagram') {
    if (id) return `https://www.instagram.com/p/${id}/`;
    if (author && author !== 'unknown') return `https://www.instagram.com/${encodeURIComponent(author)}/`;
    return 'https://instagram.com';
  }
  if (plat === 'telegram') {
    if (author && author !== 'unknown') return `https://t.me/${encodeURIComponent(author)}`;
    return 'https://t.me';
  }
  if (plat === 'reddit') {
    if (author && author !== 'unknown') return `https://www.reddit.com/user/${encodeURIComponent(author)}`;
    return 'https://reddit.com';
  }
  return null;
};

/**
 * Resolves a valid direct profile/channel/search URL for an author across platforms.
 */
const resolveAuthorProfileUrl = ({ platform, author, sampleUrl } = {}) => {
  const plat = platKey(platform);
  const rawAuthor = String(author || '').trim();
  const cleanAuthor = rawAuthor.replace(/^@+/, '').trim();
  if (!cleanAuthor || cleanAuthor.toLowerCase() === 'unknown') {
    return null;
  }

  // 1. Facebook
  if (plat === 'facebook') {
    if (sampleUrl && typeof sampleUrl === 'string' && /^https?:\/\//i.test(sampleUrl)) {
      // 1. Direct page post: facebook.com/pagename/posts/... or /photos/... or /videos/...
      const pageMatch = sampleUrl.match(/^https?:\/\/(?:www\.|m\.)?facebook\.com\/([A-Za-z0-9._-]+)\/(?:posts|videos|photos)/i);
      if (pageMatch && !['groups', 'events', 'watch', 'share', 'reel', 'reels', 'permalink.php', 'profile.php', 'story.php'].includes(pageMatch[1].toLowerCase())) {
        return `https://www.facebook.com/${pageMatch[1]}`;
      }
      // 2. Profile ID: id=12345
      const idMatch = sampleUrl.match(/[?&]id=(\d+)/i);
      if (idMatch) {
        return `https://www.facebook.com/profile.php?id=${idMatch[1]}`;
      }
      // 3. User slug root URL: facebook.com/pagename
      const directUserMatch = sampleUrl.match(/^https?:\/\/(?:www\.|m\.)?facebook\.com\/([A-Za-z0-9._-]+)(?:[/?#]|$)/i);
      if (directUserMatch && !['groups', 'events', 'watch', 'share', 'reel', 'reels', 'search', 'photo', 'photos', 'permalink.php', 'profile.php', 'story.php'].includes(directUserMatch[1].toLowerCase())) {
        return `https://www.facebook.com/${directUserMatch[1]}`;
      }
      // 4. For reels, videos, or group posts without extracted page slug, link directly to the live post/reel!
      return sampleUrl;
    }

    if (!/\s/.test(cleanAuthor) && /^[A-Za-z0-9._-]+$/.test(cleanAuthor)) {
      return `https://www.facebook.com/${encodeURIComponent(cleanAuthor)}`;
    }
    return `https://www.facebook.com/public/${encodeURIComponent(cleanAuthor)}`;
  }

  // 2. YouTube
  if (plat === 'youtube') {
    if (sampleUrl && typeof sampleUrl === 'string' && /youtube\.com\/channel\//i.test(sampleUrl)) {
      const chMatch = sampleUrl.match(/^https?:\/\/(?:www\.)?youtube\.com\/channel\/([A-Za-z0-9_-]+)/i);
      if (chMatch) return `https://www.youtube.com/channel/${chMatch[1]}`;
    }
    if (/\s/.test(cleanAuthor) || /[^A-Za-z0-9._-]/.test(cleanAuthor)) {
      return `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanAuthor)}`;
    }
    if (cleanAuthor.startsWith('@')) {
      return `https://www.youtube.com/${encodeURIComponent(cleanAuthor)}`;
    }
    return `https://www.youtube.com/@${encodeURIComponent(cleanAuthor)}`;
  }

  // 3. Twitter / X
  if (plat === 'x' || plat === 'twitter') {
    if (/\s/.test(cleanAuthor) || /[^A-Za-z0-9_]/.test(cleanAuthor)) {
      return `https://x.com/search?q=${encodeURIComponent(cleanAuthor)}`;
    }
    return `https://x.com/${encodeURIComponent(cleanAuthor)}`;
  }

  // 4. Instagram
  if (plat === 'instagram') {
    if (sampleUrl && typeof sampleUrl === 'string') {
      const igMatch = sampleUrl.match(/^https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9._]+)\/(?:p|reel)/i);
      if (igMatch && !['p', 'reel', 'stories', 'explore'].includes(igMatch[1].toLowerCase())) {
        return `https://www.instagram.com/${igMatch[1]}/`;
      }
    }
    if (/\s/.test(cleanAuthor) || /[^A-Za-z0-9._]/.test(cleanAuthor)) {
      const handle = cleanAuthor.replace(/[^A-Za-z0-9._]/g, '').toLowerCase();
      if (handle) return `https://www.instagram.com/${handle}/`;
      return `https://www.instagram.com/explore/tags/${encodeURIComponent(cleanAuthor.replace(/\s+/g, ''))}/`;
    }
    return `https://www.instagram.com/${encodeURIComponent(cleanAuthor)}/`;
  }

  // 5. Telegram
  if (plat === 'telegram') {
    if (/\s/.test(cleanAuthor) || /[^A-Za-z0-9_]/.test(cleanAuthor)) {
      return `https://t.me/s/${encodeURIComponent(cleanAuthor.replace(/[^A-Za-z0-9_]/g, ''))}`;
    }
    return `https://t.me/${encodeURIComponent(cleanAuthor)}`;
  }

  // 6. Reddit
  if (plat === 'reddit') {
    if (cleanAuthor.startsWith('r/')) {
      return `https://www.reddit.com/${cleanAuthor}`;
    }
    if (/\s/.test(cleanAuthor)) {
      return `https://www.reddit.com/search/?q=${encodeURIComponent(cleanAuthor)}`;
    }
    return `https://www.reddit.com/user/${encodeURIComponent(cleanAuthor.replace(/^u\//, ''))}`;
  }

  return null;
};

const CSS = `
*{box-sizing:border-box}
body{margin:0;font-family:'Helvetica Neue',Arial,${FONT_STACK},sans-serif;color:${INK};font-size:8.8pt;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pg{padding:0 .6mm}
p{margin:0 0 1.8mm}
.sm{font-size:7.3pt;color:${MUT}}
b{font-weight:700}

/* Cover header */
.hero{background:${NAVY};color:#fff;border-radius:3px;padding:5.5mm 7mm 0;margin:0 0 3.5mm;position:relative;overflow:hidden}
.hero:before{content:'';position:absolute;left:0;top:0;bottom:0;width:1.8mm;background:${ACCENT}}
.hero-top{display:flex;justify-content:space-between;align-items:center;gap:4mm;margin:0 0 2.6mm}
.hero .eyebrow{font-size:6.8pt;letter-spacing:.14em;color:#B8C9D6;font-weight:700;text-transform:uppercase}
.hero .eyebrow .dot{margin:0 1.6mm;color:#6F8AA3}
.classif{font-size:6.4pt;letter-spacing:.14em;font-weight:700;color:#F2C9B3;text-transform:uppercase;border:.6px solid #7C5A48;border-radius:2px;padding:.5mm 2mm}
.hero h1{font-size:19pt;line-height:1.15;margin:0 0 1.4mm;letter-spacing:-.015em;font-weight:700}
.hero .sub{font-size:8.8pt;color:#B8C9D6;margin:0 0 4.5mm}
.hero .meta{display:grid;grid-template-columns:1.5fr .8fr 1.5fr .9fr;border-top:.6px solid #2F5272;margin:0 -7mm;padding:0 7mm}
.hero .meta>span{padding:2.4mm 3mm 3mm 0;font-size:6.4pt;letter-spacing:.08em;color:#8FA6BD;text-transform:uppercase}
.hero .meta>span+span{padding-left:3mm;border-left:.6px solid #2F5272}
.hero .meta i{font-style:normal;display:block}
.hero .meta b{display:block;color:#fff;font-size:8.6pt;letter-spacing:0;text-transform:none;margin-top:.7mm;line-height:1.3}

.addr{display:flex;align-items:center;gap:5mm;border:.6px solid ${LINE};border-left:3px solid ${NAVY};border-radius:3px;background:#fff;padding:2.2mm 3.2mm;margin:0 0 3.5mm}
.addr .l{font-size:6.2pt;letter-spacing:.1em;color:${MUT};font-weight:700;width:24mm;line-height:1.35}
.addr .ab{flex:1}
.addr .who{font-size:9pt;font-weight:700;color:${INK}}
.addr .ad{font-size:7.4pt;color:#475569;margin-top:.3mm}

/* Assessment: threat level + bottom line */
.assess{display:grid;grid-template-columns:34mm 1fr;border:.6px solid ${LINE};border-radius:4px;margin:0 0 3mm;overflow:hidden;break-inside:avoid;background:#fff}
.lvl{padding:4mm 3mm;color:#fff;display:flex;flex-direction:column;justify-content:center;text-align:center}
.lvl-low{background:#1B7A4E}.lvl-med{background:#C27A0E}.lvl-high{background:#C0392B}.lvl-crit{background:#7A1F1F}
.lvl-k{font-size:6.2pt;letter-spacing:.14em;text-transform:uppercase;opacity:.85;font-weight:700}
.lvl-v{font-size:17pt;font-weight:800;line-height:1.15;margin:1.2mm 0;letter-spacing:.02em;text-transform:uppercase}
.lvl-n{font-size:6.8pt;opacity:.9}
.assess-body{padding:3.2mm 4mm}
.assess-body .lead{font-size:9.4pt;line-height:1.45;color:${INK};margin:0 0 2mm}
.assess-body .why{font-size:7.7pt;color:#475569;line-height:1.45;margin:0 0 2.4mm}
.chips{display:grid;grid-template-columns:repeat(3,1fr);gap:2mm}
.chips>div{background:${BG};border-radius:3px;padding:1.5mm 2.2mm}
.chips .ck{font-size:5.9pt;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
.chips .cv{font-size:7.4pt;font-weight:700;color:${INK};margin-top:.3mm}

/* Headline numbers: one strip */
.rpill{font-size:6pt;font-weight:700;letter-spacing:.05em;text-transform:uppercase;border-radius:8px;padding:.25mm 1.8mm;white-space:nowrap}
.rp-pri{background:#fde8e6;color:#9b1c14}.rp-amp{background:#fdecdc;color:#9a4a12}.rp-med{background:#e1f1f5;color:#1f6f86}.rp-oth{background:#eceff3;color:#5b6676}
.stack.tall{height:11px;border-radius:3px}
.acc-head{display:grid;grid-template-columns:28mm 1fr 44mm;gap:4mm;align-items:center;border:.6px solid ${LINE};border-radius:4px;padding:3mm 4mm;margin:0 0 3mm;background:#fff;break-inside:avoid}
.acc-n b{display:block;font-size:22pt;line-height:1;color:${INK};letter-spacing:-.02em}.acc-n span{display:block;font-size:7pt;color:${MUT};text-transform:uppercase;letter-spacing:.07em;margin-top:.8mm}.acc-n em{display:block;font-style:normal;font-size:7pt;color:${MUT}}
.acc-mix h4,.acc-top h4{margin:0 0 1.4mm;font-size:6.8pt;color:${MUT};text-transform:uppercase;letter-spacing:.07em}
.acc-top{border-left:.6px solid ${LINE};padding-left:4mm}.acc-top b{display:block;font-size:9pt;color:${INK}}.acc-top span{display:block;font-size:7.2pt;color:${MUT};margin-top:.6mm}
.watch{border:.6px solid #f1b8b2;border-left:3.5px solid ${CR};background:#fff8f7;border-radius:3px;padding:2.2mm 3.2mm;margin:0 0 3mm;break-inside:avoid}
.watch h4{margin:0 0 1.4mm;font-size:7.6pt;color:#7f1d1d;text-transform:uppercase;letter-spacing:.06em}
.wrow{display:flex;align-items:baseline;gap:2mm;font-size:7.6pt;padding:.8mm 0;border-top:.4px solid #f6d8d4}.wrow .nm{font-weight:700}.wrow .why{flex:1;color:#5b3a37}.wrow .lk{white-space:nowrap}
.calm{border-left:3.5px solid ${PR};background:#f1faf5;border-radius:3px;padding:2.2mm 3.2mm;margin:0 0 3mm;font-size:8pt;color:#14532d}
.geo{border:.6px solid ${LINE};border-radius:4px;background:#fff;padding:2.4mm 3.4mm;margin:0 0 3mm;break-inside:avoid}
.geo-h{display:flex;justify-content:space-between;align-items:center;margin:0 0 1.6mm}.geo-h h4{margin:0;font-size:8.4pt;color:${NAVY}}
.geo-row{display:grid;grid-template-columns:32mm 1fr 44mm;gap:3.5mm;align-items:center;padding:1.3mm 0;border-top:.4px solid #eef2f6}
.gname b{display:block;font-size:8.4pt;color:${INK}}.gname .sm{display:block}
.gbar .stack{display:flex}.gval{display:block;font-size:7pt;color:#475569;margin-top:.6mm}
.glinks{font-size:7.4pt;line-height:1.5}
.acc-head.two{grid-template-columns:28mm 1fr}
.vline{font-size:7.8pt;margin-top:.8mm;color:inherit}.calm b,.watch>b{font-size:8.6pt}
.pcards.one{grid-template-columns:1fr}
.pcard.wide{padding:2.4mm 3.2mm}

.cp-row{display:grid;grid-template-columns:1fr 1fr;gap:3mm;margin:0 0 3mm}
.cp-box{border:.6px solid ${LINE};border-radius:4px;padding:3mm 3.4mm;background:#fff;break-inside:avoid}
.cp-box h4{margin:0 0 2mm;font-size:8pt;color:${NAVY};font-weight:700;text-transform:uppercase;letter-spacing:.06em}
.cp-tl{position:relative;margin-left:2mm;padding-left:4mm;border-left:1.4px solid #C9D6E2}
.cp-tl .it{position:relative;margin:0 0 2.6mm;font-size:8pt;line-height:1.4;color:#334155}
.cp-tl .it:before{content:'';position:absolute;left:-5.4mm;top:.8mm;width:2.2mm;height:2.2mm;border-radius:50%;background:${ACCENT};border:1.2px solid #fff}
.cp-tl .dt{display:inline-block;background:${NAVY};color:#fff;font-weight:700;font-size:7pt;border-radius:2px;padding:.2mm 1.6mm;margin-right:1.4mm}
.cp-tl .kd{font-weight:700;color:${INK}}
.cp-tl .lk{display:block;margin-top:.6mm;font-size:6.6pt}
.cp-acts{display:grid;grid-template-columns:1fr;gap:1.8mm;margin:0 0 3mm}
.cp-act{display:flex;gap:2.6mm;border:.6px solid ${LINE};border-left:1.2mm solid ${TEAL};border-radius:3px;padding:2mm 3mm;background:#fff;break-inside:avoid}
.cp-act .no{flex:none;width:5.4mm;height:5.4mm;border-radius:50%;background:${NAVY};color:#fff;font-weight:700;font-size:8pt;text-align:center;line-height:5.4mm}
.cp-act b{font-size:8.4pt;color:${INK}}.cp-act .d{font-size:7.6pt;color:#475569;line-height:1.4;margin-top:.4mm}.cp-act .lk{font-size:6.6pt}
.cp-big{display:flex;gap:2mm;margin:0 0 2.2mm}
.cp-big>div{flex:1;text-align:center;border-radius:3px;padding:1.6mm 1mm;color:#fff}
.cp-big .n{font-size:15pt;font-weight:700;line-height:1.05}.cp-big .l{font-size:6pt;text-transform:uppercase;letter-spacing:.06em;opacity:.92}
.cp-note{font-size:7.4pt;color:#475569;line-height:1.45;margin:1.6mm 0 0}
.cp-note b{color:${INK}}
.grp{display:grid;grid-template-columns:44mm 1fr;gap:3mm;align-items:baseline;padding:1mm 0;border-top:.4px solid #eef2f6}
.grp .gt{font-size:6.8pt;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}.grp .gt i{display:inline-block;width:1.8mm;height:1.8mm;border-radius:50%;margin-right:1.2mm}.grp .gt b{color:${INK};margin-left:1.2mm}
.grp .gl{font-size:7.5pt;line-height:1.6;color:#334155}.grp .acct{white-space:nowrap}.grp .acct .post-link{color:#0f172a;font-weight:700;text-decoration:none;border-bottom:.4px dotted #64748b}.grp .lk{margin-left:1mm}.grp .lk a,.grp .lk .pc{display:inline-block;background:#eef4ff;border:.4px solid #b8cbf2;border-radius:1mm;padding:0 1.3mm;margin-left:.7mm;font-size:6.4pt;font-weight:700;color:#1d4ed8;text-decoration:none}.grp .sep{color:#cbd5e1}
.pcards{display:grid;grid-template-columns:1fr 1fr;gap:2.4mm;margin:0 0 3mm}
.pcard{border:.6px solid ${LINE};border-radius:3px;background:#fff;padding:2mm 2.6mm;break-inside:avoid}
.pc-h{display:flex;align-items:center;gap:2mm;margin:0 0 1.4mm;font-size:7.8pt;color:${INK}}
.plist{list-style:none;margin:1.2mm 0 0;padding:0}
.plist li{display:flex;align-items:baseline;gap:1.4mm;font-size:7.2pt;padding:.55mm 0;border-top:.4px solid #eef2f6}
.plist .nm{font-weight:700;flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.plist .lk{font-size:7pt;white-space:nowrap}
.plist .more{color:${MUT};font-size:7pt;padding-top:.8mm}
.srcbox{border:.6px solid #d6dde6;border-left:3px solid #94a3b8;background:#fbfcfd;border-radius:3px;padding:2.2mm 3.4mm;margin:0 0 3.4mm;break-inside:avoid}
.srcbox h4{margin:0 0 1.4mm;font-size:7.2pt;color:#475569;text-transform:uppercase;letter-spacing:.07em}
.srcrow{font-size:7.8pt;line-height:1.6;color:#334155;margin:0 0 .5mm}
.plink{color:#1d4ed8;font-weight:700;text-decoration:none}
.kstrip{display:grid;grid-template-columns:repeat(6,1fr);border:.6px solid ${LINE};border-radius:4px;margin:0 0 3mm;background:#fff;break-inside:avoid}
.kstrip>div{padding:2mm 2mm;text-align:center}
.kstrip>div+div{border-left:.6px solid ${LINE}}
.kstrip .n{font-size:15pt;font-weight:700;line-height:1.1;color:${NAVY};letter-spacing:-.02em}
.kstrip .l{font-size:5.9pt;color:${MUT};text-transform:uppercase;letter-spacing:.04em;margin-top:1mm;line-height:1.25}

/* Action callout */
.callout{border:.6px solid #E8C4C0;border-left:3px solid #B42318;border-radius:3px;background:#FFFAF9;padding:2.4mm 3mm;margin:0 0 3mm;break-inside:avoid}
.callout-h{font-size:8.4pt;font-weight:800;color:#8E1B12;letter-spacing:.03em;text-transform:uppercase;margin:0 0 .6mm}
.callout-s{font-size:7pt;color:#7F5550;margin:0 0 1.6mm}
.two{display:grid;grid-template-columns:1fr 1fr;gap:3mm}
.two>div{background:#fff;border:.6px solid #F0D4D0;border-radius:3px;padding:1.6mm 2.4mm}
.sub-h{font-size:7.4pt;font-weight:700;color:#8E1B12;margin:0 0 1.2mm}
.rows{list-style:none;margin:0;padding:0}
.rows li{break-inside:avoid;font-size:7pt;color:#334155;line-height:1.3;padding:.8mm 0;border-top:.5px solid #F1E3E1}
.rows li:first-child{border-top:none;padding-top:0}
.rows .tag{display:inline-block;font-size:5.6pt;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#fff;border-radius:2px;padding:.3mm 1.3mm;margin-right:1mm;vertical-align:1px}
.rows .why{display:block;color:#475569;margin-top:.3mm}

/* Section headings */
.sec{display:flex;align-items:center;gap:2.4mm;margin:4.2mm 0 2.4mm;break-after:avoid;page-break-after:avoid}
.sec .no{font-size:9.4pt;font-weight:700;color:#fff;background:${NAVY};border-radius:2px;padding:.4mm 1.8mm;letter-spacing:.02em}
.sec .nm{font-size:11pt;font-weight:700;color:${NAVY};letter-spacing:-.005em}
.sec:after{content:'';flex:1;height:.6px;background:${LINE}}
h3,h4{break-after:avoid;page-break-after:avoid}

.lead{font-size:9pt;color:#26304A;margin-bottom:2.2mm}
.bul{margin:0 0 2.4mm;padding:0;list-style:none}
.bul li{margin:0 0 1.2mm;padding-left:3.4mm;position:relative;font-size:8.3pt;color:#334155;break-inside:avoid}
.bul li:before{content:'';position:absolute;left:.4mm;top:1.5mm;width:1.3mm;height:1.3mm;border-radius:50%;background:${TEAL}}

/* Tables */
table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:7.4pt;margin:0 0 2.8mm}
th{text-align:left;font-size:6.1pt;letter-spacing:.07em;text-transform:uppercase;color:#334155;background:#EEF2F6;padding:1.6mm 2mm;border-bottom:1px solid ${NAVY};word-break:keep-all;overflow-wrap:normal;hyphens:none}
td{padding:1.6mm 2mm;border-bottom:.5px solid ${LINE};vertical-align:top;color:#334155;background:#fff;word-break:break-word;overflow-wrap:anywhere;white-space:normal}
tr:nth-child(even) td{background:#FAFBFD}
tr{break-inside:avoid}thead{display:table-header-group}
.tone-pos,.tone-positive{color:${PR};font-weight:700}.tone-neg,.tone-negative{color:${CR};font-weight:700}.tone-neu,.tone-neutral{color:${NW};font-weight:600}

/* Stat cards */
.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:2.4mm;margin:0 0 2.6mm;break-inside:avoid}
.metrics>div{border:.6px solid ${LINE};border-radius:4px;padding:2.4mm 2.8mm;background:#fff}
.metrics .n{font-size:14pt;font-weight:700;line-height:1.1;color:${NAVY};letter-spacing:-.02em}
.metrics .l{font-size:6pt;color:${MUT};text-transform:uppercase;letter-spacing:.05em;margin-top:.8mm;font-weight:600}
.metrics .a{font-size:6.8pt;color:#64748b;margin-top:.6mm}

/* Charts */
.hbar{display:grid;grid-template-columns:28mm 1fr 40mm;align-items:center;gap:2mm;margin:0 0 1.5mm}
.hbar .hl{font-size:7.3pt;color:#334155;text-align:right;overflow:hidden;white-space:nowrap}
.track{height:5px;background:#E8EEF3;border-radius:3px;overflow:hidden}
.fill{height:100%;border-radius:3px}
.hbar .hn{font-size:7pt;font-weight:700;color:${INK};line-height:1.25}
.stack{display:flex;margin-top:1mm;height:8px;border-radius:4px;overflow:hidden;background:#E8EEF3}
.stack>div{height:100%}
.legend{display:flex;flex-wrap:wrap;gap:2.8mm;margin-top:1.3mm;font-size:6.8pt;color:#475569}
.legend i{display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:1mm;vertical-align:middle}
.chartbox{border:.6px solid ${LINE};border-radius:4px;padding:3mm 3.2mm;background:#fff;margin:0 0 2.6mm;break-inside:avoid;page-break-inside:avoid}
.chartbox h4{margin:0 0 .4mm;font-size:8.2pt;color:${NAVY};font-weight:700}
.chartbox p{margin:0 0 2mm}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:2.6mm;align-items:stretch}
.grid2>.chartbox{margin-bottom:2.6mm}
.donutwrap{display:flex;align-items:center;gap:4mm}
.trows{flex:1;min-width:0}
.trow{display:grid;grid-template-columns:1fr auto 11mm;align-items:center;gap:2mm;padding:.9mm 0;border-bottom:.5px solid #EEF2F6;font-size:7.4pt;color:#334155}
.trow:last-child{border-bottom:none}
.trow.tone{grid-template-columns:1fr 22mm;padding:1.4mm 0}
.trow .tl{display:flex;align-items:center;min-width:0;overflow:hidden;white-space:nowrap}
.trow .tl i{flex:none;width:6px;height:6px;border-radius:50%;margin-right:1.6mm}
.trow .tv{font-weight:700;color:${INK};text-align:right}
.trow .tp{color:${MUT};text-align:right}
.platbars .hbar{grid-template-columns:18mm 1fr 18mm;margin-bottom:2.6mm}
.platbars .track{height:7px}

/* Timeline and what-to-watch boxes */
.dates-box,.watch-box{border:.6px solid ${LINE};border-radius:4px;padding:2.6mm 3.2mm;background:#fff}
.dates-box{border-left:3px solid #3B6EA8}
.watch-box{border-left:3px solid #C27A0E;background:#FFFCF5}
.dates-box h4,.watch-box h4{margin:0 0 1.6mm;font-size:7.6pt;text-transform:uppercase;letter-spacing:.05em;color:${NAVY}}
.watch-box h4{color:#8A5A0B}
.dates-box ul,.watch-box ul{margin:0;padding:0;list-style:none}
.dates-box li,.watch-box li{font-size:7.5pt;color:#334155;margin-bottom:1.2mm;line-height:1.35}
.intel-grid{display:grid;grid-template-columns:1fr 1fr;gap:2.6mm;margin:0 0 3mm;align-items:start}

/* Issue: known / not known */
.kn{display:grid;grid-template-columns:1fr 1fr;gap:2.6mm;margin:0 0 3mm}
.kn>div{border-radius:4px;padding:2.4mm 3.2mm;font-size:7.7pt;border:.6px solid ${LINE}}
.kn h4{margin:0 0 1.2mm;font-size:7.4pt;text-transform:uppercase;letter-spacing:.06em}
.kn ul{margin:0;padding-left:3.6mm}.kn li{margin-bottom:1mm;line-height:1.35}
.kn .yes{background:#F3FAF6;border-left:3px solid ${PR}}.kn .yes h4{color:#14532D}
.kn .no{background:#FFF9EF;border-left:3px solid #C27A0E}.kn .no h4{color:#8A5A0B}

/* Account tables */
.plat-badge{display:inline-block;padding:.6mm 1.8mm;border-radius:2px;font-size:6pt;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap}
.prio-pill{display:inline-block;padding:.6mm 1.8mm;border-radius:10px;font-size:6pt;font-weight:700;text-transform:uppercase;letter-spacing:.03em;white-space:nowrap}
.prio-high{background:#FDECEA;color:#A32116;border:.6px solid #F3B8B2}
.prio-med{background:#FFF4DD;color:#8A5A0B;border:.6px solid #F0D58F}
.prio-low{background:#EEF2F6;color:#475569;border:.6px solid #D5DEE6}
.reason-text{font-size:7.1pt;color:#334155;line-height:1.35}
.plat-group-box{break-inside:avoid;margin:0 0 3mm;border:.6px solid ${LINE};border-radius:4px;background:#fff;overflow:hidden}
.plat-group-header{display:flex;align-items:center;gap:2.4mm;padding:1.9mm 2.8mm;background:#F8FAFC;border-bottom:.6px solid ${LINE}}
.plat-group-title{font-size:7.8pt;font-weight:700;color:${INK};flex:1}
.plat-group-count{font-size:6.4pt;color:${MUT};text-transform:uppercase;letter-spacing:.05em}
.plat-group-box table{margin:0}
.plat-group-box tr:last-child td{border-bottom:none}

/* Links, annex, notes */
.post-link{color:#1D4ED8;text-decoration:none;font-weight:700;word-break:normal;overflow-wrap:anywhere}
.ref{color:#1D4ED8;text-decoration:none;font-weight:700;white-space:nowrap}
.annex-sub{display:flex;align-items:center;gap:2.4mm;margin:3mm 0 1.8mm;padding:1.8mm 2.8mm;background:#F8FAFC;border:.6px solid ${LINE};border-left:3px solid ${TEAL};border-radius:3px}
.annex-sub b{font-size:7.8pt;color:${INK};flex:1}
.annex-sub span{font-size:6.6pt;color:${MUT};text-transform:uppercase;letter-spacing:.05em}
.annex-sub.ctx{border-left-color:#94A3B8}
.footnote{margin-top:4mm;padding:2.6mm 3.4mm;background:${BG};border-radius:4px;font-size:7pt;color:#52606D;line-height:1.5;break-inside:avoid}
.footnote b{color:${INK};font-size:7.6pt}
`;

const POS = PR;
const NEU = '#94A3B8';
const NEG = CR;
const BAR = '#2F5D8A';
const CHART_COLORS = ['#2F5D8A', '#1F6F6A', '#C45C26', '#8A6BB1', '#B8860B', '#C2415D', '#4B8F5A', '#6B7C8A'];

const hbar = (label, value, max, color, note, unit = '') => `
<div class="hbar">
  <div class="hl">${esc(clip(label, 22))}</div>
  <div class="track"><div class="fill" style="width:${max > 0 ? Math.max(2, (100 * n0(value)) / max) : 0}%;background:${color}"></div></div>
  <div class="hn">${fmt(value)}${unit ? ` ${esc(unit)}` : ''}${note ? ` · ${esc(note)}` : ''}</div>
</div>`;

const PLAT_COLORS = {
  x: '#1E2A44',
  twitter: '#1E2A44',
  youtube: '#C9302C',
  facebook: '#2A8FA8',
  instagram: '#C13584',
  telegram: '#2AABEE',
  whatsapp: '#25D366',
  reddit: '#FF4500',
};
const platColor = (k) => PLAT_COLORS[String(k).toLowerCase()] || '#7A8499';

const stackBar = (parts, showLegend = true) => {
  const live = parts.filter((p) => n0(p.v) > 0);
  const tot = live.reduce((s, p) => s + n0(p.v), 0);
  if (!tot) return '<p class="sm">No split available.</p>';
  const bar = `<div class="stack">${live.map((p) => `<div style="width:${(100 * n0(p.v)) / tot}%;background:${p.c}"></div>`).join('')}</div>`;
  if (!showLegend) return bar;
  return `${bar}<div class="legend">${parts.map((p) => `<span><i style="background:${p.c}"></i>${esc(p.k)} ${fmt(p.v)} (${pct(p.v, tot)})</span>`).join('')}</div>`;
};

const donutSvg = (parts, center, sub) => {
  const live = parts.filter((p) => n0(p.v) > 0);
  const tot = live.reduce((s, p) => s + n0(p.v), 0) || 1;
  const r = 26;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const rings = live.length === 1
    ? `<circle cx="36" cy="36" r="${r}" fill="none" stroke="${live[0].c}" stroke-width="11"/>`
    : live.map((p) => {
      const len = (n0(p.v) / tot) * circ;
      const el = `<circle cx="36" cy="36" r="${r}" fill="none" stroke="${p.c}" stroke-width="11" stroke-dasharray="${len} ${Math.max(circ - len, 0.01)}" stroke-dashoffset="${-offset}" transform="rotate(-90 36 36)"/>`;
      offset += len;
      return el;
    }).join('');
  return `<svg width="78" height="78" viewBox="0 0 72 72">${rings}<text x="36" y="37" text-anchor="middle" font-size="9" font-weight="700" fill="#0B1F33">${esc(center)}</text><text x="36" y="47" text-anchor="middle" font-size="5" fill="#6B7C8A">${esc(sub)}</text></svg>`;
};

const timelineChart = (days) => {
  const rows = (days || []).slice(-24);
  if (!rows.length) return '<p class="sm">No daily series in this window.</p>';
  const w = 340;
  const h = 96;
  const padL = 28;
  const padR = 10;
  const padT = 14;
  const padB = 16;
  const max = Math.max(...rows.map((d) => n0(d.count)), 1);
  const inset = 8;
  const step = rows.length > 1 ? (w - padL - padR - 2 * inset) / (rows.length - 1) : 0;
  const xOf = (i) => (rows.length > 1 ? padL + inset + i * step : (w + padL - padR) / 2);
  const yOf = (v) => h - padB - ((h - padT - padB) * n0(v)) / max;
  const pts = rows.map((d, i) => [xOf(i), yOf(d.count)]);
  const line = pts.map((p) => p.join(',')).join(' ');
  const area = `${pts[0][0]},${h - padB} ${line} ${pts[pts.length - 1][0]},${h - padB}`;
  const grid = [0, 0.5, 1].map((f) => {
    const v = Math.round(max * f);
    const y = yOf(max * f);
    return `<line x1="${padL}" x2="${w - padR}" y1="${y}" y2="${y}" stroke="#E2E8F0" stroke-width="0.6" ${f === 0 ? '' : 'stroke-dasharray="2 2"'}/><text x="${padL - 4}" y="${y + 2.4}" text-anchor="end" font-size="6.5" fill="#6B7C8A">${fmt(v)}</text>`;
  }).join('');
  const every = rows.length > 12 ? Math.ceil(rows.length / 10) : 1;
  const labels = rows.map((d, i) => {
    if (i % every !== 0 && i !== rows.length - 1) return '';
    const bits = String(d.date || '').split('-');
    const text = bits.length === 3 ? `${bits[2]}/${bits[1]}` : String(d.date || '').slice(5);
    return `<text x="${pts[i][0]}" y="${h - 4}" text-anchor="middle" font-size="6.5" fill="#6B7C8A">${esc(text)}</text>`;
  }).join('');
  const peakI = rows.reduce((bi, d, i) => (n0(d.count) > n0(rows[bi].count) ? i : bi), 0);
  const values = rows.map((d, i) => (rows.length <= 12 || i === peakI
    ? `<text x="${pts[i][0]}" y="${pts[i][1] - 4}" text-anchor="middle" font-size="6.5" font-weight="700" fill="${i === peakI ? '#C45C26' : '#12324D'}">${fmt(d.count)}</text>`
    : '')).join('');
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;display:block">
    <defs><linearGradient id="tlfill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stop-color="#2F5D8A" stop-opacity="0.22"/><stop offset="95%" stop-color="#2F5D8A" stop-opacity="0"/></linearGradient></defs>
    ${grid}
    <polygon points="${area}" fill="url(#tlfill)"/>
    <polyline points="${line}" fill="none" stroke="#2F5D8A" stroke-width="1.4" stroke-linejoin="round"/>
    ${pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${i === peakI ? 2.6 : 1.8}" fill="${i === peakI ? '#C45C26' : '#2F5D8A'}"/>`).join('')}
    ${values}
    ${labels}
  </svg>
  <div class="legend"><span>Daily posts by publication date. Peak ${fmt(max)}. ${rows.length} day${rows.length === 1 ? '' : 's'}.</span></div>`;
};

// Report timezone: from the force profile, else Asia/Kolkata. Day boundaries and printed times follow it, not the server's clock.
let REPORT_TZ = 'Asia/Kolkata';
const validTz = (tz) => { try { new Intl.DateTimeFormat('en-GB', { timeZone: tz }); return true; } catch (e) { return false; } };
const setReportTz = (tz) => { REPORT_TZ = tz && validTz(tz) ? tz : 'Asia/Kolkata'; };

const parseDateMs = (d) => {
  if (!d) return 0;
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? t : 0;
};

const dateDayKey = (d) => {
  if (!d) return '0000-00-00';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '0000-00-00';
    return new Intl.DateTimeFormat('en-CA', { timeZone: REPORT_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(dt);
  } catch {
    return '0000-00-00';
  }
};

const TONE_PRIORITY = {
  negative: 1,
  neutral: 2,
  positive: 3,
};

const sortByDateAndTone = (list = []) =>
  [...list].sort((a, b) => {
    const dayA = dateDayKey(a.posted_at);
    const dayB = dateDayKey(b.posted_at);
    if (dayA !== dayB) {
      return dayB.localeCompare(dayA);
    }
    const toneA = TONE_PRIORITY[a.sentK] || 4;
    const toneB = TONE_PRIORITY[b.sentK] || 4;
    if (toneA !== toneB) {
      return toneA - toneB;
    }
    const timeA = parseDateMs(a.posted_at);
    const timeB = parseDateMs(b.posted_at);
    if (timeA !== timeB) {
      return timeB - timeA;
    }
    return (b.eng || 0) - (a.eng || 0);
  });

const sortByLatest = (list = []) =>
  [...list].sort((a, b) => parseDateMs(b.posted_at) - parseDateMs(a.posted_at));

const metric = (n, label, action) => `<div><div class="n">${esc(String(n))}</div><div class="l">${esc(label)}</div>${action ? `<div class="a">${esc(action)}</div>` : ''}</div>`;

const { localizeHtml } = require('./labels');

/**
 * Turns plain "[Post #n]" citations in the brief into links to the evidence annex row (#e<n>).
 * Text inside existing links is left alone, and only posts that are actually in the annex are linked.
 */
/** Executive summary: every "[Post #n]" / "Post #n" becomes a live link labelled "#n" (plain "#n" when the post has no address). Existing links only get the short label. */
const liveLinkCitations = (html, urlByN) => String(html)
  .split(/(<a\b[\s\S]*?<\/a>)/g)
  .map((seg, i) => (i % 2
    ? seg.replace(/\[Post #(\d+)\]/g, '#$1')
    : seg.replace(/\[?Post #(\d+)\]?/g, (m, n) => (urlByN.get(Number(n)) ? `<a href="${esc(urlByN.get(Number(n)))}" target="_blank" class="plink">#${n}</a>` : `#${n}`))))
  .join('');

const linkCitations = (html, validNs) => String(html)
  .split(/(<a\b[\s\S]*?<\/a>)/g)
  .map((seg, i) => (i % 2 ? seg : seg.replace(/\[Post #(\d+)\]/g, (m, n) => (validNs.has(Number(n)) ? `<a href="#e${n}" class="ref">[Post #${n}]</a>` : m))))
  .join('');

/**
 * The brief for one region only: drops everything the analysis says about posts that are all outside the region, and any
 * sentence of the model's free text that names a place outside it. Counts and charts are already built from the region's posts.
 */
const nameMatcher = (outsideNames) => {
  const parts = (outsideNames || []).map((n) => String(n).trim()).filter((n) => n.length > 2).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!parts.length) return () => false;
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${parts.join('|')})(?![\\p{L}\\p{N}])`, 'iu');   // whole words only: "goa" does not match "goal"
  return (text) => re.test(String(text || ''));
};

/**
 * The brief for one region only. An item is dropped when all its posts are outside the region OR its own text names a place outside it;
 * a sentence of the model's free text is dropped when it names one. Counts and charts are already built from the region's posts.
 */
const regionFilter = (analysis, outsideNs, outsideNames) => {
  if (!analysis) return analysis;
  const mentions = nameMatcher(outsideNames);
  const inside = (posts) => !posts || !posts.length || posts.some((n) => !outsideNs.has(Number(n)));
  const textOf = (x) => (typeof x === 'string' ? x : JSON.stringify(x || {}));
  const keep = (list) => (Array.isArray(list) ? list.filter((x) => (typeof x === 'string' || inside(x?.posts)) && !mentions(textOf(x))) : list);
  const clean = (text) => {
    if (!text) return text;
    return String(text).split(/(?<=[.!?।])\s+/).filter((sen) => !mentions(sen)).join(' ');
  };
  const strands = keep(analysis.issueStrands);
  return {
    ...analysis,
    bottomLine: clean(analysis.bottomLine),
    publicOrder: clean(analysis.publicOrder),
    situation: clean(analysis.situation),
    sentimentCommentary: clean(analysis.sentimentCommentary),
    platformsCommentary: '',
    issueStrands: strands,
    issueLink: strands?.length === (analysis.issueStrands || []).length ? clean(analysis.issueLink) : '',
    known: keep(analysis.known),
    notKnown: keep(analysis.notKnown),
    actions: keep(analysis.actions),
    closingSummary: clean(analysis.closingSummary),
    narrativesToWatch: keep(analysis.narrativesToWatch),
    narratives: keep(analysis.narratives),
    claims: keep(analysis.claims),
    keyDates: (analysis.keyDates || []).filter((k) => !k.outside && inside(k.posts) && !mentions(textOf(k))),
    activities: keep(analysis.activities),
    presence: keep(analysis.presence),
    leaders: keep(analysis.leaders),
    amplifiers: keep(analysis.amplifiers),
    geography: keep(analysis.geography),
  };
};

const buildReportHtml = ({ summary, keywordData, tenantName, analysis, headquarters, includeEvidence = true, labels = null, regionOnly = false, compact = false }) => {
  setReportTz(headquarters?.timezone);
  // Fixed wording that carries a value (a region, a count) goes through the label map here, because the post-build
  // translation only replaces text that is exactly one label. {placeholders} are kept by the translator.
  const L = (en, vars = {}) => String((labels && labels[en]) || en).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  let sectionNo = 0;
  const secNo = () => `${String(++sectionNo).padStart(2, '0')}.`;
  const stats = summary?.stats || {};
  const event = summary?.event || {};
  const kwa = keywordData || null;
  const kws = (kwa?.keywords || []).filter((k) => n0(k.total_posts) > 0);
  let total = n0(stats.total_unique_posts || stats.total_media_count);
  let sent = sentimentOf(stats.sentiment_counts);
  let sentTotal = Math.max(sent.positive + sent.neutral + sent.negative, 1);
  let platformEntries = Object.entries(stats.platform_counts || {})
    .filter(([, v]) => n0(v) > 0)
    .sort((a, b) => b[1] - a[1]);
  const eng = stats.total_engagement || kwa?.summary?.engagement || {};
  // Interactions only; views are a different measure and are shown separately, so one number never mixes the two.
  let engTotal = n0(eng.likes) + n0(eng.shares) + n0(eng.comments);
  let viewsTotal = n0(eng.views);
  const monitoredTotal = total;   // everything the monitor matched, before the event's relevance and region are applied
  const generated = summary?.generated_at ? new Date(summary.generated_at) : new Date();
  const dateStr = generated.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: REPORT_TZ });
  const windowStr =
    stats.timeframe_label
      ? `${stats.timeframe_label}${!/\d{2}\/\d{2}\/\d{4}/.test(stats.timeframe_label) && stats.date_range?.start && stats.date_range?.end ? ` (${new Date(stats.date_range.start).toLocaleDateString('en-GB', { timeZone: REPORT_TZ })} – ${new Date(stats.date_range.end).toLocaleDateString('en-GB', { timeZone: REPORT_TZ })})` : ''}`
      : stats.date_range?.start && stats.date_range?.end
        ? `${new Date(stats.date_range.start).toLocaleDateString('en-GB', { timeZone: REPORT_TZ })} – ${new Date(stats.date_range.end).toLocaleDateString('en-GB', { timeZone: REPORT_TZ })}`
        : '—';
  
  // The display name comes from the force profile (or the generic fallback in headquarters.js); no tenant is named in this file.
  const cleanTenant = (t) => {
    if (headquarters?.display_name) return headquarters.display_name;
    if (headquarters?.force && headquarters.official) return String(headquarters.force).toUpperCase();
    const label = String(t || '').replace(/[_]+/g, ' ').replace(/\bblura\s*saga\b/gi, '').trim();
    return label ? label.toUpperCase() : 'DIGITAL INTELLIGENCE PLATFORM';
  };

  const tenant = cleanTenant(tenantName);
  const hq = headquarters || null;
  const hqHtml = hq
    ? `<div class="addr">
        <div class="l">ADDRESSED TO STATE HEADQUARTERS</div>
        <div class="ab">
          <div class="who">${esc(hq.head)}, ${esc(hq.force)}</div>
          <div class="ad">${esc(hq.addressLine)}${hq.phone ? ` · ${esc(hq.phone)}` : ''}</div>
        </div>
      </div>`
    : `<div class="addr">
        <div class="l">ADDRESSED TO STATE HEADQUARTERS</div>
        <div class="ab"><div class="who">${esc(tenant)}</div></div>
      </div>`;
  let lead = platformEntries[0];
  const placeLexicon = buildPlaceLexicon(event);
  const broad = broadPlaces(event);

  const factsPlaces = analysis?.facts?.byPost || null;   // places checked against the post text; the old pattern guesses are not used when these exist
  const rawEv = summary?.evidence_traceability || [];
  const ev = rawEv.map((e, i) => {
    const n = Number((String(e.citationTag || '').match(/\d+/) || [i + 1])[0]);
    const text = String(e.text || '');
    const sk = sentKey(e.sentiment);
    const isVisit = VISIT_RE.test(text);
    const places = [];
    const addPlace = (name) => {
      if (!name || places.some((h) => h.toLowerCase() === name.toLowerCase())) return;
      places.push(name);
    };
    specificPlaces(text).forEach(addPlace);
    placesIn(text, placeLexicon).forEach(addPlace);
    if (!places.length && isVisit) extractPlacePhrases(text).forEach(addPlace);
    const likes = n0(e.likes ?? e.engagement?.likes);
    const comments = n0(e.comments ?? e.engagement?.comments);
    const shares = n0(e.shares ?? e.engagement?.shares);
    const views = n0(e.views ?? e.engagement?.views);
    const postUrl = resolvePostUrl(e);
    return {
      ...e,
      n,
      plat: platKey(e.platform),
      author: shortAuthor(e.author),
      text,
      sentK: sk,
      places: factsPlaces ? (factsPlaces[n]?.places || []) : places,
      specific: (factsPlaces ? (factsPlaces[n]?.places || []) : places).filter((p) => !broad.has(p.toLowerCase())),
      isVisit,
      url: postUrl,
      when: e.posted_at ? new Date(e.posted_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: REPORT_TZ }) : '—',
      eng: likes + comments * 2 + shares * 3 + Math.floor(views / 10),
      inter: likes + comments + shares,
      vw: views,
    };
  });

  // Region scope: the headline numbers describe posts about the event's own region, computed from the evidence list.
  // Without place data the monitor-wide numbers are kept, so nothing is invented.
  const scopeInfo = classifyEvidence(ev, analysis, event);
  const { inEv, outEv, outsideNs } = scopeInfo;
  if (regionOnly && scopeInfo.reliable) analysis = regionFilter(analysis, outsideNs, scopeInfo.outsideNames);
  const regionName = event.location || 'the event region';
  const relevantTotal = n0(stats.relevant_posts_count) || ev.length;
  const scoped = scopeInfo.reliable && inEv.length > 0;
  const scopeEv = scoped ? inEv : ev;
  if (scoped) {
    total = inEv.length;
    const tone = { positive: 0, neutral: 0, negative: 0 };
    inEv.forEach((e) => { if (e.sentK) tone[e.sentK] += 1; });
    sent = tone;
    sentTotal = Math.max(tone.positive + tone.neutral + tone.negative, 1);
    const byPlat = {};
    inEv.forEach((e) => { byPlat[e.plat] = (byPlat[e.plat] || 0) + 1; });
    platformEntries = Object.entries(byPlat).sort((a, b) => b[1] - a[1]);
    engTotal = inEv.reduce((x, e) => x + e.inter, 0);
    viewsTotal = inEv.reduce((x, e) => x + e.vw, 0);
    lead = platformEntries[0];
  }
  const riskFrom = (list) => list.reduce((acc, e) => { const k = String(e.risk_level || 'low').toLowerCase(); acc[k] = (acc[k] || 0) + 1; return acc; }, { critical: 0, high: 0, medium: 0, low: 0 });
  const dailySeries = (list) => {
    const by = {};
    list.forEach((e) => { if (e.posted_at) { const k = dateDayKey(e.posted_at); by[k] = (by[k] || 0) + 1; } });
    return Object.keys(by).sort().map((date) => ({ date, count: by[date] }));
  };
  const entitiesFrom = (list) => {
    const by = {};
    list.forEach((e) => {
      const k = String(e.target_entity || '').trim();
      if (!k) return;
      const r = by[k] || (by[k] = { name: k, total: 0, praise: 0, news: 0, crit: 0 });
      r.total += 1;
      if (e.sentK === 'positive') r.praise += 1; else if (e.sentK === 'negative') r.crit += 1; else r.news += 1;
    });
    return Object.values(by);
  };

  const regionNameWords = String(event.location || '').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim().split(' ').filter((w) => w.length > 2);
  const foldRegionName = (d) => regionNameWords.includes(String(d).toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim());

  // Geographic penetration
  const placeMap = {};
  sortByLatest(ev).forEach((e) => {
    if (e.is_relevant === false) return;
    const named = e.specific.length ? e.specific : e.places;
    named.forEach((d) => {
      if (!d || SKIP_PLACE.has(d.toLowerCase())) return;
      if (foldRegionName(d)) return;   // the event's own region is the scope, not a place inside it
      placeMap[d] = placeMap[d] || { count: 0, sample: null };
      placeMap[d].count += 1;
      if (!placeMap[d].sample) placeMap[d].sample = e;
    });
  });
  let places = Object.entries(placeMap)
    .map(([name, info]) => ({ name, count: info.count, sample: info.sample }))
    .sort((a, b) => b.count - a.count);

  let visits = sortByDateAndTone(ev.filter((e) => e.specific.length || e.isVisit));

  // Geography from the posts' own places (facts pass), grouped against the event's region. A place that is only
  // mentioned is kept apart from one where people are reported to be; places in other regions are listed separately.
  const foldGeo = (t) => String(t || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
  const regionWords = foldGeo(event.location).split(' ').filter((w) => w.length > 2);
  const factPlaces = analysis?.facts?.places || [];
  const geoReliable = Boolean(analysis?.facts);
  if (!geoReliable) { places = []; visits = []; }   // guessed places are not shown as facts
  let geoIn = []; let geoOut = []; let geoMapped = [];
  if (factPlaces.length) {
    const byN = new Map(ev.map((e) => [e.n, e]));
    const mapped = factPlaces.map((p) => {
      const hay = ` ${foldGeo(`${p.name} ${p.region}`)} `;
      const inside = !regionWords.length || regionWords.some((w) => hay.includes(` ${w} `));
      return { name: p.name, region: p.region, count: p.mentioned, active: p.active, inside, sample: byN.get(p.posts[0]) || null, posts: p.posts };
    });
    geoMapped = mapped;
    geoIn = mapped.filter((p) => p.inside && !regionWords.includes(foldGeo(p.name)));
    geoOut = mapped.filter((p) => !p.inside);
    places = geoIn.length ? geoIn : mapped.filter((p) => p.inside);
    if (regionOnly) geoOut = [];
    const activeNs = new Set(mapped.filter((p) => p.inside && p.active).flatMap((p) => p.posts));
    visits = sortByDateAndTone(ev.filter((e) => activeNs.has(e.n)));
  }

  const factPosts = new Set([...(analysis?.facts?.calls?.posts || []), ...(analysis?.facts?.violence?.posts || [])]);
  const critical = sortByDateAndTone(
    scopeEv.filter((e) => ['critical', 'high'].includes(String(e.risk_level || '').toLowerCase()) || e.has_threat_vector || factPosts.has(e.n))
  );

  // Amplifiers & high monitoring profiles — CAPPED to Top 10 (or max 15 if engagement is high)
  const authors = {};
  scopeEv.forEach((e) => {
    const key = `${e.plat}|${e.author}`;
    authors[key] = authors[key] || {
      author: e.author,
      platform: e.plat,
      count: 0,
      eng: 0,
      inter: 0,
      vw: 0,
      criticalCount: 0,
      negativeCount: 0,
      positiveCount: 0,
      neutralCount: 0,
      posts: [],
      samples: [],
      sample: e.text,
      sampleUrl: e.url,
    };
    authors[key].count += 1;
    authors[key].eng += (e.eng || 0);
    authors[key].inter += (e.inter || 0);
    authors[key].vw += (e.vw || 0);
    if (!authors[key].sampleUrl && e.url) authors[key].sampleUrl = e.url;
    if (!authors[key].sample && e.text) authors[key].sample = e.text;
    if (e.sentK === 'negative') authors[key].negativeCount += 1;
    else if (e.sentK === 'positive') authors[key].positiveCount += 1;
    else authors[key].neutralCount += 1;

    if (['critical', 'high'].includes(String(e.risk_level || '').toLowerCase()) || e.has_threat_vector) {
      authors[key].criticalCount += 1;
    }
    if (e.n) authors[key].posts.push(e.n);
    if (e.text && authors[key].samples.length < 6) {
      authors[key].samples.push({
        text: e.text,
        n: e.n,
        sentK: e.sentK,
        risk: e.risk_level,
        eng: e.eng || 0,
        url: e.url,
      });
    }
  });

  const totalAuthors = Object.keys(authors).length;
  const profileCapLimit = totalAuthors > 12 ? 15 : 10;

  // Helper to extract punchy, clean quote snippets from post texts
  const extractCleanQuote = (text, maxLen = 80) => {
    if (!text) return '';
    let cleaned = String(text)
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/#[\w\u0900-\u097F\u0B00-\u0B7F]+/gi, '')
      .replace(/@\w+/gi, '')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const sentences = cleaned.split(/(?<=[.!?।])\s+/).filter((s) => s.trim().length > 12);
    if (sentences.length > 0) {
      const best = sentences.find((s) =>
        /resign|protest|scam|error|book|minister|mantri|demand|arrest|strike|bandh|rally|action|govt|police|corrupt|syllabus/i.test(s)
      ) || sentences[0];
      cleaned = best.trim();
    }

    if (!cleaned) return '';
    if (cleaned.length <= maxLen) return `"${cleaned}"`;
    return `"${cleaned.slice(0, maxLen).trim()}…"`;
  };

  // Account roles and priority come from what each account posted (facts pass), never from its name or a fixed score.
  const factAccounts = new Map((analysis?.facts?.accounts || []).map((f) => [`${f.author}`.toLowerCase(), f]));
  const TIER = {
    priority: { rank: 3, cls: 'prio-high' },
    amplifier: { rank: 2, cls: 'prio-med' },
    media: { rank: 1, cls: 'prio-low' },
    routine: { rank: 0, cls: 'prio-low' },
  };
  const PRIORITY_LABEL = { organisation: 'Organiser', figure: 'Political actor' };
  const topReach = Math.max(1, ...Object.values(authors).map((a) => a.eng || 0));
  const sourceTypes = analysis?.sourceTypes || {};

  const allWatch = Object.values(authors)
    .map((a) => {
      const f = factAccounts.get(`${a.author}`.toLowerCase()) || {};
      // Media: from the posts' own reading (facts) or the earlier per-post source type, never from the account name.
      const typed = a.posts.map((n) => sourceTypes[n]).filter(Boolean);
      const mediaByType = typed.length > 0 && typed.filter((t) => t === 'media').length * 2 > typed.length;
      const role = f.role || (mediaByType ? 'media' : 'individual');
      const calls = n0(f.calls);
      const violence = n0(f.violence);
      let tier = 'routine';
      if (role === 'media') tier = 'media';
      else if (calls > 0 || violence > 0) tier = 'priority';     // an account is a priority only for what IT calls for or reports
      else if (a.eng >= topReach * 0.5 && a.eng > 0 && a.count >= 2) tier = 'amplifier';

      const reasons = [];
      if (tier === 'media') reasons.push(`News or official page: ${fmt(a.count)} post${a.count === 1 ? '' : 's'} about the event.`);
      if (calls > 0) reasons.push(`${fmt(calls)} post${calls === 1 ? ' calls' : 's call'} people to join or act.`);
      if (violence > 0) reasons.push(`${fmt(violence)} post${violence === 1 ? ' mentions' : 's mention'} violence or damage.`);
      if (tier === 'amplifier') reasons.push(`${fmt(a.inter)} interactions${a.vw ? ` and ${fmt(a.vw)} views` : ''} over ${fmt(a.count)} posts.`);
      if (a.criticalCount > 0) reasons.push(`${fmt(a.criticalCount)} post${a.criticalCount === 1 ? '' : 's'} rated high risk by the post analysis (this does not make the account itself a priority).`);
      if (!reasons.length) reasons.push(`${fmt(a.count)} post${a.count === 1 ? '' : 's'} on the event; no call to act or violence found.`);
      const quoteRaw = extractCleanQuote((a.samples.find((x) => x.sentK === 'negative') || a.samples[0] || { text: a.sample }).text, 90);
      const quote = regionOnly && scopeInfo.reliable && nameMatcher(scopeInfo.outsideNames)(quoteRaw) ? '' : quoteRaw;
      const t = TIER[tier];
      const label = tier === 'priority' ? (PRIORITY_LABEL[role] || 'Mobiliser') : tier === 'amplifier' ? 'Amplifier' : tier === 'media' ? 'News / official' : 'Other';
      return {
        ...a,
        role,
        tier,
        tierRank: t.rank,
        why: `${reasons.join(' ')}${quote && tier !== 'routine' ? ` ${quote}` : ''}`,
        callsN: calls,
        violenceN: violence,
        quote,
        riskScore: t.rank * 30 + Math.min(29, calls * 5 + violence * 8 + a.criticalCount * 2),
        riskLabel: label,
        priority: label,
        priorityClass: t.cls,
      };
    })
    .sort((a, b) => b.tierRank - a.tierRank || b.riskScore - a.riskScore || b.eng - a.eng || b.count - a.count);
  const highWatchList = allWatch.slice(0, profileCapLimit);

  const promoters = highWatchList;

  const entities = (scoped
    ? entitiesFrom(inEv)
    : Object.entries(stats.target_classification || {}).map(([k, v]) => ({ name: k, total: n0(v.total), praise: n0(v.praise), news: n0(v.news), crit: n0(v.criticism) })))
    .filter((e) => e.total > 0)
    .sort((a, b) => b.total - a.total);

  const topKwA = kws[0] || null;
  const topKwB = kws[1] || null;

  const findings = (analysis?.keyFindings || []).slice(0, 6);
  const narratives = (analysis?.narratives || []).slice(0, 5);
  const seenEsc = new Set();
  const actions = (analysis?.actions || []).slice(0, 10).map((a) => ({
    ...a,
    detail: String(a.detail || '').replace(/\s*Escalate if[^.]*\./gi, (m) => { const k = m.trim().toLowerCase(); if (seenEsc.has(k)) return ''; seenEsc.add(k); return m; }),
  }));

  const platStr = platformEntries.map(([k, v]) => `${platLabel(k)}: ${fmt(v)}`).join(', ') || '—';
  const kwStr = kws.slice(0, 14).map((k) => k.keyword).join(', ') || (event.keywords || []).map((k) => (k.keyword || k)).join(', ') || '—';

  const placeLabel = (e) => (e.specific.length ? e.specific.join(', ') : e.places.length ? e.places.join(', ') : 'Not named in post');
  
  const postRefLink = (e) => {
    const label = e.citationTag ? e.citationTag : `Post #${e.n}`;
    if (e.url) {
      return `<a href="${esc(e.url)}" target="_blank" class="post-link">${esc(label)}</a>`;
    }
    return esc(label);
  };

  // Inside the brief a post reference jumps to its row in the evidence annex; the annex row holds the live link.
  const postRefInternal = (e) => `<a href="#e${e.n}" class="ref">${esc(e.citationTag ? e.citationTag : `Post #${e.n}`)}</a>`;

  const authorProfileLink = (platOrObj, maybeAuthor, maybeSampleUrl) => {
    let plat = '';
    let author = '';
    let sampleUrl = '';
    if (typeof platOrObj === 'object' && platOrObj !== null) {
      plat = platOrObj.platform || platOrObj.plat;
      author = platOrObj.author || platOrObj.author_name || '';
      sampleUrl = platOrObj.sampleUrl || platOrObj.url || (platOrObj.samples && platOrObj.samples[0]?.url) || '';
    } else {
      plat = platOrObj;
      author = maybeAuthor;
      sampleUrl = maybeSampleUrl || '';
    }
    const url = resolveAuthorProfileUrl({ platform: plat, author, sampleUrl }) || resolvePostUrl({ platform: plat, author, url: sampleUrl });
    if (url) {
      return `<a href="${esc(url)}" target="_blank" class="post-link">@${esc(author)}</a>`;
    }
    return `@${esc(author)}`;
  };

  const activityPosts = sortByDateAndTone(scopeEv.filter((e) => e.isVisit));
  const activityList = activityPosts.length ? activityPosts : sortByDateAndTone(scopeEv);
  const activityRows = activityList
    .map(
      (e) => `<tr>
<td>${postRefLink(e)}</td>
<td>${esc(e.when)}</td>
<td>${esc(placeLabel(e))}</td>
<td>${esc(platLabel(e.plat))}</td>
<td>${authorProfileLink(e.plat, e.author, e.url)}</td>
<td class="tone-${e.sentK || 'neu'}">${esc(toneLabel(e.sentK))}</td>
<td>${esc(clip(e.text, 220))}</td>
</tr>`
    )
    .join('');

  const activityBrief = (analysis?.activities || [])
    .map((a) => `<li><b>${esc(a.what)}</b>${a.where ? ` — ${esc(a.where)}` : ''}${a.when ? `, ${esc(a.when)}` : ''}${a.posts?.length ? ` <span class="sm">${esc(a.posts.map((n) => `[Post #${n}]`).join(' '))}</span>` : ''}</li>`)
    .join('');

  // The posts behind the "people on site" count, so the number can be checked. Links only in the full report.
  const onSiteTable = visits.length
    ? `<div class="chartbox"><h4>Posts reporting people on site</h4><p class="sm">Reported by the posts; not verified.${visits.length > 10 ? ` Showing the latest 10 of ${fmt(visits.length)}; all are in the evidence annex.` : ''}</p>
  <table>
    <colgroup><col style="width:9%"><col style="width:11%"><col style="width:13%"><col style="width:17%"><col>${includeEvidence ? '' : ''}</colgroup>
    <thead><tr><th>Post</th><th>When</th><th>Place</th><th>Account</th><th>Text</th></tr></thead>
    <tbody>${visits.slice(0, 10).map((e) => `<tr><td>${postRefLink(e)}</td><td>${esc(e.when)}</td><td>${esc(placeLabel(e))}</td><td>${authorProfileLink(e.plat, e.author, e.url)}</td><td>${esc(clip(e.text, 170))}</td></tr>`).join('')}</tbody>
  </table></div>`
    : '';
  const refList = (ns) => (ns && ns.length ? ` <span class="sm">${ns.slice(0, 8).map((n) => `[Post #${n}]`).join(' ')}</span>` : '');
  const onSiteRefs = includeEvidence ? visits.slice(0, 8).map((e) => `[Post #${e.n}]`).join(' ') : '';
  const callRefs = refList(analysis?.facts?.calls?.posts);

  const placeRows = places.length
    ? places
        .map(
          (d) => `<tr>
<td>${esc(d.name)}</td>
<td>${fmt(d.count)}</td>
<td>${esc(clip(d.sample?.text || '', 180))}</td>
</tr>`
        )
        .join('')
    : `<tr><td colspan="3">No specific landmarks identified.${event.location ? ` Monitored region: ${esc(event.location)}.` : ''}</td></tr>`;

  const critRows = critical.length
    ? critical
        .map(
          (e) => `<tr>
<td>${postRefLink(e)}</td>
<td>${esc(placeLabel(e))}</td>
<td>${esc(platLabel(e.plat))}</td>
<td>${authorProfileLink(e.plat, e.author, e.url)}</td>
<td class="tone-neg">${esc(toneLabel(e.sentK) === '—' ? 'Negative' : toneLabel(e.sentK))}</td>
<td>${esc(clip(e.text, 200))}</td>
</tr>`
        )
        .join('')
    : `<tr><td colspan="6">No critical or high-risk posts identified in this dataset.</td></tr>`;

  const promoterRows = promoters
    .map(
      (a) => `<tr>
<td>${esc(platLabel(a.platform))}</td>
<td>${authorProfileLink(a)}</td>
<td>${fmt(a.count)}</td>
<td>${fmt(a.eng)}</td>
<td>${esc(clip(a.sample, 160))}</td>
</tr>`
    )
    .join('');


  const evidenceRowsFor = (list) => sortByDateAndTone(list)
    .map(
      (e) => `<tr id="e${e.n}">
<td>${postRefLink(e)}</td>
<td>${esc(e.when)}</td>
<td>${esc(placeLabel(e))}</td>
<td>${esc(platLabel(e.plat))}</td>
<td>${authorProfileLink(e.plat, e.author, e.url)}</td>
<td class="tone-${e.sentK || 'neu'}">${esc(toneLabel(e.sentK))}</td>
<td>${fmt(e.inter)}</td>
<td>${esc(clip(e.text, 600))}</td>
</tr>`
    )
    .join('');
  const evidenceTable = (list, heading, kind) => `${heading ? `<div class="annex-sub${kind === 'ctx' ? ' ctx' : ''}"><b>${esc(heading)}</b><span>${L(list.length === 1 ? '{n} post' : '{n} posts', { n: fmt(list.length) })}</span></div>` : ''}
  <table>
    <colgroup>
      <col style="width:9%">
      <col style="width:9%">
      <col style="width:10%">
      <col style="width:8.5%">
      <col style="width:17%">
      <col style="width:8%">
      <col style="width:5.5%">
      <col style="width:33%">
    </colgroup>
    <thead><tr><th>Post Link</th><th>When</th><th>Place</th><th>Platform</th><th>Account</th><th>Tone</th><th>Eng.</th><th>Text</th></tr></thead>
    <tbody>${evidenceRowsFor(list) || '<tr><td colspan="8">No posts in this evidence set.</td></tr>'}</tbody>
  </table>`;

  const narrHtml = narratives.length
    ? `<ul class="bul">${narratives
        .map(
          (n) =>
            `<li><b>${esc(n.title)}</b> — ${esc(clip(n.discussed, 220))}${n.tone ? ` <span class="sm">(${esc(clip(n.tone, 80))})</span>` : ''}</li>`
        )
        .join('')}</ul>`
    : analysis?.situation
      ? `<p class="lead">${esc(analysis.situation)}</p>`
      : `<p class="sm">Narrative analysis active.</p>`;

  const findingsHtml = findings.length
    ? `<ul class="bul">${findings.map((f) => `<li><b>${esc(f.headline)}</b> — ${esc(f.detail)}</li>`).join('')}</ul>`
    : '';

  const actionsHtml = actions.length
    ? `<ul class="bul">${actions.map((a) => `<li><b>${esc(a.action)}</b> — ${esc(a.detail)}${a.posts && a.posts.length ? ` <span class="sm">${esc(a.posts.map((p) => `[Post #${p}]`).join(' '))}</span>` : ''}</li>`).join('')}</ul>`
    : '';

  const platMax = platformEntries.length ? n0(platformEntries[0][1]) : 1;
  const platformBars = platformEntries
    .map(([k, v]) => hbar(platLabel(k), v, platMax, platColor(k), pct(v, total)))
    .join('');
  const briefSent = [
    { k: 'Positive', v: sent.positive, c: PR },
    { k: 'Neutral', v: sent.neutral, c: NW },
    { k: 'Negative', v: sent.negative, c: CR },
  ];
  const comparisons = (Array.isArray(kwa?.comparisons) ? kwa.comparisons : []).slice(0, 8);
  const kwMax = comparisons.length ? n0(comparisons[0].posts) : 1;
  const keywordBars = comparisons
    .map((c) => hbar(c.keyword, c.posts, kwMax, BAR, ''))
    .join('');
  const sovParts = (kwa?.keywords || [])
    .filter((k) => n0(k.total_posts) > 0)
    .slice(0, 8)
    .map((k, i) => ({ k: k.keyword, v: k.total_posts, c: CHART_COLORS[i % CHART_COLORS.length] }));

  const matchTotal = n0(kwa?.summary?.total_matched_posts) || sovParts.reduce((s, p) => s + n0(p.v), 0);
  const keywordStacks = comparisons.map((c) => `
    <div class="hbar" style="grid-template-columns:30mm 1fr 9mm;margin-bottom:1.8mm">
      <div class="hl" style="text-align:left">${esc(clip(c.keyword, 26))}</div>
      <div>${stackBar([
        { k: 'Positive', v: c.positive, c: POS },
        { k: 'Neutral', v: c.neutral, c: NEU },
        { k: 'Negative', v: c.negative, c: NEG },
      ], false)}</div>
      <div class="hn" style="text-align:right">${fmt(c.posts)}</div>
    </div>`).join('');
  const riskCounts = scoped ? riskFrom(inEv) : (stats.risk_counts || kwa?.summary?.risk_levels || {});
  const riskParts = [
    { k: 'Critical', v: riskCounts.critical, c: '#7A1F1F' },
    { k: 'High', v: riskCounts.high, c: '#B42318' },
    { k: 'Medium', v: riskCounts.medium, c: '#C45C26' },
    { k: 'Low', v: riskCounts.low, c: '#1B7A4E' },
  ];
  const entityBars = entities.slice(0, 8).map((e) => `
    <div style="margin:0 0 2.2mm">
      <div class="sm" style="display:flex;justify-content:space-between;gap:3mm;align-items:baseline">
        <span><b>${esc(e.name)}</b> · ${fmt(e.total)} posts</span>
        <span style="white-space:nowrap"><i style="display:inline-block;width:1.6mm;height:1.6mm;background:${PR};margin-right:.8mm"></i>${fmt(e.praise)} positive &nbsp;<i style="display:inline-block;width:1.6mm;height:1.6mm;background:${NW};margin-right:.8mm"></i>${fmt(e.news)} neutral &nbsp;<i style="display:inline-block;width:1.6mm;height:1.6mm;background:${CR};margin-right:.8mm"></i>${fmt(e.crit)} negative (${pct(e.crit, e.total)})</span>
      </div>
      ${stackBar([
        { k: 'Positive', v: e.praise, c: PR },
        { k: 'Neutral', v: e.news, c: NW },
        { k: 'Negative', v: e.crit, c: CR },
      ], false)}
    </div>`).join('');
  const topPlace = places[0];
  const topVoice = promoters[0];
  const topEntity = entities[0];
  const highRiskN = n0(riskCounts.critical) + n0(riskCounts.high);

  // Risk level is computed from what the posts contain (calls to act, violence, high-risk ratings), not from tone.
  const callN = n0(analysis?.facts?.calls?.count);
  const violenceN = n0(analysis?.facts?.violence?.count);
  const haveFacts = !!analysis?.facts;
  const threatLevelVal = violenceN > 1 ? 'High'
    : (violenceN > 0 || callN > 0 || highRiskN > 0) ? 'Medium'
      : (haveFacts || n0(riskCounts.medium) === 0) ? 'Low' : 'Low to Medium';
  const threatPillClass = /crit/i.test(threatLevelVal)
    ? 'threat-pill-crit'
    : (/high/i.test(threatLevelVal) ? 'threat-pill-high' : (/med/i.test(threatLevelVal) ? 'threat-pill-med' : 'threat-pill-low'));

  const threatBorderColor = /crit/i.test(threatLevelVal)
    ? '#b91c1c'
    : (/high/i.test(threatLevelVal) ? '#dc2626' : (/med/i.test(threatLevelVal) ? '#d97706' : '#16a34a'));

  // Calculate detailed threat dimensions & clear rationale
  const negativePostCount = n0(sent.negative);
  const negativeSharePct = sentTotal > 0 ? Math.round((negativePostCount / sentTotal) * 100) : 0;
  const highRiskCount = highRiskN;

  // The sentences are built from fixed phrases with {placeholders}, so each phrase can be translated into the tenant's language.
  const levelReason = violenceN > 1 ? L('posts mention violence or damage linked to the event')
    : violenceN === 1 ? L('one post mentions violence or damage, and no other post confirms it')
    : callN > 0 ? L('posts call people to join a bandh, rally or blockade')
      : highRiskCount > 0 ? L('some posts are rated high risk by the post analysis, although none call for action or mention violence')
        : L('no post calls for action, mentions violence or is rated high risk');
  const rationaleParts = [L('Rated {level} because {reason}.', { level: L(threatLevelVal), reason: levelReason })];
  const plural = (n, one, many) => L(n === 1 ? one : many, { n: fmt(n) });
  if (haveFacts) {
    rationaleParts.push(violenceN > 0 ? plural(violenceN, '{n} post mentions violence or damage.', '{n} posts mention violence or damage.') : L('No post reports violence or damage.'));
    rationaleParts.push(callN > 0 ? plural(callN, '{n} post calls people to join or take action.', '{n} posts call people to join or take action.') : L('No post calls for a bandh, blockade or gathering.'));
  }
  if (highRiskCount > 0) rationaleParts.push(plural(highRiskCount, '{n} post is rated high risk by the post analysis.', '{n} posts are rated high risk by the post analysis.'));
  const callOut = n0(analysis?.facts?.callsOutside?.count);
  const violOut = n0(analysis?.facts?.violenceOutside?.count);
  if ((callOut || violOut) && !regionOnly) {
    const detail = [callOut ? L('{n} call for it', { n: fmt(callOut) }) : '', violOut ? L('{n} mention violence', { n: fmt(violOut) }) : ''].filter(Boolean).join(', ');
    rationaleParts.push(L('{n} further posts concern activity outside {region} ({detail}); this does not raise the level here.', { n: fmt(callOut + violOut), region: esc(event.location || 'the event region'), detail }));
  }
  rationaleParts.push(L('Negative tone is criticism, not a risk signal.'));
  const computedRationale = rationaleParts.join(' ');

  const threatDesc = computedRationale;

  const keyDates = (analysis?.keyDates || []).length
    ? analysis.keyDates
    : (analysis?.activities || []).map((a) => ({
        date: a.when || 'Monitored window',
        event: `${a.what}${a.where ? ` at ${a.where}` : ''}`,
        posts: a.posts,
      })).slice(0, 4);

  const datesHtml = keyDates.length
    ? `<div class="dates-box">
        <h4>Operational Timeline & Key Dates</h4>
        <ul>
          ${keyDates.map((k) => `<li${k.outside ? ' style="color:#64748b"' : ''}>• <b>${esc(k.date || 'Key Date')}</b>: ${esc(k.event || k.what || '')}${k.posts?.length ? ` <span class="sm">${esc(k.posts.map((p) => `[Post #${p}]`).join(' '))}</span>` : ''}</li>`).join('')}
        </ul>
      </div>`
    : '';

  const narrativesToWatch = (analysis?.narrativesToWatch || []).length
    ? analysis.narrativesToWatch
    : (analysis?.claims || []).map((c) => ({
        narrative: c.claim,
        riskNote: c.note || `${c.triage === 'VERIFY' ? 'Requires official verification' : 'Monitoring required'}`,
        posts: c.posts,
      })).slice(0, 4);

  const watchHtml = narrativesToWatch.length
    ? `<div class="watch-box">
        <h4>Narratives to Watch & Misinformation Flags</h4>
        <ul>
          ${narrativesToWatch.map((n) => `<li>• <b>${esc(n.narrative)}</b>: ${esc(n.riskNote || n.sourceAccounts || '')}${n.posts?.length ? ` <span class="sm">${esc(n.posts.map((p) => `[Post #${p}]`).join(' '))}</span>` : ''}</li>`).join('')}
        </ul>
      </div>`
    : '';

  const intelGridHtml = (datesHtml || watchHtml)
    ? `<div class="intel-grid">${datesHtml || '<div></div>'}${watchHtml || '<div></div>'}</div>`
    : '';

  // Page 1: who needs to look at what first, with direct links.
  const topFlaggedProfiles = highWatchList.filter((p) => p.tier === 'priority').slice(0, 4);
  const topFlaggedPosts = critical.slice(0, 3);

  const levelKey = /crit/i.test(threatLevelVal) ? 'crit' : /high/i.test(threatLevelVal) ? 'high' : /med/i.test(threatLevelVal) ? 'med' : 'low';
  const narrativeCount = narrativesToWatch.length;
  const assessHtml = `
  <div class="assess">
    <div class="lvl lvl-${levelKey}">
      <div class="lvl-k">Threat Level</div>
      <div class="lvl-v">${esc(L(threatLevelVal))}</div>
      <div class="lvl-n">${fmt(highRiskCount)} high-risk post${highRiskCount === 1 ? '' : 's'}</div>
    </div>
    <div class="assess-body">
      ${analysis?.bottomLine ? `<p class="lead"><b>Bottom line:</b> ${esc(String(analysis.bottomLine).replace(/(\d+%\s+(?:of\s+(?:the\s+)?posts\s+)?(?:are|is)\s+)critical\b/gi, '$1negative'))}</p>` : ''}
      <p class="why"><b>Why this Risk Level:</b> ${esc(threatDesc)}</p>
      <div class="chips">
        <div><div class="ck">Mobilization & Agitation</div><div class="cv" style="color:${highRiskCount > 0 ? '#B42318' : INK}">${visits.length > 0 ? `${fmt(visits.length)} post${visits.length === 1 ? '' : 's'} report people on site` : 'No call to act found'}</div>${onSiteRefs ? `<div class="sm" style="margin-top:.6mm">${onSiteRefs}</div>` : ''}</div>
        <div><div class="ck">Narratives to Watch</div><div class="cv">${esc(plural(narrativeCount, '{n} narrative flagged', '{n} narratives flagged'))}</div></div>
        <div><div class="ck">Surveillance Priority</div><div class="cv" style="color:${threatBorderColor}">${topFlaggedProfiles.length > 0 ? `${topFlaggedProfiles.length} priority account(s)` : 'Baseline Monitoring'}</div></div>
      </div>
    </div>
  </div>`;

  const kstripHtml = `
  <div class="kstrip">
    <div><div class="n">${scoped ? fmt(inEv.length) : fmt(total)}</div><div class="l">Posts analysed</div></div>
    <div><div class="n">${fmt(engTotal)}</div><div class="l">Interactions (likes, shares, comments)</div></div>
    <div><div class="n">${haveFacts ? fmt(callN) : '—'}</div><div class="l">Posts calling people to act</div></div>
    <div><div class="n">${haveFacts ? fmt(violenceN) : '—'}</div><div class="l">Violence reports</div></div>
    <div><div class="n">${fmt(highRiskN)}</div><div class="l">High / critical risk</div></div>
    <div><div class="n">${fmt(places.length)}</div><div class="l">Places covered</div></div>
  </div>`;

  // The posts behind the headline numbers, so each number can be checked. Post numbers become links (annex links in the full report, live links in the executive summary).
  const inSet = new Set((scoped ? inEv : ev).map((e) => e.n));
  const highRiskNs = ev.filter((e) => (['critical', 'high'].includes(String(e.risk_level || '').toLowerCase()) || e.has_threat_vector) && (!regionOnly || inSet.has(e.n))).map((e) => e.n);
  const keepIn = (ns) => (ns || []).filter((n) => !regionOnly || inSet.has(Number(n)));
  const srcLine = (label, ns, count) => {
    const list = Array.from(new Set(keepIn(ns)));
    if (!list.length) return '';
    const more = Math.max(0, (count != null ? count : list.length) - Math.min(list.length, 12));
    return `<div class="srcrow"><b>${esc(L(label))} (${fmt(count != null ? count : list.length)}):</b> ${list.slice(0, 12).map((n) => `[Post #${n}]`).join(' ')}${more ? ` <span class="sm">+${fmt(more)} ${esc(L('more'))}</span>` : ''}</div>`;
  };
  const srcRows = [
    srcLine('High / critical risk', highRiskNs, highRiskNs.length),
    srcLine('Violence reports', analysis?.facts?.violence?.posts, haveFacts ? violenceN : null),
    srcLine('Posts calling people to act', analysis?.facts?.calls?.posts, haveFacts ? callN : null),
    srcLine('Posts reporting people on site', visits.map((e) => e.n), visits.length),
  ].filter(Boolean).join('');
  const srcBoxHtml = srcRows ? `<div class="srcbox"><h4>${esc(L('Posts behind these numbers'))}</h4>${srcRows}</div>` : '';

  const actionSummaryHtml = `
  <div class="callout">
    <div class="callout-h">Immediate Action Summary (Executive & Police Directives)</div>
    <div class="callout-s">Key posts and accounts identified below need review or ground verification.</div>
    <div class="two">
      <div>
        <div class="sub-h">1. Priority accounts for review (${topFlaggedProfiles.length})</div>
        <ul class="rows">
          ${topFlaggedProfiles.length
            ? topFlaggedProfiles.map((p) => `<li><span class="tag" style="background:${platColor(p.platform)}">${esc(platLabel(p.platform))}</span><b>${authorProfileLink(p)}</b>${(p.posts || []).length ? ` <span class="sm">${p.posts.slice(0, 3).map((n) => `[Post #${n}]`).join(' ')}</span>` : ''}<span class="why">${esc([p.callsN ? `${fmt(p.callsN)} post${p.callsN === 1 ? ' calls' : 's call'} people to join or act` : '', p.violenceN ? `${fmt(p.violenceN)} mention${p.violenceN === 1 ? 's' : ''} violence` : ''].filter(Boolean).join('; ') || clip(p.why, 90))}${p.quote ? ` ${esc(clip(p.quote, 70))}` : ''}</span></li>`).join('')
            : `<li>${haveFacts ? 'No account in this window calls for action or violence.' : 'Account roles are not available in this report. Regenerate it to classify accounts.'}</li>`}
        </ul>
      </div>
      <div>
        <div class="sub-h">2. Posts flagged for review</div>
        <ul class="rows">
          ${topFlaggedPosts.length
            ? topFlaggedPosts.map((p) => `<li><span class="tag" style="background:${platColor(p.plat)}">${esc(platLabel(p.plat))}</span>${includeEvidence ? postRefInternal(p) : `[Post #${p.n}]`} · <b>${authorProfileLink(p.plat, p.author, p.url)}</b><span class="why">"${esc(clip(p.text, 100))}"</span></li>`).join('')
            : '<li>No active high-threat posts flagged in this window.</li>'}
        </ul>
      </div>
    </div>
  </div>`;

  const evidenceSection = () => (includeEvidence ? `
  <div style="break-before:page;page-break-before:always"></div>
  ${secHead('Evidence Annex')}
  <div class="metrics">
    ${metric(fmt(ev.length), 'Posts in this brief', 'Direct hyperlinks enabled for each evidence post')}
    ${metric(fmt(inEv.length), L('Posts in {region}', { region: regionName }), 'Cited in the sections above')}
    ${metric(fmt(outEv.length), 'Outside the region', 'Context only; not counted as activity here')}
    ${metric(fmt(ev.filter((e) => e.posted_at).length), 'Dated posts', 'Verified publication timestamp')}
  </div>
  <p class="sm">Newest first. Click any Post # link to inspect the original live record; every [Post #n] cited above jumps to its row here. Eng. = likes + shares + comments. Tone is the automated rating.</p>
  ${evidenceTable(inEv, outEv.length ? L('Posts in {region}', { region: regionName }) : '', 'in')}
  ${outEv.length ? evidenceTable(outEv, L('Outside {region} (context only)', { region: regionName }), 'ctx') : ''}` : '');

  // Group highWatchList by platform
  const platformGroups = {};
  highWatchList.forEach((p) => {
    const platKey = String(p.platform || 'other').toLowerCase();
    platformGroups[platKey] = platformGroups[platKey] || [];
    platformGroups[platKey].push(p);
  });

  // Summary report: one small card per platform with every account (priority first), its role and its post links. Detail stays in the full report.
  const TIER_DOT = { priority: '#B42318', amplifier: '#C45C26', media: '#2A8FA8', routine: '#94A3B8' };
  const TIER_WORD = { priority: 'need attention', amplifier: 'amplifiers', media: 'news / official pages', routine: 'other accounts' };
  // Every account with the posts that belong to this report (in-region only for the Odisha-only report).
  const acctList = allWatch
    .map((p) => ({ ...p, posts: (p.posts || []).filter((n) => !regionOnly || inSet.has(n)) }))
    .filter((p) => p.posts.length);
  const ROLE_PILL = { priority: 'rp-pri', amplifier: 'rp-amp', media: 'rp-med', routine: 'rp-oth' };
  const compactAccountsHtml = (() => {
    const byPlat = {};
    acctList.forEach((p) => {
      const k = String(p.platform || 'other').toLowerCase();
      (byPlat[k] = byPlat[k] || []).push(p);
    });
    const MAX = 60;
    const GROUP_TITLE = { priority: 'Need attention', amplifier: 'Amplifiers', media: 'News / official pages', routine: 'Other accounts' };
    const cards = Object.entries(byPlat)
      .sort((x, y) => y[1].reduce((t, a) => t + a.posts.length, 0) - x[1].reduce((t, a) => t + a.posts.length, 0))
      .map(([k, list]) => {
        const postsTotal = list.reduce((t, a) => t + a.posts.length, 0);
        const tiers = ['priority', 'amplifier', 'media', 'routine'].map((t) => ({ t, items: list.filter((x) => x.tier === t) })).filter((x) => x.items.length);
        const bar = `<div class="stack">${tiers.map((x) => `<div style="width:${(100 * x.items.length) / list.length}%;background:${TIER_DOT[x.t]}"></div>`).join('')}</div>`;
        let left = MAX;
        const groups = tiers.map((x) => {
          const shown = x.items.slice(0, Math.max(0, left));
          left -= shown.length;
          const rest = x.items.length - shown.length;
          const line = shown.map((p) => `<span class="acct">${authorProfileLink(p)} <span class="lk">${esc(L(p.posts.length === 1 ? 'post' : 'posts'))}${p.posts.slice(0, 4).map((n) => `[Post #${n}]`).join('')}${p.posts.length > 4 ? ` +${p.posts.length - 4}` : ''}</span></span>`).join('<span class="sep"> · </span>');
          return `<div class="grp"><span class="gt"><i style="background:${TIER_DOT[x.t]}"></i>${esc(L(GROUP_TITLE[x.t]))} <b>${x.items.length}</b></span><div class="gl">${line}${rest > 0 ? ` <span class="sm">+${rest} ${esc(L('more accounts'))}</span>` : ''}</div></div>`;
        }).join('');
        return `<div class="pcard wide"><div class="pc-h"><span class="plat-badge" style="background:${platColor(k)}">${esc(platLabel(k))}</span><b>${fmt(list.length)} ${esc(L(list.length === 1 ? 'account' : 'accounts'))} · ${fmt(postsTotal)} ${esc(L(postsTotal === 1 ? 'post' : 'posts'))}</b></div>${bar}${groups}</div>`;
      }).join('');
    return cards ? `<div class="pcards one">${cards}</div>` : `<p class="sm">${esc(L('No accounts in this set.'))}</p>`;
  })();

  const platformBoxesHtml = Object.entries(platformGroups).length
    ? Object.entries(platformGroups)
        .sort((a, b) => b[1].length - a[1].length)
        .map(([platKey, list]) => {
          const pColor = platColor(platKey);
          return `
      <div class="plat-group-box">
        <div class="plat-group-header" style="border-left-color:${pColor}">
          <span class="plat-badge" style="background:${pColor}">${esc(platLabel(platKey))}</span>
          <span class="plat-group-title">${esc(platLabel(platKey))} Priority Profiles (Top Monitored Accounts)</span>
          <span class="plat-group-count">${list.length} profile${list.length === 1 ? '' : 's'}</span>
        </div>
        <table>
          <colgroup>
            <col style="width:23%">
            <col style="width:16%">
            <col style="width:16%">
            <col style="width:45%">
          </colgroup>
          <thead>
            <tr>
              <th>Profile / Channel Link</th>
              <th>Role</th>
              <th>Posts & Reach</th>
              <th>Why listed</th>
            </tr>
          </thead>
          <tbody>
            ${list.map((p) => `
              <tr>
                <td>${authorProfileLink(p)}</td>
                <td><span class="prio-pill ${p.priorityClass}">${esc(p.priority)}</span></td>
                <td><b>${fmt(p.count)}</b> post${p.count === 1 ? '' : 's'}${(p.posts || []).length ? `<br><span class="sm">${p.posts.slice(0, 6).map((n) => `[Post #${n}]`).join(' ')}${p.posts.length > 6 ? ` +${p.posts.length - 6}` : ''}</span>` : ''}<br><span class="sm">${fmt(p.inter)} interactions · ${p.vw ? `${fmt(p.vw)} views` : 'views not reported'}</span></td>
                <td class="reason-text">${esc(p.why)}${p.posts?.length ? ` <span class="sm">${esc(p.posts.slice(0, 3).map((n) => `[Post #${n}]`).join(' '))}</span>` : ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
        })
        .join('')
    : '<p class="sm">No high monitoring profiles identified in this dataset.</p>';

  const stampDate = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: REPORT_TZ }) : '');

  // "What the issue is": the separate stories that overlap in these posts, then what is and is not known.
  const strands = (analysis?.issueStrands || []).slice(0, 4);
  const knownList = analysis?.known || [];
  const notKnownList = analysis?.notKnown || [];
  const citeSpan = (posts) => ((posts && posts.length) ? ` <span class="sm">${posts.slice(0, 4).map((n) => `[Post #${n}]`).join(' ')}</span>` : '');
  const issueSection = () => (strands.length || knownList.length || notKnownList.length) ? `
  ${secHead('What the Issue Is')}
  ${strands.length ? `<table>
    <colgroup><col style="width:20%"><col style="width:22%"><col style="width:36%"><col style="width:22%"></colgroup>
    <thead><tr><th>Strand</th><th>Who</th><th>What they ask or do</th><th>Where it stands</th></tr></thead>
    <tbody>${strands.map((x) => `<tr><td><b>${esc(x.title)}</b></td><td>${esc(x.who || '—')}</td><td>${esc(x.demand || '—')}${citeSpan(x.posts)}</td><td>${esc(x.status || '—')}</td></tr>`).join('')}</tbody>
  </table>` : ''}
  ${analysis?.issueLink ? `<p>${esc(analysis.issueLink)}</p>` : ''}
  ${(knownList.length || notKnownList.length) ? `<div class="kn">
    <div class="yes"><h4>What we know</h4><ul>${knownList.map((k) => `<li>${esc(k.text)}${citeSpan(k.posts)}</li>`).join('') || '<li>—</li>'}</ul></div>
    <div class="no"><h4>What we do not know yet</h4><ul>${notKnownList.map((t) => `<li>${esc(t)}</li>`).join('') || '<li>—</li>'}</ul></div>
  </div>` : ''}` : '';

  const secHead = (title) => `<div class="sec"><span class="no">${secNo()}</span><span class="nm">${title}</span></div>`;

  const recommendedSection = () => `
  ${secHead('Recommended Actions')}
  ${actionsHtml || '<p class="sm">Maintain standard baseline monitoring. No immediate operational escalation required at this stage.</p>'}`;

  const riskSection = () => `
  ${secHead('Situation and Risk Assessment')}
  <div class="chartbox"><h4>Risk Bands</h4>${stackBar(riskParts)}</div>
  ${includeEvidence
    ? (critical.length ? `<p class="sm">Flagged for review (high-risk rating, call to act, or violence mentioned): ${critical.slice(0, 15).map((e) => postRefInternal(e)).join(' · ')}. Full text of every post is in the evidence annex.</p>` : '<p class="sm">No post is flagged for review.</p>')
    : critical.length > 0
      ? `<p class="sm">Posts are flagged for review because of a high-risk rating, a call to act, or a mention of violence. Tone is shown separately and is not a risk signal.</p>`
      : `<p class="sm">No critical, high-risk, or hostile posts detected in this dataset.</p>`}
  ${callRefs ? `<p class="sm">Posts calling people to act:${callRefs}</p>` : ''}
  ${analysis?.publicOrder ? `<p><b>Public Order Assessment:</b> ${esc(analysis.publicOrder)}</p>` : ''}
  ${intelGridHtml}`;

  // Place board: one row per place in the region, split into "people reported on site" and "mentioned only", with the posts behind it.
  const placeBoardHtml = (() => {
    if (!geoReliable) return `<div class="chartbox"><p class="sm">${esc(L('Place analysis is not available in this report. Regenerate it to see where the activity is.'))}</p></div>`;
    const byPostPlaces = analysis?.facts?.byPost || {};
    const same = (a, b) => foldGeo(a) === foldGeo(b);
    const rows = places.slice(0, 8).map((pl) => {
      const onSite = visits.map((v) => v.n).filter((n) => (byPostPlaces[n]?.places || []).some((x) => same(x, pl.name)));
      const rest = (pl.posts || []).filter((n) => !onSite.includes(n));
      return { ...pl, onSite, rest, all: Array.from(new Set([...onSite, ...rest])) };
    }).sort((x, y) => y.onSite.length - x.onSite.length || y.count - x.count);
    if (!rows.length) return `<div class="chartbox"><p class="sm">${esc(L('No specific place inside the region is named in the posts.'))}</p></div>`;
    const max = Math.max(1, ...rows.map((r) => r.count));
    return `<div class="geo"><div class="geo-h"><h4>${esc(L('Where posts place the activity'))}</h4><div class="legend"><span><i style="background:${PR}"></i>${esc(L('People reported on site'))}</span><span><i style="background:#94A3B8"></i>${esc(L('Mentioned only'))}</span></div></div>${rows.map((r) => {
      const on = Math.min(r.onSite.length, r.count);
      return `<div class="geo-row"><div class="gname"><b>${esc(r.name)}</b>${r.region ? `<span class="sm">${esc(clip(r.region, 28))}</span>` : ''}</div><div class="gbar"><div class="stack tall" style="width:${Math.max(8, (100 * r.count) / max)}%"><div style="width:${r.count ? (100 * on) / r.count : 0}%;background:${PR}"></div><div style="flex:1;background:#94A3B8"></div></div><span class="gval">${fmt(r.count)} ${esc(L(r.count === 1 ? 'post' : 'posts'))}${on ? ` · ${fmt(on)} ${esc(L('on site'))}` : ''}</span></div><div class="glinks">${r.all.slice(0, 6).map((n) => `[Post #${n}]`).join(' ')}${r.all.length > 6 ? ` +${r.all.length - 6}` : ''}</div></div>`;
    }).join('')}</div>`;
  })();

  const whereSection = () => `
  ${secHead('Where It Is Happening')}
  <div class="metrics" style="grid-template-columns:repeat(${regionOnly ? 2 : 3},1fr)">
    ${metric(fmt(visits.length), 'Posts reporting people on site', 'Reported by the posts; not verified')}
    ${metric(fmt(visits.filter((e) => e.specific.length).length), 'Specific sites', topPlace ? `Highest: ${topPlace.name}` : 'Cities/districts/landmarks')}
    ${regionOnly ? '' : metric(fmt(geoOut.length), 'Places outside the region', 'Context only')}
  </div>
  ${placeBoardHtml}
  ${includeEvidence ? onSiteTable : ''}
  ${geoOut.length ? `<p class="sm"><b>Outside ${esc(event.location || 'the event region')}:</b> ${geoOut.slice(0, 8).map((p) => `${esc(p.name)}${p.region ? ` (${esc(p.region)})` : ''}`).join(', ')}. These are listed for information and are not counted as activity in the region.</p>` : ''}
  ${(analysis?.geography || []).length
    ? `<ul class="bul">${analysis.geography.map((g) => `<li><b>${esc(g.place)}</b> — ${esc(g.note || '')} ${g.posts?.length ? `<span class="sm">${esc(g.posts.map((n) => `[Post #${n}]`).join(' '))}</span>` : ''}</li>`).join('')}</ul>`
    : places.length > 0
      ? `<p class="sm">Top locations identified in discussions: ${places.slice(0, 6).map((p) => `<b>${esc(p.name)}</b> (${fmt(p.count)})`).join(', ')}.</p>`
      : `<p class="sm">No specific city, district, or landmark names detected in post discussions.</p>`}`;

  const activitySection = () => `
  ${secHead('Activity and Ground Presence')}
  <div class="metrics" style="grid-template-columns:repeat(2,1fr)">
    ${metric(fmt(activityPosts.length), 'Activity posts', 'Posts naming a bandh, rally, meeting, or blockade')}
    ${metric(fmt((analysis?.activities || []).length), 'Activities named', 'Distinct campaigns, protests, bandhs and programmes')}
  </div>
  <p class="sm">Campaigns, meetings, protests, bandhs, rallies, and programmes named in the posts.</p>
  ${activityBrief ? `<ul class="bul">${activityBrief}</ul>` : narrHtml}`;

  const actorsSection = () => `
  ${secHead('Key Actors and Figures')}
  <div class="metrics" style="grid-template-columns:repeat(3,1fr)">
    ${metric(fmt(entities.length), 'Entities classified', 'Who the posts are about')}
    ${metric(topEntity ? fmt(topEntity.total) : '0', topEntity ? topEntity.name : 'Top entity', topEntity ? `${pct(topEntity.crit, topEntity.total)} negative` : '—')}
    ${metric(fmt((analysis?.leaders || []).length), 'People named', 'Named in post text')}
  </div>
  ${entityBars ? `<div class="chartbox"><h4>Tone by Entity</h4><p class="sm">Who the posts are about, split by tone, with the number of posts in each part.</p><div class="legend"><span><i style="background:${PR}"></i>Positive</span><span><i style="background:${NW}"></i>Neutral</span><span><i style="background:${CR}"></i>Negative</span></div>${entityBars}</div>` : ''}
  ${entities.length ? '' : '<p class="sm">Entity classification not available for this event.</p>'}
  ${(analysis?.leaders || []).length ? `<ul class="bul">${analysis.leaders.map((l) => `<li><b>${esc(l.name)}</b>${l.role ? ` — ${esc(l.role)}` : ''}${l.posts?.length ? ` <span class="sm">${esc(l.posts.map((n) => `[Post #${n}]`).join(' '))}</span>` : ''}</li>`).join('')}</ul>` : ''}`;

  const accountsSection = () => {
    const tierN = (t) => acctList.filter((x) => x.tier === t).length;
    const total = acctList.length;
    const platN = new Set(acctList.map((x) => String(x.platform || 'other').toLowerCase())).size;
    const attention = acctList.filter((x) => x.tier === 'priority');
    const newsN = tierN('media');
    const otherN = tierN('routine') + tierN('amplifier');
    // The answer an officer needs first, in plain words.
    const verdictTitle = !haveFacts ? L('Account roles are not available in this report.')
      : attention.length ? plural(attention.length, '{n} account needs attention: it calls for action or mentions violence.', '{n} accounts need attention: they call for action or mention violence.')
        : L('No account in these posts calls for action or violence.');
    const topOther = acctList.filter((x) => x.tier !== 'media').sort((x, y) => (y.inter || 0) - (x.inter || 0))[0];
    const verdictLines = [
      `${fmt(newsN)} of ${fmt(total)} ${esc(L('accounts'))} ${esc(L('are news or official pages reporting the event'))}; ${fmt(total - newsN)} ${esc(L('are other accounts'))}.`,
      topOther && topOther.inter ? `${esc(L('Largest reach from a non-news account'))}: <b>${authorProfileLink(topOther)}</b> (${fmt(topOther.inter)} ${esc(L('interactions'))}, ${esc(platLabel(topOther.platform))}) ${topOther.posts.slice(0, 3).map((n) => `[Post #${n}]`).join(' ')}` : '',
    ].filter(Boolean);
    const verdictHtml = `<div class="${attention.length ? 'watch' : 'calm'}"><b>${esc(verdictTitle)}</b>${verdictLines.map((x) => `<div class="vline">${x}</div>`).join('')}</div>`;
    const mix = ['priority', 'amplifier', 'media', 'routine'].map((t) => ({ t, n: tierN(t), posts: acctList.filter((x) => x.tier === t).reduce((c, x) => c + x.posts.length, 0) })).filter((x) => x.n);
    const mixBar = `<div class="stack tall">${mix.map((x) => `<div style="width:${(100 * x.n) / Math.max(1, total)}%;background:${TIER_DOT[x.t]}"></div>`).join('')}</div>`;
    const mixLegend = `<div class="legend">${mix.map((x) => `<span><i style="background:${TIER_DOT[x.t]}"></i><b>${fmt(x.n)}</b> ${esc(L(TIER_WORD[x.t]))} <span class="sm">(${fmt(x.posts)} ${esc(L(x.posts === 1 ? 'post' : 'posts'))})</span></span>`).join('')}</div>`;
    const overview = `<div class="acc-head two">
      <div class="acc-n"><b>${fmt(total)}</b><span>${esc(L(total === 1 ? 'account' : 'accounts'))}</span><em>${fmt(platN)} ${esc(L(platN === 1 ? 'platform' : 'platforms'))}</em></div>
      <div class="acc-mix"><h4>${esc(L('Who is posting'))}</h4>${mixBar}${mixLegend}</div>
    </div>`;
    const watch = acctList.filter((x) => x.tier === 'priority' || x.tier === 'amplifier').slice(0, 6);
    const watchHtml = watch.length
      ? `<div class="watch"><h4>${esc(L('Watch first'))}</h4>${watch.map((p) => `<div class="wrow"><span class="plat-badge" style="background:${platColor(p.platform)}">${esc(platLabel(p.platform))}</span><span class="nm">${authorProfileLink(p)}</span><span class="rpill ${ROLE_PILL[p.tier]}">${esc(p.priority)}</span><span class="why">${esc(clip(String(p.why || '').split(/(?<=[.!?])\s/)[0], 120))}</span><span class="lk">${p.posts.slice(0, 4).map((n) => `[Post #${n}]`).join(' ')}</span></div>`).join('')}</div>`
      : '';
    const tierOfAuthor = new Map(allWatch.map((p) => [`${p.platform}|${p.author}`, p.tier]));
    const topBars = Object.values(authors).sort((x, y) => (y.inter || 0) - (x.inter || 0)).slice(0, 6).map((a, _i, arr) => hbar(a.author, a.inter, Math.max(1, arr[0]?.inter || 1), TIER_DOT[tierOfAuthor.get(`${a.platform}|${a.author}`)] || BAR, `${a.count} post${a.count === 1 ? '' : 's'}`, 'interactions')).join('');
    return `
  ${secHead('Accounts to Watch')}
  ${verdictHtml}
  ${watchHtml}
  ${overview}
  <div class="chartbox">
    <h4>${esc(L('Largest reach'))}</h4>
    <p class="sm">Interactions = likes + shares + comments (views are not added in). Colour shows the role: ${Object.entries(TIER_WORD).map(([t, w]) => `<span style="color:${TIER_DOT[t]}">●</span> ${esc(L(w))}`).join(' &nbsp; ')}.</p>
    ${topBars || `<p class="sm">${esc(L('No accounts in this set.'))}</p>`}
  </div>
  <p class="sm">${includeEvidence ? `Priority accounts first, then the most-engaged accounts: ${highWatchList.length} profiles, each with a direct link.` : esc(L('Every account by platform and role. The numbers open the posts.'))}</p>
  ${includeEvidence ? platformBoxesHtml : compactAccountsHtml}
  ${(analysis?.amplifiers || []).length
    ? `<ul class="bul">${analysis.amplifiers.map((a) => `<li><b>${esc(a.account)}</b> — ${esc(a.why || '')}${a.posts?.length ? ` <span class="sm">${esc(a.posts.map((n) => `[Post #${n}]`).join(' '))}</span>` : ''}</li>`).join('')}</ul>`
    : ''}`;
  };

  const reactionSection = () => `
  ${secHead('Public Reaction and Tone')}
  <div class="grid2">
    <div class="chartbox">
      <h4>Tone Breakdown</h4>
      <p class="sm">Positive, neutral and negative posts. Negative tone is criticism, not a risk signal.</p>
      <div class="donutwrap">${donutSvg(briefSent, pct(sent.negative, sentTotal), 'Negative')}<div class="trows">${briefSent.map((x) => `<div class="trow tone"><span class="tl"><i style="background:${x.c}"></i><span>${esc(x.k)} ${fmt(x.v)} (${pct(x.v, sentTotal)})</span></span><span class="track"><span class="fill" style="display:block;width:${(100 * n0(x.v)) / sentTotal}%;background:${x.c}"></span></span></div>`).join('')}</div></div>
    </div>
    <div class="chartbox">
      <h4>Platform Distribution</h4>
      <p class="sm">Post volume across monitored social and digital channels.</p>
      <div class="platbars">${platformBars || '<p class="sm">No platform split.</p>'}</div>
    </div>
  </div>
  <div class="chartbox">
    <h4>Posting Timeline & Cadence</h4>
    <p class="sm">Chronological posting volume over the monitored window.</p>
    ${timelineChart(scoped ? dailySeries(inEv) : kwa?.timeline_overall)}
  </div>
  ${regionOnly ? '' : `<div class="grid2">
    <div class="chartbox">
      <h4>Keyword Share of Voice</h4>
      <p class="sm">Proportional share of keyword mentions across monitored discourse.</p>
      ${sovParts.length ? `<div class="donutwrap">${donutSvg(sovParts, fmt(matchTotal), 'mentions')}<div class="trows">${sovParts.map((p) => `<div class="trow"><span class="tl"><i style="background:${p.c}"></i>${esc(clip(p.k, 24))}</span><span class="tv">${fmt(p.v)}</span><span class="tp">${pct(p.v, matchTotal)}</span></div>`).join('')}</div></div>` : '<p class="sm">No keyword split for this event.</p>'}
    </div>
    ${keywordStacks ? `<div class="chartbox"><h4>Sentiment by Keyword</h4><p class="sm">Categorized sentiment distribution across individual keywords.</p><div class="legend" style="margin:0 0 1.6mm"><span><i style="background:${POS}"></i>Positive</span><span><i style="background:${NEU}"></i>Neutral</span><span><i style="background:${NEG}"></i>Negative</span></div>${keywordStacks}</div>` : '<div></div>'}
  </div>
  <p class="sm"><b>Tracked Keywords:</b> ${esc(clip(kwStr, 280))}</p>`}`;

  const closingSection = () => {
    const text = String(analysis?.closingSummary || '').trim();
    if (!text) return '';
    const noPlan = (para) => para.split(/(?<=[.!?])\s+/).filter((x) => !/\b(police|authorities|administration)\b[^.]{0,40}\b(plan|plans|planned|intend|intends|are monitoring|will monitor)\b/i.test(x)).join(' ');
    const paras = text.split(/\n{2,}/).map((x) => noPlan(x.trim())).filter(Boolean);
    return `
  <div class="sec"><span class="no">${secNo()}</span><span class="nm">${esc(L('Summary'))}</span></div>
  <div class="closing">${paras.map((x) => `<p>${esc(x)}</p>`).join('')}</div>`;
  };

  // Specific Event Location Summary: two pages, visual first. Same facts as the other reports, laid out as boards and charts.
  const compactBody = () => {
    const kd = keyDates.filter((k) => !k.outside).slice(0, 5);
    const dayLabel = (d) => { const t = parseDateMs(d); return t ? new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: REPORT_TZ }) : esc(clip(String(d || ''), 12)); };
    const timeline = kd.length
      ? `<div class="cp-tl">${kd.map((k) => `<div class="it"><span class="dt">${dayLabel(k.date)}</span><span class="kd">${esc(clip(String(k.event || k.what || '').replace(/^\d{4}-\d{2}-\d{2}:?\s*/, ''), 90))}</span>${k.posts?.length ? `<span class="lk">${esc(k.posts.slice(0, 5).map((n) => `[Post #${n}]`).join(' '))}</span>` : ''}</div>`).join('')}</div>`
      : `<p class="sm">${esc(L('No dated activity is named in the posts.'))}</p>`;
    const topPlaces = places.slice(0, 5);
    const pMax = Math.max(1, ...topPlaces.map((x) => x.count));
    const placeBars = topPlaces.length
      ? topPlaces.map((x) => hbar(x.name, x.count, pMax, BAR, '', L(x.count === 1 ? 'post' : 'posts'))).join('')
      : `<p class="sm">${esc(L('No specific place inside the region is named in the posts.'))}</p>`;
    const card = (a, i) => `<div class="cp-act"><div class="no">${i + 1}</div><div><b>${esc(a.action)}</b><div class="d">${esc(clip(a.detail, 300))}</div>${a.posts?.length ? `<div class="lk">${esc(a.posts.slice(0, 6).map((n) => `[Post #${n}]`).join(' '))}</div>` : ''}</div></div>`;
    const first = actions.slice(0, 3);
    const more = actions.slice(3, 5);
    const actCards = first.length
      ? `<div class="cp-acts">${first.map(card).join('')}</div>`
      : `<p class="sm">${esc(L('Maintain standard baseline monitoring.'))}</p>`;
    const moreCards = () => (more.length ? `${secHead('Further Actions')}<div class="cp-acts">${more.map((a, i) => card(a, i + 3)).join('')}</div>` : '');
    const rb = riskParts.map((x) => `<div style="background:${x.c}"><div class="n">${fmt(x.v)}</div><div class="l">${esc(L(x.k))}</div></div>`).join('');
    const reach = acctList.slice().sort((a, b) => (b.inter || 0) - (a.inter || 0)).slice(0, 5);
    const rMax = Math.max(1, ...reach.map((a) => a.inter || 0));
    const reachBars = reach.map((a) => hbar(a.author, a.inter || 0, rMax, TIER_DOT[a.tier] || BAR, `${a.posts.length} ${L(a.posts.length === 1 ? 'post' : 'posts')}`, L('interactions'))).join('');
    const watch = narrativesToWatch.slice(0, 3);
    const unknown = (analysis?.notKnown || []).slice(0, 3);
    return `
  ${kstripHtml}
  <div class="cp-row">
    <div class="cp-box"><h4>${esc(L('What is happening and when'))}</h4>${timeline}</div>
    <div class="cp-box"><h4>${esc(L('Where posts place it'))}</h4>${placeBars}<p class="cp-note">${esc(L('People reported on site'))}: <b>${fmt(visits.length)}</b></p></div>
  </div>
  ${secHead('What To Do')}
  ${actCards}
  <div style="break-before:page;page-break-before:always"></div>
  ${moreCards()}
  ${secHead('How Serious It Is')}
  <div class="cp-row">
    <div class="cp-box"><h4>${esc(L('Risk of the posts'))}</h4><div class="cp-big">${rb}</div>${stackBar(riskParts, false)}<p class="cp-note">${esc(L('Risk comes from calls to act, violence or a high-risk rating. Tone is shown separately.'))}</p></div>
    <div class="cp-box"><h4>${esc(L('Tone of the posts'))}</h4><div class="donutwrap">${donutSvg(briefSent, pct(sent.negative, sentTotal), 'Negative')}<div class="trows">${briefSent.map((x) => `<div class="trow tone"><span class="tl"><i style="background:${x.c}"></i><span>${esc(L(x.k))} ${fmt(x.v)} (${pct(x.v, sentTotal)})</span></span></div>`).join('')}</div></div></div>
  </div>
  <div class="cp-row">
    <div class="cp-box"><h4>${esc(L('Posts per day'))}</h4>${timelineChart(scoped ? dailySeries(inEv) : kwa?.timeline_overall)}</div>
    <div class="cp-box"><h4>${esc(L('Where it is posted'))}</h4>${platformBars || ''}</div>
  </div>
  <div class="cp-row">
    <div class="cp-box"><h4>${esc(L('Largest reach'))}</h4>${reachBars || `<p class="sm">${esc(L('No accounts in this set.'))}</p>`}<p class="cp-note">${Object.entries(TIER_WORD).map(([t, w]) => `<span style="color:${TIER_DOT[t]}">●</span> ${esc(L(w))}`).join(' &nbsp; ')}</p></div>
    <div class="cp-box"><h4>${esc(L('Watch and verify'))}</h4>${watch.length ? `<ul class="bul">${watch.map((n) => `<li><b>${esc(clip(n.narrative, 80))}</b>${n.riskNote ? `: ${esc(clip(n.riskNote, 90))}` : ''}${n.posts?.length ? ` <span class="sm">${esc(n.posts.slice(0, 4).map((p) => `[Post #${p}]`).join(' '))}</span>` : ''}</li>`).join('')}</ul>` : `<p class="sm">${esc(L('No narrative flagged.'))}</p>`}${unknown.length ? `<p class="cp-note"><b>${esc(L('Not known'))}:</b> ${unknown.map((u) => esc(clip(String(typeof u === 'string' ? u : (u.text || u.item || '')).replace(/[.\s]+$/, ''), 90))).join('; ')}</p>` : ''}</div>
  </div>
  ${closingSection()}`;
  };

  const body = `
<section class="pg">
  <header class="hero">
    <div class="hero-top">
      <span class="eyebrow"><span>${esc(tenant)}</span><span class="dot">·</span><span>${includeEvidence ? 'Full Intelligence & Evidence Report' : 'Executive Action Summary Brief'}</span></span>
      ${hq?.classification ? `<span class="classif">${esc(hq.classification)}</span>` : ''}
    </div>
    <h1>${esc(event.name || 'Event')}</h1>
    <div class="sub">${esc(event.location || 'Location not specified')} · ${includeEvidence ? 'Detailed intelligence brief with complete evidence register' : 'Executive action summary and tactical intelligence brief'}</div>
    <div class="meta">
      <span><i>Monitoring window</i><b>${esc(windowStr)}</b></span>
      <span><i>Generated</i><b>${esc(dateStr)}</b></span>
      <span><i>Posts analysed</i><b>${regionOnly && scoped ? `${fmt(inEv.length)} · ${esc(regionName)} only` : scoped ? L('{n} in {region} of {m} monitored', { n: fmt(inEv.length), region: esc(regionName), m: fmt(monitoredTotal) }) : fmt(total)}</b></span>
      <span><i>Report format</i><b>${includeEvidence ? 'Full Report (with evidence)' : compact ? `${esc(regionName)} Location Summary` : regionOnly ? `${esc(regionName)} Executive Summary` : 'Executive Summary'}</b></span>
    </div>
  </header>
  ${hqHtml}
  ${assessHtml}
  ${compact ? compactBody() : `${kstripHtml}
  ${srcBoxHtml}
  ${issueSection()}
  ${actionSummaryHtml}
  ${recommendedSection()}
  ${riskSection()}
  ${whereSection()}
  ${activitySection()}
  ${actorsSection()}
  ${accountsSection()}
  ${reactionSection()}
  ${closingSection()}
  ${evidenceSection()}`}
</section>
`;

  // Post references: the full report links each to its entry in the evidence annex; the executive summary has no annex, so each becomes a live link to the post itself.
  const urlByN = new Map(ev.filter((e) => e.url).map((e) => [e.n, e.url]));
  const finalBody = localizeHtml(includeEvidence
    ? linkCitations(body.replace(/(\[Post #\d+\])\s*\((?:Posts? #\d+(?:,\s*)?)+\)/g, '$1').replace(/\s*\((?:Posts? #\d+(?:,\s*)?)+\)(?=\s*<span class="sm">)/g, ''), new Set(ev.map((e) => e.n)))
    : liveLinkCitations(body, urlByN), labels);
  // Emoji have no glyph in the report fonts and print as empty boxes, so they are left out of the printed text.
  // Whole emoji sequences go first (so a joiner is only removed where it joins emoji; Indic scripts use it too), then flags, skin tones and keycaps.
  const printable = finalBody
    .replace(/\p{Extended_Pictographic}[\uFE0F\p{Emoji_Modifier}]*(?:\u200D\p{Extended_Pictographic}[\uFE0F\p{Emoji_Modifier}]*)*/gu, '')
    .replace(/[\p{Regional_Indicator}\p{Emoji_Modifier}\uFE0F\u20E3\u{E0020}-\u{E007F}]/gu, '');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>${fontFacesFor(printable)}${CSS}</style></head><body>${printable}</body></html>`;
};

module.exports = { buildReportHtml, fontFacesFor, FONT_STACK };
