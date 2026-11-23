/**
 * PROFILE BEHAVIOUR REPORT: the A4 PDF.
 * Built from the saved report only (no model call), rendered by the same Puppeteer renderer and
 * Noto fonts as the event report, so Hindi / Odia / other scripts in the evidence print correctly.
 */
const { fontFacesFor, FONT_STACK } = require('../../events/eventIntelligenceReport/template');
const { esc } = require('../../events/eventIntelligenceReport/render');
const { WEEKDAYS } = require('./behaviorFacts');

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

/** Escaped text with [P3] citations turned into small tags. */
const rich = (text) => esc(text || '').replace(/\[P(\d+)\]/g, '<span class="cite">P$1</span>');
const cites = (posts) => (posts && posts.length ? ` ${posts.map((n) => `<span class="cite">P${n}</span>`).join('')}` : '');
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

const section = (title, body) => (body ? `<section><h2>${esc(title)}</h2>${body}</section>` : '');
const para = (text) => (text ? `<p>${rich(text)}</p>` : '');

const bars = (values, labels, color) => {
  const max = Math.max(1, ...values);
  return `<div class="bars">${values.map((v, i) => `<div class="bar"><div class="fill" style="height:${Math.round((v / max) * 100)}%;background:${v ? color : LINE}"></div><div class="bl">${esc(labels[i])}</div></div>`).join('')}</div>`;
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
section{margin-top:12px;page-break-inside:avoid}
h2{font-size:10pt;margin:0 0 5px;padding-bottom:3px;border-bottom:1px solid ${LINE};color:${BRAND};text-transform:uppercase;letter-spacing:.06em}
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
.bars{display:flex;align-items:flex-end;gap:2px;height:62px;margin:4px 0 2px}
.bar{flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%}
.bar .fill{border-radius:2px 2px 0 0;min-height:1px}
.bar .bl{font-size:5.8pt;color:${MUTED};text-align:center;margin-top:2px}
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
.annex{page-break-before:always}
`;

/**
 * @param {object} data  getCachedBehaviorReport() result
 * @param {object} opts  { tenantLabel }
 */
const buildBehaviorReportHtml = (data, { tenantLabel = '' } = {}) => {
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
    ${kpi('Posts read', n(cov.read), cov.total_posts > cov.read ? `of ${n(cov.total_posts)} stored` : `${n(cov.analysed)} analysed`)}
    ${kpi('Period', `${cov.span_days || 0} days`, `${cov.first_post || '?'} → ${cov.last_post || '?'}`)}
    ${kpi('Posts a day', String(cadence.posts_per_day ?? 0), `${n(cadence.active_days)} active days`)}
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

  const pattern = `${para(r.posting_pattern)}
    <div class="grid2">
      <div><div class="muted">Posts by hour (${esc(tz)})</div>${bars(cadence.by_hour || Array(24).fill(0), Array.from({ length: 24 }, (_, h) => (h % 3 === 0 ? String(h) : '')), '#2563eb')}</div>
      <div><div class="muted">Posts by day of week</div>${bars(cadence.by_weekday || Array(7).fill(0), WEEKDAYS, '#0d9488')}</div>
    </div>`;

  const style = `${para(r.communication_style)}
    <div class="grid2">
      <div><div class="muted">Top hashtags</div>${chips(content.hashtags, (x) => `${x.tag} · ${x.count}`)}</div>
      <div><div class="muted">Most mentioned</div>${chips(content.mentions, (x) => `${x.handle} · ${x.count}`)}</div>
    </div>
    <div class="muted">${n(content.original)} original · ${n(content.shared)} shared · ${n(content.replies)} replies · ${n(content.with_media)} with photo/video · ${n(content.with_links)} with links · languages: ${esc((content.languages || []).map((l) => `${l.language} ${l.count}`).join(', ') || 'not detected')}</div>`;

  const notable = new Set((r.notable_posts || []).map((x) => x.post));
  const cited = new Set([
    ...notable,
    ...['behaviour_traits', 'themes', 'targets', 'risk_indicators', 'changes_over_time'].flatMap((k) => (r[k] || []).flatMap((x) => x.posts || [])),
  ]);
  const annexRows = ev.filter((e) => cited.has(e.n));
  const annex = annexRows.length ? `<section class="annex"><h2>Evidence: posts cited in this report</h2>
    <table class="ev"><tr><th style="width:6%">#</th><th style="width:15%">Posted</th><th style="width:15%">Reading</th><th>Post</th></tr>
    ${annexRows.map((e) => `<tr>
      <td class="no">P${e.n}</td>
      <td>${esc(e.posted_at ? fmtDateTime(e.posted_at, tz) : 'undated')}<div class="muted">${esc(platformLabel(e.platform))}${e.shared ? ' · shared' : e.reply ? ' · reply' : ''}</div></td>
      <td>${e.sentiment ? `<div>${esc(e.sentiment)}</div>` : '<div class="muted">not analysed</div>'}${e.risk_level ? `<div class="muted">risk ${esc(e.risk_level)} (${n(e.risk_score)})</div>` : ''}<div class="muted">${n(e.engagement?.likes)} likes · ${n(e.engagement?.shares)} shares</div></td>
      <td>${esc(e.text)}${e.english ? `<div class="en">EN: ${esc(e.english)}</div>` : ''}${notable.has(e.n) ? `<div class="en"><b>Why notable:</b> ${rich((r.notable_posts.find((x) => x.post === e.n) || {}).why)}</div>` : ''}${e.url ? `<div><a href="${esc(e.url)}">${esc(e.url)}</a></div>` : ''}</td>
    </tr>`).join('')}
    </table></section>` : '';

  const body = `
  <div class="head">
    <div>
      <div class="org">${esc(tenantLabel || 'Digital Intelligence')} · Profile behaviour report</div>
      <h1>${esc(f.profile?.name || 'Profile')}</h1>
      <div class="who">${esc(f.profile?.handle && f.profile.handle !== f.profile?.name ? f.profile.handle : '')}${f.profile?.platform_name ? ` · ${esc(f.profile.platform_name)}` : ''}</div>
      <div class="meta">Generated ${esc(fmtDateTime(data.generated_at, tz))}${data.generated_by?.name ? ` by ${esc(data.generated_by.name)}` : ''} · ${n(cov.read)} posts, ${esc(cov.first_post || '?')} to ${esc(cov.last_post || '?')}</div>
    </div>
    <div class="att"><div class="lbl">Attention</div><span class="val" style="background:${lvl.bg};color:${lvl.fg};border-color:${lvl.bd}">${esc(r.attention_level || 'Low')}</span></div>
  </div>
  ${data.llm_notice ? `<div class="notice">${esc(data.llm_notice)}</div>` : ''}
  <div class="bl-box">
    <div class="t">${rich(r.bottom_line)}</div>
    <div class="sub"><b>${esc(r.account_type || 'Unclear')}</b>${r.account_type_basis ? ` · ${rich(r.account_type_basis)}` : ''}</div>
    ${r.attention_reason ? `<div class="sub"><b>Why ${esc(r.attention_level || 'Low')}:</b> ${rich(r.attention_reason)}</div>` : ''}
  </div>
  ${kpis}
  <div class="grid2">
    ${section('Behaviour traits', traits)}
    ${section('Themes', themes)}
  </div>
  ${section('Tone', `${toneBar(sent)}${para(r.tone)}`)}
  ${section('Who the posts are about', targets)}
  ${section('Communication style', style)}
  ${section('Posting pattern', pattern)}
  ${section('Reach', para(r.influence))}
  ${section('Risk indicators', riskRows)}
  ${section('Changes over time', changes ? `<ul>${changes}</ul>` : '')}
  <div class="grid2">
    ${section('Watch points', (r.watch_points || []).length ? `<ul>${r.watch_points.map((w) => `<li>${rich(w)}</li>`).join('')}</ul>` : '')}
    ${section('Limitations', (r.limitations || []).length ? `<ul>${r.limitations.map((w) => `<li>${rich(w)}</li>`).join('')}</ul>` : '')}
  </div>
  <div class="foot">Analyst aid written from the account's public posts${data.summary_source === 'llm' ? ' with AI assistance' : ''}. Numbers are computed from the stored posts; P-numbers point to the evidence annex. Check the original posts before taking any action.</div>
  ${annex}`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>${fontFacesFor(body)}${CSS}</style></head><body>${body}</body></html>`;
};

module.exports = { buildBehaviorReportHtml };
