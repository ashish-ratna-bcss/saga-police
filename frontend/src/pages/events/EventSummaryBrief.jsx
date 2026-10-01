import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';

/**
 * On-screen Event Intelligence brief — matches the senior PDF style.
 * All values come from summaryData / event / tenant props (no hardcoded geography or orgs).
 */

const NARR_COLORS = ['#1F6F6A', '#12324D', '#C45C26', '#1B7A4E', '#B42318', '#5B6B78', '#3D5568'];
const PLAT_COLORS = { x: '#1E2A44', twitter: '#1E2A44', youtube: '#E0A030', facebook: '#2A8FA8', instagram: '#C13584', telegram: '#2AABEE', whatsapp: '#25D366', reddit: '#FF4500' };
const PLAT_LABELS = { x: 'X', twitter: 'X', youtube: 'YouTube', facebook: 'Facebook', instagram: 'Instagram', telegram: 'Telegram', whatsapp: 'WhatsApp', reddit: 'Reddit' };

const n0 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const fmt = (v) => n0(v).toLocaleString('en-US');
const pct = (a, b, d = 0) => (n0(b) > 0 ? `${((100 * n0(a)) / n0(b)).toFixed(d)}%` : '0%');
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

const Section = ({ n, name, children }) => (
  <section className="mb-7">
    <div className="flex items-baseline gap-3 border-b-2 border-teal-700/80 pb-1.5 mb-3">
      <span className="text-lg font-bold text-slate-800 dark:text-slate-100">{String(n).padStart(2, '0')}</span>
      <span className="text-sm font-bold tracking-[0.06em] text-slate-800 dark:text-slate-100">{name}</span>
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
          if (m) return <button type="button" onClick={() => onCite?.(Number(m[1]))} className="font-bold text-teal-700 hover:underline">{c}</button>;
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
      <button type="button" onClick={() => onCite?.(n)} className="font-bold text-teal-700 hover:underline">#{n}</button>
    </React.Fragment>
  ));

export function EventBrief({ summaryData, platformList, displayName, tenantName, onCite }) {
  const stats = summaryData?.stats || {};
  const report = stats.structured_report || null;
  const analysis = report;
  const ev = summaryData?.evidence_traceability || [];
  const total = n0(stats.total_unique_posts || stats.total_media_count);
  const s = stats.sentiment_counts || {};
  const sent = { positive: n0(s.positive ?? s.praise), neutral: n0(s.neutral ?? s.news), negative: n0(s.negative ?? s.criticism) };
  const sentTotal = Math.max(sent.positive + sent.neutral + sent.negative, 1);
  const eng = stats.total_engagement || {};
  const engTotal = n0(eng.likes) + n0(eng.shares) + n0(eng.comments);
  const plats = (platformList || []).filter((p) => p.count > 0).sort((a, b) => b.count - a.count);
  const lead = plats[0];
  const eventLoc = summaryData?.event?.location || '';
  const tenant = (tenantName || '').trim();
  const entities = useMemo(
    () => Object.entries(stats.target_classification || {}).map(([k, v]) => ({ name: k, total: n0(v.total), praise: n0(v.praise), news: n0(v.news), crit: n0(v.criticism) })).filter((e) => e.total > 0).sort((a, b) => b.total - a.total),
    [stats.target_classification]
  );
  const N = analysis?.narratives || [];
  const postNarr = analysis?.postNarrative || {};
  const sections = useMemo(() => {
    if (report && (report.situation || report.actions?.length)) {
      const cites = (arr) => (arr && arr.length ? ` ${arr.map((x) => `[Post #${x}]`).join('')}` : '');
      return [
        { title: 'Situation', body: report.situation },
        { title: 'Sentiment commentary', body: report.sentimentCommentary },
        { title: 'Public order', body: report.publicOrder },
        { title: 'Platforms & voices', body: report.platformsCommentary },
        { title: 'Recommended actions', body: (report.actions || []).map((a, i) => `${i + 1}. **${a.action}:** ${a.detail}${cites(a.posts)}`).join('\n') },
      ].filter((x) => x.body);
    }
    return splitSections(summaryData?.summary);
  }, [report, summaryData?.summary]);
  const isFallback = summaryData?.summary_source && summaryData.summary_source !== 'llm';
  const evOf = (code) => ev.filter((e) => postNarr[(String(e.citationTag || '').match(/\d+/) || [])[0]] === code);

  const findingsFinal = report?.keyFindings?.length
    ? report.keyFindings.map((k) => [k.headline, k.detail])
    : [];

  const kpis = [
    ['Total posts', fmt(total), `${fmt(stats.relevant_posts_count)} event-relevant`],
    ['Lead platform', lead ? lead.label : '—', lead ? `${fmt(lead.count)} · ${pct(lead.count, total)}` : ''],
    ['Positive', pct(sent.positive, sentTotal), fmt(sent.positive)],
    ['Neutral', pct(sent.neutral, sentTotal), fmt(sent.neutral)],
    ['Negative', pct(sent.negative, sentTotal), fmt(sent.negative)],
    ['Engagement', fmt(engTotal), `${fmt(ev.length)} cited`],
  ];

  const criticalEv = ev.filter((e) => {
    const x = String(e.sentiment || '').toLowerCase();
    return x.startsWith('neg') || x === 'criticism' || ['critical', 'high'].includes(String(e.risk_level || '').toLowerCase());
  }).slice(0, 8);

  return (
    <div className="text-foreground">
      <div className="rounded-lg bg-slate-900 text-white px-4 py-3 mb-4">
        <div className="text-[10px] font-bold tracking-[0.14em] text-slate-300">
          {tenant ? `${tenant.toUpperCase()} · ` : ''}DAILY INTELLIGENCE BRIEF
        </div>
        <div className="text-base font-semibold mt-0.5">{displayName || summaryData?.event?.name || 'Event'}</div>
        <div className="text-[11px] text-slate-300 mt-0.5">
          {eventLoc || 'Location not specified'}
          {summaryData?.model && !isFallback ? ` · ${summaryData.model}` : ''}
          {isFallback ? ' · rule-based summary' : ''}
        </div>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
        {kpis.map(([l, v, sub]) => (
          <div key={l} className="rounded-lg border border-border/70 px-3 py-2.5 bg-slate-50 dark:bg-slate-900/40">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground truncate">{l}</div>
            <div className="text-lg font-bold leading-tight truncate" title={String(v)}>{v}</div>
            <div className="text-[10px] text-muted-foreground truncate" title={sub}>{sub}</div>
          </div>
        ))}
      </div>

      {report?.bottomLine && (
        <div className="rounded-lg border-l-4 border-teal-700 bg-teal-700/5 px-4 py-3 mb-4 text-[13px] leading-6">
          <span className="text-[10px] font-bold tracking-[0.14em] text-teal-800 dark:text-teal-300 mr-2">BOTTOM LINE</span>
          <Md onCite={onCite} className="inline">{report.bottomLine}</Md>
        </div>
      )}

      {findingsFinal.length > 0 && (
        <div className="mb-6">
          <div className="text-[10px] font-bold tracking-[0.14em] text-slate-600 dark:text-slate-300 mb-2">KEY FINDINGS</div>
          <div className="grid md:grid-cols-2 gap-2.5">
            {findingsFinal.map(([a, b], i) => (
              <div key={a} className="rounded-lg border border-border/70 p-3 flex gap-3">
                <div className="text-xl font-bold text-teal-700 leading-none w-5 shrink-0">{i + 1}</div>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold leading-snug">{a}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 leading-5">{b}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Section n={1} name="ACTIVITY">
        <div className="grid md:grid-cols-2 gap-3.5 mb-3">
          <Card>
            <div className="font-semibold text-sm mb-2">Posts by platform</div>
            <div className="space-y-1.5">
              {plats.map((p) => (
                <div key={p.key} className="grid grid-cols-[70px_1fr_auto] items-center gap-2 text-xs">
                  <span className="text-right">{p.label}</span>
                  <div className="h-4 rounded bg-muted overflow-hidden">
                    <div className="h-full rounded" style={{ width: `${(100 * p.count) / plats[0].count}%`, background: platColor(p.key) }} />
                  </div>
                  <span className="font-bold tabular-nums">{fmt(p.count)} · {pct(p.count, total)}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <div className="font-semibold text-sm mb-2">Sentiment</div>
            <Stack parts={[
              { k: 'Positive', v: sent.positive, c: '#1B7A4E' },
              { k: 'Neutral', v: sent.neutral, c: '#5B6B78' },
              { k: 'Negative', v: sent.negative, c: '#B42318' },
            ]} />
            <div className="flex gap-4 text-[11px] mt-2 text-muted-foreground">
              <span>Positive {fmt(sent.positive)}</span>
              <span>Neutral {fmt(sent.neutral)}</span>
              <span>Negative {fmt(sent.negative)}</span>
            </div>
          </Card>
        </div>
        {N.length > 0 && (
          <div className="space-y-2.5">
            {N.map((n, i) => (
              <div key={n.code || n.title} className="rounded-lg border border-border/70 overflow-hidden grid grid-cols-[6px_1fr]">
                <div style={{ background: NARR_COLORS[i % NARR_COLORS.length] }} />
                <div className="p-3.5">
                  <div className="font-semibold text-sm">{n.title}</div>
                  <Md onCite={onCite} className="!text-xs mt-1">{n.discussed}</Md>
                  {n.posts?.length > 0 && (
                    <div className="text-[11px] text-muted-foreground mt-1">Evidence: <b className="text-foreground">{citeBtns(n.posts, onCite)}</b></div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {sections.slice(0, 3).map((sec, i) => (
          <div key={sec.title} className="rounded-lg border border-border/70 mb-3 mt-3 overflow-hidden grid grid-cols-[6px_1fr]">
            <div style={{ background: NARR_COLORS[i % NARR_COLORS.length] }} />
            <div className="p-3.5">
              <div className="font-semibold text-sm mb-1">{sec.title}</div>
              <Md onCite={onCite}>{sec.body}</Md>
            </div>
          </div>
        ))}
      </Section>

      <Section n={4} name="SENTIMENT">
        <Card>
          <Stack parts={[
            { k: 'Positive', v: sent.positive, c: '#1B7A4E' },
            { k: 'Neutral', v: sent.neutral, c: '#5B6B78' },
            { k: 'Negative', v: sent.negative, c: '#B42318' },
          ]} />
          <div className="text-xs text-muted-foreground mt-2">
            Positive {pct(sent.positive, sentTotal)} · Neutral {pct(sent.neutral, sentTotal)} · Negative {pct(sent.negative, sentTotal)}
          </div>
        </Card>
      </Section>

      <Section n={5} name="CRITICAL / NEGATIVE DISCOURSE">
        {criticalEv.length ? (
          <div className="space-y-2">
            {criticalEv.map((e) => (
              <div key={e.id || e.citationTag} className="rounded-lg border border-border/70 border-l-4 border-l-rose-600 p-3 text-xs">
                <div className="flex justify-between gap-2">
                  <b>{e.citationTag || ''} · @{String(e.author || '').replace(/^@/, '')} · {platLabel(e.platform)}</b>
                </div>
                <div className="mt-1 text-muted-foreground">{String(e.text || '').slice(0, 220)}</div>
              </div>
            ))}
          </div>
        ) : (
          <Card className="text-xs text-muted-foreground">No negative or high-risk posts in the cited sample.</Card>
        )}
      </Section>

      <Section n={6} name="LEADERS / TARGETS">
        <Card>
          {entities.length ? (
            <div className="space-y-1.5">
              {entities.map((e) => (
                <div key={e.name} className="grid grid-cols-[120px_1fr_90px] items-center gap-2 text-xs">
                  <span className="text-right">{e.name} <b>{fmt(e.total)}</b></span>
                  <Stack height="h-4" labels={false} parts={[
                    { k: 'Positive', v: e.praise, c: '#1B7A4E' },
                    { k: 'Neutral', v: e.news, c: '#5B6B78' },
                    { k: 'Negative', v: e.crit, c: '#B42318' },
                  ]} />
                  <span className="font-bold tabular-nums text-muted-foreground">{pct(e.crit, e.total)} neg.</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">No entity classification available.</div>
          )}
        </Card>
      </Section>
    </div>
  );
}

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
      <Section n={7} name="ALERTS & AMPLIFIERS">
        <Card className="mb-3">
          <div className="font-semibold text-sm mb-2">Risk distribution</div>
          <Stack parts={[
            { k: 'Critical', v: n0(risk.critical), c: '#7A1F1F' },
            { k: 'High', v: n0(risk.high), c: '#B42318' },
            { k: 'Medium', v: n0(risk.medium), c: '#C45C26' },
            { k: 'Low', v: n0(risk.low), c: '#1B7A4E' },
          ]} />
          <div className="flex gap-4 text-[11px] text-muted-foreground mt-2 flex-wrap">
            <span>Critical {fmt(risk.critical)}</span>
            <span>High {fmt(risk.high)}</span>
            <span>Medium {fmt(risk.medium)}</span>
            <span>Low {fmt(risk.low)}</span>
          </div>
        </Card>
        <div className="grid md:grid-cols-2 gap-3 mb-3 text-xs">
          <div className={`rounded-lg border-l-4 p-3 ${highRisk ? 'border-rose-500 bg-rose-500/5' : 'border-emerald-500 bg-emerald-500/5'}`}>
            <b>{highRisk ? `${fmt(highRisk)} high or critical risk posts.` : 'No high or critical risk posts flagged.'}</b>
          </div>
          <div className="rounded-lg border-l-4 border-teal-700 bg-teal-700/5 p-3">
            <b>Sentiment vs risk.</b> {fmt(neg)} negative posts ({pct(neg, total)}) measure tone; risk flags are separate.
          </div>
        </div>
        {claims.map((c) => (
          <div key={c.claim} className={`rounded-lg border border-border/70 border-l-4 p-3 mb-2 ${c.triage === 'VERIFY' ? 'border-l-rose-500' : 'border-l-teal-700'}`}>
            <div className="flex justify-between gap-2">
              <b className="text-sm">{c.claim}</b>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded text-white h-fit ${c.triage === 'VERIFY' ? 'bg-rose-500' : 'bg-teal-700'}`}>{c.triage}</span>
            </div>
            <div className="text-xs mt-1">{c.note}</div>
            <div className="text-[11px] text-muted-foreground mt-1"><b>Evidence:</b> {citeBtns(c.posts, onCite)}</div>
          </div>
        ))}
        {riskPosts.slice(0, 6).map((e) => (
          <div key={e.id || e.citationTag} className="rounded-lg border border-border/70 border-l-4 border-l-rose-600 p-3 mb-2 text-xs">
            <div className="flex justify-between">
              <b>{e.citationTag} · @{e.author} · {platLabel(e.platform)}</b>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white bg-rose-600">{String(e.risk_level).toUpperCase()} RISK</span>
            </div>
            <div className="mt-1 text-muted-foreground">{String(e.text || '').slice(0, 220)}</div>
          </div>
        ))}
        {!claims.length && !analysis && (
          <Card className="text-xs text-muted-foreground">Claim analysis appears after summary generation.</Card>
        )}
      </Section>
    </div>
  );
}
