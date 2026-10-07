/**
 * Event Intelligence PDF — senior brief style (navy hero, KPI strip, 7 sections).
 * Numbers come from summary/keyword data; analysis text from structured_report.
 */
const fs = require('fs');
const path = require('path');
const { esc } = require('./render');

const fontFace = (family, file) => {
  try {
    const b64 = fs.readFileSync(path.join(__dirname, 'fonts', file)).toString('base64');
    return `@font-face{font-family:'${family}';src:url(data:font/ttf;base64,${b64}) format('truetype');font-weight:100 900;}`;
  } catch (e) {
    return '';
  }
};
const FONT_FACES =
  fontFace('Report Devanagari', 'NotoSansDevanagari-Regular.ttf') +
  fontFace('Report Oriya', 'NotoSansOriya-Regular.ttf');

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
  'washroom', 'washroomthikkaro', 'schoolthikkaro', 'vaishnavism', 'fakebjp', 'kyaboltipublic', 'bjd', 'bjp', 'congress',
  'techcommunity', 'innovation', 'developers', 'futuretech', 'updates', 'live', 'breaking', 'report',
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
  const fixed = /\b(national highway(?:\s*\d+)?|nh[-\s]?\d+|vidhan sabha|legislative assembly|odisha assembly)\b/gi;
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
body{margin:0;font-family:'Helvetica Neue',Arial,'Report Devanagari','Report Oriya',sans-serif;color:${INK};font-size:8.6pt;line-height:1.42;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pg{break-before:page;overflow:hidden;max-width:100%}
.pg:first-of-type{break-before:auto}
.hero{background:${INK};color:#fff;border-radius:0 0 3px 3px;padding:6mm 7mm 5mm;margin:0 0 3.5mm;position:relative}
.hero:before{content:'';position:absolute;left:7mm;top:6mm;bottom:5mm;width:2.2mm;background:${ACCENT}}
.hero .eyebrow{font-size:7pt;letter-spacing:.14em;color:#B8C9D6;font-weight:700;margin:0 0 1.5mm 4mm;text-transform:uppercase}
.hero h1{font-size:15pt;line-height:1.15;margin:0 0 1.2mm 4mm;letter-spacing:-.01em}
.hero .sub{font-size:8.6pt;color:#B8C9D6;margin:0 0 2.5mm 4mm}
.hero .meta{display:flex;flex-wrap:wrap;gap:4.5mm;margin-left:4mm;font-size:7pt;color:#9FB0CC}
.hero .meta b{display:block;color:#fff;font-size:8.2pt;margin-top:.5mm}
.kpi{display:grid;grid-template-columns:repeat(5,1fr);gap:2.2mm;margin:0 0 3.2mm}
.kpi>div{border:.6px solid ${LINE};border-radius:3px;padding:2.2mm 2mm;background:${BG};text-align:center}
.kpi .n{font-size:12.5pt;font-weight:700;letter-spacing:-.02em;line-height:1.1;color:${INK}}
.kpi .l{font-size:6.2pt;color:${MUT};text-transform:uppercase;letter-spacing:.03em;margin-top:.6mm}
.sec{display:flex;align-items:baseline;gap:2.5mm;border-bottom:1.4px solid ${TEAL};padding-bottom:1.2mm;margin:3.5mm 0 2.2mm}
.sec .no{font-size:10.5pt;font-weight:700;color:${NAVY}}
.sec .nm{font-size:9.8pt;font-weight:700;color:${NAVY};letter-spacing:.02em}
p{margin:0 0 1.5mm}
.lead{font-size:8.8pt;color:#26304A;margin-bottom:2.2mm}
.bul{margin:0 0 2mm;padding:0;list-style:none}
.bul li{margin:0 0 1mm;padding-left:3mm;position:relative;font-size:8.2pt;color:#3D5568}
.bul li:before{content:'•';position:absolute;left:0;color:${TEAL};font-weight:700}
table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:7.4pt;margin:0 0 2.5mm}
th{text-align:left;font-size:6.3pt;letter-spacing:.06em;text-transform:uppercase;color:#fff;background:${NAVY};padding:1.5mm 2mm;border:.35px solid ${NAVY};word-break:break-word;overflow-wrap:anywhere}
td{padding:1.4mm 2mm;border:.35px solid ${LINE};vertical-align:top;color:#3D5568;background:#fff;word-break:break-word;overflow-wrap:anywhere;word-wrap:break-word;white-space:normal}
tr:nth-child(even) td{background:${BG}}
tr{break-inside:avoid}thead{display:table-header-group}
.sm{font-size:7.2pt;color:${MUT}}
.footnote{margin-top:3.5mm;padding-top:2mm;border-top:1.2px solid ${TEAL};font-size:7.2pt;color:${MUT}}
.footnote b{color:${INK}}
.tone-pos{color:${PR};font-weight:700}.tone-neg{color:${CR};font-weight:700}.tone-neu{color:${NW};font-weight:700}
.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:2mm;margin:0 0 2.2mm}
.metrics>div{border:.6px solid ${LINE};border-radius:3px;padding:2mm 2mm;background:#fff}
.metrics .n{font-size:10.5pt;font-weight:700;line-height:1.1;color:${INK}}
.metrics .l{font-size:6.3pt;color:${MUT};text-transform:uppercase;letter-spacing:.03em;margin-top:.4mm}
.metrics .a{font-size:6.8pt;color:#3D5568;margin-top:.6mm}
.hbar{display:grid;grid-template-columns:28mm 1fr 32mm;align-items:center;gap:2mm;margin:0 0 1.2mm}
.hbar .hl{font-size:7.3pt;color:#3D5568;text-align:right;overflow:hidden;white-space:nowrap}
.track{height:6.5px;background:#E7EEF3;border-radius:2px;overflow:hidden}
.fill{height:100%;border-radius:2px}
.hbar .hn{font-size:7.1pt;font-weight:700;color:${INK}}
.stack{display:flex;height:9.5px;border-radius:2px;overflow:hidden;background:#E7EEF3}
.stack>div{height:100%}
.legend{display:flex;flex-wrap:wrap;gap:2.8mm;margin-top:1.1mm;font-size:6.8pt;color:#3D5568}
.legend i{display:inline-block;width:6.5px;height:6.5px;border-radius:1px;margin-right:1mm;vertical-align:middle}
.chartbox{border:.6px solid ${LINE};border-radius:3px;padding:2.3mm;background:#fff;margin:0 0 2.3mm;break-inside:avoid;page-break-inside:avoid}
.metrics{break-inside:avoid;page-break-inside:avoid}
.chartbox h4{margin:0 0 .3mm;font-size:7.8pt;color:${NAVY}}
.chartbox p{margin:0 0 1.6mm}
.charts{display:grid;grid-template-columns:1.3fr .7fr;gap:2.4mm;margin:0 0 2.3mm}
.tl{display:flex;align-items:flex-end;gap:1px;height:20mm;border-bottom:.6px solid ${LINE}}
.tlc{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;min-width:0}
.tlb{width:70%;background:#6366f1;border-radius:1px 1px 0 0;min-height:1px}
.tlc span{font-size:5.4pt;color:${MUT};margin-top:.4mm}
.donutwrap{display:flex;align-items:center;gap:2.8mm}
.addr{border:.6px solid ${LINE};border-left:3px solid ${NAVY};background:#fff;padding:2.2mm 2.8mm;margin:0 0 2.8mm}
.addr .who{font-size:10.5pt;font-weight:700;color:${INK};margin:.3mm 0}
.addr .l{font-size:6.8pt;letter-spacing:.08em;color:${MUT};font-weight:700}
.threat-card{display:flex;align-items:flex-start;gap:2.8mm;padding:2.4mm 3mm;border-radius:3px;margin:0 0 2.8mm;border:.6px solid ${LINE};background:#fff}
.threat-pill{font-size:7.2pt;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:1.1mm 2.6mm;border-radius:2px;color:#fff;white-space:nowrap;display:inline-block}
.threat-pill-low{background:#10b981}
.threat-pill-med{background:#f59e0b}
.threat-pill-high{background:#f43f5e}
.threat-pill-crit{background:#be123c}
.threat-desc{font-size:7.8pt;color:${INK};line-height:1.35;flex:1}

/* Page 1 Action Summary Box */
.action-summary-box{border:1.2px solid #b91c1c;border-left:4px solid #b91c1c;border-radius:3px;background:#fff8f8;padding:2.8mm 3.4mm;margin:0 0 3.2mm}
.action-summary-box h3{margin:0 0 1.5mm;font-size:9.2pt;font-weight:800;color:#991b1b;letter-spacing:.04em;text-transform:uppercase;display:flex;align-items:center;gap:2mm}
.action-summary-box .action-grid{display:grid;grid-template-columns:1fr 1fr;gap:2.8mm;margin-top:1.8mm}
.action-item{background:#fff;border:.6px solid #fecaca;border-radius:2px;padding:2mm 2.4mm}
.action-item .action-title{font-size:7.8pt;font-weight:700;color:#991b1b;margin-bottom:.8mm}
.action-item .action-desc{font-size:7.3pt;color:#334155;line-height:1.3}

.post-link{color:#1d4ed8;text-decoration:underline;font-weight:700;word-break:break-all}
.post-link:hover{color:#1e40af}

.intel-grid{display:grid;grid-template-columns:1fr 1fr;gap:2.4mm;margin:0 0 2.8mm}
.dates-box{background:#f8fafc;border:.6px solid #e2e8f0;border-left:3px solid #3b82f6;border-radius:3px;padding:2mm 2.8mm;margin:0 0 2.4mm}
.dates-box h4{margin:0 0 1mm;font-size:7.6pt;color:#1e3a8a;text-transform:uppercase;letter-spacing:.04em}
.dates-box ul{margin:0;padding:0;list-style:none}
.dates-box li{font-size:7.4pt;color:#334155;margin-bottom:1mm;line-height:1.3}
.watch-box{background:#fffbeb;border:.6px solid #fde68a;border-left:3px solid #f59e0b;border-radius:3px;padding:2mm 2.8mm;margin:0 0 2.4mm}
.watch-box h4{margin:0 0 1mm;font-size:7.6pt;color:#92400e;text-transform:uppercase;letter-spacing:.04em}
.watch-box ul{margin:0;padding:0;list-style:none}
.watch-box li{font-size:7.4pt;color:#78350f;margin-bottom:1mm;line-height:1.3}
.plat-badge{display:inline-block;padding:.7mm 1.8mm;border-radius:2px;font-size:6.2pt;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}
.prio-pill{display:inline-block;padding:.7mm 1.8mm;border-radius:2px;font-size:6.1pt;font-weight:700;text-transform:uppercase;letter-spacing:.03em;white-space:nowrap}
.prio-crit{background:#fef2f2;color:#991b1b;border:.6px solid #f87171;font-weight:800}
.prio-high{background:#fff1f2;color:#be123c;border:.6px solid #fecdd3;font-weight:700}
.prio-med{background:#fffbeb;color:#92400e;border:.6px solid #fde68a}
.prio-low{background:#f0fdf4;color:#166534;border:.6px solid #bbf7d0}
.author-handle{font-weight:700;color:${INK}}
.reason-text{font-size:7.1pt;color:#334155;line-height:1.3}
.plat-group-box{margin:0 0 3mm;border:.6px solid ${LINE};border-radius:3px;background:#fff;break-inside:avoid;page-break-inside:avoid;overflow:hidden}
.plat-group-header{display:flex;align-items:center;gap:2.4mm;padding:1.8mm 2.6mm;background:#f8fafc;border-bottom:.6px solid ${LINE};border-left:3.5px solid ${NAVY}}
.plat-group-title{font-size:7.8pt;font-weight:700;color:${INK};flex:1}
.plat-group-count{font-size:6.6pt;color:${MUT};text-transform:uppercase;letter-spacing:.04em}
.plat-group-box table{margin:0;border:none}
.plat-group-box th{background:#26304A;font-size:6.1pt}
.plat-group-box td{border-bottom:.35px solid ${LINE}}
.plat-group-box tr:last-child td{border-bottom:none}
`;

const POS = '#10b981';
const NEU = '#0ea5e9';
const NEG = '#f43f5e';
const CHART_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#64748b'];

const hbar = (label, value, max, color, note) => `
<div class="hbar">
  <div class="hl">${esc(clip(label, 22))}</div>
  <div class="track"><div class="fill" style="width:${max > 0 ? Math.max(2, (100 * n0(value)) / max) : 0}%;background:${color}"></div></div>
  <div class="hn">${fmt(value)}${note ? ` · ${esc(note)}` : ''}</div>
</div>`;

const PLAT_COLORS = {
  x: '#1E2A44',
  twitter: '#1E2A44',
  youtube: '#E0A030',
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
  const h = 92;
  const padL = 8;
  const padR = 8;
  const padT = 8;
  const padB = 16;
  const max = Math.max(...rows.map((d) => n0(d.count)), 1);
  const step = rows.length > 1 ? (w - padL - padR) / (rows.length - 1) : 0;
  const pts = rows.map((d, i) => {
    const x = padL + i * step;
    const y = h - padB - ((h - padT - padB) * n0(d.count)) / max;
    return [x, y];
  });
  const line = pts.map((p) => p.join(',')).join(' ');
  const area = `${pts[0][0]},${h - padB} ${line} ${pts[pts.length - 1][0]},${h - padB}`;
  const labelAt = [0, Math.floor((rows.length - 1) / 2), rows.length - 1].filter((v, i, a) => a.indexOf(v) === i);
  const labels = labelAt.map((i) => {
    const raw = String(rows[i].date || '');
    const bits = raw.split('-');
    const text = bits.length === 3 ? `${bits[2]}/${bits[1]}` : raw.slice(5);
    return `<text x="${pts[i][0]}" y="${h - 3}" text-anchor="middle" font-size="7" fill="#6B7C8A">${esc(text)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="32mm" preserveAspectRatio="none">
    <defs><linearGradient id="tlfill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stop-color="#6366f1" stop-opacity="0.4"/><stop offset="95%" stop-color="#6366f1" stop-opacity="0"/></linearGradient></defs>
    <polygon points="${area}" fill="url(#tlfill)"/>
    <polyline points="${line}" fill="none" stroke="#6366f1" stroke-width="1.8"/>
    ${pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="1.8" fill="#6366f1"/>`).join('')}
    ${labels}
  </svg>
  <div class="legend"><span>Daily posts by publication date. Peak ${fmt(max)}. ${rows.length} day${rows.length === 1 ? '' : 's'}.</span></div>`;
};

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
    return dt.toISOString().slice(0, 10);
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

const buildReportHtml = ({ summary, keywordData, tenantName, analysis, headquarters, includeEvidence = true }) => {
  const stats = summary?.stats || {};
  const event = summary?.event || {};
  const kwa = keywordData || null;
  const kws = (kwa?.keywords || []).filter((k) => n0(k.total_posts) > 0);
  const total = n0(stats.total_unique_posts || stats.total_media_count);
  const sent = sentimentOf(stats.sentiment_counts);
  const sentTotal = Math.max(sent.positive + sent.neutral + sent.negative, 1);
  const platformEntries = Object.entries(stats.platform_counts || {})
    .filter(([, v]) => n0(v) > 0)
    .sort((a, b) => b[1] - a[1]);
  const eng = kwa?.summary?.engagement || stats.total_engagement || {};
  const engTotal = n0(eng.total) || n0(eng.likes) + n0(eng.shares) + n0(eng.comments);
  const generated = summary?.generated_at ? new Date(summary.generated_at) : new Date();
  const dateStr = generated.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const windowStr =
    stats.timeframe_label
      ? `${stats.timeframe_label}${stats.date_range?.start && stats.date_range?.end ? ` (${new Date(stats.date_range.start).toLocaleDateString('en-GB')} – ${new Date(stats.date_range.end).toLocaleDateString('en-GB')})` : ''}`
      : stats.date_range?.start && stats.date_range?.end
        ? `${new Date(stats.date_range.start).toLocaleDateString('en-GB')} – ${new Date(stats.date_range.end).toLocaleDateString('en-GB')}`
        : '—';
  
  const cleanTenant = (t) => {
    if (!t) return 'DIGITAL INTELLIGENCE PLATFORM';
    const s = String(t).replace(/[_]+/g, ' ').replace(/\bblurasaga\b/gi, '').replace(/\bblura\s+saga\b/gi, '').trim();
    if (/odisha/i.test(s)) return 'ODISHA POLICE';
    if (/delhi/i.test(s)) return 'DELHI POLICE';
    if (/jharkhand/i.test(s)) return 'JHARKHAND POLICE';
    if (/andhra|ap/i.test(s)) return 'ANDHRA PRADESH POLICE';
    if (/uttarakhand/i.test(s)) return 'UTTARAKHAND POLICE';
    return s.toUpperCase() || 'DIGITAL INTELLIGENCE PLATFORM';
  };

  const tenant = cleanTenant(tenantName);
  const hq = headquarters || null;
  const hqHtml = hq
    ? `<div class="addr">
        <div class="l">ADDRESSED TO STATE HEADQUARTERS</div>
        <div class="who">${esc(hq.head)}, ${esc(hq.force)}</div>
        <div>${esc(hq.addressLine)}</div>
        ${hq.phone ? `<div class="sm">${esc(hq.phone)}</div>` : ''}
      </div>`
    : `<div class="addr">
        <div class="l">ADDRESSED TO STATE HEADQUARTERS</div>
        <div class="who">${esc(tenant)}</div>
      </div>`;
  const lead = platformEntries[0];
  const placeLexicon = buildPlaceLexicon(event);
  const broad = broadPlaces(event);

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
      places,
      specific: places.filter((p) => !broad.has(p.toLowerCase())),
      isVisit,
      url: postUrl,
      when: e.posted_at ? new Date(e.posted_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—',
      eng: likes + comments * 2 + shares * 3 + Math.floor(views / 10),
    };
  });

  // Geographic penetration
  const placeMap = {};
  sortByLatest(ev).forEach((e) => {
    if (e.is_relevant === false) return;
    const named = e.specific.length ? e.specific : e.places;
    named.forEach((d) => {
      if (!d || SKIP_PLACE.has(d.toLowerCase())) return;
      placeMap[d] = placeMap[d] || { count: 0, sample: null };
      placeMap[d].count += 1;
      if (!placeMap[d].sample) placeMap[d].sample = e;
    });
  });
  const places = Object.entries(placeMap)
    .map(([name, info]) => ({ name, count: info.count, sample: info.sample }))
    .sort((a, b) => b.count - a.count);

  const visits = sortByDateAndTone(ev.filter((e) => e.specific.length || e.isVisit));

  const critical = sortByDateAndTone(
    ev.filter((e) => e.sentK === 'negative' || ['critical', 'high'].includes(String(e.risk_level || '').toLowerCase()))
  );

  // Amplifiers & high monitoring profiles — CAPPED to Top 10 (or max 15 if engagement is high)
  const authors = {};
  ev.forEach((e) => {
    const key = `${e.plat}|${e.author}`;
    authors[key] = authors[key] || {
      author: e.author,
      platform: e.plat,
      count: 0,
      eng: 0,
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

  const usedRationales = new Set();

  const buildSurveillanceRationale = (a) => {
    const authorName = (a.author || '').toLowerCase();

    // Check if high monitoring profile from LLM analysis has a non-generic reason
    const matchHmp = (analysis?.highMonitoringProfiles || []).find(
      (hmp) => hmp.account && (
        hmp.account.toLowerCase().includes(authorName) ||
        authorName.includes(hmp.account.toLowerCase())
      ) && hmp.whyMonitor && hmp.whyMonitor.length > 20 && !hmp.whyMonitor.toLowerCase().includes('broadcaster of adverse')
    );
    if (matchHmp?.whyMonitor && !usedRationales.has(matchHmp.whyMonitor)) {
      usedRationales.add(matchHmp.whyMonitor);
      return matchHmp.whyMonitor;
    }

    const matchAmp = (analysis?.amplifiers || []).find(
      (amp) => amp.account && (
        amp.account.toLowerCase().includes(authorName) ||
        authorName.includes(amp.account.toLowerCase())
      ) && amp.why && amp.why.length > 20 && !amp.why.toLowerCase().includes('broadcaster of adverse')
    );
    if (matchAmp?.why && !usedRationales.has(matchAmp.why)) {
      usedRationales.add(matchAmp.why);
      return matchAmp.why;
    }

    // Inspect author samples to determine exact stance and quote
    const samples = a.samples || [];
    const allTexts = samples.map((s) => s.text).join(' ');
    const textLower = allTexts.toLowerCase();

    const primarySample = samples.find(
      (s) => s.sentK === 'negative' || ['critical', 'high'].includes(String(s.risk || '').toLowerCase())
    ) || samples.slice().sort((x, y) => (y.eng || 0) - (x.eng || 0))[0] || { text: a.sample || '' };

    const quote = extractCleanQuote(primarySample.text, 80);

    let narrativeFocus = '';
    if (/resign|resignation|step down|sack|dismiss|mantri|minister/i.test(textLower)) {
      narrativeFocus = 'Demanding ministerial accountability and immediate resignation';
    } else if (/protest|dharna|agitation|march|strike|bandh|rally|chalo|gherao|demonstrat|gather/i.test(textLower)) {
      narrativeFocus = 'Mobilizing ground agitation, protest calls, and demonstration logistics';
    } else if (/textbook|syllabus|curriculum|class\s*\d|school|education|student|mistake|error|print/i.test(textLower)) {
      narrativeFocus = 'Circulating textbook printing error claims and curriculum lapses';
    } else if (/scam|corrupt|fraud|bribe|irregularit|money|fund|cbi|probe|investigat|rigged/i.test(textLower)) {
      narrativeFocus = 'Amplifying financial irregularities and corruption allegations';
    } else if (/fir|police|arrest|custody|lathi|assault|clash|riot|attack|violence|weapon/i.test(textLower)) {
      narrativeFocus = 'Tracking law-and-order confrontation and demanding police/FIR action';
    } else if (/threat|warning|ultimatum|shutdown|rail roko|rasta roko|blockade/i.test(textLower)) {
      narrativeFocus = 'Issuing administrative ultimatums and disruption threats';
    } else if (/neglect|lapse|betrayal|unacceptable|shame|apology|justice|condemn|failure|outrage/i.test(textLower)) {
      narrativeFocus = 'Broadcasting strong public outrage and administrative criticism';
    } else if (a.eng >= 15000) {
      narrativeFocus = 'Key digital amplifier driving viral discourse across feeds';
    } else if (a.count >= 3) {
      narrativeFocus = `High-cadence repeat broadcaster (${a.count} posts tracked)`;
    } else if (a.criticalCount > 0) {
      narrativeFocus = 'Flagged critical account publishing hostile escalation claims';
    } else if (a.negativeCount > 0) {
      narrativeFocus = 'Active critic challenging official state handling';
    } else if (a.positiveCount > 0) {
      narrativeFocus = 'Regional account providing supportive counter-narrative updates';
    } else {
      narrativeFocus = 'Regional broadcaster sharing ground situation updates';
    }

    let rationale = '';
    if (quote && quote.length > 8) {
      if (a.eng >= 10000) {
        rationale = `${narrativeFocus}: ${quote} (${fmt(a.eng)} impressions)`;
      } else if (a.count > 1) {
        rationale = `${narrativeFocus}: ${quote} (${fmt(a.count)} posts)`;
      } else {
        rationale = `${narrativeFocus}: ${quote}`;
      }
    } else {
      if (a.eng > 5000) {
        rationale = `${narrativeFocus} with high reach (${fmt(a.eng)} engagements across ${fmt(a.count)} posts).`;
      } else {
        rationale = `${narrativeFocus} (${fmt(a.count)} post${a.count === 1 ? '' : 's'} recorded in monitoring window).`;
      }
    }

    let candidate = rationale;
    let counter = 1;
    while (usedRationales.has(candidate)) {
      candidate = `${rationale} [Track #${counter}]`;
      counter++;
    }
    usedRationales.add(candidate);
    return candidate;
  };

  const highWatchList = Object.values(authors)
    .map((a) => {
      // Compute precise risk percentage and classification
      let riskScore = 0;
      if (a.criticalCount > 0) {
        riskScore = Math.min(98, 75 + a.criticalCount * 10 + Math.round((a.negativeCount / a.count) * 15));
      } else if (a.negativeCount > 0) {
        riskScore = Math.min(88, 55 + Math.round((a.negativeCount / a.count) * 30));
      } else if (a.neutralCount > 0) {
        riskScore = Math.max(10, Math.min(35, 15 + Math.round((a.count / 5) * 10)));
      } else {
        riskScore = 8;
      }

      let riskLabel = '';
      let priorityClass = 'prio-low';
      if (riskScore >= 85) {
        riskLabel = `Critical (${riskScore}% Risk)`;
        priorityClass = 'prio-crit';
      } else if (riskScore >= 60) {
        riskLabel = `High (${riskScore}% Risk)`;
        priorityClass = 'prio-high';
      } else if (riskScore >= 35) {
        riskLabel = `Medium (${riskScore}% Risk)`;
        priorityClass = 'prio-med';
      } else {
        riskLabel = `Low (${riskScore}% Risk)`;
        priorityClass = 'prio-low';
      }

      const why = buildSurveillanceRationale(a);

      return {
        ...a,
        why,
        riskScore,
        riskLabel,
        priority: riskLabel,
        priorityClass,
      };
    })
    .sort((a, b) => b.riskScore - a.riskScore || b.negativeCount - a.negativeCount || b.eng - a.eng || b.count - a.count)
    .slice(0, profileCapLimit);

  const promoters = highWatchList;

  const entities = Object.entries(stats.target_classification || {})
    .map(([k, v]) => ({ name: k, total: n0(v.total), praise: n0(v.praise), news: n0(v.news), crit: n0(v.criticism) }))
    .filter((e) => e.total > 0)
    .sort((a, b) => b.total - a.total);

  const topKwA = kws[0] || null;
  const topKwB = kws[1] || null;

  const findings = (analysis?.keyFindings || []).slice(0, 6);
  const narratives = (analysis?.narratives || []).slice(0, 5);
  const actions = (analysis?.actions || []).slice(0, 6);

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

  const activityPosts = sortByDateAndTone(ev.filter((e) => e.isVisit));
  const activityList = activityPosts.length ? activityPosts : sortByDateAndTone(ev);
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

  const visitRows = visits.length
    ? visits
        .map(
          (e) => `<tr>
<td>${postRefLink(e)}</td>
<td>${esc(e.when)}</td>
<td>${esc(placeLabel(e))}</td>
<td>${esc(platLabel(e.plat))}</td>
<td>${authorProfileLink(e.plat, e.author, e.url)}</td>
<td>${esc(clip(e.text, 200))}</td>
</tr>`
        )
        .join('')
    : `<tr><td colspan="6">No posts in this dataset name a specific ground field location.</td></tr>`;

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

  const entityRows = entities.slice(0, 8)
    .map(
      (e) => `<tr>
<td>${esc(e.name)}</td>
<td>${fmt(e.total)}</td>
<td>${fmt(e.praise)}</td>
<td>${fmt(e.news)}</td>
<td>${fmt(e.crit)}</td>
</tr>`
    )
    .join('');

  const evidenceRows = sortByDateAndTone(ev)
    .map(
      (e) => `<tr>
<td>${postRefLink(e)}</td>
<td>${esc(e.when)}</td>
<td>${esc(placeLabel(e))}</td>
<td>${esc(platLabel(e.plat))}</td>
<td>${authorProfileLink(e.plat, e.author, e.url)}</td>
<td class="tone-${e.sentK || 'neu'}">${esc(toneLabel(e.sentK))}</td>
<td>${fmt(e.eng)}</td>
<td>${esc(clip(e.text, 240))}</td>
</tr>`
    )
    .join('');

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
    ? `<ul class="bul">${actions.map((a) => `<li><b>${esc(a.action)}</b> — ${esc(a.detail)}${a.posts && a.posts.length ? ` <span class="sm">(${esc(a.posts.map(p => `Post #${p}`).join(', '))})</span>` : ''}</li>`).join('')}</ul>`
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
    .map((c) => hbar(c.keyword, c.posts, kwMax, '#6366f1', ''))
    .join('');
  const sovParts = (kwa?.keywords || [])
    .filter((k) => n0(k.total_posts) > 0)
    .slice(0, 8)
    .map((k, i) => ({ k: k.keyword, v: k.total_posts, c: CHART_COLORS[i % CHART_COLORS.length] }));

  const matchTotal = n0(kwa?.summary?.total_matched_posts) || sovParts.reduce((s, p) => s + n0(p.v), 0);
  const keywordStacks = comparisons.map((c) => `
    <div class="hbar" style="grid-template-columns:36mm 1fr;margin-bottom:2.2mm">
      <div class="hl">${esc(clip(c.keyword, 28))}</div>
      <div>${stackBar([
        { k: 'Positive', v: c.positive, c: POS },
        { k: 'Neutral', v: c.neutral, c: NEU },
        { k: 'Negative', v: c.negative, c: NEG },
      ], false)}</div>
    </div>`).join('');
  const riskCounts = stats.risk_counts || kwa?.summary?.risk_levels || {};
  const riskParts = [
    { k: 'Critical', v: riskCounts.critical, c: '#7A1F1F' },
    { k: 'High', v: riskCounts.high, c: '#B42318' },
    { k: 'Medium', v: riskCounts.medium, c: '#C45C26' },
    { k: 'Low', v: riskCounts.low, c: '#1B7A4E' },
  ];
  const entityBars = entities.slice(0, 6).map((e) => `
    <div style="margin:0 0 2mm">
      <div class="sm"><b>${esc(e.name)}</b> · ${fmt(e.total)} posts · ${pct(e.crit, e.total)} negative</div>
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

  const threatLevelVal = analysis?.threatLevel || (
    highRiskN > 0 ? 'High' : (n0(riskCounts.medium) > 0 ? 'Low to Medium' : 'Low')
  );
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

  let computedRationale = '';
  if (highRiskCount > 0) {
    computedRationale = `${fmt(highRiskCount)} high/critical risk post(s) identified with direct calls for agitation, public confrontation, or aggressive demands targeting administrative leadership. Active operational tracking is warranted.`;
  } else if (negativeSharePct >= 25) {
    computedRationale = `Elevated critical discourse (${negativeSharePct}% adverse tone, ${fmt(negativePostCount)} posts) actively circulating across platform feeds. Ground mobilization risk requires continuous monitoring.`;
  } else if (visits.length > 0) {
    computedRationale = `Field activity and regional presence recorded across ${fmt(places.length)} location(s). Current public discourse remains predominantly peaceful without violent escalation indicators.`;
  } else {
    computedRationale = `Standard baseline public discourse. No elevated threat signals, violent mobilization calls, or public order disturbances detected in this monitoring window.`;
  }

  const threatDesc = analysis?.threatDesc || computedRationale;

  // Page 1 Half-Page Action Summary: Key posts/profiles requiring immediate attention with direct links
  const topFlaggedProfiles = highWatchList.filter((p) => p.riskScore >= 60 || p.criticalCount > 0 || p.negativeCount > 0).slice(0, 4);
  const topFlaggedPosts = critical.slice(0, 3);

  const threatCardHtml = `
  <div class="threat-card" style="display:block;border-left:4px solid ${threatBorderColor};padding:2.6mm 3.2mm;margin-bottom:3.2mm">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:2.5mm;margin-bottom:1.5mm">
      <div style="display:flex;align-items:center;gap:2mm">
        <span class="threat-pill ${threatPillClass}">Threat Level: ${esc(threatLevelVal)}</span>
        <span style="font-size:8.2pt;font-weight:700;color:${INK}">Operational Threat Assessment & Risk Rationale</span>
      </div>
      <span style="font-size:6.8pt;color:${MUT};font-weight:700">${fmt(highRiskCount)} Critical Posts · ${negativeSharePct}% Adverse Sentiment</span>
    </div>
    
    <div class="threat-desc" style="font-size:7.4pt;color:#334155;line-height:1.4;margin-bottom:2mm">
      <b>Why this Risk Level:</b> ${esc(threatDesc)}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:2mm">
      <div style="background:#f8fafc;border:.6px solid #e2e8f0;padding:1.4mm 2mm;border-radius:2px">
        <div style="font-size:6.1pt;color:#64748b;font-weight:700;text-transform:uppercase">Mobilization & Agitation</div>
        <div style="font-size:7.2pt;font-weight:700;color:${highRiskCount > 0 ? '#b91c1c' : INK}">
          ${visits.length > 0 ? `${fmt(visits.length)} field presence posts` : 'No violent strike calls'}
        </div>
      </div>
      <div style="background:#f8fafc;border:.6px solid #e2e8f0;padding:1.4mm 2mm;border-radius:2px">
        <div style="font-size:6.1pt;color:#64748b;font-weight:700;text-transform:uppercase">Adverse Narrative Share</div>
        <div style="font-size:7.2pt;font-weight:700;color:${negativeSharePct >= 20 ? '#b91c1c' : INK}">
          ${negativeSharePct}% (${fmt(negativePostCount)} critical posts)
        </div>
      </div>
      <div style="background:#f8fafc;border:.6px solid #e2e8f0;padding:1.4mm 2mm;border-radius:2px">
        <div style="font-size:6.1pt;color:#64748b;font-weight:700;text-transform:uppercase">Surveillance Priority</div>
        <div style="font-size:7.2pt;font-weight:700;color:${threatBorderColor}">
          ${topFlaggedProfiles.length > 0 ? `${topFlaggedProfiles.length} High-Risk Account(s) Flagged` : 'Baseline Monitoring'}
        </div>
      </div>
    </div>
  </div>`;

  const actionSummaryHtml = `
  <div class="action-summary-box">
    <h3>🚨 Immediate Action Summary (Executive & Police Directives)</h3>
    <p style="font-size:7.6pt;color:#7f1d1d;margin:0 0 1.5mm">
      Key posts and accounts identified below require immediate review, ground verification, cyber tracking, or takedown escalation.
    </p>
    <div class="action-grid">
      <div class="action-item">
        <div class="action-title">1. Priority Accounts For Review / Takedown (${topFlaggedProfiles.length || 1} Flags)</div>
        <div class="action-desc">
          ${topFlaggedProfiles.length ? topFlaggedProfiles.map(p => `• ${authorProfileLink(p.platform, p.author)} (${esc(platLabel(p.platform))}) — <b>${esc(p.why)}</b>`).join('<br>') : '• Continuous surveillance on top amplifying digital channels.'}
        </div>
      </div>
      <div class="action-item">
        <div class="action-title">2. Critical Monitored Posts Requiring Action</div>
        <div class="action-desc">
          ${topFlaggedPosts.length ? topFlaggedPosts.map(p => `• ${postRefLink(p)} [${esc(platLabel(p.plat))}] by ${authorProfileLink(p.plat, p.author)}: "${esc(clip(p.text, 90))}"`).join('<br>') : '• No active high-threat posts flagged in this window.'}
        </div>
      </div>
    </div>
  </div>`;

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
          ${keyDates.map((k) => `<li>• <b>${esc(k.date || 'Key Date')}</b>: ${esc(k.event || k.what || '')}${k.posts?.length ? ` <span class="sm">${esc(k.posts.map((p) => `[Post #${p}]`).join(' '))}</span>` : ''}</li>`).join('')}
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

  const evidenceSecHtml = includeEvidence ? `
  <div class="sec"><span class="no">09.</span><span class="nm">Evidence register (Click to Open Post)</span></div>
  <div class="metrics">
    ${metric(fmt(ev.length), 'Posts in this brief', 'Direct hyperlinks enabled for each evidence post')}
    ${metric(fmt(ev.filter((e) => e.posted_at).length), 'Dated posts', 'Verified publication timestamp')}
    ${metric(fmt(sent.negative), 'Negative tone', `${pct(sent.negative, sentTotal)} of toned posts`)}
    ${metric(fmt(places.length), 'Places named', topPlace ? `Lead site: ${topPlace.name}` : 'None named')}
  </div>
  <p class="sm">All ${fmt(ev.length)} posts used for this brief. Click any Post # link to inspect the original live record.</p>
  <table>
    <colgroup>
      <col style="width:11%">
      <col style="width:13%">
      <col style="width:14%">
      <col style="width:9%">
      <col style="width:14%">
      <col style="width:8%">
      <col style="width:7%">
      <col style="width:24%">
    </colgroup>
    <thead><tr><th>Post Link</th><th>When</th><th>Place</th><th>Platform</th><th>Account</th><th>Tone</th><th>Eng.</th><th>Text</th></tr></thead>
    <tbody>${evidenceRows || '<tr><td colspan="8">No posts in this evidence set.</td></tr>'}</tbody>
  </table>` : '';

  // Group highWatchList by platform
  const platformGroups = {};
  highWatchList.forEach((p) => {
    const platKey = String(p.platform || 'other').toLowerCase();
    platformGroups[platKey] = platformGroups[platKey] || [];
    platformGroups[platKey].push(p);
  });

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
              <th>Risk Level</th>
              <th>Posts & Reach</th>
              <th>Why to Monitor (Surveillance Rationale)</th>
            </tr>
          </thead>
          <tbody>
            ${list.map((p) => `
              <tr>
                <td>${authorProfileLink(p)}</td>
                <td><span class="prio-pill ${p.priorityClass}">${esc(p.priority)}</span></td>
                <td><b>${fmt(p.count)}</b> posts<br><span class="sm">${fmt(p.eng)} reach</span></td>
                <td class="reason-text">${esc(p.why)}${p.posts?.length ? ` <span class="sm">${esc(p.posts.slice(0, 3).map((n) => `[Post #${n}]`).join(' '))}</span>` : ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
        })
        .join('')
    : '<p class="sm">No high monitoring profiles identified in this dataset.</p>';

  const body = `
<section class="pg">
  <div class="hero">
    <div class="eyebrow">${esc(tenant)} · ${includeEvidence ? 'FULL INTELLIGENCE & EVIDENCE REPORT' : 'EXECUTIVE ACTION SUMMARY BRIEF'}</div>
    <h1>${esc(event.name || 'Event')}</h1>
    <div class="sub">${esc(event.location || 'Location not specified')} · ${includeEvidence ? 'Detailed intelligence brief with complete evidence register' : 'Executive action summary and tactical intelligence brief'}</div>
    <div class="meta">
      <span>MONITORING WINDOW<b>${esc(windowStr)}</b></span>
      <span>GENERATED<b>${esc(dateStr)}</b></span>
      <span>POSTS ANALYSED<b>${fmt(total)}</b></span>
      <span>REPORT FORMAT<b>${includeEvidence ? `With Evidence (${fmt(ev.length)})` : 'Executive 2-Page Brief'}</b></span>
    </div>
  </div>
  ${hqHtml}

  ${actionSummaryHtml}

  ${threatCardHtml}

  <div class="kpi">
    <div><div class="n">${fmt(total)}</div><div class="l">Total posts</div></div>
    <div><div class="n">${esc(lead ? platLabel(lead[0]) : '—')}</div><div class="l">Lead platform</div></div>
    <div><div class="n">${fmt(places.length)}</div><div class="l">Places covered</div></div>
    <div><div class="n">${fmt(sent.negative)}</div><div class="l">Negative posts</div></div>
    <div><div class="n">${fmt(engTotal)}</div><div class="l">Total engagement</div></div>
  </div>

  <div class="kpi">
    <div><div class="n">${pct(sent.positive, sentTotal)}</div><div class="l">Positive share</div></div>
    <div><div class="n">${pct(sent.neutral, sentTotal)}</div><div class="l">Neutral share</div></div>
    <div><div class="n">${pct(sent.negative, sentTotal)}</div><div class="l">Negative share</div></div>
    <div><div class="n">${fmt(topKwA ? n0(topKwA.total_posts) : 0)}</div><div class="l">${esc(topKwA ? clip(topKwA.keyword, 22) : 'Top keyword')}</div></div>
    <div><div class="n">${fmt(topKwB ? n0(topKwB.total_posts) : visits.length)}</div><div class="l">${esc(topKwB ? clip(topKwB.keyword, 22) : 'Field activity')}</div></div>
  </div>

  <p class="sm"><b>Active Platforms:</b> ${esc(platStr)}</p>
  <p class="sm"><b>Tracked Keywords:</b> ${esc(clip(kwStr, 280))}</p>

  <div class="charts">
    <div class="chartbox">
      <h4>Platform Distribution & Sentiment Mix</h4>
      <p class="sm">Post volume distribution across monitored social and digital channels.</p>
      ${platformBars || '<p class="sm">No platform split.</p>'}
      <div style="margin-top:2mm">${stackBar(briefSent)}</div>
    </div>
    <div class="chartbox">
      <h4>Keyword Share of Voice</h4>
      <p class="sm">Proportional share of keyword mentions across monitored discourse.</p>
      ${sovParts.length ? `<div class="donutwrap">${donutSvg(sovParts, fmt(matchTotal), 'Matches')}<div class="legend" style="flex-direction:column;gap:1mm">${sovParts.map((p) => `<span><i style="background:${p.c}"></i>${esc(clip(p.k, 28))} ${fmt(p.v)}</span>`).join('')}</div></div>` : '<p class="sm">No keyword split for this event.</p>'}
    </div>
  </div>
  <div class="charts">
    <div class="chartbox">
      <h4>Keyword Volume Breakdown</h4>
      <p class="sm">Direct post volume and frequency per tracked keyword.</p>
      ${keywordBars || '<p class="sm">No keyword split for this event.</p>'}
    </div>
    <div class="chartbox">
      <h4>Posting Timeline & Cadence</h4>
      <p class="sm">Chronological posting volume and publication cadence over the monitored window.</p>
      ${timelineChart(kwa?.timeline_overall)}
    </div>
  </div>
  ${keywordStacks ? `<div class="chartbox"><h4>Sentiment by Keyword</h4><p class="sm">Categorized sentiment distribution across individual keywords.</p><div class="legend"><span><i style="background:${POS}"></i>Positive</span><span><i style="background:${NEU}"></i>Neutral</span><span><i style="background:${NEG}"></i>Negative</span></div>${keywordStacks}</div>` : ''}

  ${analysis?.bottomLine ? `<p class="lead"><b>Bottom line:</b> ${esc(analysis.bottomLine)}</p>` : ''}
  ${findingsHtml}

  ${intelGridHtml}

  <div class="sec"><span class="no">01.</span><span class="nm">Recommended Law Enforcement & Cyber Actions</span></div>
  ${actionsHtml || '<p class="sm">Maintain standard baseline monitoring. No immediate operational escalation required at this stage.</p>'}

  <div class="sec"><span class="no">02.</span><span class="nm">Activity Analysis & Field Presence</span></div>
  <div class="metrics">
    ${metric(fmt(activityPosts.length), 'Activity posts', 'Posts naming a bandh, rally, meeting, or blockade')}
    ${metric(fmt(total), 'Posts in window', 'Total posts analyzed')}
    ${metric(lead ? platLabel(lead[0]) : '—', 'Lead platform', lead ? `${fmt(lead[1])} posts, ${pct(lead[1], total)}` : 'No platform split')}
    ${metric(fmt(engTotal), 'Engagement', 'Likes + shares + comments')}
  </div>
  <p class="sm">Campaigns, meetings, protests, bandhs, rallies, and programmes named in the posts.</p>
  ${activityBrief ? `<ul class="bul">${activityBrief}</ul>` : narrHtml}
  ${includeEvidence ? `<table>
    <colgroup>
      <col style="width:11%">
      <col style="width:13%">
      <col style="width:15%">
      <col style="width:10%">
      <col style="width:15%">
      <col style="width:9%">
      <col style="width:27%">
    </colgroup>
    <thead><tr><th>Post Link</th><th>When</th><th>Place</th><th>Platform</th><th>Author</th><th>Tone</th><th>Evidence</th></tr></thead>
    <tbody>${activityRows || '<tr><td colspan="7">No activity posts in this set.</td></tr>'}</tbody>
  </table>` : ''}

  <div class="sec"><span class="no">03.</span><span class="nm">Geographic Movement & Regional Presence</span></div>
  <div class="metrics">
    ${metric(fmt(visits.length), 'Presence posts', 'Field activity posts naming a specific site')}
    ${metric(fmt(places.length), 'Places named', topPlace ? `Highest: ${topPlace.name}` : 'None named')}
    ${metric(topPlace ? fmt(topPlace.count) : '0', 'Top place volume', topPlace ? topPlace.name : '—')}
    ${metric(fmt(visits.filter((e) => e.specific.length).length), 'Specific sites', 'Cities/districts/landmarks')}
  </div>
  <div class="chartbox">
    <h4>Top Locations Named in Discussion</h4>
    ${places.slice(0, 8).map((d) => hbar(d.name, d.count, places[0]?.count || 1, NAVY, pct(d.count, ev.length || 1))).join('') || '<p class="sm">No place named inside a post.</p>'}
  </div>
  ${(analysis?.geography || []).length
    ? `<ul class="bul">${analysis.geography.map((g) => `<li><b>${esc(g.place)}</b> — ${esc(g.note || '')} ${g.posts?.length ? `<span class="sm">${esc(g.posts.map((n) => `[Post #${n}]`).join(' '))}</span>` : ''}</li>`).join('')}</ul>`
    : places.length > 0
      ? `<p class="sm">Top locations identified in discussions: ${places.slice(0, 6).map((p) => `<b>${esc(p.name)}</b> (${fmt(p.count)})`).join(', ')}.</p>`
      : `<p class="sm">No specific city, district, or landmark names detected in post discussions.</p>`}
  ${includeEvidence ? `<table>
    <colgroup>
      <col style="width:12%">
      <col style="width:14%">
      <col style="width:18%">
      <col style="width:10%">
      <col style="width:15%">
      <col style="width:31%">
    </colgroup>
    <thead><tr><th>Post Link</th><th>When</th><th>Place named</th><th>Platform</th><th>Author</th><th>Evidence</th></tr></thead>
    <tbody>${visitRows}</tbody>
  </table>` : ''}
</section>

<section class="pg">
  <div class="sec"><span class="no">04.</span><span class="nm">Public Sentiment & Tone Distribution</span></div>
  <div class="kpi">
    <div><div class="n tone-pos">${fmt(sent.positive)}</div><div class="l">Positive (${pct(sent.positive, sentTotal)})</div></div>
    <div><div class="n tone-neu">${fmt(sent.neutral)}</div><div class="l">Neutral (${pct(sent.neutral, sentTotal)})</div></div>
    <div><div class="n tone-neg">${fmt(sent.negative)}</div><div class="l">Negative (${pct(sent.negative, sentTotal)})</div></div>
    <div><div class="n">${fmt(sent.positive + sent.neutral + sent.negative)}</div><div class="l">Toned volume</div></div>
    <div><div class="n">${fmt(total)}</div><div class="l">Total posts</div></div>
  </div>
  <div class="chartbox">
    <h4>Tone Breakdown</h4>
    <div class="donutwrap">${donutSvg(briefSent, pct(sent.negative, sentTotal), 'Negative')}<div style="flex:1">${stackBar(briefSent)}</div></div>
  </div>

  <div class="sec"><span class="no">05.</span><span class="nm">Critical Comments & Threat Tracking</span></div>
  <div class="metrics">
    ${metric(fmt(critical.length), 'Critical rows', 'Negative and adverse posts')}
    ${metric(pct(sent.negative, sentTotal), 'Negative share', `${fmt(sent.negative)} of ${fmt(sentTotal)} toned posts`)}
    ${metric(fmt(highRiskN), 'High / Critical risk', 'Priority alerts')}
    ${metric(fmt(n0(riskCounts.medium)), 'Medium risk', 'Active tracking')}
  </div>
  <div class="chartbox"><h4>Risk Bands</h4>${stackBar(riskParts)}</div>
  ${includeEvidence
    ? `<p class="sm">Critical and adverse posts in this dataset, with clickable links for review.</p>
  <table>
    <colgroup>
      <col style="width:12%">
      <col style="width:16%">
      <col style="width:11%">
      <col style="width:16%">
      <col style="width:10%">
      <col style="width:35%">
    </colgroup>
    <thead><tr><th>Post Link</th><th>Place</th><th>Platform</th><th>Account</th><th>Tone</th><th>Evidence</th></tr></thead>
    <tbody>${critRows}</tbody>
  </table>`
    : critical.length > 0
      ? `<p class="sm">Captured ${fmt(critical.length)} critical posts (${pct(sent.negative, sentTotal)} of toned volume). Review high-risk alerts and public order commentary below.</p>`
      : `<p class="sm">No critical, high-risk, or hostile posts detected in this dataset.</p>`}
  ${analysis?.publicOrder ? `<p><b>Public Order Assessment:</b> ${esc(analysis.publicOrder)}</p>` : ''}

  <div class="sec"><span class="no">06.</span><span class="nm">Targeted Entities & Key Figures</span></div>
  <div class="metrics">
    ${metric(fmt(entities.length), 'Entities classified', 'Who the posts are about')}
    ${metric(topEntity ? fmt(topEntity.total) : '0', topEntity ? topEntity.name : 'Top entity', topEntity ? `${pct(topEntity.crit, topEntity.total)} negative` : '—')}
    ${metric(fmt((analysis?.leaders || []).length), 'People named', 'Named in post text')}
    ${metric(fmt(sent.negative), 'Negative posts', 'Negative sentiment volume')}
  </div>
  ${entityBars ? `<div class="chartbox"><h4>Tone by Entity</h4><p class="sm">Sentiment distribution categorized by monitored entity and subject.</p><div class="legend"><span><i style="background:${PR}"></i>Positive</span><span><i style="background:${NW}"></i>Neutral</span><span><i style="background:${CR}"></i>Negative</span></div>${entityBars}</div>` : ''}
  ${
    entities.length
      ? `<table>
    <colgroup>
      <col style="width:32%">
      <col style="width:17%">
      <col style="width:17%">
      <col style="width:17%">
      <col style="width:17%">
    </colgroup>
    <thead><tr><th>Target / entity</th><th>Posts</th><th>Positive</th><th>Neutral</th><th>Negative</th></tr></thead>
    <tbody>${entityRows}</tbody>
  </table>`
      : '<p class="sm">Entity classification not available for this event.</p>'
  }
  ${(analysis?.leaders || []).length ? `<ul class="bul">${analysis.leaders.map((l) => `<li><b>${esc(l.name)}</b>${l.role ? ` — ${esc(l.role)}` : ''}${l.posts?.length ? ` <span class="sm">${esc(l.posts.map((n) => `[Post #${n}]`).join(' '))}</span>` : ''}</li>`).join('')}</ul>` : ''}
  ${analysis?.platformsCommentary ? `<p>${esc(analysis.platformsCommentary)}</p>` : ''}

  <div class="sec"><span class="no">07.</span><span class="nm">High Monitoring Profiles (Top ${highWatchList.length} Accounts Capped)</span></div>
  <div class="metrics">
    ${metric(fmt(highWatchList.length), 'Profiles tracked', 'Monitored accounts categorized by platform')}
    ${metric(fmt(highWatchList.filter((p) => p.priority === 'High Watch').length), 'High watch tier', 'Priority surveillance & escalation targets')}
    ${metric(topVoice ? fmt(topVoice.count) : '0', topVoice ? clip(topVoice.author, 16) : 'Top account', topVoice ? platLabel(topVoice.platform) : '—')}
    ${metric(fmt(engTotal), 'Total reach', 'Combined engagement')}
  </div>
  <div class="chartbox">
    <h4>Top Amplifying Accounts by Engagement</h4>
    ${promoters.slice(0, 8).map((a) => hbar(a.author, a.eng, promoters[0]?.eng || 1, '#6366f1', `${a.count} posts`)).join('') || '<p class="sm">No accounts in this set.</p>'}
  </div>
  <p class="sm">Surveillance register limited to the Top ${highWatchList.length} high-engagement accounts across platforms with direct profile links.</p>
  ${platformBoxesHtml}
  ${(analysis?.amplifiers || []).length
    ? `<ul class="bul">${analysis.amplifiers.map((a) => `<li><b>${esc(a.account)}</b> — ${esc(a.why || '')}${a.posts?.length ? ` <span class="sm">${esc(a.posts.map((n) => `[Post #${n}]`).join(' '))}</span>` : ''}</li>`).join('')}</ul>`
    : ''}

  ${evidenceSecHtml}

  <div class="footnote">
    <b>Executive Brief Summary</b><br>
    • Target Force: ${hq ? esc(`${hq.head}, ${hq.force}, ${hq.addressLine}`) : esc(tenant)}.<br>
    • Monitored Event: ${esc(event.name || '—')}.<br>
    • Posts analysed from database: ${fmt(total)}.${includeEvidence ? ` Cited evidence: ${fmt(ev.length)}.` : ' (Evidence register omitted for executive 2-page brief).'}<br>
    • Platforms: ${esc(platStr)}.<br>
    • Places named in posts: ${fmt(places.length)}${places[0] ? `; highest volume in ${esc(places[0].name)}` : ''}.<br>
    • Sentiment (Positive / Neutral / Negative): ${fmt(sent.positive)} / ${fmt(sent.neutral)} / ${fmt(sent.negative)}.
  </div>
</section>
`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>${FONT_FACES}${CSS}</style></head><body>${body}</body></html>`;
};

module.exports = { buildReportHtml };
