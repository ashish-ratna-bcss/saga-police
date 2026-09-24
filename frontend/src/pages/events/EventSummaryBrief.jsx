import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';

/**
 * On-screen version of the Event Intelligence report. Same story and design language as the PDF
 * (backend/src/modules/events/eventIntelligenceReport): KPI strip, key findings, where/how charts,
 * narrative cards with [Post #n] evidence links, and risk kept separate from sentiment.
 * Every value comes from summaryData (stats, evidence_traceability, stats.report_analysis); nothing is estimated.
 */

const NARR_COLORS = ['#3B4CCA', '#0E8A8A', '#8A4FBF', '#C77A12', '#C2456A', '#5B6474', '#4C9A2A'];
const PLAT_COLORS = { x: '#1E2A44', twitter: '#1E2A44', youtube: '#E0A030', facebook: '#2A8FA8', instagram: '#C13584', telegram: '#2AABEE', whatsapp: '#25D366' };
const PLAT_LABELS = { x: 'X', twitter: 'X', youtube: 'YouTube', facebook: 'Facebook', instagram: 'Instagram', telegram: 'Telegram', whatsapp: 'WhatsApp' };

const n0 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const fmt = (v) => n0(v).toLocaleString('en-US');
const pct = (a, b, d = 1) => (n0(b) > 0 ? `${((100 * n0(a)) / n0(b)).toFixed(d)}%` : '0%');
const platLabel = (k) => PLAT_LABELS[String(k).toLowerCase()] || String(k).charAt(0).toUpperCase() + String(k).slice(1);
const platColor = (k) => PLAT_COLORS[String(k).toLowerCase()] || '#7A8499';

const stripEmoji = (s) => String(s).replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}️‍]/gu, '').trim();
const splitSections = (md) =>
  String(md || '')
    .split(/^#{1,4}\s+/m)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => {
      const nl = p.indexOf('\n');
      return { title: stripEmoji(nl === -1 ? p : p.slice(0, nl)).replace(/^\d+\.\s*/, ''), body: nl === -1 ? '' : p.slice(nl + 1).trim() };
    })
    .filter((s) => s.body && !/^Event Summary:/i.test(s.title));

const Tag = ({ kind }) => {
  const m = { R: ['REPORTED', 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'], D: ['DERIVED', 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'], O: ['AI READING', 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'] }[kind];
  return <span className={`text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded mr-1.5 align-middle ${m[1]}`}>{m[0]}</span>;
};

const Stack = ({ parts, height = 'h-6', labels = true }) => {
  const live = parts.filter((p) => p.v > 0);
  const tot = live.reduce((s, p) => s + p.v, 0);
  if (!tot) return <div className={`${height} rounded bg-muted`} />;
  return (
    <div className={`flex ${height} rounded overflow-hidden gap-px`}>
      {live.map((p) => (
        <div key={p.k} style={{ width: `${(100 * p.v) / tot}%`, background: p.c }} className="flex items-center justify-center text-[10px] font-bold text-white min-w-0" title={`${p.k}: ${p.v}`}>
          {labels && (100 * p.v) / tot > 9 ? fmt(p.v) : ''}
        </div>
      ))}
    </div>
  );
};

const Section = ({ n, name, q, children }) => (
  <section className="mb-7">
    <div className="flex items-baseline gap-3 border-b-2 border-foreground/80 pb-1.5 mb-3">
      <span className="text-lg font-bold text-indigo-600">{String(n).padStart(2, '0')}</span>
      <span className="text-sm font-bold tracking-[0.1em]">{name}</span>
      <span className="text-xs text-muted-foreground">{q}</span>
    </div>
    {children}
  </section>
);

const Card = ({ children, className = '' }) => <div className={`rounded-lg border border-border/70 p-4 bg-background ${className}`}>{children}</div>;

const linkCites = (text) => String(text || '').replace(/\[Post #(\d+)\]/g, '[Post #$1](#cite-$1)');

const Md = ({ children, onCite, className = '' }) => (
  <div className={`prose dark:prose-invert max-w-none text-[13px] leading-6 prose-p:my-1.5 prose-li:my-0.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-p:text-foreground/85 prose-li:text-foreground/85 ${className}`}>
    <ReactMarkdown
      components={{
        a: ({ href, children: c }) => {
          const m = String(href || '').match(/^#cite-(\d+)$/);
          if (m) return <button type="button" onClick={() => onCite?.(Number(m[1]))} className="font-bold text-indigo-600 hover:underline">{c}</button>;
          return <a href={href} target="_blank" rel="noreferrer">{c}</a>;
        },
      }}
    >
      {linkCites(children)}
    </ReactMarkdown>
  </div>
);

const citeBtns = (arr, onCite) =>
  (arr || []).map((n, i) => (
    <React.Fragment key={n}>
      {i > 0 && ', '}
      <button type="button" onClick={() => onCite?.(n)} className="font-bold text-indigo-600 hover:underline">#{n}</button>
    </React.Fragment>
  ));

/** Main "Event Summary" tab: brief → see → understand → measure. */
export function EventBrief({ summaryData, platformList, displayName, onCite }) {
  const stats = summaryData?.stats || {};
  const report = stats.structured_report || null; // fixed-structure JSON written by the LLM in the single summary call
  const analysis = report;
  const ev = summaryData?.evidence_traceability || [];
  const total = n0(stats.total_unique_posts || stats.total_media_count);
  const s = stats.sentiment_counts || {};
  const sent = { positive: n0(s.positive ?? s.praise), neutral: n0(s.neutral ?? s.news), negative: n0(s.negative ?? s.criticism) };
  const sentTotal = sent.positive + sent.neutral + sent.negative;
  const risk = { critical: 0, high: 0, medium: 0, low: 0, ...(stats.risk_counts || {}) };
  const highRisk = n0(risk.critical) + n0(risk.high);
  const eng = stats.total_engagement || {};
  const engTotal = n0(eng.likes) + n0(eng.shares) + n0(eng.comments);
  const plats = (platformList || []).filter((p) => p.count > 0).sort((a, b) => b.count - a.count);
  const lead = plats[0];
  const entities = useMemo(
    () => Object.entries(stats.target_classification || {}).map(([k, v]) => ({ name: k, total: n0(v.total), praise: n0(v.praise), news: n0(v.news), crit: n0(v.criticism) })).filter((e) => e.total > 0).sort((a, b) => b.total - a.total),
    [stats.target_classification]
  );
  const critTotal = entities.reduce((a, e) => a + e.crit, 0);
  const topEntity = entities[0];
  const N = analysis?.narratives || [];
  const postNarr = analysis?.postNarrative || {};
  const sections = useMemo(() => {
    if (report && (report.situation || report.actions?.length)) {
      const cites = (arr) => (arr && arr.length ? ' ' + arr.map((x) => `[Post #${x}]`).join('') : '');
      return [
        { title: 'Situation & event scope', body: report.situation },
        { title: 'Social commentary & target sentiment', body: report.sentimentCommentary },
        { title: 'Public order & threat assessment', body: report.publicOrder },
        { title: 'Active platforms & distribution channels', body: report.platformsCommentary },
        { title: 'Recommended operational actions', body: (report.actions || []).map((a, i) => `${i + 1}. **${a.action}:** ${a.detail}${cites(a.posts)}`).join('\n') },
      ].filter((x) => x.body);
    }
    return splitSections(summaryData?.summary);
  }, [report, summaryData?.summary]);
  const isFallback = summaryData?.summary_source && summaryData.summary_source !== 'llm';
  const evOf = (code) => ev.filter((e) => postNarr[(String(e.citationTag || '').match(/\d+/) || [])[0]] === code);

  const findings = [];
  if (sentTotal) findings.push([`Tone is ${sent.neutral >= sent.positive && sent.neutral >= sent.negative ? 'mainly news and updates' : 'mixed'}.`, `${fmt(sent.neutral)} of ${fmt(sentTotal)} posts (${pct(sent.neutral, sentTotal)}) are neutral; praise ${fmt(sent.positive)} (${pct(sent.positive, sentTotal)}), criticism ${fmt(sent.negative)} (${pct(sent.negative, sentTotal)}).`]);
  if (lead) findings.push([`${lead.label} carries ${pct(lead.count, total)} of the volume.`, plats.map((p) => `${p.label} ${fmt(p.count)} (${pct(p.count, total)})`).join(', ') + '.']);
  if (topEntity) findings.push([`“${topEntity.name}” is the most common target.`, `${fmt(topEntity.total)} posts (${pct(topEntity.total, total)})${critTotal ? `; ${fmt(topEntity.crit)} of ${fmt(critTotal)} critical posts (${pct(topEntity.crit, critTotal)}) are aimed at it` : ''}.`]);
  findings.push([N.length ? `${N.length} narratives emerge from the evidence sample.` : 'Narratives are not available for this summary.', N.length ? `${N.map((n) => n.title).join('; ')}. Narrative volumes are not measured.` : 'Regenerate the summary to add the narrative analysis.']);
  findings.push([highRisk ? `${fmt(highRisk)} posts carry a high or critical risk level.` : 'No high or critical risk posts were flagged.', `Risk is separate from sentiment: ${fmt(risk.critical)} critical, ${fmt(risk.high)} high, ${fmt(risk.medium)} medium, ${fmt(risk.low)} low.`]);

  const findingsFinal = report?.keyFindings?.length ? report.keyFindings.map((k) => [k.headline, k.detail]) : findings;

  const kpis = [
    ['Unique posts', fmt(total), `${fmt(stats.relevant_posts_count)} event-relevant`],
    ['Lead platform', lead ? lead.label : '–', lead ? `${fmt(lead.count)} posts · ${pct(lead.count, total)}` : ''],
    ['News / neutral', pct(sent.neutral, sentTotal, 0), `${pct(sent.positive, sentTotal, 0)} praise · ${pct(sent.negative, sentTotal, 0)} crit.`],
    ['High / critical risk', fmt(highRisk), `${fmt(risk.medium)} medium · ${fmt(risk.low)} low`],
    ['Engagement', fmt(engTotal), engTotal ? `${pct(eng.likes, engTotal)} likes` : 'not available'],
    ['Cited evidence', fmt(ev.length), `of ${fmt(total)} posts`],
  ];

  return (
    <div className="text-foreground">
      {/* Header strip + KPIs + bottom line + key findings */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
        <div className="text-[10px] font-bold tracking-[0.16em] text-indigo-600">EVENT INTELLIGENCE BRIEF</div>
        <span className="text-[11px] text-muted-foreground">{summaryData?.event?.location || 'Region not specified'}</span>
        {summaryData?.model && !isFallback && <span className="text-[11px] text-muted-foreground">· AI: {summaryData.model}</span>}
        {isFallback && <span className="text-[11px] text-amber-600">· rule-based fallback (model unavailable)</span>}
      </div>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
        {kpis.map(([l, v, sub]) => (
          <div key={l} className="rounded-lg border border-border/70 px-3 py-2.5 bg-muted/20">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground truncate">{l}</div>
            <div className="text-lg font-bold leading-tight truncate" title={String(v)}>{v}</div>
            <div className="text-[10px] text-muted-foreground truncate" title={sub}>{sub}</div>
          </div>
        ))}
      </div>

      {report?.bottomLine && (
        <div className="rounded-lg border-l-4 border-indigo-500 bg-indigo-500/5 px-4 py-3 mb-4 text-[13px] leading-6">
          <span className="text-[10px] font-bold tracking-[0.14em] text-indigo-600 mr-2">BOTTOM LINE</span><Tag kind="O" />
          <Md onCite={onCite} className="inline">{report.bottomLine}</Md>
        </div>
      )}

      <div className="mb-6">
        <div className="text-[10px] font-bold tracking-[0.16em] text-indigo-600 mb-2">KEY FINDINGS {report?.keyFindings?.length ? <Tag kind="O" /> : <Tag kind="D" />}</div>
        <div className="grid md:grid-cols-2 gap-2.5">
          {findingsFinal.map(([a, b], i) => (
            <div key={a} className="rounded-lg border border-border/70 p-3 flex gap-3">
              <div className="text-xl font-bold text-indigo-600 leading-none w-5 shrink-0">{i + 1}</div>
              <div className="min-w-0"><div className="text-[13px] font-semibold leading-snug">{a}</div><div className="text-xs text-muted-foreground mt-0.5 leading-5">{b}</div></div>
            </div>
          ))}
        </div>
      </div>

      <Section n={1} name="SEE" q="What is happening?">
        <div className="grid md:grid-cols-2 gap-3.5">
          <Card>
            <div className="text-[11px] italic text-muted-foreground mb-1"><Tag kind="R" /><Tag kind="D" />Where is it happening?</div>
            <div className="font-semibold text-sm mb-2">Posts by platform</div>
            <div className="space-y-1.5">
              {plats.map((p) => (
                <div key={p.key} className="grid grid-cols-[70px_1fr_auto] items-center gap-2 text-xs">
                  <span className="text-right">{p.label}</span>
                  <div className="h-4 rounded bg-muted overflow-hidden"><div className="h-full rounded" style={{ width: `${(100 * p.count) / plats[0].count}%`, background: platColor(p.key) }} /></div>
                  <span className="font-bold tabular-nums">{fmt(p.count)} · {pct(p.count, total)}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <div className="text-[11px] italic text-muted-foreground mb-1"><Tag kind="R" /><Tag kind="D" />What is the tone?</div>
            <div className="font-semibold text-sm mb-2">Sentiment of {fmt(sentTotal)} posts</div>
            <Stack parts={[{ k: 'Praise', v: sent.positive, c: '#1F9D6B' }, { k: 'News', v: sent.neutral, c: '#6C8EBF' }, { k: 'Criticism', v: sent.negative, c: '#D9483B' }]} />
            <div className="flex gap-4 text-[11px] mt-2 text-muted-foreground">
              <span><i className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: '#1F9D6B' }} />Praise {fmt(sent.positive)}</span>
              <span><i className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: '#6C8EBF' }} />News {fmt(sent.neutral)}</span>
              <span><i className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: '#D9483B' }} />Criticism {fmt(sent.negative)}</span>
            </div>
            <div className="text-[11px] text-muted-foreground mt-2">Praise to criticism {sent.negative ? `${(sent.positive / sent.negative).toFixed(1)} : 1` : 'n/a'} <Tag kind="D" />. Criticism is tone, not danger, and is kept separate from risk.</div>
          </Card>
        </div>
      </Section>

      <Section n={2} name="UNDERSTAND" q="What are the key issues and narratives?">
        {N.length ? (
          <>
            <p className="text-xs text-muted-foreground mb-3"><Tag kind="O" />Narratives are read by the AI from the {fmt(ev.length)} cited posts, one main narrative per post. Volumes are not measured. Click a post number to open its evidence.</p>
            {N.map((n, i) => {
              const es = evOf(n.code);
              const tone = ['positive', 'neutral', 'negative'].map((k) => es.filter((e) => { const x = String(e.sentiment || '').toLowerCase(); return k === 'positive' ? x.startsWith('pos') || x === 'praise' : k === 'negative' ? x.startsWith('neg') || x === 'criticism' : !(x.startsWith('pos') || x === 'praise' || x.startsWith('neg') || x === 'criticism'); }).length);
              return (
                <div key={n.code} className="rounded-lg border border-border/70 mb-3 overflow-hidden grid grid-cols-[6px_1fr]">
                  <div style={{ background: NARR_COLORS[i % NARR_COLORS.length] }} />
                  <div className="p-3.5">
                    <div className="flex justify-between items-baseline"><div className="font-semibold text-sm">{n.code}. {n.title}</div><div className="text-[11px] text-muted-foreground">{es.length} cited posts</div></div>
                    <div className="mt-1.5 grid grid-cols-[130px_1fr] gap-x-3 gap-y-1 text-xs">
                      <span className="uppercase tracking-wide text-[10px] text-muted-foreground pt-0.5">What is discussed</span><Md onCite={onCite} className="!text-xs">{n.discussed}</Md>
                      <span className="uppercase tracking-wide text-[10px] text-muted-foreground pt-0.5">Tone</span><span>{n.tone}</span>
                      <span className="uppercase tracking-wide text-[10px] text-muted-foreground pt-0.5">Risk / sensitivity</span><span>{n.risk}</span>
                      <span className="uppercase tracking-wide text-[10px] text-muted-foreground pt-0.5">Evidence</span>
                      <span className="text-muted-foreground">{tone[0]} positive · {tone[1]} neutral · {tone[2]} negative &nbsp;|&nbsp; <b className="text-foreground">{citeBtns(n.posts, onCite)}</b></span>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        ) : (
          <Card className="text-xs text-muted-foreground">Narrative analysis is not available for this summary. Regenerate the summary to create it.</Card>
        )}
        <div className="text-sm font-semibold mt-5 mb-2"><Tag kind="O" />AI briefing</div>
        <p className="text-[11px] text-muted-foreground mb-2">{isFallback ? 'Rule-based briefing (the language model did not return a full narrative).' : `Generated by ${summaryData?.model || 'the platform language model'}.`}</p>
        {sections.map((sec, i) => (
          <div key={sec.title} className="rounded-lg border border-border/70 mb-3 overflow-hidden grid grid-cols-[6px_1fr]">
            <div style={{ background: NARR_COLORS[i % NARR_COLORS.length] }} />
            <div className="p-3.5"><div className="font-semibold text-sm mb-1">{sec.title}</div><Md onCite={onCite}>{sec.body}</Md></div>
          </div>
        ))}
      </Section>

      <Section n={4} name="MEASURE" q="How large and how targeted?">
        <Card>
          <div className="text-[11px] italic text-muted-foreground mb-1"><Tag kind="R" /><Tag kind="D" />Who draws criticism?</div>
          <div className="font-semibold text-sm mb-2">Sentiment by target entity</div>
          {entities.length ? (
            <div className="space-y-1.5">
              {entities.map((e) => (
                <div key={e.name} className="grid grid-cols-[120px_1fr_90px] items-center gap-2 text-xs">
                  <span className="text-right">{e.name} <b>{fmt(e.total)}</b></span>
                  <Stack height="h-4" labels={false} parts={[{ k: 'Praise', v: e.praise, c: '#1F9D6B' }, { k: 'News', v: e.news, c: '#6C8EBF' }, { k: 'Criticism', v: e.crit, c: '#D9483B' }]} />
                  <span className={`font-bold tabular-nums ${e.crit / e.total > 0.05 ? 'text-rose-600' : 'text-muted-foreground'}`}>{pct(e.crit, e.total)} crit.</span>
                </div>
              ))}
            </div>
          ) : <div className="text-xs text-muted-foreground">No entity classification is available.</div>}
          <div className="text-[11px] text-muted-foreground mt-2">The entity is the classifier's target for a post; criticism aimed at an organisation is not necessarily criticism of the event. Full charts (keywords, timeline, sources) are in the downloadable report.</div>
        </Card>
      </Section>
    </div>
  );
}

/** Risk & Advisory tab header: risk kept separate from sentiment, plus claims and alerts from the AI analysis. */
export function RiskAlerts({ summaryData, onCite }) {
  const stats = summaryData?.stats || {};
  const analysis = stats.structured_report || null;
  const risk = { critical: 0, high: 0, medium: 0, low: 0, ...(stats.risk_counts || {}) };
  const s = stats.sentiment_counts || {};
  const neg = n0(s.negative ?? s.criticism);
  const total = n0(stats.total_unique_posts || stats.total_media_count);
  const highRisk = n0(risk.critical) + n0(risk.high);
  const claims = analysis?.claims || [];
  const ev = summaryData?.evidence_traceability || [];
  const riskPosts = ev.filter((e) => ['critical', 'high'].includes(String(e.risk_level || '').toLowerCase()));

  return (
    <div className="mb-6">
      <Section n={7} name="ALERT" q="What needs attention?">
        <Card className="mb-3">
          <div className="text-[11px] italic text-muted-foreground mb-1"><Tag kind="R" />How is risk distributed, separately from sentiment?</div>
          <Stack parts={[{ k: 'Critical', v: n0(risk.critical), c: '#7A1F1F' }, { k: 'High', v: n0(risk.high), c: '#D9483B' }, { k: 'Medium', v: n0(risk.medium), c: '#E0A030' }, { k: 'Low', v: n0(risk.low), c: '#1F9D6B' }]} />
          <div className="flex gap-4 text-[11px] text-muted-foreground mt-2 flex-wrap">
            <span>Critical {fmt(risk.critical)}</span><span>High {fmt(risk.high)}</span><span>Medium {fmt(risk.medium)}</span><span>Low {fmt(risk.low)}</span>
          </div>
        </Card>
        <div className="grid md:grid-cols-2 gap-3 mb-3 text-xs">
          <div className={`rounded-lg border-l-4 p-3 ${highRisk ? 'border-rose-500 bg-rose-500/5' : 'border-emerald-500 bg-emerald-500/5'}`}>
            <b>{highRisk ? `${fmt(highRisk)} high or critical risk posts.` : 'No alert: public order, threat, mobilisation.'}</b> {highRisk ? 'Review the alert cards below.' : 'No post is flagged high or critical.'}
          </div>
          <div className="rounded-lg border-l-4 border-indigo-500 bg-indigo-500/5 p-3">
            <b>Sentiment is not risk.</b> {fmt(neg)} critical posts ({pct(neg, total)}) are opinion or policy feedback unless flagged high or critical. Misinformation and geopolitical sensitivity are not scored by the platform, so no score is shown.
          </div>
        </div>
        {claims.map((c) => (
          <div key={c.claim} className={`rounded-lg border border-border/70 border-l-4 p-3 mb-2 ${c.triage === 'VERIFY' ? 'border-l-rose-500' : 'border-l-indigo-500'}`}>
            <div className="flex justify-between gap-2"><b className="text-sm">{c.claim}</b><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded text-white h-fit ${c.triage === 'VERIFY' ? 'bg-rose-500' : 'bg-indigo-500'}`}>{c.triage}</span></div>
            <div className="text-xs mt-1">{c.note}</div>
            <div className="text-[11px] text-muted-foreground mt-1"><b>Evidence:</b> {citeBtns(c.posts, onCite)} · <Tag kind="O" /></div>
          </div>
        ))}
        {riskPosts.slice(0, 6).map((e) => (
          <div key={e.id || e.citationTag} className="rounded-lg border border-border/70 border-l-4 border-l-rose-600 p-3 mb-2 text-xs">
            <div className="flex justify-between"><b>{e.citationTag} · @{e.author} · {platLabel(e.platform)}</b><span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white bg-rose-600">{String(e.risk_level).toUpperCase()} RISK</span></div>
            <div className="mt-1 text-muted-foreground">{String(e.text || '').slice(0, 220)}</div>
          </div>
        ))}
        {!claims.length && !analysis && <Card className="text-xs text-muted-foreground">Claim analysis is not available for this summary. Regenerate the summary to create it.</Card>}
      </Section>
    </div>
  );
}
