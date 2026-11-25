/**
 * PROFILE BEHAVIOUR REPORT (Tools → Profile Report): the A4 PDF.
 * Built from the saved report only (no model call), rendered by the same Puppeteer renderer and
 * Noto fonts as the event report, so Hindi / Odia / other scripts in the evidence print correctly.
 */
const { fontFacesFor, FONT_STACK } = require('../../events/eventIntelligenceReport/template');
const { esc } = require('../../events/eventIntelligenceReport/render');
const { WEEKDAYS, citedPostNumbers, foldText, sharesReported } = require('./reportFacts');

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';
const BRAND = '#12355b';
const LEVEL = {
  High: { bg: '#fee2e2', fg: '#b91c1c', bd: '#fca5a5' },
  Medium: { bg: '#fef3c7', fg: '#b45309', bd: '#fcd34d' },
  Low: { bg: '#dcfce7', fg: '#15803d', bd: '#86efac' },
};
const TONE = { positive: '#16a34a', neutral: '#94a3b8', negative: '#dc2626' };

/** Escaped text with [P3] citations turned into small tags (the report with evidence). */
const richCited = (text) => esc(text || '').replace(/\[P(\d+)\]/g, '<span class="cite">P$1</span>');
const citesTags = (posts) => (posts && posts.length ? ` ${posts.map((n) => `<span class="cite">P${n}</span>`).join('')}` : '');
const DANGLING = /\b(?:are|is|were|was|in|see|from|by|at|on|and|of|include|includes|including)\s*[.!?]?$/i;
/**
 * Escaped text with the [P3] citations taken out (the report without evidence: there is no list for them to point to).
 * A sentence that only exists to point at posts ("The most liked posts are [P2], [P5] and [P4].") would be left hanging,
 * so it is cut back to the part before its last semicolon, or dropped.
 */
// one citation "[P3]" or a group the model wrote: "[P1, P2]", "[P1, [P2], P3]"
const CITE_GROUP = /\s*\[(?:\s*\[?\s*P\d+\s*\]?\s*(?:,|;|and|&)?)+\]/gi;
const richPlain = (text) => {
  const sentences = String(text || '').match(/[^.!?]+(?:[.!?]+|$)\s*/g) || [];
  const kept = sentences.map((s) => {
    const rest = s.replace(CITE_GROUP, '');
    if (rest === s) return s;                                   // no citation in this sentence
    const tidy = rest.replace(/(?:\s*[,;:])+(?=\s*[.!?]|\s*$)/g, '').replace(/\s+/g, ' ').trim();
    if (!DANGLING.test(tidy.replace(/[\s,]+(?=[.!?]?$)/, ''))) return `${tidy} `;
    const cut = tidy.lastIndexOf(';');
    return cut > 3 ? `${tidy.slice(0, cut)}. ` : '';
  });
  return esc(kept.join('')).replace(/\s+([.,;:])/g, '$1').replace(/\s{2,}/g, ' ').trim();
};
const pill = (label, map) => {
  const c = map[label] || { bg: '#f1f5f9', fg: '#334155', bd: LINE };
  return `<span class="pill" style="background:${c.bg};color:${c.fg};border-color:${c.bd}">${esc(label)}</span>`;
};
const SEVERITY = LEVEL;
const EVIDENCE = {
  Observed: { bg: '#e0f2fe', fg: '#0369a1', bd: '#7dd3fc' },
  Likely: { bg: '#f1f5f9', fg: '#334155', bd: '#cbd5e1' },
  Unclear: { bg: '#fafaf9', fg: '#78716c', bd: '#d6d3d1' },
};
const ATTITUDE = {
  Supportive: { bg: '#dcfce7', fg: '#15803d', bd: '#86efac' },
  Critical: { bg: '#ffedd5', fg: '#c2410c', bd: '#fdba74' },
  Hostile: { bg: '#fee2e2', fg: '#b91c1c', bd: '#fca5a5' },
  Neutral: { bg: '#f1f5f9', fg: '#334155', bd: '#cbd5e1' },
  Mixed: { bg: '#ede9fe', fg: '#6d28d9', bd: '#c4b5fd' },
};

const fmtDateTime = (iso, timeZone) => {
  try {
    return new Intl.DateTimeFormat('en-IN', { timeZone, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  } catch (e) {
    return String(iso || '');
  }
};
const n = (v) => Number(v || 0).toLocaleString('en-IN');
/** "2022-05-23" (a calendar day already in the report's timezone) as "23 May 2022". */
const dayLabel = (day) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ''));
  if (!m) return day ? String(day) : '?';
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])));
};

/**
 * What a post says, each sentence once. A post with only a picture shows the text read from it, labelled as such;
 * an English line that repeats the post or its image text is left out.
 */
const bodyOf = (e) => {
  const text = String(e.text || '').trim();
  const image = String(e.image_text || '').trim();
  const scene = String(e.scene || '').trim();
  const english = String(e.english || '').trim();
  const showEnglish = english && foldText(english) !== foldText(text) && foldText(english) !== foldText(image);
  const en = showEnglish ? `<div class="en">EN: ${esc(english)}</div>` : '';
  const seen = (e.picture_signals || []).length ? `<div class="en"><b>Seen in the picture:</b> ${esc(e.picture_signals.join(' · '))}</div>` : '';
  const pic = scene && foldText(scene) !== foldText(text) && foldText(scene) !== foldText(image) ? `<div class="en">Picture: ${esc(scene)}</div>${seen}` : seen;
  if (!text && image) return `<div><span class="tag">Image post</span> ${esc(image)}</div>${en}${pic}`;
  if (!text && pic) return `<div><span class="tag">Image post</span> <span class="muted">no caption, no text on the picture</span></div>${pic}${en}`;
  const imageLine = image && foldText(image) !== foldText(text) ? `<div class="en">Image text: ${esc(image)}</div>` : '';
  return `<div>${esc(text || '(no caption)')}</div>${en}${imageLine}${pic}`;
};

const short = (s, max) => {
  const chars = Array.from(String(s || '').replace(/\s+/g, ' ').trim());
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : chars.join('');
};

/** How a post is meant (the close reading), or, for posts read before readings existed, the classifier's own note. */
const wordSet = (t) => new Set(foldText(t).split(' ').filter((w) => w.length > 2));
/** Share of the shorter text's words that the other also has (0 to 1). */
const wordShare = (a, b) => {
  const x = wordSet(a);
  const y = wordSet(b);
  if (!x.size || !y.size) return 0;
  let common = 0;
  x.forEach((w) => { if (y.has(w)) common += 1; });
  return common / Math.min(x.size, y.size);
};
const readingOf = (e) => {
  if (e.meaning) {
    // for a plain photo the reading only restates the picture line above it; a joke is always worth saying
    return !/^joke:/i.test(e.meaning) && e.scene && wordShare(e.meaning, e.scene) >= 0.75 ? '' : e.meaning;
  }
  return e.sentiment && e.summary && foldText(e.summary) !== foldText(e.text) ? e.summary : '';
};

/** "12 likes · 3 comments · 4 shares", leaving shares out where the platform does not publish them. */
const responseOf = (e) => {
  const g = e.engagement || {};
  const shares = e.shares_reported === undefined ? sharesReported(e.platform) : e.shares_reported;
  return `${n(g.likes)} likes · ${n(g.comments)} comments${shares ? ` · ${n(g.shares)} shares` : ''}`;
};

const section = (title, body) => (body ? `<section><h2>${esc(title)}</h2>${body}</section>` : '');

/** A small column chart; each column carries its count so a handful of posts can be read without guessing. */
const bars = (values, labels, color) => {
  const max = Math.max(1, ...values);
  return `<div class="bars">${values.map((v, i) => `<div class="bar"><div class="bv">${v || ''}</div><div class="fill" style="height:${Math.round((v / max) * 66)}%;background:${v ? color : LINE}"></div><div class="bl">${esc(labels[i])}</div></div>`).join('')}</div>`;
};

/** Posts per month (or quarter, or year) over the whole period, with a few dates under it and the longest silence in words. */
const timelineChart = (cadence) => {
  const tl = cadence && cadence.timeline;
  if (!tl || !Array.isArray(tl.buckets) || tl.buckets.length < 2) return '';
  const total = tl.buckets.length;
  const max = Math.max(1, ...tl.buckets.map((b) => b.posts));
  const columns = tl.buckets.map((b) => `<div class="tbar"><div class="tv">${b.posts || ''}</div><div class="tfill" style="height:${Math.round((b.posts / max) * 66)}%;background:${b.posts ? '#7c3aed' : LINE}"></div></div>`).join('');
  const startsYear = (b) => (tl.unit === 'month' ? b.key.endsWith('-01') : tl.unit === 'quarter' ? b.key.endsWith('Q1') : true);
  const at = (i) => ((i + 0.5) / total) * 100;
  const ticks = [{ i: 0, text: tl.buckets[0].label }, { i: total - 1, text: tl.buckets[total - 1].label }];
  tl.buckets.forEach((b, i) => {
    if (i > 0 && i < total - 1 && startsYear(b) && at(i) - at(0) > 11 && at(total - 1) - at(i) > 11) ticks.push({ i, text: b.key.slice(0, 4) });
  });
  const axis = ticks.map((t) => `<span style="left:${Math.min(94, Math.max(6, at(t.i))).toFixed(1)}%">${esc(t.text)}</span>`).join('');
  const gap = cadence.longest_gap;
  const caption = [
    `Posts per ${tl.unit}`,
    `posted in ${n(tl.active)} of ${n(total)} ${tl.unit}s`,
    tl.peak ? `busiest ${tl.peak.label} (${n(tl.peak.posts)} posts)` : '',
    gap && gap.days >= 30 ? `longest silence ${n(gap.days)} days (${dayLabel(gap.from)} → ${dayLabel(gap.to)})` : '',
  ].filter(Boolean).join(' · ');
  return `<div class="muted">${esc(caption)}</div><div class="tl">${columns}</div><div class="tax">${axis}</div>`;
};

const PLATFORMS = { x: 'X', twitter: 'X', facebook: 'Facebook', instagram: 'Instagram', youtube: 'YouTube', telegram: 'Telegram', reddit: 'Reddit' };
const platformLabel = (p) => PLATFORMS[String(p || '').toLowerCase()] || p || '';

const toneBar = (s) => {
  const total = (s.positive || 0) + (s.neutral || 0) + (s.negative || 0);
  if (!total) return '<p class="muted">No analysed posts yet.</p>';
  const seg = (k) => (s[k] ? `<div style="width:${(s[k] / total) * 100}%;background:${TONE[k]}"></div>` : '');
  return `<div class="stack">${seg('positive')}${seg('neutral')}${seg('negative')}</div>
    <div class="legend"><span><i style="background:${TONE.positive}"></i>Positive ${n(s.positive)}</span><span><i style="background:${TONE.neutral}"></i>Neutral ${n(s.neutral)}</span><span><i style="background:${TONE.negative}"></i>Negative ${n(s.negative)}</span></div>`;
};

const CSS = `
@page{size:A4}
*{box-sizing:border-box}
body{margin:0;font-family:'Helvetica Neue',Arial,${FONT_STACK},sans-serif;color:${INK};font-size:8.8pt;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.head{background:${BRAND};color:#fff;border-radius:6px;padding:12px 14px;display:flex;justify-content:space-between;gap:12px}
.head .org{font-size:7pt;letter-spacing:.12em;text-transform:uppercase;opacity:.8}
.head h1{margin:2px 0 4px;font-size:15pt;letter-spacing:.01em}
.head .who{font-size:10pt;font-weight:600}
.head .meta{font-size:7.5pt;opacity:.85;margin-top:3px}
.att{align-self:flex-start;text-align:right}
.att .lbl{font-size:7pt;text-transform:uppercase;letter-spacing:.1em;opacity:.85}
.att .val{display:inline-block;margin-top:3px;padding:3px 10px;border-radius:999px;font-weight:700;font-size:10pt;border:1px solid}
.notice{margin-top:8px;padding:6px 9px;border:1px solid #fcd34d;background:#fffbeb;color:#92400e;border-radius:5px;font-size:8pt}
.bl-box{margin-top:10px;border:1px solid ${LINE};border-left:4px solid ${BRAND};border-radius:5px;padding:8px 11px;background:#f8fafc}
.bl-box .t{font-size:10pt;line-height:1.5}
.bl-box .sub{margin-top:5px;color:${MUTED};font-size:8pt}
.kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-top:10px}
.kpi{border:1px solid ${LINE};border-radius:5px;padding:6px 7px}
.kpi .k{font-size:6.8pt;color:${MUTED};text-transform:uppercase;letter-spacing:.06em}
.kpi .v{font-size:11.5pt;font-weight:700;margin-top:1px}
.kpi .s{font-size:7pt;color:${MUTED}}
section{margin-top:12px}
.grid2,.tl,.tax,.bars,.item,.kpis,.bl-box,.chips,.stack,.legend{page-break-inside:avoid;break-inside:avoid}
h2{font-size:10pt;margin:0 0 5px;padding-bottom:3px;border-bottom:1px solid ${LINE};color:${BRAND};text-transform:uppercase;letter-spacing:.06em;break-after:avoid;page-break-after:avoid}
p{margin:0 0 5px}
.muted{color:${MUTED}}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
table{width:100%;border-collapse:collapse}
th{font-size:7pt;text-transform:uppercase;letter-spacing:.06em;color:${MUTED};text-align:left;padding:4px 5px;border-bottom:1px solid ${LINE}}
td{padding:5px;border-bottom:1px solid ${LINE};vertical-align:top}
tr{page-break-inside:avoid}
.pill{display:inline-block;border:1px solid;border-radius:999px;padding:0 6px;font-size:7pt;font-weight:600;white-space:nowrap}
.cite{display:inline-block;margin-left:2px;padding:0 3px;border-radius:3px;background:#eef2ff;color:#4338ca;font-size:6.8pt;font-weight:700;vertical-align:1px}
.item{padding:5px 0;border-bottom:1px solid ${LINE}}
.item:last-child{border-bottom:0}
.item .h{font-weight:700}
.bars{display:flex;align-items:flex-end;gap:2px;height:76px;margin:4px 0 2px}
.bar{flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%}
.bar .fill{border-radius:2px 2px 0 0;min-height:1px}
.bar .bv{font-size:6pt;color:${INK};text-align:center;line-height:8px;height:8px}
.bar .bl{font-size:5.8pt;color:${MUTED};text-align:center;margin-top:2px;line-height:8px;height:8px}
.tl{display:flex;align-items:flex-end;gap:1px;height:74px;margin-top:4px}
.tbar{flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%}
.tbar .tv{font-size:5.4pt;color:${INK};text-align:center;line-height:7px;height:7px}
.tbar .tfill{min-height:1px;border-radius:1px 1px 0 0}
.tax{position:relative;height:12px;margin-top:2px}
.tax span{position:absolute;transform:translateX(-50%);font-size:6.2pt;color:${MUTED};white-space:nowrap}
.stack{display:flex;height:9px;border-radius:5px;overflow:hidden;margin:3px 0}
.legend{display:flex;gap:12px;font-size:7.5pt;color:${MUTED}}
.legend i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:4px;vertical-align:-1px}
.chips span{display:inline-block;margin:0 4px 4px 0;padding:1px 7px;border-radius:999px;background:#f1f5f9;border:1px solid ${LINE};font-size:7.5pt}
ul{margin:0;padding-left:15px}
li{margin-bottom:3px}
.ev td{font-size:8pt}
.ev .no{font-weight:700;color:#4338ca;white-space:nowrap}
.ev .en{color:${MUTED};margin-top:2px}
.ev a{color:#1d4ed8;text-decoration:none;word-break:break-all;font-size:7pt}
.foot{margin-top:14px;padding-top:6px;border-top:1px solid ${LINE};color:${MUTED};font-size:7.5pt}
.annex{margin-top:16px;page-break-inside:auto}
.ev thead{display:table-header-group}
.tag{display:inline-block;margin-right:4px;padding:0 5px;border-radius:3px;background:#ede9fe;color:#6d28d9;font-size:6.8pt;font-weight:700;vertical-align:1px}
`;

/**
 * Two versions of the same report, like the event report's "Full Report with Evidence" and "Executive Summary":
 *   with evidence    (default)  every cited post is listed and linked, and [P#] citations point to that list
 *   without evidence            the assessment on its own: no post list and no citation tags
 * @param {object} data  getCachedBehaviorReport() result
 * @param {object} opts  { tenantLabel, includeEvidence }
 */
const buildBehaviorReportHtml = (data, { tenantLabel = '', includeEvidence = true } = {}) => {
  const rich = includeEvidence ? richCited : richPlain;
  const cites = includeEvidence ? citesTags : () => '';
  const para = (text) => { const t = text ? rich(text) : ''; return t ? `<p>${t}</p>` : ''; };
  const r = data.report || {};
  const f = data.facts || {};
  const ev = data.evidence || [];
  const tz = f.timezone || 'Asia/Kolkata';
  const cov = f.coverage || {};
  const lvl = LEVEL[r.attention_level] || LEVEL.Low;
  const sent = f.sentiment || {};
  const analysedN = (sent.positive || 0) + (sent.neutral || 0) + (sent.negative || 0);
  const risk = f.risk || {};
  const cadence = f.cadence || {};
  const content = f.content || {};

  const kpi = (k, v, s = '') => `<div class="kpi"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div>${s ? `<div class="s">${esc(s)}</div>` : ''}</div>`;
  const kpis = `<div class="kpis">
    ${kpi('Posts collected', n(cov.read), `${n(cov.analysed)} analysed${cov.no_text ? ` · ${n(cov.no_text)} no text` : ''}${cov.waiting ? ` · ${n(cov.waiting)} waiting` : ''}`)}
    ${kpi('Period', cov.span_label || `${cov.span_days || 0} days`, `${dayLabel(cov.first_post)} → ${dayLabel(cov.last_post)}`)}
    ${kpi(`Posts a ${cadence.rate?.unit || 'day'}`, String(cadence.rate ? cadence.rate.value : (cadence.posts_per_day ?? 0)), `${n(cadence.active_days)} active days`)}
    ${kpi('Engagement a post', n(f.engagement?.avg_score), `average · median ${n(f.engagement?.median_score)}`)}
    ${kpi('Negative', `${analysedN ? Math.round(((sent.negative || 0) / analysedN) * 100) : 0}%`, `${n(sent.negative)} of ${n(analysedN)}`)}
    ${kpi('Serious risk', n((risk.critical || 0) + (risk.high || 0)), `${n(risk.medium)} medium`)}
  </div>`;

  const traits = (r.behaviour_traits || []).map((t) => `<div class="item"><span class="h">${esc(t.trait)}</span> ${pill(t.evidence_level, EVIDENCE)}<div>${rich(t.detail)}${cites(t.posts)}</div></div>`).join('');
  const themes = (r.themes || []).map((t) => `<div class="item"><span class="h">${esc(t.theme)}</span> ${pill(t.share, {})}<div>${rich(t.detail)}${cites(t.posts)}</div></div>`).join('');
  const targets = (r.targets || []).length ? `<table><tr><th style="width:26%">Named in posts</th><th style="width:14%">Attitude</th><th>What the posts say</th></tr>${r.targets.map((t) => `<tr><td><b>${esc(t.target)}</b></td><td>${pill(t.attitude, ATTITUDE)}</td><td>${rich(t.detail)}${cites(t.posts)}</td></tr>`).join('')}</table>` : '';
  const riskRows = (r.risk_indicators || []).length
    ? `<table><tr><th style="width:26%">Indicator</th><th style="width:12%">Severity</th><th>Detail</th></tr>${r.risk_indicators.map((x) => `<tr><td><b>${esc(x.indicator)}</b></td><td>${pill(x.severity, SEVERITY)}</td><td>${rich(x.detail)}${cites(x.posts)}</td></tr>`).join('')}</table>`
    : '<p class="muted">No explicit risk indicator (threat, incitement, call for a bandh or blockade, doxxing) in the posts read.</p>';
  const changes = (r.changes_over_time || []).map((c) => `<li>${rich(c.from)} <b>→</b> ${rich(c.to)}${cites(c.posts)}</li>`).join('');
  const chips = (items, fmt) => (items && items.length ? `<div class="chips">${items.map((x) => `<span>${esc(fmt(x))}</span>`).join('')}</div>` : '<p class="muted">None.</p>');

  const byPlatform = (f.by_platform || []).length > 1
    ? `${para(r.platform_differences)}<table><tr><th>Platform</th><th>Posts</th><th>Negative</th><th>Serious risk</th><th>Engagement a post</th><th>Period</th></tr>${f.by_platform.map((p) => `<tr><td><b>${esc(platformLabel(p.platform))}</b></td><td>${n(p.posts)}</td><td>${p.negative_share}% of ${n(p.analysed)}</td><td>${n(p.high_risk)}</td><td>${n(p.avg_engagement)}</td><td>${esc(dayLabel(p.first_post))} → ${esc(dayLabel(p.last_post))}</td></tr>`).join('')}</table>`
    : '';

  const pattern = `${para(r.posting_pattern)}
    ${timelineChart(cadence)}
    <div class="grid2">
      <div><div class="muted">Posts by hour (${esc(tz)})</div>${bars(cadence.by_hour || Array(24).fill(0), Array.from({ length: 24 }, (_, h) => (h % 3 === 0 ? String(h) : '')), '#2563eb')}</div>
      <div><div class="muted">Posts by day of week</div>${bars(cadence.by_weekday || Array(7).fill(0), WEEKDAYS, '#0d9488')}</div>
    </div>`;

  const style = `${para(r.communication_style)}
    <div class="grid2">
      <div><div class="muted">Top hashtags</div>${chips(content.hashtags, (x) => `${x.tag} · ${x.count}`)}</div>
      <div><div class="muted">Most mentioned</div>${chips(content.mentions, (x) => `${x.handle} · ${x.count}`)}</div>
    </div>
    ${(content.pictures?.terms || []).length ? `<div class="muted">What the pictures show (${n(content.pictures.described)} of ${n(content.pictures.with_pictures)} pictures described)</div>${chips(content.pictures.terms, (x) => `${x.term} · ${x.count}`)}` : ''}
    ${(content.pictures?.signals || []).length ? `<div class="muted">Flagged in pictures (flags, symbols, weapons, crowds ...)</div>${chips(content.pictures.signals, (x) => `${x.term} · ${x.count}`)}` : ''}
    ${(content.tones || []).length ? `<div class="muted">How the posts are meant (${n(content.read_in_context)} of ${n(cov.read)} read in context)</div>${chips(content.tones, (x) => `${x.term} · ${x.count}`)}` : ''}
    <div class="muted">${n(content.original)} original · ${n(content.shared)} shared · ${n(content.replies)} replies · ${n(content.with_media)} with photo/video · ${n(content.with_links)} with links · languages: ${esc((content.languages || []).map((l) => `${l.language} ${l.count}`).join(', ') || 'not detected')}</div>`;

  // what the model says it cannot show, then what the numbers do not cover (posts without text, still waiting, no share counts)
  const limitations = [...(r.limitations || []), ...(cov.notes || [])].filter((x, i, all) => x && all.indexOf(x) === i);
  const notable = new Set((r.notable_posts || []).map((x) => x.post));
  const cited = citedPostNumbers(r);
  // A small profile lists every post it has something to read for; a large one lists the posts the report cites.
  const everyPost = Number.isFinite(cov.usable) && ev.length >= cov.usable && ev.length <= 60;
  const annexRows = everyPost ? ev : ev.filter((e) => cited.has(e.n));
  const annexNote = everyPost && cov.no_text ? `<p class="muted">Not listed: ${n(cov.no_text)} ${cov.no_text === 1 ? 'post' : 'posts'} with no caption and nothing readable in the picture.</p>` : '';
  const annex = includeEvidence && annexRows.length ? `<section class="annex"><h2>${everyPost ? `Evidence: all ${n(annexRows.length)} posts read` : 'Evidence: posts cited in this report'}</h2>${annexNote}
    <table class="ev"><thead><tr><th style="width:6%">#</th><th style="width:15%">Posted</th><th style="width:17%">Reading</th><th>Post</th></tr></thead><tbody>
    ${annexRows.map((e) => `<tr>
      <td class="no">P${e.n}</td>
      <td>${esc(e.posted_at ? fmtDateTime(e.posted_at, tz) : 'undated')}<div class="muted">${esc(platformLabel(e.platform))}${e.shared ? ' · shared' : e.reply ? ' · reply' : ''}</div></td>
      <td>${e.sentiment ? `<div>${esc(e.sentiment)}</div>` : '<div class="muted">not analysed</div>'}${e.tone ? `<div class="muted">${esc(e.tone)}</div>` : ''}${e.risk_level ? `<div class="muted">risk ${esc(e.risk_level)} (${n(e.risk_score)})</div>` : ''}<div class="muted">${esc(responseOf(e))}</div></td>
      <td>${bodyOf(e)}${readingOf(e) ? `<div class="en"><b>Reading:</b> ${esc(short(readingOf(e), 280))}</div>` : ''}${notable.has(e.n) ? `<div class="en"><b>Why notable:</b> ${rich((r.notable_posts.find((x) => x.post === e.n) || {}).why)}</div>` : ''}${e.url ? `<div><a href="${esc(e.url)}">${esc(e.url)}</a></div>` : ''}</td>
    </tr>`).join('')}
    </tbody></table></section>` : '';

  const body = `
  <div class="head">
    <div>
      <div class="org">${esc(tenantLabel || 'Digital Intelligence')} · Profile behaviour report${includeEvidence ? '' : ' · Executive summary'}</div>
      <h1>${esc(f.profile?.name || 'Profile')}</h1>
      <div class="who">${esc(f.profile?.handle && f.profile.handle !== f.profile?.name ? f.profile.handle : '')}${f.profile?.platform_name ? ` · ${esc(f.profile.platform_name)}` : ''}</div>
      <div class="meta">Generated ${esc(fmtDateTime(data.generated_at, tz))}${data.generated_by?.name ? ` by ${esc(data.generated_by.name)}` : ''} · ${n(cov.read)} posts, ${esc(dayLabel(cov.first_post))} to ${esc(dayLabel(cov.last_post))}</div>
    </div>
    <div class="att"><div class="lbl">Attention</div><span class="val" style="background:${lvl.bg};color:${lvl.fg};border-color:${lvl.bd}">${esc(r.attention_level || 'Low')}</span></div>
  </div>
  ${data.llm_notice ? `<div class="notice">${esc(data.llm_notice)}</div>` : ''}
  <div class="bl-box">
    <div class="t">${rich(r.bottom_line)}</div>
    <div class="sub"><b>${esc(r.account_type || 'Unclear')}</b>${r.account_type_basis ? ` · ${rich(r.account_type_basis)}` : ''}</div>
    ${r.attention_reason ? `<div class="sub"><b>Why ${esc(r.attention_level || 'Low')}:</b> ${rich(r.attention_reason)}</div>` : ''}
    ${r.regional_link ? `<div class="sub"><b>Regional link:</b> ${rich(r.regional_link)}</div>` : ''}
  </div>
  ${kpis}
  <div class="grid2">
    ${section('Behaviour traits', traits)}
    ${section('Themes', themes)}
  </div>
  ${section('Tone', `${toneBar(sent)}${para(r.tone)}`)}
  ${section('Who the posts are about', targets)}
  ${section('Communication style', style)}
  ${section('By platform', byPlatform)}
  ${section('Posting pattern', pattern)}
  ${section('Reach', para(r.influence))}
  ${section('Risk indicators', riskRows)}
  ${section('Changes over time', changes ? `<ul>${changes}</ul>` : '')}
  <div class="grid2">
    ${section('Watch points', (r.watch_points || []).length ? `<ul>${r.watch_points.map((w) => `<li>${rich(w)}</li>`).join('')}</ul>` : '')}
    ${section('Limitations', limitations.length ? `<ul>${limitations.map((w) => `<li>${rich(w)}</li>`).join('')}</ul>` : '')}
  </div>
  <div class="foot">Analyst aid written from the account's public posts${data.summary_source === 'llm' ? ' with AI assistance' : ''}. ${includeEvidence
    ? 'Numbers are computed from the stored posts; P-numbers point to the evidence annex. Check the original posts before taking any action.'
    : 'Numbers are computed from the stored posts. This summary leaves out the post-by-post evidence; the full report with evidence lists and links every post. Check the original posts before taking any action.'}</div>
  ${annex}`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>${fontFacesFor(body)}${CSS}</style></head><body>${body}</body></html>`;
};

module.exports = { buildBehaviorReportHtml, __test: { richPlain } };
