/**
 * Presentation report: the same facts as the written report, laid out as 16:9 slides (one idea per slide, a chart or a few
 * big numbers, plain sentences). Everything shown is computed from the event's own data; no tenant, place or topic is named here.
 */

const SLIDE_W = 1280;
const SLIDE_H = 720;

const COLORS = {
  navy: '#16275F',
  ink: '#1B2A4A',
  blue: '#306FE0',
  orange: '#F08A24',
  red: '#C0392B',
  green: '#1F8F5A',
  purple: '#7B4FC4',
  teal: '#0E9AA7',
  grey: '#9BA6B8',
  card: '#EDF2FB',
};

const CSS = `
@page{size:${SLIDE_W}px ${SLIDE_H}px;margin:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:'Lato','Liberation Sans','Helvetica Neue',Arial,sans-serif;color:${COLORS.ink};-webkit-print-color-adjust:exact;print-color-adjust:exact}
.slide{width:${SLIDE_W}px;height:${SLIDE_H}px;position:relative;overflow:hidden;page-break-after:always;break-after:page;background:#fff;padding:54px 72px 0}
.slide:last-child{page-break-after:auto;break-after:auto}
.slide h2{font-family:'Lora',Georgia,'Times New Roman',serif;font-size:44px;line-height:1.1;margin:0 0 26px;color:${COLORS.navy};font-weight:700;letter-spacing:-.01em}
.slide .foot{position:absolute;left:72px;right:72px;bottom:24px;display:flex;justify-content:space-between;font-size:13px;color:#7A8499}
.slide.title{background:${COLORS.navy};color:#fff;padding:0}
.title .left{position:absolute;left:72px;top:170px;width:620px}
.title h1{font-family:'Lora',Georgia,'Times New Roman',serif;font-size:66px;line-height:1.08;margin:0 0 26px;font-weight:700}
.title .sub{font-size:25px;margin:0 0 56px;color:#E8ECF8}
.title .meta{font-size:19px;line-height:1.6;color:#DCE3F5}
.title .tiles{position:absolute;right:72px;top:150px;width:518px;display:grid;grid-template-columns:1fr 1fr;gap:22px}
.title .note{position:absolute;right:72px;top:478px;width:518px;font-size:17px;font-style:italic;line-height:1.5;color:#C9D3EE}
.title .foot{color:#C9D3EE}
.tile{border-radius:18px;color:#fff;text-align:center;padding:26px 14px;display:flex;flex-direction:column;justify-content:center;min-height:132px}
.tile .n{font-family:'Lora',Georgia,'Times New Roman',serif;font-size:48px;font-weight:700;line-height:1.05}
.tile .l{font-size:19px;margin-top:8px;opacity:.95}
.tile.or{background:${COLORS.orange}}.tile.bl{background:${COLORS.blue}}.tile.rd{background:${COLORS.red}}.tile.gr{background:${COLORS.green}}.tile.pu{background:${COLORS.purple}}.tile.tl{background:${COLORS.teal}}
.row4{display:grid;grid-template-columns:repeat(4,1fr);gap:22px;margin:0 0 34px}
.row4 .tile{min-height:112px;padding:18px 10px}.row4 .tile .n{font-size:40px}.row4 .tile .l{font-size:16px}
.point{display:flex;align-items:center;gap:24px;margin:0 0 16px;font-size:23px;line-height:1.32}
.point .num{flex:none;width:64px;height:64px;border-radius:50%;color:#fff;font-weight:700;font-size:26px;display:flex;align-items:center;justify-content:center;font-family:'Lora',Georgia,serif}
.point .tx{flex:1}
.cols3{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}
.card{background:${COLORS.card};border-radius:18px;padding:24px 26px;border-top:7px solid ${COLORS.blue};height:500px;overflow:hidden}
.card.o{border-top-color:${COLORS.orange}}.card.g{border-top-color:${COLORS.green}}.card.r{border-top-color:${COLORS.red}}.card.t{border-top-color:${COLORS.teal}}
.card h3{margin:0 0 14px;font-size:27px;color:${COLORS.navy};line-height:1.2}
.card p{margin:0 0 12px;font-size:18px;line-height:1.38;color:#2B3957}
.card p b{color:${COLORS.navy}}
.card .esc{display:block;margin-top:6px;font-size:16px;color:#7A1F1F}
.small{font-size:15px;color:#5B6880}
.chartcol{display:flex;gap:14px;align-items:flex-end;height:360px;border-bottom:2px solid #D5DCE8;padding:0 6px}
.chartcol .b{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%}
.chartcol .b i{display:block;width:100%;background:${COLORS.blue};border-radius:4px 4px 0 0}
.chartcol .b.pk i{background:${COLORS.red}}
.chartcol .b span{font-size:20px;margin-bottom:6px;color:${COLORS.ink}}
.chartlab{display:flex;gap:14px;padding:0 6px;margin-top:8px}
.chartlab span{flex:1;text-align:center;font-size:18px;color:#3A4866}
.split{display:grid;grid-template-columns:1.55fr 1fr;gap:32px}
.phase{border-radius:16px;color:#fff;padding:20px 24px;margin:0 0 18px}
.phase h4{margin:0 0 8px;font-size:23px}.phase p{margin:0;font-size:18px;line-height:1.4}
.phase.a{background:${COLORS.teal}}.phase.b{background:${COLORS.orange}}.phase.c{background:${COLORS.red}}
.tone{display:grid;grid-template-columns:230px 1fr;align-items:center;gap:20px;margin:0 0 54px}
.tone .lab{text-align:right;font-size:24px;color:#2B3957}
.tone .bar{display:flex;height:138px;border-radius:6px;overflow:hidden;width:760px}
.tone .bar div{display:flex;align-items:center;justify-content:center;color:#fff;font-size:24px}
.legend2{display:flex;gap:28px;justify-content:center;font-size:21px;margin-top:6px}
.legend2 i{display:inline-block;width:16px;height:16px;margin-right:8px;vertical-align:-2px}
.hb{display:grid;grid-template-columns:300px 1fr 70px;gap:14px;align-items:center;margin:0 0 15px;font-size:20px}
.hb .nm{text-align:right;color:#2B3957;line-height:1.15}
.hb .tr{height:34px;background:#F1F4F9;border-radius:4px}
.hb .fl{height:100%;border-radius:4px}
.hb .v{font-weight:700;color:${COLORS.ink}}
.big{border-radius:18px;color:#fff;text-align:center;padding:30px 20px;margin:0 0 20px}
.big .n{font-family:'Lora',Georgia,serif;font-size:80px;font-weight:700;line-height:1}
.big .l{font-size:20px;margin-top:10px;line-height:1.3}
.info{background:${COLORS.card};border-radius:18px;padding:18px 24px;margin:0 0 14px}
.info h3{margin:0 0 8px;font-size:25px;color:${COLORS.navy}}
.info p{margin:0;font-size:18px;line-height:1.4;color:#2B3957}
.ic{display:flex;gap:20px;align-items:flex-start}
.ic .dot{flex:none;width:56px;height:56px;border-radius:50%;color:#fff;font-size:26px;font-weight:700;display:flex;align-items:center;justify-content:center}
table.m{width:100%;border-collapse:collapse;font-size:23px}
table.m th{background:${COLORS.navy};color:#fff;text-align:left;padding:18px 22px;font-size:22px}
table.m td{padding:20px 22px;border-bottom:2px solid #D5DCE8}
table.m td.dir{font-weight:700;color:${COLORS.green}}
table.n td:first-child{font-weight:700;width:240px;vertical-align:top}
table.n td{font-size:20px;line-height:1.45}
.donutbox{display:flex;align-items:center;gap:30px}
.donutbox svg{width:330px;height:330px}
.lg{font-size:21px;line-height:1.9}
.lg i{display:inline-block;width:18px;height:18px;margin-right:10px;vertical-align:-2px;border-radius:3px}
`;

const slide = (cls, inner, { tenant, mark, no }) => `<section class="slide ${cls}">${inner}<div class="foot"><span>${tenant}${mark ? ` | ${mark}` : ''}</span><span>${no || ''}</span></div></section>`;

/**
 * ctx: values already computed by the report builder (see template.js). Functions: esc, fmt, pct, clip, L, donutSvg, platLabel.
 */
const buildPresentationBody = (ctx) => {
  const {
    esc, fmt, pct, clip, L, donutSvg, platLabel, platColor,
    event, tenant, windowStr: windowFull, period, dateStr, total, sent, sentTotal, engTotal, ev, riskParts, platformEntries, kws,
    analysis, places, authors, threatLevel, rationale, bottomLine, counts, narrativesToWatch, actions, notKnown, stats,
  } = ctx;
  const t = esc(tenant);
  const windowStr = period || windowFull;
  // Text on a slide is shortened by whole sentences, never cut in the middle of one.
  const whole = (text, max) => {
    const sentences = String(text || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/).filter(Boolean);
    let out = '';
    for (const sn of sentences) { if ((out + ' ' + sn).trim().length > max && out) break; out = (out + ' ' + sn).trim(); }
    if (out.length > max * 1.6) { const cut = out.slice(0, max).replace(/[,;:\s]+\S*$/, ''); out = cut.replace(/[.,;:\s]+$/, '') + '.'; }
    return out;
  };
  const noCite = (x) => String(x || '').replace(/\s*Posts?\s*(?:\[Post #\d+\][,\s]*(?:and\s*)?)+\.?/gi, ' ').replace(/\s*\[Post #\d+\]/g, '').replace(/\s+/g, ' ').trim();
  const nPosts = (n, one, many) => L(n === 1 ? one : many, { n });
  const compact = (n) => {
    const v = Number(n) || 0;
    if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(v >= 1e5 ? 0 : 1)}K`;
    return String(Math.round(v));
  };
  const pc = (a, b) => (b > 0 ? Math.round((1000 * a) / b) / 10 : 0);
  const posts = (ev || []).filter((e) => e.posted_at);

  // Tone shares: posts from the full counts; engagement from the posts listed in the evidence register.
  const engBy = { positive: 0, neutral: 0, negative: 0 };
  (ev || []).forEach((e) => { if (engBy[e.sentK] !== undefined) engBy[e.sentK] += Number(e.inter) || 0; });
  const engSum = engBy.positive + engBy.neutral + engBy.negative;
  const negPostPct = pc(sent.negative, sentTotal);
  const posPostPct = pc(sent.positive, sentTotal);
  const negEngPct = pc(engBy.negative, engSum);

  // ---- 1. Title
  const s1 = `
    <div class="left"><h1>${esc(L('Situation assessment and way forward'))}</h1><div class="sub">${esc(event.name || '')}</div>
      <div class="meta">${esc(L('Monitoring period'))} ${esc(windowStr)}<br>${esc(L('Prepared'))} ${esc(dateStr)} ${esc(L('by'))} ${t}</div></div>
    <div class="tiles">
      <div class="tile or"><div class="n">${fmt(total)}</div><div class="l">${esc(L('public posts read'))}</div></div>
      <div class="tile bl"><div class="n">${compact(engTotal)}</div><div class="l">${esc(L('engagements'))}</div></div>
      <div class="tile rd"><div class="n">${negPostPct}%</div><div class="l">${esc(L('negative posts'))}</div></div>
      <div class="tile gr"><div class="n">${posPostPct}%</div><div class="l">${esc(L('positive posts'))}</div></div>
    </div>
    <div class="note">${esc(L('A monitoring perspective, not legal advice. Allegations are claims made by posters, not findings. Risk bands are model labels, not analyst-reviewed.'))}</div>`;

  // ---- 2. In short
  const points = [];
  if (bottomLine) points.push({ c: COLORS.blue, tx: esc(whole(bottomLine, 330)) });
  if (engSum > 0) points.push({ c: COLORS.orange, tx: esc(L('Negative posts are {a}% of posts and draw {b}% of the engagement.', { a: negPostPct, b: negEngPct })) });
  points.push({ c: COLORS.purple, tx: `${esc(L('Risk level'))}: <b>${esc(L(threatLevel))}</b>. ${esc(whole(rationale, 260))}` });
  const dates = (analysis?.keyDates || []).filter((k) => !k.outside).slice(0, 1);
  if (dates.length) points.push({ c: COLORS.green, tx: `${esc(dates[0].date || '')}: ${esc(whole(dates[0].event || '', 200))}` });
  const s2 = `<h2>${esc(L('In short'))}</h2>
    <div class="row4">
      <div class="tile or"><div class="n">${fmt(total)}</div><div class="l">${esc(L('public posts'))}</div></div>
      <div class="tile bl"><div class="n">${compact(engTotal)}</div><div class="l">${esc(L('engagements'))}</div></div>
      <div class="tile rd"><div class="n">${negPostPct}%</div><div class="l">${esc(L('negative'))}</div></div>
      <div class="tile gr"><div class="n">${posPostPct}%</div><div class="l">${esc(L('positive'))}</div></div>
    </div>
    ${points.slice(0, 4).map((p, i) => `<div class="point"><div class="num" style="background:${p.c}">${i + 1}</div><div class="tx">${p.tx}</div></div>`).join('')}`;

  // ---- 3. Recommended actions
  const claimLines = (narrativesToWatch || []).slice(0, 2).map((n) => `<p><b>${esc(whole(noCite(n.narrative), 110))}</b><br>${esc(whole(noCite(n.riskNote), 130))}</p>`).join('')
    || `<p>${esc(L('No claim needs checking in this window.'))}</p>`;
  const actLines = (actions || []).slice(0, 2).map((a) => {
    const parts = String(a.action || '').split(/\s+[—–]\s+/);
    const m = String(a.detail || '').match(/\s*(Escalate if[^]*?)$/i);
    const doText = noCite(m ? String(a.detail).slice(0, m.index) : a.detail);
    return `<p><b>${esc(parts[0])}</b>${parts[1] ? ` · ${esc(parts[1])}` : ''}<br>${esc(whole(doText, 120))}${m ? `<span class="esc">${esc(whole(noCite(m[1]), 110))}</span>` : ''}</p>`;
  }).join('') || `<p>${esc(L('Maintain standard baseline monitoring.'))}</p>`;
  const watch = [];
  watch.push(L('Violence: {a} confirmed, {b} mentioned, {c} alleged or warned.', { a: counts.violenceConfirmed, b: counts.violenceMentioned, c: counts.alleged }));
  if (counts.detentions) watch.push(nPosts(counts.detentions, '{n} post reports arrests, detentions or a refused permission.', '{n} posts report arrests, detentions or a refused permission.'));
  (notKnown || []).slice(0, 2).forEach((x) => watch.push(noCite(String(typeof x === 'string' ? x : (x.text || x.item || '')).replace(/[.\s]+$/, ''))));
  const hasClaims = (narrativesToWatch || []).length > 0;
  const hasActs = (actions || []).length > 0;
  const cards3 = [
    hasClaims ? `<div class="card"><h3>${esc(L('Claims to verify and answer'))}</h3>${claimLines}</div>` : '',
    hasActs ? `<div class="card o"><h3>${esc(L('What to do first'))}</h3>${actLines}</div>` : '',
    `<div class="card g"><h3>${esc(L('What to watch next'))}</h3>${watch.filter(Boolean).map((w) => `<p>${esc(whole(w, 190))}</p>`).join('')}</div>`,
  ].filter(Boolean);
  const s3 = `<h2>${esc(L('Recommended actions'))}</h2><div class="cols3" style="grid-template-columns:repeat(${cards3.length},1fr)">${cards3.join('')}</div>${hasActs ? '' : `<p class="small" style="margin-top:22px">${esc(L('Maintain standard baseline monitoring.'))}</p>`}`;

  // ---- 4. How the conversation built up
  const byDay = {};
  posts.forEach((e) => {
    const k = String(e.posted_at).slice(0, 10);
    const d = byDay[k] || (byDay[k] = { n: 0, neg: 0 });
    d.n += 1; if (e.sentK === 'negative') d.neg += 1;
  });
  const days = Object.keys(byDay).sort().slice(-10);
  const maxDay = Math.max(1, ...days.map((d) => byDay[d].n));
  const peakDay = days.reduce((b, d) => (byDay[d].n > (byDay[b]?.n || 0) ? d : b), days[0]);
  const dayLab = (d) => { const x = new Date(`${d}T00:00:00Z`); return `${x.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][x.getUTCMonth()]}`; };
  const phaseOf = (list, cls, title) => {
    if (!list.length) return '';
    const ns = list.map((d) => byDay[d].n); const ng = list.map((d) => pc(byDay[d].neg, byDay[d].n));
    return `<div class="phase ${cls}"><h4>${esc(title)}</h4><p>${esc(dayLab(list[0]))}${list.length > 1 ? ` ${esc(L('to'))} ${esc(dayLab(list[list.length - 1]))}` : ''}: ${Math.min(...ns)}${Math.min(...ns) !== Math.max(...ns) ? ` ${esc(L('to'))} ${Math.max(...ns)}` : ''} ${esc(L('posts a day'))}, ${Math.round(Math.min(...ng))}% ${Math.round(Math.min(...ng)) !== Math.round(Math.max(...ng)) ? `${esc(L('to'))} ${Math.round(Math.max(...ng))}% ` : ''}${esc(L('negative'))}.</p></div>`;
  };
  const pi = days.indexOf(peakDay);
  const risingFrom = days.findIndex((d) => byDay[d].n >= 0.4 * maxDay);
  const early = days.slice(0, Math.max(0, Math.min(risingFrom < 0 ? pi : risingFrom, pi)));
  const rise = days.slice(early.length, pi);
  const peak = days.slice(pi);
  const s4 = `<h2>${esc(L('How the conversation built up'))}</h2><div class="split"><div>
      <div class="small" style="font-weight:700;margin-bottom:10px">${esc(L('Posts per day'))}</div>
      ${days.length ? `<div class="chartcol">${days.map((d) => `<div class="b${d === peakDay ? ' pk' : ''}"><span>${byDay[d].n}</span><i style="height:${Math.max(3, (100 * byDay[d].n) / maxDay)}%"></i></div>`).join('')}</div>
      <div class="chartlab">${days.map((d) => `<span>${esc(dayLab(d))}</span>`).join('')}</div>` : `<p class="small">${esc(L('No daily series in this window.'))}</p>`}
    </div><div>${phaseOf(early, 'a', L('Early phase'))}${phaseOf(rise, 'b', L('Escalation'))}${phaseOf(peak, 'c', L('Peak and after'))}</div></div>`;

  // ---- 5. Share of posts vs engagement
  const tone = (a, b, c, tot) => [[a, COLORS.red], [b, COLORS.grey], [c, COLORS.green]].map(([v, col]) => `<div style="width:${tot > 0 ? (100 * v) / tot : 0}%;background:${col}">${tot > 0 && (100 * v) / tot >= 6 ? `${pc(v, tot)}%` : ''}</div>`).join('');
  const s5 = `<h2>${esc(L('Where the engagement goes'))}</h2>
    <div class="tone"><div class="lab">${esc(L('Share of posts'))}</div><div class="bar">${tone(sent.negative, sent.neutral, sent.positive, sentTotal)}</div></div>
    <div class="tone"><div class="lab">${esc(L('Share of engagement'))}</div><div class="bar">${engSum > 0 ? tone(engBy.negative, engBy.neutral, engBy.positive, engSum) : ''}</div></div>
    <div class="legend2"><span><i style="background:${COLORS.red}"></i>${esc(L('Negative'))}</span><span><i style="background:${COLORS.grey}"></i>${esc(L('Neutral'))}</span><span><i style="background:${COLORS.green}"></i>${esc(L('Positive'))}</span></div>
    <p class="small" style="margin-top:26px">${esc(L('Engagement is counted over the {n} posts listed in the evidence register.', { n: fmt((ev || []).length) }))}</p>`;

  // ---- 6. What the posts are about
  const topKw = (kws || []).slice(0, 7);
  const kMax = Math.max(1, ...topKw.map((k) => Number(k.total_posts) || 0));
  const kTot = (kws || []).reduce((s, k) => s + (Number(k.total_posts) || 0), 0);
  const s6 = `<h2>${esc(L('What the posts are about'))}</h2><div class="split"><div>
      <div class="small" style="font-weight:700;margin-bottom:12px">${esc(L('Posts per keyword (a post can carry several)'))}</div>
      ${topKw.map((k, i) => `<div class="hb"><div class="nm">${esc(clip(k.keyword, 34))}</div><div class="tr"><div class="fl" style="width:${(100 * (Number(k.total_posts) || 0)) / kMax}%;background:${i === 0 ? COLORS.red : COLORS.grey}"></div></div><div class="v">${fmt(k.total_posts)}</div></div>`).join('') || `<p class="small">${esc(L('No keyword split for this event.'))}</p>`}
    </div><div>${topKw[0] ? `<div class="big" style="background:${COLORS.red}"><div class="n">${pc(Number(topKw[0].total_posts) || 0, kTot)}%</div><div class="l">${esc(L('of keyword matches are on "{k}"', { k: clip(topKw[0].keyword, 40) }))}</div></div>` : ''}</div></div>`;

  // ---- 7. Where it is concentrated + language
  const placeRows = (places || []).slice(0, 6).map((p) => {
    const mine = (ev || []).filter((e) => (e.places || []).some((x) => String(x).toLowerCase() === String(p.name).toLowerCase()));
    const neg = mine.filter((e) => e.sentK === 'negative').length;
    return { name: p.name, n: mine.length || p.count || 0, negPct: mine.length ? pc(neg, mine.length) : 0 };
  }).sort((a, b) => b.negPct - a.negPct);
  const scriptOf = (ch) => (/[ऀ-ॿ]/.test(ch) ? 'Devanagari' : /[଀-୿]/.test(ch) ? 'Odia' : /[ঀ-৿]/.test(ch) ? 'Bengali' : /[஀-௿]/.test(ch) ? 'Tamil' : /[ఀ-౿]/.test(ch) ? 'Telugu' : /[ಀ-೿]/.test(ch) ? 'Kannada' : /[ഀ-ൿ]/.test(ch) ? 'Malayalam' : /[઀-૿]/.test(ch) ? 'Gujarati' : /[਀-੿]/.test(ch) ? 'Gurmukhi' : /[؀-ۿ]/.test(ch) ? 'Arabic' : /[A-Za-z]/.test(ch) ? 'Roman' : '');
  const scriptCount = {};
  (ev || []).forEach((e) => {
    const cnt = {}; let tot = 0;
    for (const ch of String(e.text || '').replace(/https?:\/\/\S+|[#@]\S+/g, '')) { const s = scriptOf(ch); if (s) { cnt[s] = (cnt[s] || 0) + 1; tot += 1; } }
    const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]);
    if (!tot || !top.length) return;
    const key = top.length > 1 && top[1][1] / tot >= 0.25 ? 'Mixed' : top[0][0];
    scriptCount[key] = (scriptCount[key] || 0) + 1;
  });
  const scriptTot = Object.values(scriptCount).reduce((a, b) => a + b, 0);
  const scriptLine = Object.entries(scriptCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${esc(L(k))} ${pc(v, scriptTot).toFixed(0)}%`).join(' · ');
  const s7 = !placeRows.length ? `<h2>${esc(L('Language of the conversation'))}</h2><div class="info"><h3>${esc(L('Language'))}</h3><p>${scriptLine} ${esc(L('of posts. Respond in these scripts at a minimum.'))}</p></div><p class="small">${esc(L('No specific place is named in the posts.'))}</p>` : `<h2>${esc(L('Where the conversation is concentrated'))}</h2><div class="split"><div>
      <div class="small" style="font-weight:700;margin-bottom:12px">${placeRows.some((x) => x.negPct > 0) ? esc(L('Share of posts negative, by place named (overall {p}%)', { p: Math.round(negPostPct) })) : esc(L('Posts by place named'))}</div>
      ${placeRows.map((p) => { const byCount = !placeRows.some((x) => x.negPct > 0); const mx = Math.max(1, ...placeRows.map((x) => x.n)); return `<div class="hb"><div class="nm">${esc(clip(p.name, 28))}</div><div class="tr"><div class="fl" style="width:${byCount ? Math.max(3, (100 * p.n) / mx) : Math.max(1, p.negPct)}%;background:${!byCount && p.negPct > negPostPct ? COLORS.red : COLORS.blue}"></div></div><div class="v">${byCount ? p.n : `${p.negPct}%`}</div></div>`; }).join('') || `<p class="small">${esc(L('No specific place is named in the posts.'))}</p>`}
    </div><div>
      ${placeRows[0] ? `<div class="info"><h3>${esc(placeRows.slice().sort((a, b) => b.n - a.n)[0].name)}</h3><p>${esc(L('Named in {n} of the posts listed.', { n: placeRows.slice().sort((a, b) => b.n - a.n)[0].n }))}</p></div>` : ''}
      ${scriptLine ? `<div class="info"><h3>${esc(L('Language'))}</h3><p>${scriptLine} ${esc(L('of posts. Respond in these scripts at a minimum.'))}</p></div>` : ''}
    </div></div>`;

  // ---- 8. A few accounts set the tone
  const topAcc = Object.values(authors || {}).sort((a, b) => (b.inter || 0) - (a.inter || 0)).slice(0, 7);
  const aMax = Math.max(1, ...topAcc.map((a) => a.inter || 0));
  const platAgg = {};
  (ev || []).forEach((e) => { const p = e.plat || 'other'; const x = platAgg[p] || (platAgg[p] = { n: 0, inter: 0, neg: 0 }); x.n += 1; x.inter += Number(e.inter) || 0; if (e.sentK === 'negative') x.neg += 1; });
  const platList = Object.entries(platAgg).filter(([, v]) => v.n >= 2);
  const bestReach = platList.slice().sort((a, b) => b[1].inter / b[1].n - a[1].inter / a[1].n)[0];
  const mostNeg = platList.slice().sort((a, b) => b[1].neg / b[1].n - a[1].neg / a[1].n)[0];
  const topPlat = platformEntries[0];
  const s8 = `<h2>${esc(L('A few accounts set the tone'))}</h2><div class="split"><div>
      <div class="small" style="font-weight:700;margin-bottom:12px">${esc(L('Interactions (likes, shares, comments), top accounts'))}</div>
      ${topAcc.map((a) => `<div class="hb"><div class="nm">${esc(clip(a.author, 26))}, ${esc(platLabel(a.platform))}</div><div class="tr"><div class="fl" style="width:${(100 * (a.inter || 0)) / aMax}%;background:${COLORS.blue}"></div></div><div class="v">${compact(a.inter || 0)}</div></div>`).join('') || `<p class="small">${esc(L('No accounts in this set.'))}</p>`}
    </div><div>
      ${topPlat ? `<div class="big" style="background:${COLORS.orange}"><div class="n">${pc(Number(topPlat[1]), total).toFixed(0)}%</div><div class="l">${esc(L('of posts are on {p}', { p: platLabel(topPlat[0]) }))}</div></div>` : ''}
      ${bestReach ? `<div class="big" style="background:${COLORS.purple}"><div class="n" style="font-size:52px">${esc(platLabel(bestReach[0]))}</div><div class="l">${esc(L('has the strongest reach per post'))}</div></div>` : ''}
      ${mostNeg && mostNeg[1].neg ? `<div class="big" style="background:${COLORS.red}"><div class="n">${Math.round(pc(mostNeg[1].neg, mostNeg[1].n))}%</div><div class="l">${esc(L('negative on {p}, the highest', { p: platLabel(mostNeg[0]) }))}</div></div>` : ''}
    </div></div>`;

  // ---- 9. Claims that matter
  const claimBars = (narrativesToWatch || []).slice(0, 5).map((n) => {
    const best = Math.max(0, ...(n.posts || []).map((no) => { const e = (ev || []).find((x) => x.n === Number(no)); return e ? (Number(e.inter) || 0) : 0; }));
    return { label: n.narrative || '', v: best };
  });
  const cMax = Math.max(1, ...claimBars.map((c) => c.v));
  const s9 = `<h2>${esc(L('The claims that matter can be checked'))}</h2>
    <div class="small" style="font-weight:700;margin-bottom:12px">${esc(L('Interactions on the top post carrying each claim'))}</div>
    ${claimBars.map((c) => `<div class="hb" style="grid-template-columns:520px 1fr 90px"><div class="nm">${esc(clip(c.label, 90))}</div><div class="tr"><div class="fl" style="width:${(100 * c.v) / cMax}%;background:${COLORS.red}"></div></div><div class="v">${compact(c.v)}</div></div>`).join('') || `<p class="small">${esc(L('No claim needs checking in this window.'))}</p>`}`;

  // ---- 10. Risk signals
  const s10 = `<h2>${esc(L('Risk signals'))}</h2><div class="split"><div class="donutbox">${donutSvg(riskParts, String((counts.highRisk || 0)), L('high / critical'))}
      <div class="lg">${riskParts.map((p) => `<div><i style="background:${p.c}"></i>${esc(L(p.k))}: ${fmt(p.v)}</div>`).join('')}</div></div><div>
      <div class="info"><div class="ic"><div class="dot" style="background:${COLORS.red}">!</div><div><h3>${esc(L('Violence'))}</h3><p>${esc(L('{a} confirmed, {b} mentioned, {c} alleged or warned.', { a: counts.violenceConfirmed, b: counts.violenceMentioned, c: counts.alleged }))}</p></div></div></div>
      <div class="info"><div class="ic"><div class="dot" style="background:${COLORS.orange}">?</div><div><h3>${esc(L('Arrests and calls to act'))}</h3><p>${esc(L('Arrests or detentions reported: {a}. Posts calling people to act: {b}. Posts reporting a group mobilising: {c}.', { a: counts.detentions, b: counts.calls, c: counts.mobilising }))}</p></div></div></div>
      <div class="info"><div class="ic"><div class="dot" style="background:${COLORS.purple}">∗</div><div><h3>${esc(L('Level'))}: ${esc(L(threatLevel))}</h3><p>${esc(whole(rationale, 120))}</p></div></div></div>
    </div></div>`;

  // ---- 11. How we will know it is working
  const hi = (riskParts[0].v || 0) + (riskParts[1].v || 0);
  const s11 = `<h2>${esc(L('How we will know it is working'))}</h2><table class="m"><tr><th>${esc(L('Measure'))}</th><th>${esc(L('Baseline'))}: ${esc(windowStr)}</th><th>${esc(L('Direction we want'))}</th></tr>
    <tr><td>${esc(L('Share of negative posts'))}</td><td>${negPostPct}%</td><td class="dir">${esc(L('Down'))}</td></tr>
    <tr><td>${esc(L('Share of positive or neutral posts'))}</td><td>${Math.round((100 - negPostPct) * 10) / 10}% (${posPostPct}% + ${pc(sent.neutral, sentTotal)}%)</td><td class="dir">${esc(L('Up'))}</td></tr>
    ${engSum > 0 ? `<tr><td>${esc(L('Share of engagement going to negative posts'))}</td><td>${negEngPct}%</td><td class="dir">${esc(L('Down'))}</td></tr>` : ''}
    <tr><td>${esc(L('High and critical-risk posts'))}</td><td>${fmt(hi)}</td><td class="dir">${esc(L('Down'))}</td></tr></table>`;

  // ---- 12. Notes
  const collected = Number(stats.total_unique_posts || stats.total_media_count || total) || total;
  const unrelated = Number(stats.unrelated_posts_count || 0);
  const s12 = `<h2>${esc(L('Notes on the figures'))}</h2><table class="m n"><tr><th>${esc(L('Item'))}</th><th>${esc(L('What to know'))}</th></tr>
    <tr><td>${esc(L('Coverage'))}</td><td>${esc(L('{a} posts analysed as relevant; {b} set aside as unrelated; {c} posts are listed in the evidence register. Duplicates are merged.', { a: fmt(total), b: fmt(unrelated), c: fmt((ev || []).length) }))}</td></tr>
    <tr><td>${esc(L('Negative'))}</td><td>${esc(L('A negative post criticises or opposes; it measures opinion, not hostility or threat.'))}</td></tr>
    <tr><td>${esc(L('Risk'))}</td><td>${esc(L('Risk comes from calls to act, confirmed violence or a high-risk rating. Arrests and allegations are shown apart and are not violence. Risk bands are model labels, not analyst-reviewed.'))}</td></tr>
    <tr><td>${esc(L('Engagement'))}</td><td>${esc(L('Interactions are likes, shares and comments. Views are not added in.'))}</td></tr></table>`;

  // A slide with nothing to show (no claim to check) is left out instead of printing an empty page.
  const slides = [s1, s2, hasClaims || hasActs ? s3 : '', s4, s5, s6, s7, s8, claimBars.length ? s9 : '', s10, s11, s12].filter(Boolean);
  return slides.map((inner, i) => slide(i === 0 ? 'title' : '', inner, { tenant: t, mark: esc(ctx.classification || ''), no: i === 0 ? '' : String(i + 1) })).join('');
};

module.exports = { buildPresentationBody, PRESENTATION_CSS: CSS, SLIDE_W, SLIDE_H };
