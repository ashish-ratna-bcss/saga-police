import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';

/**
 * On-screen Event Intelligence brief — editorial senior-document layout.
 * Values from summaryData / event / tenant only (no hardcoded geography or orgs).
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

const Stack = ({ parts, height = 'h-5', labels = true }) => {
  const live = parts.filter((p) => p.v > 0);
  const tot = live.reduce((s, p) => s + p.v, 0);
  if (!tot) return <div className={`${height} rounded-sm bg-muted`} />;
  return (
    <div className={`flex ${height} rounded-sm overflow-hidden`}>
      {live.map((p) => (
        <div
          key={p.k}
          style={{ width: `${(100 * p.v) / tot}%`, background: p.c }}
          className="flex items-center justify-center text-[10px] font-semibold text-white min-w-0"
          title={`${p.k}: ${p.v}`}
        >
          {labels && (100 * p.v) / tot > 12 ? fmt(p.v) : ''}
        </div>
      ))}
    </div>
  );
};

const Section = ({ n, name, children }) => (
  <section className="mb-8">
    <div className="flex items-baseline gap-2.5 border-b border-border/80 pb-2 mb-4">
      <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">{String(n).padStart(2, '0')}</span>
      <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-foreground/90">{name}</span>
    </div>
    {children}
  </section>
);

const linkCites = (text) => String(text || '').replace(/\[Post #(\d+)\]/g, '[Post #$1](#cite-$1)');

const Md = ({ children, onCite, className = '' }) => (
  <div
    className={`prose dark:prose-invert max-w-none text-[13.5px] leading-6 prose-p:my-1.5 prose-li:my-0.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-p:text-foreground/85 prose-li:text-foreground/85 ${className}`}
  >
    <ReactMarkdown
      components={{
        a: ({ href, children: c }) => {
          const m = String(href || '').match(/^#cite-(\d+)$/);
          if (m) {
            return (
              <button type="button" onClick={() => onCite?.(Number(m[1]))} className="font-semibold text-teal-800 dark:text-teal-300 hover:underline">
                {c}
              </button>
            );
          }
          return (
            <a href={href} target="_blank" rel="noreferrer">
              {c}
            </a>
          );
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
      <button type="button" onClick={() => onCite?.(n)} className="font-semibold text-teal-800 dark:text-teal-300 hover:underline">
        #{n}
      </button>
    </React.Fragment>
  ));

const StatSep = () => <span className="text-border mx-1.5 select-none" aria-hidden>·</span>;

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
    () =>
      Object.entries(stats.target_classification || {})
        .map(([k, v]) => ({ name: k, total: n0(v.total), praise: n0(v.praise), news: n0(v.news), crit: n0(v.criticism) }))
        .filter((e) => e.total > 0)
        .sort((a, b) => b.total - a.total),
    [stats.target_classification]
  );
  const N = analysis?.narratives || [];
  const sections = useMemo(() => {
    if (report && (report.situation || report.actions?.length)) {
      const cites = (arr) => (arr && arr.length ? ` ${arr.map((x) => `[Post #${x}]`).join('')}` : '');
      return [
        { title: 'Situation', body: report.situation },
        { title: 'Sentiment commentary', body: report.sentimentCommentary },
        { title: 'Public order', body: report.publicOrder },
        { title: 'Platforms & voices', body: report.platformsCommentary },
        {
          title: 'Recommended actions',
          body: (report.actions || []).map((a, i) => `${i + 1}. **${a.action}:** ${a.detail}${cites(a.posts)}`).join('\n'),
        },
      ].filter((x) => x.body);
    }
    return splitSections(summaryData?.summary);
  }, [report, summaryData?.summary]);
  const isFallback = summaryData?.summary_source && summaryData.summary_source !== 'llm';

  const findingsFinal = report?.keyFindings?.length ? report.keyFindings.map((k) => [k.headline, k.detail]) : [];

  const criticalEv = ev
    .filter((e) => {
      const x = String(e.sentiment || '').toLowerCase();
      return x.startsWith('neg') || x === 'criticism' || ['critical', 'high'].includes(String(e.risk_level || '').toLowerCase());
    })
    .slice(0, 8);

  const title = displayName || summaryData?.event?.name || 'Event';
  const metaParts = [
    tenant || null,
    eventLoc || null,
    summaryData?.model && !isFallback ? summaryData.model : null,
    isFallback ? 'rule-based summary' : null,
  ].filter(Boolean);

  return (
    <div className="text-foreground max-w-3xl">
      {/* Title — document header, no dark slab */}
      <header className="mb-5">
        <div className="text-[10px] font-semibold tracking-[0.14em] uppercase text-muted-foreground mb-1.5">
          Daily intelligence brief
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground leading-snug">{title}</h2>
        {metaParts.length > 0 && (
          <p className="mt-1.5 text-[12px] text-muted-foreground leading-5">{metaParts.join(' · ')}</p>
        )}
      </header>

      {/* One slim stats line */}
      <div className="flex flex-wrap items-baseline gap-y-1 text-[12.5px] mb-6 pb-4 border-b border-border/70">
        <span>
          <span className="text-muted-foreground">Posts</span>{' '}
          <strong className="tabular-nums font-semibold">{fmt(total)}</strong>
        </span>
        <StatSep />
        <span>
          <span className="text-muted-foreground">Lead</span>{' '}
          <strong className="font-semibold">{lead ? lead.label : '—'}</strong>
          {lead ? <span className="text-muted-foreground"> ({pct(lead.count, total)})</span> : null}
        </span>
        <StatSep />
        <span className="text-emerald-700 dark:text-emerald-400">
          +{pct(sent.positive, sentTotal)}
        </span>
        <StatSep />
        <span className="text-slate-600 dark:text-slate-400">
          {pct(sent.neutral, sentTotal)} neu
        </span>
        <StatSep />
        <span className="text-rose-700 dark:text-rose-400">
          −{pct(sent.negative, sentTotal)}
        </span>
        <StatSep />
        <span>
          <span className="text-muted-foreground">Engagement</span>{' '}
          <strong className="tabular-nums font-semibold">{fmt(engTotal)}</strong>
          <span className="text-muted-foreground"> · {fmt(ev.length)} cited</span>
        </span>
      </div>

      {/* Bottom line — lead paragraph */}
      {report?.bottomLine && (
        <div className="mb-7">
          <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-muted-foreground mb-2">Bottom line</div>
          <Md onCite={onCite} className="!text-[15px] !leading-7 prose-p:text-foreground/90">
            {report.bottomLine}
          </Md>
        </div>
      )}

      {/* Key findings — numbered list, hairline dividers */}
      {findingsFinal.length > 0 && (
        <div className="mb-8">
          <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-muted-foreground mb-3">Key findings</div>
          <ol className="m-0 p-0 list-none">
            {findingsFinal.map(([a, b], i) => (
              <li key={a} className="flex gap-3 py-3 border-t border-border/60 first:border-t-0 first:pt-0">
                <span className="text-[12px] font-semibold tabular-nums text-muted-foreground w-5 shrink-0 pt-0.5">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold leading-snug text-foreground">{a}</div>
                  <div className="text-[12.5px] text-muted-foreground mt-1 leading-5">{b}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      <Section n={1} name="Activity">
        {plats.length > 0 && (
          <div className="mb-5">
            <div className="text-[12px] text-muted-foreground mb-2">Posts by platform</div>
            <div className="space-y-2">
              {plats.map((p) => (
                <div key={p.key} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 text-[12px]">
                  <span className="text-right text-muted-foreground">{p.label}</span>
                  <div className="h-2 rounded-sm bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-sm"
                      style={{ width: `${(100 * p.count) / Math.max(plats[0].count, 1)}%`, background: platColor(p.key) }}
                    />
                  </div>
                  <span className="tabular-nums text-foreground/80 font-medium min-w-[5.5rem] text-right">
                    {fmt(p.count)} · {pct(p.count, total)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <Stack
                height="h-2.5"
                labels={false}
                parts={[
                  { k: 'Positive', v: sent.positive, c: '#1B7A4E' },
                  { k: 'Neutral', v: sent.neutral, c: '#5B6B78' },
                  { k: 'Negative', v: sent.negative, c: '#B42318' },
                ]}
              />
              <div className="flex gap-4 text-[11px] mt-1.5 text-muted-foreground">
                <span>Positive {fmt(sent.positive)}</span>
                <span>Neutral {fmt(sent.neutral)}</span>
                <span>Negative {fmt(sent.negative)}</span>
              </div>
            </div>
          </div>
        )}

        {N.length > 0 && (
          <div className="space-y-4">
            {N.map((n, i) => (
              <div key={n.code || n.title} className="grid grid-cols-[3px_1fr] gap-3">
                <div className="rounded-full" style={{ background: NARR_COLORS[i % NARR_COLORS.length] }} />
                <div>
                  <div className="text-[13.5px] font-semibold leading-snug">{n.title}</div>
                  <Md onCite={onCite} className="!text-[12.5px] mt-1">
                    {n.discussed}
                  </Md>
                  {n.posts?.length > 0 && (
                    <div className="text-[11px] text-muted-foreground mt-1.5">
                      Evidence: {citeBtns(n.posts, onCite)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {sections.slice(0, 3).map((sec, i) => (
          <div key={sec.title} className="mt-5 grid grid-cols-[3px_1fr] gap-3">
            <div className="rounded-full" style={{ background: NARR_COLORS[i % NARR_COLORS.length] }} />
            <div>
              <div className="text-[13.5px] font-semibold mb-1">{sec.title}</div>
              <Md onCite={onCite}>{sec.body}</Md>
            </div>
          </div>
        ))}
      </Section>

      <Section n={2} name="Critical / negative discourse">
        {criticalEv.length ? (
          <div className="space-y-0">
            {criticalEv.map((e) => (
              <div
                key={e.id || e.citationTag}
                className="py-3 border-t border-border/60 first:border-t-0 first:pt-0 grid grid-cols-[3px_1fr] gap-3"
              >
                <div className="rounded-full bg-rose-600" />
                <div className="text-[12.5px] min-w-0">
                  <div className="font-medium text-foreground">
                    {e.citationTag || ''} · @{String(e.author || '').replace(/^@/, '')} · {platLabel(e.platform)}
                  </div>
                  <div className="mt-1 text-muted-foreground leading-5">{String(e.text || '').slice(0, 220)}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12.5px] text-muted-foreground m-0">No negative or high-risk posts in the cited sample.</p>
        )}
      </Section>

      <Section n={3} name="Leaders / targets">
        {entities.length ? (
          <div className="space-y-2.5">
            {entities.map((e) => (
              <div key={e.name} className="grid grid-cols-[7rem_1fr_4.5rem] items-center gap-2 text-[12px]">
                <span className="text-right text-muted-foreground truncate" title={e.name}>
                  {e.name} <span className="text-foreground font-semibold tabular-nums">{fmt(e.total)}</span>
                </span>
                <Stack
                  height="h-2"
                  labels={false}
                  parts={[
                    { k: 'Positive', v: e.praise, c: '#1B7A4E' },
                    { k: 'Neutral', v: e.news, c: '#5B6B78' },
                    { k: 'Negative', v: e.crit, c: '#B42318' },
                  ]}
                />
                <span className="tabular-nums text-muted-foreground text-right">{pct(e.crit, e.total)} neg.</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12.5px] text-muted-foreground m-0">No entity classification available.</p>
        )}
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
    <div className="mb-2">
      <Section n={1} name="Risk snapshot">
        <div className="flex flex-wrap items-baseline gap-y-1 text-[12.5px] mb-4">
          <span>
            <span className="text-muted-foreground">High / critical</span>{' '}
            <strong className={`tabular-nums font-semibold ${highRisk ? 'text-rose-700 dark:text-rose-400' : 'text-foreground'}`}>
              {fmt(highRisk)}
            </strong>
          </span>
          <StatSep />
          <span className="text-muted-foreground">
            Crit {fmt(risk.critical)} · High {fmt(risk.high)} · Med {fmt(risk.medium)} · Low {fmt(risk.low)}
          </span>
          <StatSep />
          <span className="text-muted-foreground">
            Negative tone {fmt(neg)} ({pct(neg, total)}) — separate from risk flags
          </span>
        </div>
        <Stack
          height="h-2.5"
          labels={false}
          parts={[
            { k: 'Critical', v: n0(risk.critical), c: '#7A1F1F' },
            { k: 'High', v: n0(risk.high), c: '#B42318' },
            { k: 'Medium', v: n0(risk.medium), c: '#C45C26' },
            { k: 'Low', v: n0(risk.low), c: '#1B7A4E' },
          ]}
        />
      </Section>

      {(claims.length > 0 || riskPosts.length > 0 || !analysis) && (
        <Section n={2} name="Claims & high-risk posts">
          {claims.map((c) => (
            <div key={c.claim} className="py-3 border-t border-border/60 first:border-t-0 first:pt-0 grid grid-cols-[3px_1fr] gap-3">
              <div className={`rounded-full ${c.triage === 'VERIFY' ? 'bg-rose-500' : 'bg-teal-700'}`} />
              <div>
                <div className="flex justify-between gap-2 items-start">
                  <span className="text-[13.5px] font-semibold">{c.claim}</span>
                  <span
                    className={`text-[10px] font-semibold tracking-wide shrink-0 ${
                      c.triage === 'VERIFY' ? 'text-rose-700 dark:text-rose-300' : 'text-teal-800 dark:text-teal-300'
                    }`}
                  >
                    {c.triage}
                  </span>
                </div>
                <div className="text-[12.5px] mt-1 text-muted-foreground">{c.note}</div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  <span className="font-medium text-foreground/80">Evidence:</span> {citeBtns(c.posts, onCite)}
                </div>
              </div>
            </div>
          ))}

          {riskPosts.slice(0, 6).map((e) => (
            <div
              key={e.id || e.citationTag}
              className="py-3 border-t border-border/60 first:border-t-0 first:pt-0 grid grid-cols-[3px_1fr] gap-3 text-[12.5px]"
            >
              <div className="rounded-full bg-rose-600" />
              <div>
                <div className="flex justify-between gap-2">
                  <span className="font-medium">
                    {e.citationTag} · @{e.author} · {platLabel(e.platform)}
                  </span>
                  <span className="text-[10px] font-semibold tracking-wide text-rose-700 dark:text-rose-300">
                    {String(e.risk_level).toUpperCase()} RISK
                  </span>
                </div>
                <div className="mt-1 text-muted-foreground leading-5">{String(e.text || '').slice(0, 220)}</div>
              </div>
            </div>
          ))}

          {!claims.length && !analysis && (
            <p className="text-[12.5px] text-muted-foreground m-0">Claim analysis appears after summary generation.</p>
          )}
        </Section>
      )}
    </div>
  );
}
