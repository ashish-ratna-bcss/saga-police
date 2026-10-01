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

/**
 * Build a place lexicon from this event's location field only.
 * No fixed state/district lists — works for any tenant / geography.
 * Keywords are themes, not places, so they are not included here.
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
  'the', 'this', 'that', 'today', 'yesterday', 'watch', 'students', 'student', 'protest',
  'massive', 'national', 'public', 'people', 'letter', 'state', 'india', 'news', 'post',
  'call', 'called', 'bandh', 'rally', 'meeting', 'campaign', 'minister', 'government',
  'police', 'education', 'school', 'assembly', 'wednesday', 'tomorrow', 'september',
  'october', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'november', 'december',
]);

/** Places written in the post: datelines, institutions, highways, and single place hashtags. */
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
    if (placeTail.test(phrase) || words.length === 1) add(phrase);
  }
  const hash = /#([A-Z][a-z]{3,18})\b/g;
  while ((m = hash.exec(src))) add(m[1]);
  return hits.slice(0, 6);
};

const broadPlaces = (event) => new Set(
  String(event?.location || '')
    .split(/[,;/|]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length >= 2)
);

const CSS = `
*{box-sizing:border-box}
body{margin:0;font-family:'Helvetica Neue',Arial,'Report Devanagari','Report Oriya',sans-serif;color:${INK};font-size:8.6pt;line-height:1.42;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pg{break-before:page;overflow:hidden;max-width:100%}
.pg:first-of-type{break-before:auto}
.hero{background:${INK};color:#fff;border-radius:0 0 3px 3px;padding:7mm 7mm 6mm;margin:0 0 4mm;position:relative}
.hero:before{content:'';position:absolute;left:7mm;top:7mm;bottom:7mm;width:2.2mm;background:${ACCENT}}
.hero .eyebrow{font-size:7pt;letter-spacing:.14em;color:#B8C9D6;font-weight:700;margin:0 0 2mm 4mm}
.hero h1{font-size:16pt;line-height:1.15;margin:0 0 1.5mm 4mm;letter-spacing:-.01em}
.hero .sub{font-size:9pt;color:#B8C9D6;margin:0 0 3mm 4mm}
.hero .meta{display:flex;flex-wrap:wrap;gap:5mm;margin-left:4mm;font-size:7pt;color:#9FB0CC}
.hero .meta b{display:block;color:#fff;font-size:8.4pt;margin-top:.6mm}
.kpi{display:grid;grid-template-columns:repeat(5,1fr);gap:2.2mm;margin:0 0 3.5mm}
.kpi>div{border:.6px solid ${LINE};border-radius:3px;padding:2.4mm 2.2mm;background:${BG};text-align:center}
.kpi .n{font-size:13pt;font-weight:700;letter-spacing:-.02em;line-height:1.1;color:${INK}}
.kpi .l{font-size:6.2pt;color:${MUT};text-transform:uppercase;letter-spacing:.03em;margin-top:.8mm}
.sec{display:flex;align-items:baseline;gap:2.5mm;border-bottom:1.4px solid ${TEAL};padding-bottom:1.4mm;margin:4mm 0 2.5mm}
.sec .no{font-size:11pt;font-weight:700;color:${NAVY}}
.sec .nm{font-size:10pt;font-weight:700;color:${NAVY};letter-spacing:.02em}
p{margin:0 0 1.6mm}
.lead{font-size:9pt;color:#26304A;margin-bottom:2.5mm}
.bul{margin:0 0 2mm;padding:0;list-style:none}
.bul li{margin:0 0 1mm;padding-left:3mm;position:relative;font-size:8.3pt;color:#3D5568}
.bul li:before{content:'•';position:absolute;left:0;color:${TEAL};font-weight:700}
table{border-collapse:collapse;width:100%;font-size:7.5pt;margin:0 0 2.5mm}
th{text-align:left;font-size:6.4pt;letter-spacing:.06em;text-transform:uppercase;color:#fff;background:${NAVY};padding:1.6mm 2mm;border:.35px solid ${NAVY}}
td{padding:1.5mm 2mm;border:.35px solid ${LINE};vertical-align:top;color:#3D5568;background:#fff}
tr:nth-child(even) td{background:${BG}}
tr{break-inside:avoid}thead{display:table-header-group}
.sm{font-size:7.2pt;color:${MUT}}
.footnote{margin-top:4mm;padding-top:2mm;border-top:1.2px solid ${TEAL};font-size:7.3pt;color:${MUT}}
.footnote b{color:${INK}}
.tone-pos{color:${PR};font-weight:700}.tone-neg{color:${CR};font-weight:700}.tone-neu{color:${NW};font-weight:700}
.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:2mm;margin:0 0 2.5mm}
.metrics>div{border:.6px solid ${LINE};border-radius:3px;padding:2mm 2.2mm;background:#fff}
.metrics .n{font-size:11pt;font-weight:700;line-height:1.1;color:${INK}}
.metrics .l{font-size:6.4pt;color:${MUT};text-transform:uppercase;letter-spacing:.03em;margin-top:.5mm}
.metrics .a{font-size:7pt;color:#3D5568;margin-top:.8mm}
.hbar{display:grid;grid-template-columns:28mm 1fr 32mm;align-items:center;gap:2mm;margin:0 0 1.3mm}
.hbar .hl{font-size:7.4pt;color:#3D5568;text-align:right;overflow:hidden;white-space:nowrap}
.track{height:7px;background:#E7EEF3;border-radius:2px;overflow:hidden}
.fill{height:100%;border-radius:2px}
.hbar .hn{font-size:7.2pt;font-weight:700;color:${INK}}
.stack{display:flex;height:10px;border-radius:2px;overflow:hidden;background:#E7EEF3}
.stack>div{height:100%}
.legend{display:flex;flex-wrap:wrap;gap:3mm;margin-top:1.2mm;font-size:7pt;color:#3D5568}
.legend i{display:inline-block;width:7px;height:7px;border-radius:1px;margin-right:1mm;vertical-align:middle}
.chartbox{border:.6px solid ${LINE};border-radius:3px;padding:2.5mm;background:#fff;margin:0 0 2.5mm;break-inside:avoid;page-break-inside:avoid}
.metrics{break-inside:avoid;page-break-inside:avoid}
.chartbox h4{margin:0 0 .4mm;font-size:8pt;color:${NAVY}}
.chartbox p{margin:0 0 2mm}
.charts{display:grid;grid-template-columns:1.3fr .7fr;gap:2.5mm;margin:0 0 2.5mm}
.tl{display:flex;align-items:flex-end;gap:1px;height:22mm;border-bottom:.6px solid ${LINE}}
.tlc{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;min-width:0}
.tlb{width:70%;background:#6366f1;border-radius:1px 1px 0 0;min-height:1px}
.tlc span{font-size:5.5pt;color:${MUT};margin-top:.4mm}
.donutwrap{display:flex;align-items:center;gap:3mm}
.addr{border:.6px solid ${LINE};border-left:3px solid ${NAVY};background:#fff;padding:2.4mm 3mm;margin:0 0 3mm}
.addr .who{font-size:11pt;font-weight:700;color:${INK};margin:.4mm 0}
.addr .l{font-size:7pt;letter-spacing:.08em;color:${MUT};font-weight:700}
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

const metric = (n, label, action) => `<div><div class="n">${esc(String(n))}</div><div class="l">${esc(label)}</div>${action ? `<div class="a">${esc(action)}</div>` : ''}</div>`;

const buildReportHtml = ({ summary, keywordData, tenantName, analysis, headquarters }) => {
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
    stats.date_range?.start && stats.date_range?.end
      ? `${new Date(stats.date_range.start).toLocaleDateString('en-GB')} – ${new Date(stats.date_range.end).toLocaleDateString('en-GB')}`
      : '—';
  const tenant = (tenantName || 'DIGITAL INTELLIGENCE PLATFORM').toUpperCase();
  const hq = headquarters || null;
  const hqHtml = hq
    ? `<div class="addr">
        <div class="l">ADDRESSED TO THE STATE HEADQUARTERS</div>
        <div class="who">The ${esc(hq.head)}, ${esc(hq.force)}</div>
        <div>${esc(hq.addressLine)}</div>
        ${hq.phone ? `<div class="sm">${esc(hq.phone)}</div>` : ''}
        <p class="sm">${esc(hq.note)} ${hq.official ? 'Taken from the official police page.' : 'The official home page did not print this street, so the agency record is cited.'} ${hq.sources.map((s) => `${esc(s.label)}: ${esc(s.url)}`).join(' · ')}</p>
      </div>`
    : `<div class="addr">
        <div class="l">ADDRESSED TO THE STATE HEADQUARTERS</div>
        <div class="who">${esc(tenant)}</div>
        <p class="sm">No verified headquarters record matched this account. No city or street is added.</p>
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
      when: e.posted_at ? new Date(e.posted_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—',
      eng: likes + comments * 2 + shares * 3 + Math.floor(views / 10),
    };
  });

  // Geographic penetration: places named inside posts. The state name is kept, but it does not hide a city or site.
  const placeMap = {};
  ev.forEach((e) => {
    const named = e.specific.length ? e.specific : e.places;
    named.forEach((d) => {
      placeMap[d] = placeMap[d] || { count: 0, sample: null };
      placeMap[d].count += 1;
      if (!placeMap[d].sample) placeMap[d].sample = e;
    });
  });
  const places = Object.entries(placeMap)
    .map(([name, info]) => ({ name, count: info.count, sample: info.sample }))
    .sort((a, b) => b.count - a.count);

  const visits = ev
    .filter((e) => e.specific.length || e.isVisit)
    .sort((a, b) => String(b.posted_at || '').localeCompare(String(a.posted_at || '')));

  const critical = ev
    .filter((e) => e.sentK === 'negative' || ['critical', 'high'].includes(String(e.risk_level || '').toLowerCase()))
    .sort((a, b) => b.eng - a.eng);

  // Amplifiers / authors
  const authors = {};
  ev.forEach((e) => {
    const key = `${e.plat}|${e.author}`;
    authors[key] = authors[key] || { author: e.author, platform: e.plat, count: 0, eng: 0, sample: e.text };
    authors[key].count += 1;
    authors[key].eng += e.eng;
  });
  const promoters = Object.values(authors)
    .sort((a, b) => b.eng - a.eng || b.count - a.count)
    .slice(0, 20);

  // Targets from entity classification (tenant/event data — not hardcoded orgs)
  const entities = Object.entries(stats.target_classification || {})
    .map(([k, v]) => ({ name: k, total: n0(v.total), praise: n0(v.praise), news: n0(v.news), crit: n0(v.criticism) }))
    .filter((e) => e.total > 0)
    .sort((a, b) => b.total - a.total);

  // Top monitored keywords by volume (dynamic per event)
  const topKwA = kws[0] || null;
  const topKwB = kws[1] || null;

  const findings = (analysis?.keyFindings || []).slice(0, 6);
  const narratives = (analysis?.narratives || []).slice(0, 5);
  const actions = (analysis?.actions || []).slice(0, 5);

  const platStr = platformEntries.map(([k, v]) => `${platLabel(k)}: ${fmt(v)}`).join(', ') || '—';
  const kwStr = kws.slice(0, 14).map((k) => k.keyword).join(', ') || (event.keywords || []).map((k) => (k.keyword || k)).join(', ') || '—';

  const placeLabel = (e) => (e.specific.length ? e.specific.join(', ') : e.places.length ? e.places.join(', ') : 'Not named in the post');
  const postRef = (e) => (e.citationTag ? e.citationTag : `Post #${e.n}`);

  const activityPosts = ev.filter((e) => e.isVisit);
  const activityRows = (activityPosts.length ? activityPosts : ev)
    .map(
      (e) => `<tr>
<td>${esc(postRef(e))}</td>
<td>${esc(e.when)}</td>
<td>${esc(placeLabel(e))}</td>
<td>${esc(platLabel(e.plat))}</td>
<td>${esc(e.author)}</td>
<td class="tone-${e.sentK || 'neu'}">${esc(toneLabel(e.sentK))}</td>
<td>${esc(clip(e.text, 140))}</td>
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
<td>${esc(postRef(e))}</td>
<td>${esc(e.when)}</td>
<td>${esc(placeLabel(e))}</td>
<td>${esc(platLabel(e.plat))}</td>
<td>${esc(e.author)}</td>
<td>${esc(clip(e.text, 120))}</td>
</tr>`
        )
        .join('')
    : `<tr><td colspan="6">No post in this set names a place or a field activity.</td></tr>`;

  const placeRows = places.length
    ? places
        .map(
          (d) => `<tr>
<td>${esc(d.name)}</td>
<td>${fmt(d.count)}</td>
<td>${esc(clip(d.sample?.text || '', 110))}</td>
</tr>`
        )
        .join('')
    : `<tr><td colspan="3">No place names matched in the cited evidence sample.${event.location ? ` Event location: ${esc(event.location)}.` : ''}</td></tr>`;

  const critRows = critical.length
    ? critical
        .map(
          (e) => `<tr>
<td>${esc(postRef(e))}</td>
<td>${esc(placeLabel(e))}</td>
<td>${esc(platLabel(e.plat))}</td>
<td>${esc(e.author)}</td>
<td class="tone-neg">${esc(toneLabel(e.sentK) === '—' ? 'Negative' : toneLabel(e.sentK))}</td>
<td>${esc(clip(e.text, 130))}</td>
</tr>`
        )
        .join('')
    : `<tr><td colspan="6">No negative or high-risk posts in this evidence set.</td></tr>`;

  const promoterRows = promoters
    .map(
      (a) => `<tr>
<td>${esc(platLabel(a.platform))}</td>
<td>${esc(a.author)}</td>
<td>${fmt(a.count)}</td>
<td>${fmt(a.eng)}</td>
<td>${esc(clip(a.sample, 90))}</td>
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

  const narrHtml = narratives.length
    ? `<ul class="bul">${narratives
        .map(
          (n) =>
            `<li><b>${esc(n.title)}</b> — ${esc(clip(n.discussed, 220))}${n.tone ? ` <span class="sm">(${esc(clip(n.tone, 80))})</span>` : ''}</li>`
        )
        .join('')}</ul>`
    : analysis?.situation
      ? `<p class="lead">${esc(analysis.situation)}</p>`
      : `<p class="sm">Narrative briefing will appear after summary generation.</p>`;

  const findingsHtml = findings.length
    ? `<ul class="bul">${findings.map((f) => `<li><b>${esc(f.headline)}</b> — ${esc(f.detail)}</li>`).join('')}</ul>`
    : '';

  const actionsHtml = actions.length
    ? `<ul class="bul">${actions.map((a) => `<li><b>${esc(a.action)}</b> — ${esc(a.detail)}</li>`).join('')}</ul>`
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

  const body = `
<section class="pg">
  <div class="hero">
    <div class="eyebrow">${esc(tenant)} · CRIME BRANCH BRIEF FOR THE ${esc((hq?.head || 'DGP').toUpperCase())}</div>
    <h1>${esc(event.name || 'Event')}</h1>
    <div class="sub">${esc(event.location || 'Location not specified')} · Each row below is a monitored post used as evidence</div>
    <div class="meta">
      <span>MONITORING WINDOW<b>${esc(windowStr)}</b></span>
      <span>GENERATED<b>${esc(dateStr)}</b></span>
      <span>POSTS ANALYSED<b>${fmt(total)}</b></span>
      <span>CITED EVIDENCE<b>${fmt(ev.length)}</b></span>
    </div>
  </div>
  ${hqHtml}

  <div class="kpi">
    <div><div class="n">${fmt(total)}</div><div class="l">Total posts</div></div>
    <div><div class="n">${esc(lead ? platLabel(lead[0]) : '—')}</div><div class="l">Lead platform</div></div>
    <div><div class="n">${fmt(places.length)}</div><div class="l">Places covered</div></div>
    <div><div class="n">${fmt(sent.negative)}</div><div class="l">Negative</div></div>
    <div><div class="n">${fmt(engTotal)}</div><div class="l">Engagement</div></div>
  </div>

  <div class="kpi">
    <div><div class="n">${pct(sent.positive, sentTotal)}</div><div class="l">Positive</div></div>
    <div><div class="n">${pct(sent.neutral, sentTotal)}</div><div class="l">Neutral</div></div>
    <div><div class="n">${pct(sent.negative, sentTotal)}</div><div class="l">Negative share</div></div>
    <div><div class="n">${fmt(topKwA ? n0(topKwA.total_posts) : 0)}</div><div class="l">${esc(topKwA ? clip(topKwA.keyword, 22) : 'Top keyword')}</div></div>
    <div><div class="n">${fmt(topKwB ? n0(topKwB.total_posts) : visits.length)}</div><div class="l">${esc(topKwB ? clip(topKwB.keyword, 22) : 'Field activity')}</div></div>
  </div>

  <p class="sm"><b>Platforms:</b> ${esc(platStr)}</p>
  <p class="sm"><b>Keywords:</b> ${esc(clip(kwStr, 280))}</p>

  <div class="charts">
    <div class="chartbox">
      <h4>Posts by platform</h4>
      <p class="sm">Bar length is post count. Colours match the Event Summary screen.</p>
      ${platformBars || '<p class="sm">No platform split.</p>'}
      <div style="margin-top:2mm">${stackBar(briefSent)}</div>
    </div>
    <div class="chartbox">
      <h4>Share of voice</h4>
      <p class="sm">Proportion of keyword mentions. Same donut as Analyses.</p>
      ${sovParts.length ? `<div class="donutwrap">${donutSvg(sovParts, fmt(matchTotal), 'Matches')}<div class="legend" style="flex-direction:column;gap:1mm">${sovParts.map((p) => `<span><i style="background:${p.c}"></i>${esc(clip(p.k, 28))} ${fmt(p.v)}</span>`).join('')}</div></div>` : '<p class="sm">No keyword split for this event.</p>'}
    </div>
  </div>
  <div class="charts">
    <div class="chartbox">
      <h4>Mentions volume by keyword</h4>
      <p class="sm">Indigo bars, same as Analyses. Length is posts.</p>
      ${keywordBars || '<p class="sm">No keyword split for this event.</p>'}
    </div>
    <div class="chartbox">
      <h4>Mentions timeline</h4>
      <p class="sm">Daily volume by publication date. Same indigo series as Analyses.</p>
      ${timelineChart(kwa?.timeline_overall)}
    </div>
  </div>
  ${keywordStacks ? `<div class="chartbox"><h4>Sentiment by keyword</h4><p class="sm">Green = positive, sky blue = neutral news, rose = negative. Same stack as Analyses.</p><div class="legend"><span><i style="background:${POS}"></i>Positive</span><span><i style="background:${NEU}"></i>Neutral</span><span><i style="background:${NEG}"></i>Negative</span></div>${keywordStacks}</div>` : ''}

  ${analysis?.bottomLine ? `<p class="lead"><b>Bottom line.</b> ${esc(analysis.bottomLine)}</p>` : ''}
  ${findingsHtml}

  <div class="sec"><span class="no">01.</span><span class="nm">Activity analysis</span></div>
  <div class="metrics">
    ${metric(fmt(activityPosts.length), 'Activity posts', 'Open posts that name a bandh, rally, meeting, or blockade')}
    ${metric(fmt(total), 'Posts in window', 'Denominator for every share below')}
    ${metric(lead ? platLabel(lead[0]) : '—', 'Lead platform', lead ? `${fmt(lead[1])} posts, ${pct(lead[1], total)}` : 'No platform split')}
    ${metric(fmt(engTotal), 'Engagement', 'Likes + shares + comments')}
  </div>
  <p class="sm">Campaigns, meetings, protests, bandhs, rallies, and programmes named in the posts.</p>
  ${activityBrief ? `<ul class="bul">${activityBrief}</ul>` : narrHtml}
  <table>
    <thead><tr><th>Post</th><th>When</th><th>Place in the post</th><th>Platform</th><th>Author</th><th>Tone</th><th>Evidence</th></tr></thead>
    <tbody>${activityRows || '<tr><td colspan="7">No activity posts in this set.</td></tr>'}</tbody>
  </table>

  <div class="sec"><span class="no">02.</span><span class="nm">Recent movement / presence</span></div>
  <div class="metrics">
    ${metric(fmt(visits.length), 'Presence posts', 'Count a presence only when the post names a site')}
    ${metric(fmt(places.length), 'Places named', topPlace ? `Highest: ${topPlace.name}` : 'None named')}
    ${metric(topPlace ? fmt(topPlace.count) : '0', 'Posts at top place', topPlace ? topPlace.name : '—')}
    ${metric(fmt(visits.filter((e) => e.specific.length).length), 'With a specific site', 'State name alone is not a site')}
  </div>
  <p class="sm">Where a post says someone was present, or names a site of a rally, meeting, protest, or blockade. A blank place means the post did not name one.</p>
  ${(analysis?.presence || []).length ? `<ul class="bul">${analysis.presence.map((p) => `<li><b>${esc(p.who)}</b>${p.place ? ` at ${esc(p.place)}` : ''}${p.posts?.length ? ` <span class="sm">${esc(p.posts.map((n) => `[Post #${n}]`).join(' '))}</span>` : ''}</li>`).join('')}</ul>` : ''}
  <table>
    <thead><tr><th>Post</th><th>When</th><th>Place named</th><th>Platform</th><th>Author</th><th>Evidence</th></tr></thead>
    <tbody>${visitRows}</tbody>
  </table>

  <div class="sec"><span class="no">03.</span><span class="nm">Geographic penetration</span></div>
  <div class="chartbox">
    <h4>Posts by place named in the text</h4>
    ${places.slice(0, 8).map((d) => hbar(d.name, d.count, places[0]?.count || 1, NAVY, pct(d.count, ev.length || 1))).join('') || '<p class="sm">No place named inside a post.</p>'}
  </div>
  <p class="sm"><b>${fmt(places.length)}</b> place${places.length === 1 ? '' : 's'} written in the posts. These are cities, sites, highways, and institutions from the text, not only the event’s state.</p>
  ${(analysis?.geography || []).length ? `<ul class="bul">${analysis.geography.map((g) => `<li><b>${esc(g.place)}</b> — ${esc(g.note || '')} ${g.posts?.length ? `<span class="sm">${esc(g.posts.map((n) => `[Post #${n}]`).join(' '))}</span>` : ''}</li>`).join('')}</ul>` : ''}
  <table>
    <thead><tr><th>Place</th><th>Posts</th><th>Evidence</th></tr></thead>
    <tbody>${placeRows}</tbody>
  </table>
</section>

<section class="pg">
  <div class="sec"><span class="no">04.</span><span class="nm">Popularity / sentiment</span></div>
  <div class="kpi">
    <div><div class="n tone-pos">${fmt(sent.positive)}</div><div class="l">Positive (${pct(sent.positive, sentTotal)})</div></div>
    <div><div class="n tone-neu">${fmt(sent.neutral)}</div><div class="l">Neutral (${pct(sent.neutral, sentTotal)})</div></div>
    <div><div class="n tone-neg">${fmt(sent.negative)}</div><div class="l">Negative (${pct(sent.negative, sentTotal)})</div></div>
    <div><div class="n">${fmt(sent.positive + sent.neutral + sent.negative)}</div><div class="l">Analysed for tone</div></div>
    <div><div class="n">${fmt(total)}</div><div class="l">Total posts</div></div>
  </div>
  <div class="chartbox">
    <h4>Tone split</h4>
    <div class="donutwrap">${donutSvg(briefSent, pct(sent.negative, sentTotal), 'Negative')}<div style="flex:1">${stackBar(briefSent)}</div></div>
    <p class="sm" style="margin-top:2mm">${
      sent.neutral >= sent.positive && sent.neutral >= sent.negative
        ? 'Majority neutral. Treat negative share as the criticism load, not as a threat by itself.'
        : sent.negative >= sent.positive
          ? 'Negative tone is the largest share. Read section 05 before any public-order judgement.'
          : 'Positive tone is the largest share.'
    } Action: quote these percentages, do not recompute them.</p>
  </div>

  <div class="sec"><span class="no">05.</span><span class="nm">Critical comment tracking</span></div>
  <div class="metrics">
    ${metric(fmt(critical.length), 'Critical rows', 'Read high and critical rows before ordinary criticism')}
    ${metric(pct(sent.negative, sentTotal), 'Negative share', `${fmt(sent.negative)} of ${fmt(sentTotal)} toned posts`)}
    ${metric(fmt(highRiskN), 'High or critical risk', 'Separate from ordinary criticism')}
    ${metric(fmt(n0(riskCounts.medium)), 'Medium risk', 'Review after the high band')}
  </div>
  <div class="chartbox"><h4>Risk bands</h4>${stackBar(riskParts)}</div>
  <p class="sm">Every negative or high-risk post in this evidence set, with the account that posted it.</p>
  <table>
    <thead><tr><th>Post</th><th>Place</th><th>Platform</th><th>Account</th><th>Tone</th><th>Evidence</th></tr></thead>
    <tbody>${critRows}</tbody>
  </table>
  ${analysis?.publicOrder ? `<p><b>Public order.</b> ${esc(analysis.publicOrder)}</p>` : ''}

  <div class="sec"><span class="no">06.</span><span class="nm">Active leaders / representatives</span></div>
  <div class="metrics">
    ${metric(fmt(entities.length), 'Entities classified', 'Who the posts are about')}
    ${metric(topEntity ? fmt(topEntity.total) : '0', topEntity ? topEntity.name : 'Top entity', topEntity ? `${pct(topEntity.crit, topEntity.total)} negative` : '—')}
    ${metric(fmt((analysis?.leaders || []).length), 'People named', 'Only names written in posts')}
    ${metric(fmt(sent.negative), 'Negative posts', 'See which entity carries them')}
  </div>
  ${entityBars ? `<div class="chartbox"><h4>Tone by entity</h4><p class="sm">Same stacked bar as the Event Summary screen. Green positive, slate neutral, red negative.</p><div class="legend"><span><i style="background:${PR}"></i>Positive</span><span><i style="background:${NW}"></i>Neutral</span><span><i style="background:${CR}"></i>Negative</span></div>${entityBars}</div>` : ''}
  ${
    entities.length
      ? `<table>
    <thead><tr><th>Target / entity</th><th>Posts</th><th>Positive</th><th>Neutral</th><th>Negative</th></tr></thead>
    <tbody>${entityRows}</tbody>
  </table>`
      : '<p class="sm">Entity classification not available for this event.</p>'
  }
  ${(analysis?.leaders || []).length ? `<ul class="bul">${analysis.leaders.map((l) => `<li><b>${esc(l.name)}</b>${l.role ? ` — ${esc(l.role)}` : ''}${l.posts?.length ? ` <span class="sm">${esc(l.posts.map((n) => `[Post #${n}]`).join(' '))}</span>` : ''}</li>`).join('')}</ul>` : ''}
  ${analysis?.platformsCommentary ? `<p>${esc(analysis.platformsCommentary)}</p>` : ''}

  <div class="sec"><span class="no">07.</span><span class="nm">Influencer ecosystem</span></div>
  <div class="metrics">
    ${metric(fmt(promoters.length), 'Accounts listed', 'Ranked by stored engagement')}
    ${metric(topVoice ? fmt(topVoice.count) : '0', topVoice ? topVoice.author : 'Top account', topVoice ? platLabel(topVoice.platform) : '—')}
    ${metric(topVoice ? fmt(topVoice.eng) : '0', 'Top engagement score', 'Likes + 2×comments + 3×shares + views/10')}
    ${metric(fmt(eng.likes || 0), 'Likes', `${fmt(eng.shares || 0)} shares · ${fmt(eng.comments || 0)} comments`)}
  </div>
  <div class="chartbox">
    <h4>Amplifying accounts</h4>
    ${promoters.slice(0, 8).map((a) => hbar(a.author, a.eng, promoters[0]?.eng || 1, '#6366f1', `${a.count} posts`)).join('') || '<p class="sm">No accounts in this set.</p>'}
  </div>
  <p class="sm">Accounts ranked by how often they post in this set and by likes, comments, shares, and views stored on those posts.</p>
  ${(analysis?.amplifiers || []).length ? `<ul class="bul">${analysis.amplifiers.map((a) => `<li><b>${esc(a.account)}</b> — ${esc(a.why || '')}${a.posts?.length ? ` <span class="sm">${esc(a.posts.map((n) => `[Post #${n}]`).join(' '))}</span>` : ''}</li>`).join('')}</ul>` : ''}
  <table>
    <thead><tr><th>Platform</th><th>Account</th><th>Posts</th><th>Eng. score</th><th>Sample</th></tr></thead>
    <tbody>${promoterRows || '<tr><td colspan="5">No amplifier data in cited evidence.</td></tr>'}</tbody>
  </table>

  <div class="sec"><span class="no">08.</span><span class="nm">Evidence register</span></div>
  <div class="metrics">
    ${metric(fmt(ev.length), 'Posts in this brief', 'Every row below is one monitored post')}
    ${metric(fmt(ev.filter((e) => e.posted_at).length), 'With a publication time', 'Undated posts stay in the register')}
    ${metric(fmt(sent.negative), 'Negative tone', `${pct(sent.negative, sentTotal)} of toned posts`)}
    ${metric(fmt(places.length), 'Places named', topPlace ? `Lead site: ${topPlace.name}` : 'None named in the text')}
  </div>
  <p class="sm">All ${fmt(ev.length)} posts used for this brief. Post numbers match the citations above.</p>
  <table>
    <thead><tr><th>Post</th><th>When</th><th>Place</th><th>Platform</th><th>Account</th><th>Tone</th><th>Eng.</th><th>Text</th></tr></thead>
    <tbody>${ev.map((e) => `<tr>
<td>${esc(postRef(e))}</td>
<td>${esc(e.when)}</td>
<td>${esc(placeLabel(e))}</td>
<td>${esc(platLabel(e.plat))}</td>
<td>${esc(e.author)}</td>
<td class="tone-${e.sentK || 'neu'}">${esc(toneLabel(e.sentK))}</td>
<td>${fmt(e.eng)}</td>
<td>${esc(clip(e.text, 160))}</td>
</tr>`).join('') || '<tr><td colspan="8">No posts in this evidence set.</td></tr>'}</tbody>
  </table>

  ${actionsHtml ? `<div class="sec"><span class="no">09.</span><span class="nm">Recommended actions</span></div>${actionsHtml}` : ''}

  <div class="footnote">
    <b>Summary</b><br>
    • Addressee: ${hq ? esc(`${hq.head}, ${hq.force}, ${hq.addressLine}`) : 'No verified headquarters for this account'}.<br>
    • Tenant: ${esc(tenant)}. Event: ${esc(event.name || '—')}.<br>
    • Posts analysed from database: ${fmt(total)}. Cited evidence: ${fmt(ev.length)}.<br>
    • Platforms: ${esc(platStr)}.<br>
    • Places named in posts: ${fmt(places.length)}${places[0] ? `; highest volume in ${esc(places[0].name)}` : ''}.<br>
    • Sentiment (Positive / Neutral / Negative): ${fmt(sent.positive)} / ${fmt(sent.neutral)} / ${fmt(sent.negative)}.
  </div>
</section>
`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>${FONT_FACES}${CSS}</style></head><body>${body}</body></html>`;
};

module.exports = { buildReportHtml };
