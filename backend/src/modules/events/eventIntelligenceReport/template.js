/**
 * HTML template for the Event Intelligence & Social Analytics PDF.
 * Story flow: SEE → UNDERSTAND → CONNECT → MEASURE → VERIFY → DETECT → ALERT → DRILL DOWN.
 *
 * Rules: every number comes from the supplied data. Nothing is estimated. When data is missing
 * a section says what is missing instead of inventing a value. Each metric is tagged:
 *   REPORTED = value taken as-is from the platform, DERIVED = calculated here from reported values,
 *   OBSERVATION = AI/editorial reading (LLM narrative).
 */
const fs = require('fs');
const path = require('path');
const { esc } = require('./render');

// Embed Noto fonts so Hindi / Odia post text is shaped correctly on any server (no reliance on system fonts).
const fontFace = (family, file) => {
  try {
    const b64 = fs.readFileSync(path.join(__dirname, 'fonts', file)).toString('base64');
    return `@font-face{font-family:'${family}';src:url(data:font/ttf;base64,${b64}) format('truetype');font-weight:100 900;}`;
  } catch (e) {
    return '';
  }
};
const FONT_FACES = fontFace('Report Devanagari', 'NotoSansDevanagari-Regular.ttf') + fontFace('Report Oriya', 'NotoSansOriya-Regular.ttf');

const PR = '#1F9D6B', NW = '#6C8EBF', CR = '#D9483B';
const XC = '#1E2A44', YC = '#E0A030', FC = '#2A8FA8', IND = '#3B4CCA', INK = '#0B1220', MUT = '#5B6474';
const PLATFORM_COLORS = { x: XC, twitter: XC, youtube: YC, facebook: FC, instagram: '#C13584', telegram: '#2AABEE', whatsapp: '#25D366' };
const PLATFORM_LABELS = { x: 'X', twitter: 'X', youtube: 'YouTube', facebook: 'Facebook', instagram: 'Instagram', telegram: 'Telegram', whatsapp: 'WhatsApp' };

const n0 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const fmt = (v) => n0(v).toLocaleString('en-US');
const pct = (a, b, d = 1) => (n0(b) > 0 ? `${((100 * n0(a)) / n0(b)).toFixed(d)}%` : '0%');
const platLabel = (k) => PLATFORM_LABELS[String(k).toLowerCase()] || String(k).charAt(0).toUpperCase() + String(k).slice(1);
const platColor = (k) => PLATFORM_COLORS[String(k).toLowerCase()] || '#7A8499';

const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" style="display:block">${body}</svg>`;
const txt = (x, y, s, size = 10, fill = INK, anchor = 'start', weight = 400) =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}" font-family="Helvetica Neue,Arial,'Report Devanagari','Report Oriya',sans-serif">${esc(s)}</text>`;

const stack = (x, y, w, h, parts, minLab = 26, size = 9) => {
  const live = parts.filter((p) => p.v > 0);
  const tot = live.reduce((s, p) => s + p.v, 0);
  if (!tot) return '';
  let cx = x;
  let out = '';
  for (const p of live) {
    const ww = (w * p.v) / tot;
    out += `<rect x="${cx.toFixed(1)}" y="${y}" width="${Math.max(ww - 1, 0.5).toFixed(1)}" height="${h}" fill="${p.c}"/>`;
    if (ww >= minLab) out += txt((cx + ww / 2).toFixed(1), y + h / 2 + size / 3, p.label ?? p.v, size, '#fff', 'middle', 700);
    cx += ww;
  }
  return out;
};

const tag = (k) => {
  const m = {
    R: ['REPORTED', '#E6EEFA', '#2B4C8C'],
    D: ['DERIVED', '#E7F5EE', '#17734F'],
    O: ['AI READING', '#FFF1DC', '#8A5A00'],
    C: ['CONFLICT', '#FCE5E2', '#A32A20'],
  }[k];
  return `<span class="tag" style="background:${m[1]};color:${m[2]}">${m[0]}</span>`;
};

const legend = (items) =>
  `<div class="legend">${items.map(([c, l]) => `<span><i style="background:${c}"></i>${esc(l)}</span>`).join('')}</div>`;

// ---------------- markdown-lite for the LLM narrative ----------------
const stripEmoji = (s) => String(s).replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}️‍]/gu, '').trim();
const inline = (s) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<i>$2</i>')
    .replace(/\[Post #(\d+)\]/g, '<a class="cite" href="#ev-$1">[Post #$1]</a>');
const mdToHtml = (md) => {
  const lines = String(md || '').split(/\r?\n/);
  let html = '';
  let list = null;
  const close = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { close(); continue; }
    const b = line.match(/^[-*•]\s+(.*)$/);
    const o = line.match(/^\d+[.)]\s+(.*)$/);
    if (b) { if (list !== 'ul') { close(); html += '<ul>'; list = 'ul'; } html += `<li>${inline(b[1])}</li>`; }
    else if (o) { if (list !== 'ol') { close(); html += '<ol>'; list = 'ol'; } html += `<li>${inline(o[1])}</li>`; }
    else { close(); html += `<p>${inline(line)}</p>`; }
  }
  close();
  return html;
};
const splitSections = (md) => {
  const parts = String(md || '').split(/^#{2,4}\s+/m).map((s) => s.trim()).filter(Boolean);
  return parts.map((p) => {
    const nl = p.indexOf('\n');
    const title = stripEmoji(nl === -1 ? p : p.slice(0, nl)).replace(/^\d+\.\s*/, '');
    return { title, body: nl === -1 ? '' : p.slice(nl + 1) };
  });
};

const CSS = `
*{box-sizing:border-box}
body{margin:0;font-family:'Helvetica Neue',Arial,'Report Devanagari','Report Oriya','Noto Sans','Noto Sans Devanagari','Noto Sans Oriya','Noto Sans Telugu',sans-serif;color:${INK};font-size:8.6pt;line-height:1.42;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pg{break-before:page}
.pg:first-of-type{break-before:auto}
.rh{background:#0B1220;color:#9FB0CC;font-size:6pt;letter-spacing:.12em;display:flex;justify-content:space-between;align-items:center;padding:1.6mm 3mm;border-radius:2px;margin:0 0 3mm}
.rh b{color:#fff}.rb{display:flex;gap:2.2mm;white-space:nowrap}.rb span{color:#5D6C88}.rb span.on{color:#fff;font-weight:700;border-bottom:1.2px solid #7C8CFF}
.sec{font-size:6.6pt;letter-spacing:.16em;color:#3B4CCA;font-weight:700;text-transform:uppercase}
.chip{display:inline-block;border:.5px solid #C5CDE0;background:#F5F7FB;border-radius:8px;padding:.3mm 1.8mm;margin:0 1mm 1mm 0;font-size:7pt}
.nar{border:.6px solid #D5DBE6;border-radius:3px;overflow:hidden;margin-bottom:2.6mm;display:grid;grid-template-columns:2.2mm 1fr;break-inside:avoid}
.nar>div:last-child{padding:2.4mm 3.5mm}
.nar .row{display:grid;grid-template-columns:27mm 1fr;gap:2mm;font-size:7.9pt;margin-top:.8mm}
.nar .row span:first-child{color:#5B6474;font-size:6.4pt;text-transform:uppercase;letter-spacing:.06em;padding-top:.3mm}
.stg{display:flex;align-items:baseline;gap:3mm;border-bottom:2px solid ${INK};padding-bottom:1.5mm;margin:0 0 3mm}
.stg b{font-size:16pt;color:${IND}}.stg .nm{font-size:12pt;font-weight:700;letter-spacing:.09em}.stg .qq{font-size:8.4pt;color:${MUT}}
h1{font-size:15pt;line-height:1.15;margin:0 0 1.5mm;letter-spacing:-.01em}
h2{font-size:10pt;margin:0 0 1.5mm}h3{font-size:8.6pt;margin:0 0 1mm}
p{margin:0 0 1.6mm}
.lead{font-size:9.8pt;color:#26304A;margin-bottom:3mm}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin-bottom:3mm}
.card{border:.6px solid #D5DBE6;border-radius:3px;padding:3mm 3.5mm;background:#fff;break-inside:avoid;margin-bottom:3mm}
.g2>*{min-width:0}.g2 .card{margin-bottom:0}.kpi>*{min-width:0}svg{max-width:100%}
.card.soft{background:#F5F7FB;border-color:#E3E8F1}
.q{margin:0 0 1.2mm;font-size:7.4pt;color:${MUT};font-style:italic}
.call{border-left:3px solid ${IND};background:#EEF1FD;padding:2.6mm 3.5mm;margin:0 0 3mm;border-radius:0 3px 3px 0;break-inside:avoid}
.call.warn{border-color:${CR};background:#FDEFED}.call.amb{border-color:${YC};background:#FFF7E8}.call.grn{border-color:${PR};background:#EAF7F1}
.tag{font-size:5.6pt;font-weight:700;letter-spacing:.08em;padding:.5mm 1.4mm;border-radius:2px;margin-right:1.5mm;vertical-align:1px;white-space:nowrap}
.kpi{display:grid;grid-template-columns:repeat(6,1fr);gap:2.4mm;margin:0 0 3.5mm}
.kpi>div{border:.6px solid #D5DBE6;border-radius:3px;padding:2.2mm 2.6mm;min-width:0}
.kpi .n{font-size:14pt;font-weight:700;letter-spacing:-.02em;line-height:1.1}
.kpi .l{font-size:6.2pt;color:${MUT};text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kpi .s{font-size:6.6pt;color:${MUT}}
table{border-collapse:collapse;width:100%;font-size:7.6pt}
th{text-align:left;font-size:6.4pt;letter-spacing:.07em;text-transform:uppercase;color:${MUT};border-bottom:1px solid ${INK};padding:1.2mm 1.5mm}
td{padding:1.4mm 1.5mm;border-bottom:.5px solid #E3E8F1;vertical-align:top}
tr{break-inside:avoid}thead{display:table-header-group}
td.r,th.r{text-align:right}
.legend{display:flex;gap:4mm;font-size:7.2pt;margin:1mm 0 1.5mm}
.legend i{display:inline-block;width:2.5mm;height:2.5mm;border-radius:1px;margin-right:1.2mm;vertical-align:-.3mm}
.find{display:grid;grid-template-columns:7mm 1fr;gap:2mm;padding:1.8mm 0;border-bottom:.5px solid #E3E8F1}
.find .no{font-size:12pt;font-weight:700;color:${IND};line-height:1}
.pill{display:inline-block;font-size:6.2pt;padding:.4mm 1.8mm;border-radius:8px;color:#fff;font-weight:700}
.sm{font-size:7.2pt;color:${MUT}}
.ev{font-size:7.6pt;color:#26304A}
a{color:${IND}}a.cite{text-decoration:none;font-weight:700}
.narr{border:.6px solid #D5DBE6;border-radius:3px;margin-bottom:3mm;display:grid;grid-template-columns:2.2mm 1fr;overflow:hidden;break-inside:avoid}
.narr>div:last-child{padding:2.6mm 3.5mm}
.narr p,.narr li{font-size:8.2pt;margin:0 0 1mm}.narr ul,.narr ol{margin:0 0 1mm;padding-left:4.5mm}
.hero{background:linear-gradient(120deg,#0B1220,#1B2A5C);color:#fff;border-radius:4px;padding:6mm 7mm;margin-bottom:3.5mm}
.st{display:inline-block;font-size:6pt;font-weight:700;letter-spacing:.06em;padding:.5mm 1.6mm;border-radius:2px;color:#fff}
.ac{border:.6px solid #D5DBE6;border-left-width:3px;border-radius:3px;padding:2.2mm 3mm;margin-bottom:2.2mm;break-inside:avoid}
`;

const NARRATIVE_COLORS = ['#3B4CCA', '#0E8A8A', '#8A4FBF', '#C77A12', '#C2456A', '#5B6474', '#4C9A2A'];

const stageHeader = (i, name, q, cont) =>
  `<div class="stg"><b>${String(i).padStart(2, '0')}</b><span class="nm">${name}</span><span class="qq">${esc(q)}${cont ? ' — continued' : ''}</span></div>`;

const sentimentOf = (c = {}) => ({
  positive: n0(c.positive ?? c.praise),
  neutral: n0(c.neutral ?? c.news),
  negative: n0(c.negative ?? c.criticism),
});

// ---------------- main builder ----------------
const STAGES = ['SEE', 'UNDERSTAND', 'CONNECT', 'MEASURE', 'VERIFY', 'DETECT', 'ALERT', 'DRILL DOWN'];
const platKey = (k) => { const s = String(k || '').toLowerCase(); return s === 'twitter' ? 'x' : s; };
const noPostLabel = (n) => `#${n}`;
const cite = (n) => `<a class="cite" href="#ev-${n}">#${n}</a>`;
const citeList = (arr) => (arr && arr.length ? arr.map(cite).join(', ') : '–');

const buildReportHtml = ({ summary, keywordData, tenantName, analysis }) => {
  const stats = summary?.stats || {};
  const event = summary?.event || {};
  const kwa = keywordData || null;
  const kws = (kwa?.keywords || []).filter((k) => n0(k.total_posts) > 0);
  const total = n0(stats.total_unique_posts || stats.total_media_count);
  const sent = sentimentOf(stats.sentiment_counts);
  const sentTotal = sent.positive + sent.neutral + sent.negative;
  const platformEntries = Object.entries(stats.platform_counts || {}).filter(([, v]) => n0(v) > 0).sort((a, b) => b[1] - a[1]);
  const risk = { critical: 0, high: 0, medium: 0, low: 0, ...(stats.risk_counts || {}) };
  const highRisk = n0(risk.critical) + n0(risk.high);
  const eng = kwa?.summary?.engagement || stats.total_engagement || {};
  const engTotal = n0(eng.total) || n0(eng.likes) + n0(eng.shares) + n0(eng.comments);
  const entities = Object.entries(stats.target_classification || {}).map(([k, v]) => ({
    name: k, total: n0(v.total), praise: n0(v.praise), news: n0(v.news), crit: n0(v.criticism),
  })).filter((e) => e.total > 0).sort((a, b) => b.total - a.total);
  const kwMatchSum = kws.reduce((s, k) => s + n0(k.total_posts), 0);
  const reportedMentions = n0(stats.total_keyword_mentions);
  const mentionsConflict = kws.length > 0 && reportedMentions > 0 && reportedMentions !== kwMatchSum;
  const timeline = kwa?.timeline_overall || [];
  const isFallback = summary?.summary_source === 'fallback';
  const generated = summary?.generated_at ? new Date(summary.generated_at) : new Date();
  const dateStr = generated.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const windowStr = stats.date_range?.start && stats.date_range?.end
    ? `${new Date(stats.date_range.start).toLocaleDateString('en-GB')} – ${new Date(stats.date_range.end).toLocaleDateString('en-GB')}`
    : 'not available';
  const lead = platformEntries[0];
  const topEntity = entities[0];
  const critTotal = entities.reduce((s, e) => s + e.crit, 0);
  const tenant = (tenantName || 'DIGITAL INTELLIGENCE PLATFORM').toUpperCase();

  // evidence + analysis
  const rawEv = summary?.evidence_traceability || [];
  const ev = rawEv.map((e, i) => {
    const n = (String(e.citationTag || '').match(/\d+/) || [i + 1])[0];
    const nn = Number(n);
    return { ...e, n: nn, plat: platKey(e.platform), narr: analysis?.postNarrative?.[nn] || null, sentK: (() => { const s = String(e.sentiment || '').toLowerCase(); return s.startsWith('pos') || s === 'praise' ? 'positive' : s.startsWith('neg') || s === 'criticism' ? 'negative' : 'neutral'; })() };
  });
  const N = analysis?.narratives || [];
  const hasN = N.length > 0;
  const ncol = (code) => NARRATIVE_COLORS[(code.charCodeAt(0) - 65) % NARRATIVE_COLORS.length];
  const evOf = (code) => ev.filter((e) => e.narr === code);
  const notAvail = (what) => `<div class="card"><p class="ev"><b>${what} — not available.</b> The AI analysis of the evidence posts could not be produced for this report (the language model was unavailable or returned no usable result). Regenerate the report to retry.</p></div>`;

  const pgWrap = (on, body) => {
    const rb = STAGES.map((s, i) => `<span class="${on.includes(i) ? 'on' : ''}">${i + 1} ${s}</span>`).join('');
    return `<section class="pg"><div class="rh"><span style="overflow:hidden;text-overflow:ellipsis;max-width:60mm"><b>${esc(tenant)}</b> &nbsp;·&nbsp; ${esc(String(event.name || 'EVENT').toUpperCase().slice(0, 26))}</span><div class="rb">${on.length ? rb : '<span class="on">EXECUTIVE BRIEF</span>'}</div></div>${body}</section>`;
  };
  const pages = [];

  // ================= 1. EXECUTIVE BRIEF =================
  const kpi = `<div class="kpi">
<div><div class="l">Unique posts</div><div class="n">${fmt(total)}</div><div class="s">${fmt(stats.relevant_posts_count)} event-relevant</div></div>
<div><div class="l">Lead platform</div><div class="n">${lead ? esc(platLabel(lead[0])) : '–'}</div><div class="s">${lead ? `${fmt(lead[1])} posts · ${pct(lead[1], total)}` : ''}</div></div>
<div><div class="l">Tone</div><div class="n" style="color:${NW}">${pct(sent.neutral, sentTotal, 0)}</div><div class="s">news · ${pct(sent.positive, sentTotal, 0)} praise · ${pct(sent.negative, sentTotal, 0)} crit.</div></div>
<div><div class="l">High/crit. risk</div><div class="n" style="color:${highRisk ? CR : PR}">${fmt(highRisk)}</div><div class="s">${fmt(risk.medium)} medium · ${fmt(risk.low)} low</div></div>
<div><div class="l">Engagement</div><div class="n">${fmt(engTotal)}</div><div class="s">${engTotal ? `${pct(eng.likes, engTotal)} likes` : 'not available'}</div></div>
<div><div class="l">Keyword matches</div><div class="n">${kws.length ? fmt(kwMatchSum) : '–'}</div><div class="s">${kws.length} keywords tracked</div></div></div>`;
  const findings = [];
  if (sentTotal) findings.push([`Tone is ${sent.neutral >= sent.positive && sent.neutral >= sent.negative ? 'mainly news and updates' : 'mixed'}.`, `${fmt(sent.neutral)} of ${fmt(sentTotal)} posts (${pct(sent.neutral, sentTotal)}) are neutral; praise is ${fmt(sent.positive)} (${pct(sent.positive, sentTotal)}) and criticism ${fmt(sent.negative)} (${pct(sent.negative, sentTotal)}).`, 'p.2']);
  if (lead) findings.push([`${platLabel(lead[0])} carries ${pct(lead[1], total)} of the volume.`, platformEntries.map(([k, v]) => `${platLabel(k)} ${fmt(v)} (${pct(v, total)})`).join(', ') + '.', 'p.2']);
  if (kws.length) findings.push([`“${kws[0].keyword}” is the highest-volume keyword.`, `${fmt(kws[0].total_posts)} matching posts (${pct(kws[0].total_posts, total)} of unique posts). Keyword counts overlap and are not additive.`, 'p.8']);
  if (topEntity) findings.push([`“${topEntity.name}” is the most common target of commentary.`, `${fmt(topEntity.total)} posts (${pct(topEntity.total, total)})${critTotal ? `; ${fmt(topEntity.crit)} of ${fmt(critTotal)} critical posts (${pct(topEntity.crit, critTotal)}) are aimed at it` : ''}.`, 'p.9']);
  findings.push([hasN ? `${N.length} narratives emerge from the evidence sample.` : 'Narratives could not be derived for this report.', hasN ? N.map((n) => n.title).join('; ') + '. Narrative volumes are not measured, so they are qualitative.' : 'The AI analysis of the evidence posts was unavailable.', 'p.3']);
  findings.push([highRisk ? `${fmt(highRisk)} posts carry a high or critical risk level.` : 'No high or critical risk posts were flagged.', `Risk is assessed separately from sentiment: ${fmt(risk.critical)} critical, ${fmt(risk.high)} high, ${fmt(risk.medium)} medium, ${fmt(risk.low)} low.`, 'p.15']);
  const findingsFinal = analysis?.keyFindings?.length ? analysis.keyFindings.map((k) => [k.headline, k.detail, '']) : findings;
  const findingsHtml = findingsFinal.map(([a, b, c], i) => `<div class="find"><div class="no">${i + 1}</div><div><b>${esc(a)}</b> <span class="sm">${c}</span><br><span class="ev">${esc(b)}</span></div></div>`).join('');
  const caveats = [];
  if (isFallback) caveats.push('The AI narrative is a rule-based fallback.');
  if (mentionsConflict) caveats.push(`<b>Keyword count conflict:</b> ${fmt(reportedMentions)} (Summary) vs ${fmt(kwMatchSum)} (sum of keyword-matching posts). Unresolved: see p.10.`);
  if (!kws.length) caveats.push('Keyword analytics were unavailable, so keyword sections are limited.');
  if (timeline.length < 2) caveats.push('No dated posts were available, so no timeline is shown.');
  caveats.push(`Evidence covers <b>${fmt(rawEv.length)} of ${fmt(total)}</b> posts and is a targeted sample.`);
  caveats.push('Narrative volumes and platform × sentiment are not supplied.');
  pages.push(pgWrap([], `<div class="hero">
<div style="font-size:6.6pt;letter-spacing:.18em;color:#9FB0CC">EVENT INTELLIGENCE &amp; SOCIAL ANALYTICS REPORT</div>
<div style="font-size:24pt;font-weight:700;letter-spacing:-.02em;margin:1.5mm 0 .5mm">${esc(event.name || 'Event')}</div>
<div style="font-size:9.5pt;color:#C9D4EA">${esc(event.location || 'Region not specified')} · ${esc((event.platforms || []).map(platLabel).join(', ') || 'Social platforms')}</div>
<div style="display:flex;gap:7mm;margin-top:4mm;font-size:7pt;color:#9FB0CC">
<span>MONITORING WINDOW<br><b style="color:#fff;font-size:8.4pt">${esc(windowStr)}</b></span><span>GENERATED<br><b style="color:#fff;font-size:8.4pt">${esc(dateStr)}</b></span>
<span>UNIQUE POSTS<br><b style="color:#fff;font-size:8.4pt">${fmt(total)}</b></span><span>CLASSIFICATION<br><b style="color:#fff;font-size:8.4pt">Restricted / Law Enforcement Only</b></span></div></div>
${kpi}
<div class="sec">Bottom line</div>
<p class="lead" style="margin-top:1mm">${analysis?.bottomLine ? esc(analysis.bottomLine) : `${sentTotal ? `The monitored conversation is ${sent.neutral >= sent.positive && sent.neutral >= sent.negative ? 'mainly factual and event-focused' : 'mixed in tone'}: ${pct(sent.neutral, sentTotal, 0)} news/updates, ${pct(sent.positive, sentTotal, 0)} praise, ${pct(sent.negative, sentTotal, 0)} criticism. ` : ''}${highRisk ? `${fmt(highRisk)} posts are flagged high or critical risk and need review.` : 'No high or critical risk posts were flagged.'}`} Read the caveats below before relying on any single figure.</p>
<div class="sec" style="margin-top:2mm">Key findings</div>${findingsHtml}
<div class="g2" style="margin-top:3.5mm"><div class="call amb" style="margin:0"><h3>Data caveats that affect interpretation</h3><div class="ev">${caveats.map((c) => `• ${c}`).join('<br>')}</div></div>
<div class="card soft"><h3>How to read the labels</h3><div class="ev" style="line-height:1.9">${tag('R')}value taken from the platform data<br>${tag('D')}calculated here from reported values<br>${tag('O')}AI reading of the sampled posts<br>${tag('C')}two values disagree</div></div></div>`));

  // ================= 2. SEE =================
  let pb = '';
  platformEntries.forEach(([k, v], i) => {
    const y = i * 26, bw = 210 * (v / platformEntries[0][1]);
    pb += txt(62, y + 16, platLabel(k), 10, INK, 'end') + `<rect x="68" y="${y + 3}" width="${bw.toFixed(1)}" height="17" rx="2" fill="${platColor(k)}"/>` + txt(68 + bw + 5, y + 16, `${fmt(v)} · ${pct(v, total)}`, 9.5, INK, 'start', 700);
  });
  const platSvg = svg(340, Math.max(platformEntries.length * 26, 26), pb);
  const sentSvg = svg(340, 34, stack(0, 2, 340, 28, [{ v: sent.positive, c: PR }, { v: sent.neutral, c: NW }, { v: sent.negative, c: CR }], 24, 10));
  const evSent = { positive: 0, neutral: 0, negative: 0 };
  ev.forEach((e) => { evSent[e.sentK] += 1; });
  const evTot = ev.length;
  const cmpSvg = evTot && sentTotal ? svg(340, 62,
    txt(0, 15, 'All posts', 8.5) + stack(80, 3, 260, 16, [{ v: sent.positive, c: PR, label: pct(sent.positive, sentTotal, 0) }, { v: sent.neutral, c: NW, label: pct(sent.neutral, sentTotal, 0) }, { v: sent.negative, c: CR, label: pct(sent.negative, sentTotal, 0) }], 20, 8) +
    txt(0, 45, 'Evidence sample', 8.5) + stack(80, 33, 260, 16, [{ v: evSent.positive, c: PR, label: pct(evSent.positive, evTot, 0) }, { v: evSent.neutral, c: NW, label: pct(evSent.neutral, evTot, 0) }, { v: evSent.negative, c: CR, label: pct(evSent.negative, evTot, 0) }], 20, 8)) : '';
  const evPlat = {};
  ev.forEach((e) => { evPlat[e.plat] = (evPlat[e.plat] || { positive: 0, neutral: 0, negative: 0 }); evPlat[e.plat][e.sentK] += 1; });
  const evPlatSvg = Object.keys(evPlat).length ? svg(500, Object.keys(evPlat).length * 30 + 2, Object.entries(evPlat).map(([p, c], i) => {
    const y = i * 30;
    return txt(70, y + 19, platLabel(p), 10, INK, 'end') + `<rect x="78" y="${y + 5}" width="8" height="18" fill="${platColor(p)}"/>` + stack(90, y + 5, 330, 18, [{ v: c.positive, c: PR }, { v: c.neutral, c: NW }, { v: c.negative, c: CR }], 14, 9) + txt(430, y + 19, `${c.positive + c.neutral + c.negative} cited`, 9, MUT);
  }).join('')) : '';
  let peaks = [];
  let timelineCard;
  if (timeline.length >= 2) {
    const W = 520, H = 120, pad = 18;
    const counts = timeline.map((d) => n0(d.count));
    const max = Math.max(...counts, 1);
    const bw = Math.max((W - pad) / timeline.length - 1, 1);
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const sd = Math.sqrt(counts.reduce((a, b) => a + (b - mean) ** 2, 0) / counts.length);
    let bars = '';
    timeline.forEach((d, i) => {
      const x = pad + i * ((W - pad) / timeline.length);
      let yy = H - 22;
      [[n0(d.negative), CR], [n0(d.neutral), NW], [n0(d.positive), PR]].forEach(([v, c]) => {
        const h = (v / max) * (H - 40);
        if (h > 0) { yy -= h; bars += `<rect x="${x.toFixed(1)}" y="${yy.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="${c}"/>`; }
      });
      if (n0(d.count) >= mean + 2 * sd && n0(d.count) >= 3) peaks.push(d);
    });
    bars += txt(pad, H - 8, timeline[0].date, 7.5, MUT) + txt(W, H - 8, timeline[timeline.length - 1].date, 7.5, MUT, 'end') + txt(0, 10, String(max), 7.5, MUT);
    const peakDay = timeline.reduce((a, b) => (n0(b.count) > n0(a.count) ? b : a));
    timelineCard = `<div class="card"><p class="q">How is the conversation changing over time? ${tag('R')}${tag('D')}</p><h2>Posts per day by sentiment</h2>${svg(W, H, bars)}${legend([[PR, 'Praise'], [NW, 'News'], [CR, 'Criticism']])}
<p class="sm">${timeline.length} dated days. Peak day <b>${esc(peakDay.date)}</b> (${fmt(peakDay.count)} posts). ${peaks.length ? `${peaks.length} day(s) exceed the mean by two standard deviations (derived spike rule, ≥3 posts).` : 'No day exceeds the mean by two standard deviations.'}</p></div>`;
  } else {
    timelineCard = `<div class="card"><p class="q">How is the conversation changing over time?</p><h2>Timeline: not available</h2><p class="ev">Fewer than two dated days were found, so posts-over-time is not drawn and no spike or decay is inferred. A per-post date is the most valuable data to add.</p></div>`;
  }
  pages.push(pgWrap([0], `${stageHeader(1, 'SEE', 'What is happening?')}<h1>Where the conversation happens and how it sounds</h1>
<div class="g2"><div class="card"><p class="q">Where is it happening? ${tag('R')}${tag('D')}</p><h2>Posts by platform</h2>${platSvg}<p class="sm">Shares calculated on ${fmt(total)} unique posts. Platform × sentiment is not supplied for all posts.</p></div>
<div class="card"><p class="q">What is the tone? ${tag('R')}${tag('D')}</p><h2>Sentiment of the ${fmt(sentTotal)} posts</h2>${sentSvg}${legend([[PR, `Praise ${fmt(sent.positive)}`], [NW, `News ${fmt(sent.neutral)}`], [CR, `Criticism ${fmt(sent.negative)}`]])}
<table><tr><th>Class</th><th class="r">Posts</th><th class="r">Share</th></tr><tr><td>Praise (positive)</td><td class="r">${fmt(sent.positive)}</td><td class="r">${pct(sent.positive, sentTotal)}</td></tr><tr><td>News / updates (neutral)</td><td class="r">${fmt(sent.neutral)}</td><td class="r">${pct(sent.neutral, sentTotal)}</td></tr><tr><td>Criticism (negative)</td><td class="r">${fmt(sent.negative)}</td><td class="r">${pct(sent.negative, sentTotal)}</td></tr></table></div></div>
<div class="call grn"><b>Reading.</b> ${sent.negative ? `Praise to criticism is ${(sent.positive / sent.negative).toFixed(1)} : 1` : `No criticism was recorded (${fmt(sent.positive)} praise posts)`} ${tag('D')}. Criticism is a measure of tone, not danger, and is kept separate from risk (p.15).</div>
${timelineCard}
<div class="g2">${cmpSvg ? `<div class="card"><p class="q">Is the evidence sample representative? ${tag('D')}</p><h2>All posts vs. cited evidence</h2>${cmpSvg}${legend([[PR, 'Praise'], [NW, 'News'], [CR, 'Criticism']])}<p class="sm">The sample favours high-risk, high-reach, critical and recent posts, so read it as examples, not proportions.</p></div>` : '<div></div>'}
${evPlatSvg ? `<div class="card"><p class="q">Which platform carries the critical voices? ${tag('D')}${tag('O')}</p><h2>Tone of cited posts, by platform</h2>${evPlatSvg}<p class="sm">Cited posts only; not generalisable to the full set.</p></div>` : '<div></div>'}</div>`));

  // ================= 3-4. UNDERSTAND =================
  const platsIn = [...new Set(ev.map((e) => e.plat))].slice(0, 4);
  let mx = '';
  if (hasN && platsIn.length) {
    const rh = 26, cx0 = 290, cw = 30;
    mx += txt(0, 12, 'Narrative', 7.5, MUT);
    platsIn.forEach((p, j) => { mx += txt(cx0 + j * cw, 12, platLabel(p), 7, MUT, 'middle'); });
    const tx = cx0 + platsIn.length * cw + 4;
    mx += txt(tx, 12, 'Tone of cited posts (source labels)', 7.5, MUT);
    N.forEach((n, i) => {
      const y = 18 + i * rh, es = evOf(n.code);
      mx += `<rect x="0" y="${y + 4}" width="4" height="${rh - 10}" fill="${ncol(n.code)}"/>` + txt(10, y + 17, `${n.code}. ${n.title.slice(0, 44)}`, 9);
      platsIn.forEach((p, j) => {
        const v = es.filter((e) => e.plat === p).length;
        if (v) mx += `<circle cx="${cx0 + j * cw}" cy="${y + 13}" r="${4.5 + v * 1.4}" fill="${platColor(p)}"/>` + txt(cx0 + j * cw, y + 16.5, v, 8.5, '#fff', 'middle', 700);
      });
      mx += stack(tx, y + 6, 520 - tx, 16, [{ v: es.filter((e) => e.sentK === 'positive').length, c: PR }, { v: es.filter((e) => e.sentK === 'neutral').length, c: NW }, { v: es.filter((e) => e.sentK === 'negative').length, c: CR }], 10, 9);
    });
    mx = svg(520, 18 + N.length * rh, mx);
  }
  const ncard = (n) => {
    const es = evOf(n.code);
    const platS = platsIn.map((p) => [p, es.filter((e) => e.plat === p).length]).filter(([, c]) => c).map(([p, c]) => `${platLabel(p)} ${c}`).join(' · ');
    const tone = `${es.filter((e) => e.sentK === 'positive').length} positive · ${es.filter((e) => e.sentK === 'neutral').length} neutral · ${es.filter((e) => e.sentK === 'negative').length} negative`;
    return `<div class="nar"><div style="background:${ncol(n.code)}"></div><div>
<div style="display:flex;justify-content:space-between;align-items:baseline"><h2 style="margin:0">${n.code}. ${esc(n.title)}</h2><span class="sm">${es.length} cited posts</span></div>
<div class="row"><span>What is discussed</span><span>${inline(n.discussed)}</span></div>
<div class="row"><span>Tone</span><span>${esc(n.tone || '–')}</span></div>
<div class="row"><span>Risk / sensitivity</span><span>${esc(n.risk || '–')}</span></div>
<div class="row"><span>Platforms · tone · evidence</span><span class="sm" style="color:#26304A">${esc(platS)} &nbsp;|&nbsp; ${tone} &nbsp;|&nbsp; <b>${citeList(n.posts)}</b></span></div></div></div>`;
  };
  // Text comes from the LLM's structured report when present (single source of content); markdown only for older summaries.
  const cites = (arr) => (arr && arr.length ? ' ' + arr.map((n) => `[Post #${n}]`).join('') : '');
  const briefSections = analysis && (analysis.situation || analysis.actions?.length)
    ? [
      { title: 'Situation & event scope', body: analysis.situation },
      { title: 'Social commentary & target sentiment', body: analysis.sentimentCommentary },
      { title: 'Public order & threat assessment (separated from criticism)', body: analysis.publicOrder },
      { title: 'Active platforms & distribution channels', body: analysis.platformsCommentary },
      { title: 'Recommended operational actions for authorities', body: (analysis.actions || []).map((a, i) => `${i + 1}. **${a.action}:** ${a.detail}${cites(a.posts)}`).join('\n') },
    ].filter((x) => x.body)
    : splitSections(summary?.summary);
  const briefCards = briefSections.map((s, i) => `<div class="narr"><div style="background:${NARRATIVE_COLORS[i % NARRATIVE_COLORS.length]}"></div><div><h2>${esc(s.title)}</h2>${mdToHtml(s.body)}</div></div>`).join('');
  pages.push(pgWrap([1], `${stageHeader(2, 'UNDERSTAND', 'What are the key issues and narratives?')}<h1>What people are talking about</h1>
<p class="lead">Narratives are read by the AI from the ${fmt(ev.length)} cited posts, one main narrative per post. Volumes are not measured, so treat them as qualitative intelligence ${tag('O')}. Bubble size means how well evidenced, not how big.</p>
${hasN ? `<div class="card"><p class="q">Which narratives, on which platforms, in what tone? ${tag('D')}${tag('O')}</p>${mx}</div>${N.slice(0, 3).map(ncard).join('')}` : notAvail('Narrative map')}`));
  pages.push(pgWrap([1], `${stageHeader(2, 'UNDERSTAND', 'What are the key issues and narratives?', true)}
${hasN ? N.slice(3).map(ncard).join('') : ''}
<h2 style="margin-top:2mm">AI briefing ${tag('O')}</h2><p class="sm">${isFallback ? 'Rule-based briefing (the language model did not return a full narrative).' : `Generated by ${esc(summary?.model || 'the platform language model')}.`} Post citations link to the evidence register.</p>
${briefCards || '<div class="card"><p class="ev">No briefing text is available for this event yet.</p></div>'}`));

  // ================= 5. CONNECT: entity → narrative, hashtags =================
  const entOf = (e) => String(e.target_entity || 'Other');
  const evEntities = [...new Set(ev.map(entOf))];
  const entCited = (name) => ev.filter((e) => entOf(e) === name).length;
  const corpusOf = (name) => (entities.find((x) => x.name.toLowerCase() === name.toLowerCase()) || {}).total;
  let sankey = '';
  if (hasN) {
    const assigned = ev.filter((e) => e.narr);
    const W = 520, H = 240, u = Math.min(5, 190 / Math.max(assigned.length, 1)), lx = 150, rx = 370, nw = 10;
    const L = evEntities.sort((a, b) => entCited(b) - entCited(a));
    const lh = Object.fromEntries(L.map((e) => [e, assigned.filter((x) => entOf(x) === e).length * u]));
    const gap = 26;
    let y = (H - Object.values(lh).reduce((a, b) => a + b, 0) - gap * (L.length - 1)) / 2;
    const ly = {}; L.forEach((e) => { ly[e] = y; y += lh[e] + gap; });
    const rc = Object.fromEntries(N.map((n) => [n.code, assigned.filter((x) => x.narr === n.code).length]));
    const rgap = 9; y = (H - N.reduce((s, n) => s + rc[n.code] * u, 0) - rgap * (N.length - 1)) / 2;
    const ry = {}; N.forEach((n) => { ry[n.code] = y; y += rc[n.code] * u + rgap; });
    const lo = { ...ly }, ro = { ...ry };
    L.forEach((e) => N.forEach((n) => {
      const c = assigned.filter((x) => entOf(x) === e && x.narr === n.code).length;
      if (!c) return;
      const w = c * u, a = lo[e] + w / 2, b = ro[n.code] + w / 2; lo[e] += w; ro[n.code] += w;
      sankey += `<path d="M${lx + nw},${a.toFixed(1)} C${(lx + rx) / 2 + nw / 2},${a.toFixed(1)} ${(lx + rx) / 2 + nw / 2},${b.toFixed(1)} ${rx},${b.toFixed(1)}" stroke="${ncol(n.code)}" stroke-width="${w.toFixed(1)}" fill="none" opacity=".5"/>`;
    }));
    L.forEach((e) => { sankey += `<rect x="${lx}" y="${ly[e].toFixed(1)}" width="${nw}" height="${lh[e].toFixed(1)}" fill="${INK}"/>` + txt(lx - 6, ly[e] + lh[e] / 2 + 1, e, 9, INK, 'end', 700) + txt(lx - 6, ly[e] + lh[e] / 2 + 11, `${entCited(e)} cited${corpusOf(e) ? ` · ${fmt(corpusOf(e))} in corpus` : ''}`, 7, MUT, 'end'); });
    N.forEach((n) => { sankey += `<rect x="${rx}" y="${ry[n.code].toFixed(1)}" width="${nw}" height="${(rc[n.code] * u).toFixed(1)}" fill="${ncol(n.code)}"/>` + txt(rx + nw + 6, ry[n.code] + rc[n.code] * u / 2 + 3, `${n.code}. ${n.title.slice(0, 30)} (${rc[n.code]})`, 8.4); });
    sankey = svg(W + 60, H, sankey);
  }
  const tagMap = new Map();
  ev.forEach((e) => { (String(e.text || '').match(/#[\p{L}\p{N}_]+/gu) || []).forEach((t0) => { const k = t0.toLowerCase(); const c = tagMap.get(k) || { tag: t0, posts: new Set(), plats: new Set() }; c.posts.add(e.n); c.plats.add(e.plat); tagMap.set(k, c); }); });
  const tagRows = [...tagMap.values()].sort((a, b) => b.posts.size - a.posts.size).slice(0, 10);
  const pairs = new Map();
  ev.forEach((e) => { const t1 = [...new Set((String(e.text || '').match(/#[\p{L}\p{N}_]+/gu) || []).map((x) => x.toLowerCase()))]; for (let i = 0; i < t1.length; i++) for (let j = i + 1; j < t1.length; j++) { const k = [t1[i], t1[j]].sort().join(' + '); const c = pairs.get(k) || new Set(); c.add(e.n); pairs.set(k, c); } });
  const pairRows = [...pairs.entries()].filter(([, s]) => s.size >= 2).sort((a, b) => b[1].size - a[1].size).slice(0, 6);
  pages.push(pgWrap([2], `${stageHeader(3, 'CONNECT', 'Who and what is connected to these narratives?')}<h1>Who and what each narrative is about</h1>
<p class="lead">Entities are the classifier's per-post targets; narratives are the AI grouping. Flow width is the number of cited posts.</p>
${hasN ? `<div class="card"><p class="q">Which entities carry which narratives? ${tag('D')}${tag('O')}</p><h2>Entity → narrative flow (${ev.length} cited posts)</h2>${sankey}<p class="sm">The corpus counts come from the platform. The flow covers cited posts only.</p></div>
<div class="call"><b>Reading the flow.</b> ${tag('O')}The entity label is the <i>target</i> of a post, so it does not always say whom the post is about. Consider adding an issue field and a “subject” entity.</div>` : notAvail('Entity → narrative flow')}
<h2 style="margin-top:3mm">Keyword co-occurrence: what the visible hashtags show</h2>
${tagRows.length ? `<div class="g2"><div class="card" style="padding:1.5mm 3mm"><p class="q">Hashtags in the evidence ${tag('D')}</p><table><tr><th>Hashtag</th><th class="r">Posts</th><th>Platforms</th><th>IDs</th></tr>${tagRows.map((r) => `<tr><td>${esc(r.tag)}</td><td class="r">${r.posts.size}</td><td>${[...r.plats].map(platLabel).join(', ')}</td><td class="sm">${citeList([...r.posts].slice(0, 5))}</td></tr>`).join('')}</table></div>
<div class="card" style="padding:1.5mm 3mm"><p class="q">Hashtags seen together (≥2 posts) ${tag('D')}</p>${pairRows.length ? `<table><tr><th>Pair</th><th class="r">Posts</th></tr>${pairRows.map(([k, s]) => `<tr><td>${esc(k)}</td><td class="r">${s.size}</td></tr>`).join('')}</table>` : '<p class="ev">No pair appears in two or more cited posts.</p>'}</div></div>` : '<div class="card"><p class="ev">No hashtags were found in the cited posts.</p></div>'}
<div class="call amb"><b>Limit.</b> Co-occurrence across all ${fmt(total)} posts needs per-post matched keywords, which the platform does not export. Only the cited posts' visible hashtags are shown. A full term × term matrix would also explain the gap between unique posts and keyword-post matches (p.10).</div>`));

  // ================= 6. CONNECT: network + propagation =================
  let net = '';
  if (hasN) {
    const Wd = 560, Hd = 410, cx = 280, cy = 205;
    const ang = {}; N.forEach((n, i) => { ang[n.code] = (-90 + i * 360 / N.length) * Math.PI / 180; });
    const npos = {}; N.forEach((n) => { npos[n.code] = [cx + 88 * Math.cos(ang[n.code]), cy + 88 * Math.sin(ang[n.code])]; });
    const acc = new Map();
    ev.filter((e) => e.narr).forEach((e) => { const a = acc.get(e.author) || []; a.push(e); acc.set(e.author, a); });
    const bynar = {};
    const pos = {};
    acc.forEach((ps, a) => { const ks = [...new Set(ps.map((p) => p.narr))]; if (ks.length === 1) (bynar[ks[0]] = bynar[ks[0]] || []).push(a); });
    Object.entries(bynar).forEach(([k, al]) => { al.sort(); al.forEach((a, i) => { const off = (i - (al.length - 1) / 2) * (Math.min(15, 48 / Math.max(al.length - 1, 1)) * Math.PI / 180); const r = 140 + (i % 3) * 24; pos[a] = [cx + r * Math.cos(ang[k] + off), cy + r * Math.sin(ang[k] + off), ang[k] + off]; }); });
    acc.forEach((ps, a) => { const ks = [...new Set(ps.map((p) => p.narr))]; if (ks.length > 1) { const x = ks.reduce((s, k) => s + Math.cos(ang[k]), 0) / ks.length, y = ks.reduce((s, k) => s + Math.sin(ang[k]), 0) / ks.length; pos[a] = [cx + 150 * x * 1.25, cy + 150 * y * 1.25, Math.atan2(y, x)]; } });
    acc.forEach((ps, a) => ps.forEach((p) => { if (pos[a]) net += `<line x1="${pos[a][0].toFixed(1)}" y1="${pos[a][1].toFixed(1)}" x2="${npos[p.narr][0].toFixed(1)}" y2="${npos[p.narr][1].toFixed(1)}" stroke="${ncol(p.narr)}" stroke-width="1.3" opacity=".55"/>`; }));
    acc.forEach((ps, a) => { if (!pos[a]) return; const [x, y, an] = pos[a]; const r = 3.6 + 1.8 * (ps.length - 1); const multi = new Set(ps.map((p) => p.plat)).size > 1;
      net += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${platColor(ps[0].plat)}" stroke="${multi ? YC : '#fff'}" stroke-width="${multi ? 2 : 1}"/>` + txt((x + Math.cos(an) * (r + 3)).toFixed(1), (y + Math.sin(an) * (r + 3) + 2.5).toFixed(1), String(a).length < 19 ? a : String(a).slice(0, 17) + '…', 6.6, INK, Math.cos(an) > 0.25 ? 'start' : Math.cos(an) < -0.25 ? 'end' : 'middle'); });
    N.forEach((n) => { const [x, y] = npos[n.code]; net += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${10 + evOf(n.code).length * 1.6}" fill="${ncol(n.code)}"/>` + txt(x.toFixed(1), (y + 4).toFixed(1), n.code, 11, '#fff', 'middle', 700); });
    net = svg(Wd, Hd, net);
  }
  const propRows = hasN ? N.map((n) => {
    const es = evOf(n.code);
    const ps = [...new Set(es.map((e) => e.plat))];
    return `<tr><td><b>${n.code}. ${esc(n.title)}</b></td><td>${ps.map((p) => `${platLabel(p)} ${citeList(es.filter((e) => e.plat === p).map((e) => e.n))}`).join(' · ')}</td><td class="r">${ps.length}</td></tr>`;
  }).join('') : '';
  pages.push(pgWrap([2], `${stageHeader(3, 'CONNECT', 'Who and what is connected to these narratives?', true)}<h1>Network of sources and narratives</h1>
${hasN ? `<div class="card"><p class="q">Which accounts connect to which narratives? ${tag('D')}${tag('O')}</p><div style="width:88%;margin:0 auto">${net}</div>${legend([[XC, 'X'], [YC, 'YouTube'], [FC, 'Facebook'], ['#7A8499', 'Other'], ['#fff', 'Gold ring = account cited on 2+ platforms']])}
<p class="sm">Accounts sit near their narrative; accounts connected to two narratives sit between them. The graph covers cited posts only. No reply, mention or repost links are in the data, so no influence or amplification is implied.</p></div>
<h2 style="margin-top:3mm">Cross-platform presence</h2><div class="card" style="padding:1.5mm 3mm"><p class="q">Do topics appear on more than one platform? ${tag('D')}${tag('O')}</p><table><tr><th>Narrative</th><th>Cited posts by platform</th><th class="r">Platforms</th></tr>${propRows}</table></div>
<div class="call amb"><b>Co-presence, not propagation.</b> Showing that a topic moved from one platform to another needs post timestamps and reply/repost links. The report shows where topics co-exist and does not claim direction or speed.</div>` : notAvail('Network graph and cross-platform presence')}`));

  // ================= 7. CONNECT: influencer & source =================
  const typeNames = { media: 'Media / institution', creator: 'Creator / page', individual: 'Individual account' };
  const st = analysis?.sourceTypes || {};
  const typed = ev.filter((e) => st[e.n]);
  let soSvg = '';
  if (typed.length) {
    soSvg = svg(500, 98, ['media', 'creator', 'individual'].map((ty, i) => {
      const ps = typed.filter((e) => st[e.n] === ty), y = i * 32;
      return txt(112, y + 19, typeNames[ty], 10, INK, 'end') + stack(120, y + 5, 300, 20, [{ v: ps.filter((e) => e.sentK === 'positive').length, c: PR }, { v: ps.filter((e) => e.sentK === 'neutral').length, c: NW }, { v: ps.filter((e) => e.sentK === 'negative').length, c: CR }], 14, 9.5) + txt(428, y + 19, `${ps.length} cited`, 9, MUT);
    }).join(''));
  }
  const acc2 = new Map();
  kws.forEach((k) => (k.top_authors || []).forEach((a) => { const key = `${a.name}|${a.platform}`; const cur = acc2.get(key) || { name: a.name, platform: a.platform, count: 0, engagement: 0 }; cur.count += n0(a.count); cur.engagement += n0(a.engagement); acc2.set(key, cur); }));
  const accounts = [...acc2.values()].sort((a, b) => b.count - a.count || b.engagement - a.engagement).slice(0, 10);
  const authCount = new Map(); ev.forEach((e) => authCount.set(e.author, (authCount.get(e.author) || []).concat(e.n)));
  const repeat = [...authCount.entries()].filter(([, v]) => v.length > 1);
  const critByType = typed.length ? ['individual', 'media', 'creator'].map((ty) => [ty, typed.filter((e) => st[e.n] === ty && e.sentK === 'negative').length]).sort((a, b) => b[1] - a[1])[0] : null;
  pages.push(pgWrap([2], `${stageHeader(3, 'CONNECT', 'Who and what is connected to these narratives?', true)}<h1>Influencer &amp; source intelligence</h1>
<p class="lead">Who speaks, in what tone, and how much reach the data lets us attribute to them.</p>
${soSvg ? `<div class="card"><p class="q">Which kinds of source voice which tone? ${tag('D')}${tag('O')}</p><h2>Cited posts by source type and tone</h2>${soSvg}${legend([[PR, 'Praise'], [NW, 'News'], [CR, 'Criticism']])}
<p class="ev">${critByType && critByType[1] ? `Most cited critical posts come from <b>${typeNames[critByType[0]].toLowerCase()}s</b> (${critByType[1]} of ${typed.filter((e) => e.sentK === 'negative').length}). ` : ''}Source types are the AI's classification from the account name and post form and should be confirmed.</p></div>` : notAvail('Source-type analysis')}
<div class="g2" style="margin-top:3mm"><div class="card"><p class="q">Which accounts lead by matches? ${tag('R')}${tag('D')}</p><h2>Top accounts across keywords</h2>${accounts.length ? `<table><tr><th>Account</th><th>Platform</th><th class="r">Matches</th><th class="r">Engagement</th></tr>${accounts.map((a) => `<tr><td>${esc(a.name)}</td><td>${esc(platLabel(a.platform))}</td><td class="r">${fmt(a.count)}</td><td class="r">${fmt(a.engagement)}</td></tr>`).join('')}</table><p class="sm" style="margin-top:1.5mm">Counts are summed across keywords, so an account can be counted for several keywords. Reach per account is not supplied.</p>` : '<p class="ev">Keyword analytics did not return account data.</p>'}</div>
<div class="card"><p class="q">Who repeats in the evidence? ${tag('D')}</p><h2>Accounts cited more than once</h2>${repeat.length ? `<table><tr><th>Account</th><th class="r">Posts</th><th>IDs</th></tr>${repeat.map(([a, v]) => `<tr><td>${esc(a)}</td><td class="r">${v.length}</td><td>${citeList(v)}</td></tr>`).join('')}</table>` : '<p class="ev">No account is cited more than once.</p>'}
<p class="sm" style="margin-top:1.5mm">${authCount.size} distinct accounts in ${ev.length} cited posts. Concentration across all ${fmt(total)} posts is unknown.</p></div></div>`));

  // ================= 8. MEASURE: keywords =================
  const kwTop = kws.slice(0, 14);
  const kwMax = kwTop[0]?.total_posts || 1;
  let kv = '', ks = '';
  kwTop.forEach((k, i) => {
    const y = i * 21, bw = 200 * (n0(k.total_posts) / kwMax), s = k.sentiment || {}, cr = n0(s.negative);
    const baseline = n0(k.total_posts) >= total && total > 0;
    kv += txt(142, y + 14, k.keyword, 9, INK, 'end') + `<rect x="148" y="${y + 3}" width="${bw.toFixed(1)}" height="15" rx="2" fill="${baseline ? '#B8C0D8' : IND}"/>` + txt(148 + bw + 5, y + 14, `${fmt(k.total_posts)} · ${pct(k.total_posts, total)}`, 8.5, INK, 'start', 700);
    ks += txt(142, y + 15, k.keyword, 9, INK, 'end') + stack(148, y + 3, 290, 15, [{ v: n0(s.positive), c: PR }, { v: n0(s.neutral), c: NW }, { v: cr, c: CR }], 14, 8) + txt(478, y + 15, pct(s.positive, k.total_posts, 0), 8.5, PR, 'end', 700) + txt(530, y + 15, pct(cr, k.total_posts), 8.5, cr / n0(k.total_posts) > 0.1 ? CR : MUT, 'end', 700);
  });
  const kvSvg = svg(540, Math.max(kwTop.length * 21, 21), kv);
  const ksSvg = svg(540, kwTop.length * 21 + 12, `<g transform="translate(0,12)">${ks}</g>` + txt(478, 8, 'Praise%', 7, MUT, 'end') + txt(530, 8, 'Crit.%', 7, MUT, 'end'));
  const baselineKw = kws.find((k) => n0(k.total_posts) >= total && total > 0);
  const mostCrit = kws.filter((k) => n0(k.total_posts) >= 5).map((k) => [k, n0(k.sentiment?.negative) / n0(k.total_posts)]).sort((a, b) => b[1] - a[1])[0];
  pages.push(pgWrap([3], `${stageHeader(4, 'MEASURE', 'How large, engaging and widespread is it?')}<h1>Which terms drive the conversation</h1>
<p class="lead">${kws.length} monitored terms. Post counts overlap because one post can carry several terms, so they describe emphasis and must not be summed as posts.</p>
${kwTop.length ? `<div class="card"><p class="q">Which keywords are driving the conversation? ${tag('R')}</p><h2>Posts matching each keyword (of ${fmt(total)} unique)</h2>${kvSvg}<p class="sm">${baselineKw ? `<b>${esc(baselineKw.keyword)}</b> (grey) matches every post, so it is the collection filter and carries no discriminating signal. ` : ''}Keyword counts are not additive.</p></div>
<div class="card"><p class="q">How does sentiment vary across keywords? ${tag('R')}${tag('D')}</p><h2>Sentiment mix within each keyword's matching posts</h2>${legend([[PR, 'Praise'], [NW, 'News'], [CR, 'Criticism']])}${ksSvg}</div>
${mostCrit && mostCrit[1] > 0 ? `<div class="call"><b>Where tone differs.</b> “${esc(mostCrit[0].keyword)}” has the highest criticism rate among keywords with ≥5 posts (${fmt(mostCrit[0].sentiment?.negative)} of ${fmt(mostCrit[0].total_posts)} = ${(mostCrit[1] * 100).toFixed(1)}%). Small groups swing sharply on a single post.</div>` : ''}` : '<div class="card"><p class="ev">Keyword analytics are not available for this event.</p></div>'}`));

  // ================= 9. MEASURE: entity + engagement =================
  const maxEnt = entities[0]?.total || 1;
  let eo1 = '', eo2 = '';
  entities.forEach((e, i) => {
    const y = i * 24, bw = 130 * (e.total / maxEnt);
    eo1 += txt(96, y + 15, e.name, 9, INK, 'end') + `<rect x="102" y="${y + 3}" width="${bw.toFixed(1)}" height="16" rx="2" fill="${IND}"/>` + txt(102 + bw + 5, y + 15, `${fmt(e.total)} · ${pct(e.total, total)}`, 8.5, INK, 'start', 700);
    eo2 += txt(96, y + 15, e.name, 9, INK, 'end') + stack(102, y + 3, 170, 16, [{ v: e.praise, c: PR }, { v: e.news, c: NW }, { v: e.crit, c: CR }], 14, 8) + txt(338, y + 15, pct(e.crit, e.total), 8.5, e.crit / e.total > 0.05 ? CR : MUT, 'end', 700);
  });
  const entSvg1 = svg(340, Math.max(entities.length * 24, 24), eo1);
  const entSvg2 = svg(340, Math.max(entities.length * 24 + 12, 36), `<g transform="translate(0,12)">${eo2}</g>` + txt(338, 8, 'Crit.%', 7, MUT, 'end'));
  const engBar = engTotal ? svg(520, 52, stack(0, 4, 520, 22, [{ v: n0(eng.likes), c: IND, label: fmt(eng.likes) }, { v: n0(eng.shares), c: YC, label: fmt(eng.shares) }, { v: n0(eng.comments), c: '#8A4FBF', label: fmt(eng.comments) }], 30, 8) +
    `<rect x="0" y="34" width="9" height="9" fill="${IND}"/>` + txt(13, 42, `Likes ${fmt(eng.likes)} · ${pct(eng.likes, engTotal)}`, 8) + `<rect x="170" y="34" width="9" height="9" fill="${YC}"/>` + txt(183, 42, `Shares ${fmt(eng.shares)} · ${pct(eng.shares, engTotal)}`, 8) + `<rect x="330" y="34" width="9" height="9" fill="#8A4FBF"/>` + txt(343, 42, `Comments ${fmt(eng.comments)} · ${pct(eng.comments, engTotal)}`, 8)) : '';
  pages.push(pgWrap([3], `${stageHeader(4, 'MEASURE', 'How large, engaging and widespread is it?', true)}<h1>Who the conversation is about, and how it engages</h1>
<p class="lead">Each post is assigned one target entity, so entity counts are unique posts (unlike keyword counts).</p>
${entities.length ? `<div class="g2"><div class="card"><p class="q">Which entity types dominate? ${tag('R')}${tag('D')}</p><h2>Posts by target entity</h2>${entSvg1}</div>
<div class="card"><p class="q">Who draws criticism? ${tag('R')}${tag('D')}</p><h2>Sentiment by target entity</h2>${legend([[PR, 'Praise'], [NW, 'News'], [CR, 'Criticism']])}${entSvg2}</div></div>
<div class="g2"><div class="call ${critTotal ? 'warn' : 'grn'}" style="margin:0"><b>${critTotal ? `${pct(topEntity.crit, critTotal)} of all criticism (${fmt(topEntity.crit)} of ${fmt(critTotal)}) is aimed at “${esc(topEntity.name)}”.` : 'No criticism is recorded against any entity.'}</b> ${entities.filter((e) => e !== topEntity).slice(0, 2).map((e) => `${esc(e.name)}: ${fmt(e.crit)} of ${fmt(e.total)} (${pct(e.crit, e.total)}).`).join(' ')}</div>
<div class="call amb" style="margin:0"><b>Caution on entity labels.</b> ${tag('O')}The entity is the classifier's target for a post. Criticism aimed at an organisation is not necessarily criticism of the event; check cited posts before concluding.</div></div>` : '<div class="card"><p class="ev">No entity classification is available.</p></div>'}
<h2 style="margin-top:4mm">Engagement</h2>
${engBar ? `<div class="kpi" style="grid-template-columns:repeat(4,1fr)"><div><div class="l">Total engagement</div><div class="n">${fmt(engTotal)}</div><div class="s">${tag('R')}</div></div><div><div class="l">Likes</div><div class="n">${fmt(eng.likes)}</div><div class="s">${pct(eng.likes, engTotal)} ${tag('D')}</div></div><div><div class="l">Shares</div><div class="n">${fmt(eng.shares)}</div><div class="s">${pct(eng.shares, engTotal)} ${tag('D')}</div></div><div><div class="l">Mean per post</div><div class="n">${fmt(Math.round(engTotal / Math.max(total, 1)))}</div><div class="s">${tag('D')} ÷ ${fmt(total)}</div></div></div>
<div class="card"><p class="q">How much engagement is present, and what is it made of? ${tag('R')}${tag('D')}</p><h2>Composition of total engagement</h2>${engBar}<p class="ev">Only one corpus-level total exists: no platform, keyword, narrative or per-post breakdown, so none is inferred. Platforms expose different engagement fields, so the total is not like-for-like. ${n0(eng.views) ? `Views (${fmt(eng.views)}) are reported separately and are not included.` : ''} The mean is a simple average; the distribution is unknown.</p></div>` : '<div class="card"><p class="ev">Engagement data is not available.</p></div>'}`));

  // ================= 10. MEASURE: methodology (keyword mentions) =================
  const dupPairs = [];
  kws.forEach((a, i) => kws.slice(i + 1).forEach((b) => { if (a.total_posts === b.total_posts && n0(a.sentiment?.positive) === n0(b.sentiment?.positive) && n0(a.sentiment?.neutral) === n0(b.sentiment?.neutral) && n0(a.sentiment?.negative) === n0(b.sentiment?.negative)) dupPairs.push([a, b]); }));
  const dupSum = dupPairs.reduce((s, [, b]) => s + n0(b.total_posts), 0);
  const hashSum = kws.filter((k) => String(k.keyword).startsWith('#')).reduce((s, k) => s + n0(k.total_posts), 0);
  const hyp = [];
  if (kws.length && reportedMentions) {
    const row = (label, val, note) => hyp.push([label, val, val - reportedMentions, note]);
    row('Sum of all keyword post-counts', kwMatchSum, kwMatchSum === reportedMentions ? 'Matches the reported value.' : 'This is a post-match count.');
    if (baselineKw) row(`All terms except the baseline (${baselineKw.keyword})`, kwMatchSum - n0(baselineKw.total_posts), '');
    row('Hashtag terms only', hashSum, '');
    row('Plain-text terms only', kwMatchSum - hashSum, '');
    if (dupPairs.length) row('Drop duplicated terms (identical counts and sentiment)', kwMatchSum - dupSum, '');
    let hits = null;
    if (kws.length <= 20) {
      const vals = kws.map((k) => n0(k.total_posts)); let c = 0;
      for (let m = 1; m < (1 << vals.length); m++) { let s = 0; for (let i = 0; i < vals.length; i++) if (m & (1 << i)) s += vals[i]; if (s === reportedMentions) c++; }
      hits = [c, (1 << vals.length) - 1];
    }
    if (hits) hyp.push([`Every non-empty combination of the ${kws.length} terms (${fmt(hits[1])})`, `${hits[0]} combination(s) reach ${fmt(reportedMentions)}`, null, hits[0] ? 'Only arbitrary combinations reach it; no common rule.' : 'None reach it.']);
  }
  const hypRows = hyp.map(([a, b, c, d]) => `<tr><td>${esc(a)}</td><td class="r"><b>${typeof b === 'number' ? fmt(b) : esc(b)}</b></td><td class="r">${c === null ? '' : (c > 0 ? '+' : '') + fmt(c)}</td><td class="sm">${esc(d)}</td></tr>`).join('');
  const dict = [
    ['Unique posts', 'Distinct posts after deduplication', fmt(total), 'Headline'],
    ['Event-relevant posts', 'Posts classified as related to the event', fmt(stats.relevant_posts_count), 'Headline'],
    ['Keyword-matching posts', 'Distinct posts containing one keyword', kws.length ? 'per keyword' : '–', 'Drill-down; overlap allowed'],
    ['Keyword-post matches', 'Sum of keyword-matching posts across keywords', kws.length ? fmt(kwMatchSum) : '–', 'Secondary'],
    ['Summary “keyword mentions”', 'Per-post matched-keyword count in the Summary AI calculation', reportedMentions ? fmt(reportedMentions) : '–', mentionsConflict ? 'Held back: unverified' : 'Consistent'],
    ['Engagement', 'Platform-supported engagement fields', engTotal ? fmt(engTotal) : '–', 'Headline*'],
  ].map(([a, b, c, d]) => `<tr><td><b>${a}</b></td><td>${b}</td><td class="r"><b>${c}</b></td><td>${d}</td></tr>`).join('');
  const ovSvg = kws.length && reportedMentions ? svg(520, 96,
    txt(0, 14, 'Unique posts', 9.5) + `<rect x="200" y="3" width="${(270 * total / Math.max(kwMatchSum, reportedMentions, total)).toFixed(1)}" height="15" fill="${XC}"/>` + txt(206 + 270 * total / Math.max(kwMatchSum, reportedMentions, total), 15, fmt(total), 10, INK, 'start', 700) +
    txt(0, 40, 'Summary “keyword mentions”', 9) + `<rect x="200" y="29" width="${(270 * reportedMentions / Math.max(kwMatchSum, reportedMentions, total)).toFixed(1)}" height="15" fill="${YC}"/>` + txt(206 + 270 * reportedMentions / Math.max(kwMatchSum, reportedMentions, total), 41, fmt(reportedMentions), 10, INK, 'start', 700) +
    txt(0, 66, 'Sum of keyword post-counts', 9) + `<rect x="200" y="55" width="${(270 * kwMatchSum / Math.max(kwMatchSum, reportedMentions, total)).toFixed(1)}" height="15" fill="${mentionsConflict ? CR : PR}"/>` + txt(206 + 270 * kwMatchSum / Math.max(kwMatchSum, reportedMentions, total), 67, fmt(kwMatchSum), 10, INK, 'start', 700) +
    txt(0, 90, mentionsConflict ? `The two keyword measures differ by ${fmt(Math.abs(kwMatchSum - reportedMentions))}.` : 'The two keyword measures agree.', 8, MUT)) : '';
  pages.push(pgWrap([3], `${stageHeader(4, 'MEASURE', 'How large, engaging and widespread is it?', true)}<h1>Keyword mentions: reconciling the two counts</h1>
<p class="lead">${mentionsConflict ? 'The Summary AI and the keyword analytics report different keyword totals. What can be tested from the data is shown below; the exact backend formula must be confirmed.' : 'The keyword counts in the Summary AI and the keyword analytics can be compared below.'}</p>
${ovSvg ? `<div class="card"><p class="q">How far apart are the numbers? ${tag('R')}${mentionsConflict ? tag('C') : ''}</p>${ovSvg}</div>` : '<div class="card"><p class="ev">Keyword totals are not available for comparison.</p></div>'}
${hypRows ? `<h2 style="margin-top:3mm">Explanations tested against the visible data ${tag('D')}</h2><div class="card" style="padding:1.5mm 3mm"><table><tr><th>Hypothesis</th><th class="r">Result</th><th class="r">Δ vs reported</th><th>Outcome</th></tr>${hypRows}</table></div>
<div class="call ${mentionsConflict ? 'warn' : 'grn'}"><b>Conclusion.</b> ${mentionsConflict ? `The sum of keyword post-counts (${fmt(kwMatchSum)}) is fully explained by the table. The reported ${fmt(reportedMentions)} is not reproduced by any test above, so it should not be used as a headline until the backend confirms its calculation.` : 'The reported keyword value equals the sum of keyword post-counts.'}</div>` : ''}
<h2 style="margin-top:3mm">Metric dictionary used in this report</h2><div class="card" style="padding:1.5mm 3mm"><table><tr><th>Metric</th><th>Definition</th><th class="r">Value</th><th>Use</th></tr>${dict}</table></div>
<p class="sm" style="margin-top:2mm">In the platform, the Summary AI counts each post's matched keywords (with a substring search of the text as a fallback) while keyword analytics count matching posts per keyword. These are different measures and should be produced by one shared calculation with one label. *Not like-for-like across platforms.</p>`));

  // ================= 11. MEASURE: reconciliation =================
  const kwaS = kwa?.summary || {};
  const entSum = entities.reduce((s, e) => s + e.total, 0);
  const platSum = platformEntries.reduce((s, [, v]) => s + n0(v), 0);
  const kwRowsOk = kws.length ? kws.every((k) => n0(k.sentiment?.positive) + n0(k.sentiment?.neutral) + n0(k.sentiment?.negative) === n0(k.total_posts)) : null;
  const check = (name, a, b, ok) => `<tr><td>${name}</td><td>${a}</td><td>${b}</td><td><span class="pill" style="background:${ok === null ? '#7A8499' : ok ? PR : CR}">${ok === null ? 'n/a' : ok ? 'Agree' : 'Differs'}</span></td></tr>`;
  const checks = [
    check('Sentiment classes sum to unique posts', fmt(sentTotal), fmt(total), sentTotal === total),
    check('Platform counts sum to unique posts', fmt(platSum), fmt(total), platSum === total),
    check('Entity totals sum to unique posts', fmt(entSum), fmt(total), entSum === total),
    check('Unique posts: Summary vs keyword analytics', fmt(total), kwaS.total_unique_posts != null ? fmt(kwaS.total_unique_posts) : '–', kwaS.total_unique_posts != null ? n0(kwaS.total_unique_posts) === total : null),
    check('Praise: Summary vs keyword analytics', fmt(sent.positive), kwaS.sentiment ? fmt(kwaS.sentiment.positive) : '–', kwaS.sentiment ? n0(kwaS.sentiment.positive) === sent.positive : null),
    check('Keyword sentiment rows sum to keyword counts', kws.length ? `${kws.length} rows` : '–', '—', kwRowsOk),
  ].join('');
  const issues = [];
  if (mentionsConflict) issues.push(['Keyword mentions differ', `Summary ${fmt(reportedMentions)}; keyword analytics ${fmt(kwMatchSum)}.`, 'Different measures with one similar label.', 'Confirm the formula; use one label and one calculation.']);
  dupPairs.forEach(([a, b]) => issues.push([`“${a.keyword}” and “${b.keyword}” are identical`, `Same posts (${fmt(a.total_posts)}) and same sentiment.`, 'Possible normalisation of hashtag and plain text; one term may be counted twice.', 'Confirm whether the terms are matched independently.']));
  if (baselineKw) issues.push([`“${baselineKw.keyword}” matches every post`, `${fmt(baselineKw.total_posts)} of ${fmt(total)}.`, 'It is the collection filter, so 100% event relevance is true by construction.', 'Add a relevance-confidence field.']);
  if (n0(stats.relevant_posts_count) === total && total) issues.push(['100% event-relevance rate', `${fmt(stats.relevant_posts_count)} of ${fmt(total)} posts.`, 'Describes collection, not measured relevance.', 'Add a relevance-confidence field.']);
  issues.push(['Evidence coverage', `${fmt(ev.length)} of ${fmt(total)} posts (${pct(ev.length, total)}).`, 'Narratives, source types and network views rest on this sample only.', 'Widen the sample or classify every post.']);
  if (timeline.length < 2) issues.push(['No per-post dates', 'Timeline and spike detection cannot be shown.', 'Change over time cannot be measured.', 'Provide per-post timestamps.']);
  const issueRows = issues.map(([a, b, c, d], i) => `<tr><td class="num"><b>${i + 1}</b></td><td style="width:32mm"><b>${esc(a)}</b></td><td>${esc(b)}</td><td>${esc(c)}</td><td>${esc(d)}</td></tr>`).join('');
  pages.push(pgWrap([3], `${stageHeader(4, 'MEASURE', 'How large, engaging and widespread is it?', true)}<h1>What agrees, what conflicts, what to verify</h1>
<p class="lead">Every count in this report was cross-checked against the others.</p>
<h2>Consistency checks ${tag('D')}</h2><div class="card" style="padding:1.5mm 3mm"><table><tr><th>Check</th><th>Value A</th><th>Value B</th><th>Result</th></tr>${checks}</table></div>
<h2 style="margin-top:4mm">Items requiring data verification ${mentionsConflict ? tag('C') : ''}</h2><div class="card" style="padding:1.5mm 3mm"><table><tr><th>#</th><th>Issue</th><th>What the data says</th><th>Assessment</th><th>Recommended action</th></tr>${issueRows}</table></div>`));

  // ================= 12. VERIFY =================
  const claims = analysis?.claims || [];
  const supportRows = [
    ['Post totals, platform mix, sentiment', 'REPORTED', PR, `Counted from ${fmt(total)} ingested posts; sums verified on p.11.`],
    ['Entity classification', 'AI READING', YC, 'Target entity assigned per post by the classifier.'],
    ['Keyword volumes and sentiment', kws.length ? 'REPORTED' : 'NOT AVAILABLE', kws.length ? PR : '#7A8499', kws.length ? 'From keyword analytics; overlaps allowed.' : 'Keyword analytics were not returned.'],
    [hasN ? `${N.length} narratives` : 'Narratives', hasN ? 'ILLUSTRATED' : 'NOT AVAILABLE', hasN ? YC : '#7A8499', hasN ? `Rest on ${fmt(ev.length)} of ${fmt(total)} posts; volumes not measured.` : 'AI analysis unavailable.'],
    ['Risk levels', 'AI READING', YC, 'Assigned per post by the risk classifier. No numeric risk score is produced.'],
  ].map(([a, b, c, d]) => `<tr><td>${a}</td><td><span class="st" style="background:${c};${c === YC ? 'color:#3A2A00' : ''}">${b}</span></td><td class="sm">${d}</td></tr>`).join('');
  const claimRows = claims.map((c) => {
    const es = ev.filter((e) => c.posts.includes(e.n));
    return `<tr><td><b>${esc(c.claim)}</b></td><td>${citeList(c.posts)}</td><td>${[...new Set(es.map((e) => platLabel(e.plat)))].join(', ')}</td><td class="sm">${esc(c.note)}</td></tr>`;
  }).join('');
  const single = claims.filter((c) => c.posts.length === 1).length;
  const riskBar = svg(520, 34, stack(0, 2, 520, 24, [{ v: n0(risk.critical), c: '#7A1F1F', label: `Critical ${risk.critical}` }, { v: n0(risk.high), c: CR, label: `High ${risk.high}` }, { v: n0(risk.medium), c: YC, label: `Medium ${risk.medium}` }, { v: n0(risk.low), c: PR, label: `Low ${risk.low}` }], 40, 8));
  const stance = stats.stance_counts || {};
  pages.push(pgWrap([4], `${stageHeader(5, 'VERIFY', 'What is supported by actual evidence?')}<h1>How strongly is each finding supported?</h1>
<p class="lead">Findings are graded by how they are evidenced. This is a report on evidence, not a confidence score.</p>
<div class="card" style="padding:1.5mm 3mm"><table><tr><th>Finding</th><th>Basis</th><th>Note</th></tr>${supportRows}</table></div>
<div class="card" style="margin-top:3mm"><p class="q">How is risk distributed, separately from sentiment? ${tag('R')}</p><h2>Post risk levels</h2>${riskBar}<p class="sm">Risk is not sentiment: ${fmt(sent.negative)} critical posts are opinion or policy feedback unless flagged high or critical. Stance: support ${fmt(stance.support)}, oppose ${fmt(stance.oppose)}, neutral ${fmt(stance.neutral)}.</p></div>
<h2 style="margin-top:3mm">Claim &amp; evidence intelligence ${tag('O')}</h2>
${claims.length ? `<p class="sm">Claim → evidence post → platform → verification path. Claims are extracted by the AI from the cited posts and are candidates for checking, not confirmed findings.</p><div class="card" style="padding:1.5mm 3mm"><table><tr><th>Claim</th><th>Evidence</th><th>Platform</th><th>Verification note</th></tr>${claimRows}</table></div>
<div class="call" style="margin-top:3mm"><b>Where evidence is thin.</b> ${single} of ${claims.length} claim(s) rest on a single post. Claims supported by several posts on more than one platform deserve priority.</div>` : notAvail('Claims requiring verification')}`));

  // ================= 13. DETECT: timeline / changes =================
  const changes = analysis?.changes || [];
  const peakRows = peaks.sort((a, b) => n0(b.count) - n0(a.count)).slice(0, 6).map((d) => `<tr><td>${esc(d.date)}</td><td class="r">${fmt(d.count)}</td><td class="r">${fmt(d.negative)}</td><td class="r">${fmt(d.engagement)}</td></tr>`).join('');
  const startEnd = stats.date_range?.start && stats.date_range?.end ? `Window ${new Date(stats.date_range.start).toLocaleDateString('en-GB')} to ${new Date(stats.date_range.end).toLocaleDateString('en-GB')}.` : '';
  pages.push(pgWrap([5], `${stageHeader(6, 'DETECT', 'What is emerging or changing?')}<h1>What can be seen of change, and what cannot</h1>
${timelineCard}
<div class="card"><p class="q">Which days stand out? ${tag('D')}</p><h2>Spike days</h2>${peakRows ? `<table><tr><th>Date</th><th class="r">Posts</th><th class="r">Critical</th><th class="r">Engagement</th></tr>${peakRows}</table><p class="sm" style="margin-top:1mm">Rule: posts ≥ mean + 2 standard deviations and ≥ 3 posts. This flags unusual volume, not its cause. ${startEnd}</p>` : `<p class="ev">${timeline.length >= 2 ? 'No day exceeds the spike rule (mean + 2 standard deviations, at least 3 posts).' : 'Not available: there are not enough dated posts.'}</p>`}</div>
<div class="call amb"><b>Narrative momentum: not measurable yet.</b> It needs a narrative label on every dated post so volume, share, engagement and tone can be compared between periods. Only the cited sample is labelled today, so <b>no momentum is claimed</b>. ${timeline.length >= 2 ? 'Daily volume and tone are measured above.' : 'There are no per-post dates, so nothing is inferred about change.'}</div>
<h2 style="margin-top:3mm">“What changed?” Changes stated in the posts ${tag('O')}</h2>
${changes.length ? `<div class="card" style="padding:1.5mm 3mm"><table><tr><th>From</th><th>To</th><th>Post</th></tr>${changes.map((c) => `<tr><td>${esc(c.from)}</td><td>${esc(c.to)}</td><td>${cite(c.post)}</td></tr>`).join('')}</table></div><div class="call amb"><b>Limit.</b> These are changes the posts themselves describe. They are not measured changes in volume, sentiment or engagement between periods.</div>` : '<div class="card"><p class="ev">No before/after change is stated in the cited posts.</p></div>'}
<h2 style="margin-top:3mm">Detection readiness</h2><div class="card" style="padding:1.5mm 3mm"><table><tr><th>Detection</th><th>Needs</th><th>Available now?</th></tr>
<tr><td><b>Conversation spikes</b></td><td>Post-level timestamps</td><td>${timeline.length >= 2 ? 'Yes' : 'No'}</td></tr>
<tr><td><b>Narrative momentum</b></td><td>Timestamps + narrative label per post</td><td>No</td></tr>
<tr><td><b>Rising keywords · sentiment shift</b></td><td>A prior-period run</td><td>Candidates only (p.14)</td></tr>
<tr><td><b>New sources / influencers</b></td><td>Prior-period source list</td><td>No</td></tr>
<tr><td><b>Engagement change</b></td><td>Prior-period engagement, per-post engagement</td><td>No</td></tr>
<tr><td><b>Cross-platform propagation</b></td><td>Timestamps + reply / repost links</td><td>Co-presence only (p.6)</td></tr></table></div>`));

  // ================= 14. DETECT: emerging keywords + baseline =================
  const emerging = analysis?.emerging || [];
  const monitored = new Set(kws.map((k) => String(k.keyword).toLowerCase()));
  const emRows = emerging.map((k) => `<tr><td><b>${esc(k.term)}</b></td><td>${citeList(k.posts)}</td><td class="sm">${monitored.has(k.term.toLowerCase()) ? 'Already monitored' : 'Not in the monitored list'}</td><td class="sm">${esc(k.why)}</td></tr>`).join('');
  const base = [
    ['Unique posts', fmt(total)],
    ['Platform mix', platformEntries.map(([k, v]) => `${platLabel(k)} ${pct(v, total)}`).join(' / ') || '–'],
    ['Sentiment (praise / news / criticism)', sentTotal ? `${pct(sent.positive, sentTotal)} / ${pct(sent.neutral, sentTotal)} / ${pct(sent.negative, sentTotal)}` : '–'],
    ['Praise-to-criticism ratio', sent.negative ? `${(sent.positive / sent.negative).toFixed(1)} : 1` : 'no criticism recorded'],
    ['Criticism aimed at top entity', topEntity && critTotal ? `${pct(topEntity.crit, critTotal)} (${fmt(topEntity.crit)} of ${fmt(critTotal)})` : '–'],
    ['Engagement total', engTotal ? fmt(engTotal) : '–'],
    ['Top keywords', kws.slice(0, 3).map((k) => `${k.keyword} (${fmt(k.total_posts)})`).join(', ') || '–'],
    ['High / critical risk posts', fmt(highRisk)],
    ['Narratives identified', hasN ? `${N.length} (qualitative)` : '–'],
  ].map(([a, b]) => `<tr><td>${a}</td><td><b>${esc(b)}</b></td><td class="sm">not supplied</td><td class="sm">–</td></tr>`).join('');
  pages.push(pgWrap([5], `${stageHeader(6, 'DETECT', 'What is emerging or changing?', true)}<h1>Emerging keywords and the change baseline</h1>
<p class="lead">Terms that appear in the cited posts. They are <b>candidates</b> for discovery. Whether they are emerging (rising against a prior period) cannot be shown yet.</p>
${emRows ? `<div class="card" style="padding:1.5mm 3mm"><p class="q">Which terms should the platform start tracking? ${tag('O')}</p><table><tr><th>Term</th><th>Seen in</th><th>Status</th><th>Why it matters</th></tr>${emRows}</table></div>` : notAvail('Emerging keyword candidates')}
<h2 style="margin-top:4mm">“What Changed?” baseline snapshot</h2>
<p class="sm">These values are the reference period. The comparison columns are empty because no previous-period data is stored, and none has been estimated.</p>
<div class="card" style="padding:1.5mm 3mm"><table><tr><th>Metric</th><th>This period</th><th>Previous period</th><th>Change</th></tr>${base}</table></div>
<div class="call"><b>To switch this on:</b> save each generated report's baseline and compare it with the next run. New and rising keywords, new sources and narrative shifts can then be filled automatically. The metric definitions on p.10 must be fixed first so both periods use the same measures.</div>`));

  // ================= 15. ALERT =================
  const dimRows = [
    ['Sentiment', `${fmt(sent.negative)} critical posts (${pct(sent.negative, sentTotal)})`, 'Measured', CR, 'Kept separate from risk. Criticism is not treated as a threat.'],
    ['Threat / public order', `${fmt(highRisk)} high or critical risk posts (${fmt(risk.critical)} critical, ${fmt(risk.high)} high)`, highRisk ? 'Flagged' : 'None flagged', highRisk ? CR : PR, 'From the per-post risk classifier. No numeric score.'],
    ['Misinformation', 'No misinformation classification exists in the data. Candidate claims are extracted by the AI (p.12).', 'Not classified', '#7A8499', 'Verify claims before acting.'],
    ['Geopolitical sensitivity', 'Not scored by the platform. See narrative risk notes (p.3–4).', 'Not scored', '#7A8499', 'No score is invented.'],
  ].map(([a, b, c, d, e]) => `<tr><td style="width:28mm"><b>${a}</b></td><td>${b}</td><td style="width:26mm"><span class="pill" style="background:${d}">${c}</span></td><td class="sm">${e}</td></tr>`).join('');
  const acard = (level, col, title, body, evd, action) => `<div class="ac" style="border-left-color:${col}"><div style="display:flex;justify-content:space-between;gap:2mm"><b>${title}</b><span class="st" style="background:${col}">${level}</span></div><div class="ev" style="margin-top:.8mm">${body}</div><div class="sm"><b>Evidence:</b> ${evd} &nbsp;·&nbsp; <b>Action:</b> ${action}</div></div>`;
  const V = '#C2456A', M = '#3B4CCA', Dd = '#5B6474';
  const alertCards = claims.map((c) => acard(c.triage, c.triage === 'VERIFY' ? V : M, esc(c.claim), esc(c.note), citeList(c.posts), c.triage === 'VERIFY' ? 'Check against official or primary sources' : 'Watch for change')).join('');
  const riskPosts = ev.filter((e) => ['critical', 'high'].includes(String(e.risk_level || '').toLowerCase()));
  const riskCards = riskPosts.slice(0, 6).map((e) => acard(`${String(e.risk_level).toUpperCase()} RISK`, String(e.risk_level).toLowerCase() === 'critical' ? '#7A1F1F' : CR, `${cite(e.n)} · ${esc(e.author || 'unknown')} · ${esc(platLabel(e.plat))}`, esc(String(e.text || '').slice(0, 200)), cite(e.n), 'Review the post and its source')).join('');
  const dataIssues = issues.map(([a]) => a).slice(0, 4).join('; ');
  pages.push(pgWrap([6], `${stageHeader(7, 'ALERT', 'What needs attention?')}<h1>What needs attention</h1>
<p class="lead">Triage is assigned from the AI reading and the platform's risk classifier. It is <b>not a system risk score</b>; none exists.</p>
<div class="card" style="padding:1.5mm 3mm"><table><tr><th>Dimension</th><th>What the data shows</th><th>Status</th><th>Basis</th></tr>${dimRows}</table></div>
<div class="g2" style="margin:3mm 0"><div class="call ${highRisk ? 'warn' : 'grn'}" style="margin:0"><b>${highRisk ? `${fmt(highRisk)} high or critical risk posts.` : 'No alert: public order, threat, mobilisation.'}</b> ${highRisk ? 'Review the cards below.' : 'No post is flagged high or critical.'}</div>
<div class="card soft"><div class="ev"><span class="st" style="background:${V}">VERIFY</span> check the claim &nbsp; <span class="st" style="background:${M}">MONITOR</span> watch for change &nbsp; <span class="st" style="background:${Dd}">DATA</span> fix measurement</div></div></div>
${alertCards}${riskCards}${!alertCards && !riskCards ? '<div class="call grn">No claim or high-risk post requires attention in the analysed sample.</div>' : ''}
${acard('DATA', Dd, 'Measurement issues that limit alerting', esc(dataIssues || 'None found.'), 'p.10–11', 'Resolve before automating alerts')}`));

  // ================= 16-17. DRILL DOWN: evidence register =================
  const evRow = (e) => {
    const sc = e.sentK === 'positive' ? PR : e.sentK === 'negative' ? CR : NW;
    const pc = platColor(e.plat);
    return `<tr id="ev-${e.n}"><td class="num"><b>#${e.n}</b></td><td><span class="pill" style="background:${pc}">${esc(platLabel(e.plat))}</span></td><td>${esc(e.author || '')}</td>
<td><span class="pill" style="background:${sc}">${e.sentK}</span><br><span class="sm">${esc(e.target_entity || '')}</span></td><td>${e.narr ? `<b style="color:${ncol(e.narr)}">${e.narr}</b>` : '–'}</td><td>${esc(String(e.risk_level || '–'))}</td>
<td class="ev">${esc(String(e.text || ''))}${e.url ? `<br><a href="${esc(e.url)}">${esc(String(e.url).slice(0, 70))}</a>` : ''}</td></tr>`;
  };
  const narrKey = hasN ? N.map((n) => `<span style="color:${ncol(n.code)}"><b>${n.code}</b></span> ${esc(n.title)}`).join(' &nbsp; ') : '';
  pages.push(pgWrap([7], `${stageHeader(8, 'DRILL DOWN', 'Which sources and content sit behind each insight?')}<h1 style="font-size:14pt">Finding → evidence → source (${ev.length} cited posts)</h1>
<p class="sm">All ${ev.length} cited posts, with their [Post #n] numbers. The full ${fmt(total)} posts are in the platform's “All Posts” tab. ${narrKey ? `Narratives: ${narrKey}` : ''}</p>
<div class="card" style="padding:1mm 2.5mm;break-inside:auto"><table><thead><tr><th>Post</th><th>Platform</th><th>Source</th><th>Label · target</th><th>Narr.</th><th>Risk</th><th>Post text (as collected)</th></tr></thead><tbody>${ev.map(evRow).join('') || '<tr><td colspan="7">No evidence posts available.</td></tr>'}</tbody></table></div>`));

  // ================= 18. DRILL DOWN: index + method =================
  const idxRows = hasN ? N.map((n) => `<tr><td><b style="color:${ncol(n.code)}">${n.code}</b> ${esc(n.title)}</td><td>${citeList(n.posts)}</td></tr>`).join('') : '';
  const actions = briefSections.find((s) => /action|advisory|recommend/i.test(s.title));
  pages.push(pgWrap([7], `${stageHeader(8, 'DRILL DOWN', 'Which sources and content sit behind each insight?', true)}<h1>Back to the source</h1>
<div class="g2"><div><h2>Insight → posts</h2>${idxRows ? `<div class="card" style="padding:1.5mm 3mm"><table><tr><th>Narrative</th><th>Posts</th></tr>${idxRows}</table></div>` : '<div class="card"><p class="ev">Narrative index not available.</p></div>'}
<p class="sm" style="margin-top:2mm">Post numbers are the citation tags used in the narrative. Open the platform's “All Posts” tab for the full ${fmt(total)} posts and filter by author or platform.</p></div>
<div><h2>Where the report needs more data</h2><div class="card soft"><div class="ev">1. Post-level timestamps<br>2. A narrative label on every post<br>3. Keyword × platform and platform × sentiment for all posts<br>4. Engagement per post and platform<br>5. Reply / repost links for real propagation<br>6. A stored prior-period run for “What changed?”<br>7. One shared keyword-count calculation</div></div></div></div>
${actions ? `<div class="narr" style="margin-top:3mm"><div style="background:${IND}"></div><div><h2>${esc(actions.title)} ${tag('O')}</h2>${mdToHtml(actions.body)}</div></div>` : ''}
<div class="call" style="margin-top:3mm"><h3>Method &amp; provenance</h3><div class="ev">Generated from the cached Summary AI result${isFallback ? ' (rule-based fallback)' : ''}, the keyword analytics and ${analysis ? 'an AI structured analysis of the cited posts' : 'no structured analysis (unavailable)'} for this event. Counts and post text come from collected data. Calculations are shares, ratios, sums and spike flags (DERIVED). Narratives, source types, claims, emerging keywords, entity targets and risk levels are AI classifications and must be reviewed by an analyst. No timeline, momentum or change measure is created where the data does not exist.</div></div>
<div class="call warn"><b>Restricted document.</b> Classified “Restricted / Law Enforcement Only”. Handle under the same classification.</div>`));

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(event.name || 'Event')} — Event Intelligence Report</title><style>${FONT_FACES}${CSS}</style></head><body>${pages.join('')}</body></html>`;
};

module.exports = { buildReportHtml };
