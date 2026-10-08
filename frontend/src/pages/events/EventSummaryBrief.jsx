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

const foldGeo = (t) => String(t || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();

/** Same rule as the PDF: level comes from calls to act, violence and high-risk ratings, never from tone. */
export const riskLevelOf = (stats) => {
  const facts = stats?.structured_report?.facts;
  const r = stats?.risk_counts || stats?.risk || {};
  const highRisk = n0(r.critical) + n0(r.high);
  const calls = n0(facts?.calls?.count);
  const violence = n0(facts?.violence?.count);
  const level = violence > 0 ? 'High' : calls > 0 || highRisk > 0 ? 'Medium' : 'Low';
  return { level, calls, violence, highRisk, hasFacts: Boolean(facts) };
};

const LEVEL_STYLE = {
  High: 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
  Medium: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
  Low: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
};
const ROLE_LABEL = { priority: 'Priority', amplifier: 'Amplifier', media: 'Media', routine: 'Routine' };
const ROLE_STYLE = {
  priority: 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200',
  amplifier: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200',
  media: 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200',
  routine: 'bg-muted text-muted-foreground',
};

export function EventBrief({ summaryData, platformList, displayName, tenantName, onCite }) {
  const stats = summaryData?.stats || {};
  const report = stats.structured_report || null;
  const facts = report?.facts || null;
  const ev = summaryData?.evidence_traceability || [];
  const total = n0(stats.total_unique_posts || stats.total_media_count);
  const s = stats.sentiment_counts || {};
  const sent = { positive: n0(s.positive ?? s.praise), neutral: n0(s.neutral ?? s.news), negative: n0(s.negative ?? s.criticism) };
  const sentTotal = Math.max(sent.positive + sent.neutral + sent.negative, 1);
  const eng = stats.total_engagement || {};
  const interactions = n0(eng.likes) + n0(eng.shares) + n0(eng.comments);
  const plats = (platformList || []).filter((p) => p.count > 0).sort((a, b) => b.count - a.count);
  const lead = plats[0];
  const eventLoc = summaryData?.event?.location || '';
  const tenant = (tenantName || '').trim();
  const risk = riskLevelOf(stats);
  const isFallback = summaryData?.summary_source && summaryData.summary_source !== 'llm';
  const N = report?.narratives || [];
  const cites = (arr) => (arr && arr.length ? ` ${arr.map((x) => `[Post #${x}]`).join('')}` : '');

  const entities = useMemo(
    () =>
      Object.entries(stats.target_classification || {})
        .map(([k, v]) => ({ name: k, total: n0(v.total), praise: n0(v.praise), news: n0(v.news), crit: n0(v.criticism) }))
        .filter((e) => e.total > 0)
        .sort((a, b) => b.total - a.total),
    [stats.target_classification]
  );

  // Places grouped against the event's own region, as in the PDF.
  const geo = useMemo(() => {
    const words = foldGeo(eventLoc).split(' ').filter((w) => w.length > 2);
    const list = (facts?.places || []).map((p) => {
      const hay = ` ${foldGeo(`${p.name} ${p.region}`)} `;
      const inside = !words.length || words.some((w) => hay.includes(` ${w} `));
      return { ...p, inside, own: words.includes(foldGeo(p.name)) };
    });
    return { inside: list.filter((p) => p.inside && !p.own), outside: list.filter((p) => !p.inside) };
  }, [facts, eventLoc]);

  // Accounts: role and reason come from what each account posted.
  const accounts = useMemo(() => {
    const topReach = Math.max(1, ...(facts?.accounts || []).map((a) => n0(a.eng)));
    return (facts?.accounts || [])
      .map((a) => {
        const tier = a.role === 'media' ? 'media' : a.calls > 0 || a.violence > 0 ? 'priority' : n0(a.eng) >= topReach * 0.5 && a.posts?.length >= 2 ? 'amplifier' : 'routine';
        const reasons = [];
        if (tier === 'media') reasons.push('News or official channel: it reports the event, it does not organise it.');
        if (a.calls > 0) reasons.push(`${a.calls} post${a.calls === 1 ? ' calls' : 's call'} people to join or act.`);
        if (a.violence > 0) reasons.push(`${a.violence} post${a.violence === 1 ? ' mentions' : 's mention'} violence or damage.`);
        if (!reasons.length) reasons.push(`${a.posts?.length || 0} post(s) on the event; no call to act or violence found.`);
        return { ...a, tier, reasons };
      })
      .sort((x, y) => ['priority', 'amplifier', 'media', 'routine'].indexOf(x.tier) - ['priority', 'amplifier', 'media', 'routine'].indexOf(y.tier))
      .slice(0, 10);
  }, [facts]);

  const title = displayName || summaryData?.event?.name || 'Event';
  const metaParts = [tenant || null, eventLoc || null, isFallback ? 'rule-based summary (the model was not available)' : null].filter(Boolean);
  const keyDates = report?.keyDates || [];

  return (
    <div className="text-foreground max-w-3xl">
      <header className="mb-5">
        <div className="text-[10px] font-semibold tracking-[0.14em] uppercase text-muted-foreground mb-1.5">Event intelligence brief</div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground leading-snug">{title}</h2>
        {metaParts.length > 0 && <p className="mt-1.5 text-[12px] text-muted-foreground leading-5">{metaParts.join(' · ')}</p>}
      </header>

      {/* Risk card: the answer first */}
      <div className={`rounded-md border px-4 py-3 mb-5 ${LEVEL_STYLE[risk.level]}`}>
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-[10px] font-semibold tracking-[0.14em] uppercase opacity-80">Public order risk</div>
          <div className="text-lg font-semibold">{risk.level}</div>
        </div>
        <p className="text-[12.5px] leading-5 mt-1.5 m-0">
          {risk.hasFacts
            ? `${risk.violence ? `${fmt(risk.violence)} post${risk.violence === 1 ? ' mentions' : 's mention'} violence or damage. ` : 'No post reports violence or damage. '}${risk.calls ? `${fmt(risk.calls)} post${risk.calls === 1 ? ' calls' : 's call'} people to join or act. ` : 'No post calls for a bandh, blockade or gathering. '}`
            : ''}
          {risk.highRisk ? `${fmt(risk.highRisk)} post${risk.highRisk === 1 ? ' is' : 's are'} rated high risk. ` : ''}
          {pct(sent.negative, sentTotal)} of posts are critical in tone; criticism alone is not a threat.
        </p>
      </div>

      <div className="flex flex-wrap items-baseline gap-y-1 text-[12.5px] mb-6 pb-4 border-b border-border/70">
        <span><span className="text-muted-foreground">Posts</span> <strong className="tabular-nums font-semibold">{fmt(total)}</strong></span>
        <StatSep />
        <span><span className="text-muted-foreground">Lead</span> <strong className="font-semibold">{lead ? lead.label : '—'}</strong>{lead ? <span className="text-muted-foreground"> ({pct(lead.count, total)})</span> : null}</span>
        <StatSep />
        <span className="text-emerald-700 dark:text-emerald-400">Positive {pct(sent.positive, sentTotal)}</span>
        <StatSep />
        <span className="text-slate-600 dark:text-slate-400">Neutral {pct(sent.neutral, sentTotal)}</span>
        <StatSep />
        <span className="text-rose-700 dark:text-rose-400">Negative {pct(sent.negative, sentTotal)}</span>
        <StatSep />
        <span><span className="text-muted-foreground">Interactions</span> <strong className="tabular-nums font-semibold">{fmt(interactions)}</strong>{n0(eng.views) ? <span className="text-muted-foreground"> · {fmt(eng.views)} views</span> : null}</span>
      </div>

      {report?.bottomLine && (
        <div className="mb-7">
          <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-muted-foreground mb-2">Bottom line</div>
          <Md onCite={onCite} className="!text-[15px] !leading-7 prose-p:text-foreground/90">{report.bottomLine}</Md>
        </div>
      )}

      {keyDates.length > 0 && (
        <div className="mb-8">
          <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-muted-foreground mb-3">Key dates</div>
          <ul className="m-0 p-0 list-none space-y-2">
            {keyDates.map((k) => (
              <li key={`${k.date}-${k.event}`} className="grid grid-cols-[6.5rem_1fr] gap-3 text-[13px]">
                <span className="font-semibold tabular-nums">
                  {k.date}
                  <span className={`ml-1.5 text-[10px] font-medium ${k.type === 'upcoming' ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}>{k.type}</span>
                </span>
                <span className="text-foreground/85">{k.event} {k.posts?.length ? <span className="text-[11px] text-muted-foreground">{citeBtns(k.posts, onCite)}</span> : null}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Section n={1} name="Situation and risk">
        {report?.situation && <Md onCite={onCite}>{report.situation}</Md>}
        {report?.publicOrder && <Md onCite={onCite}>{`**Public order:** ${report.publicOrder}`}</Md>}
        {(report?.claims || []).length > 0 && (
          <div className="mt-3">
            <div className="text-[12px] text-muted-foreground mb-1.5">Claims in the posts (not confirmed)</div>
            {report.claims.map((c) => (
              <div key={c.claim} className="py-2 border-t border-border/60 first:border-t-0 grid grid-cols-[3px_1fr] gap-3">
                <div className={`rounded-full ${c.triage === 'VERIFY' ? 'bg-rose-500' : 'bg-teal-700'}`} />
                <div className="text-[12.5px]">
                  <span className="font-semibold">{c.claim}</span> <span className="text-[10px] font-semibold text-muted-foreground">{c.triage}</span>
                  {c.note ? <div className="text-muted-foreground mt-0.5">{c.note}</div> : null}
                  {c.posts?.length ? <div className="text-[11px] text-muted-foreground mt-0.5">Evidence: {citeBtns(c.posts, onCite)}</div> : null}
                </div>
              </div>
            ))}
          </div>
        )}
        {!report?.situation && !report?.publicOrder && <p className="text-[12.5px] text-muted-foreground m-0">Regenerate the report to see the situation summary.</p>}
      </Section>

      <Section n={2} name="Where it is happening">
        {facts?.places?.length ? (
          <>
            {geo.inside.length > 0 ? (
              <div className="space-y-2">
                {geo.inside.slice(0, 10).map((p) => (
                  <div key={p.name} className="grid grid-cols-[1fr_auto] items-baseline gap-2 text-[12.5px]">
                    <span><strong className="font-semibold">{p.name}</strong>{p.region ? <span className="text-muted-foreground"> · {p.region}</span> : null}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {fmt(p.mentioned)} post{p.mentioned === 1 ? '' : 's'} ·{' '}
                      <span className={p.active ? 'text-emerald-700 dark:text-emerald-300 font-medium' : ''}>{p.active ? 'activity reported' : 'mentioned only'}</span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12.5px] text-muted-foreground m-0">No specific place inside {eventLoc || 'the event region'} is named in the posts.</p>
            )}
            {geo.outside.length > 0 && (
              <p className="text-[12px] text-muted-foreground mt-3 mb-0">
                <strong className="text-foreground/80">Outside {eventLoc || 'the event region'}:</strong>{' '}
                {geo.outside.slice(0, 8).map((p) => `${p.name}${p.region ? ` (${p.region})` : ''}`).join(', ')}. Listed for information; not counted as activity in the region.
              </p>
            )}
          </>
        ) : (report?.geography || []).length > 0 ? (
          <ul className="m-0 pl-4 text-[12.5px] space-y-1">
            {report.geography.map((g) => (
              <li key={g.place}><strong>{g.place}</strong> — {g.note} <span className="text-[11px] text-muted-foreground">{citeBtns(g.posts, onCite)}</span></li>
            ))}
          </ul>
        ) : (
          <p className="text-[12.5px] text-muted-foreground m-0">No place is named in the posts.</p>
        )}
      </Section>

      <Section n={3} name="Activity and ground presence">
        {(report?.activities || []).length > 0 ? (
          <ul className="m-0 pl-4 text-[12.5px] space-y-1">
            {report.activities.map((a) => (
              <li key={`${a.what}-${a.when}-${a.where}`}>
                <strong>{a.what}</strong>{a.where ? ` — ${a.where}` : ''}{a.when ? `, ${a.when}` : ''} <span className="text-[11px] text-muted-foreground">{citeBtns(a.posts, onCite)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12.5px] text-muted-foreground m-0">No campaign, meeting, bandh or rally is named in the posts.</p>
        )}
        {(report?.presence || []).length > 0 && (
          <ul className="m-0 mt-2 pl-4 text-[12.5px] space-y-1">
            {report.presence.map((p) => (
              <li key={`${p.who}-${p.place}`}>{p.who} — on site at {p.place} <span className="text-[11px] text-muted-foreground">{citeBtns(p.posts, onCite)}</span></li>
            ))}
          </ul>
        )}
        {plats.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-[12px] text-muted-foreground">Posts by platform</div>
            {plats.map((p) => (
              <div key={p.key} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 text-[12px]">
                <span className="text-right text-muted-foreground">{p.label}</span>
                <div className="h-2 rounded-sm bg-muted overflow-hidden">
                  <div className="h-full rounded-sm" style={{ width: `${(100 * p.count) / Math.max(plats[0].count, 1)}%`, background: platColor(p.key) }} />
                </div>
                <span className="tabular-nums text-foreground/80 font-medium min-w-[5.5rem] text-right">{fmt(p.count)} · {pct(p.count, total)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section n={4} name="Key actors and figures">
        {(report?.leaders || []).length > 0 && (
          <ul className="m-0 pl-4 text-[12.5px] space-y-1 mb-3">
            {report.leaders.map((l) => (
              <li key={l.name}><strong>{l.name}</strong>{l.role ? ` — ${l.role}` : ''} <span className="text-[11px] text-muted-foreground">{citeBtns(l.posts, onCite)}</span></li>
            ))}
          </ul>
        )}
        {entities.length ? (
          <div className="space-y-2.5">
            {entities.map((e) => (
              <div key={e.name} className="grid grid-cols-[7rem_1fr_4.5rem] items-center gap-2 text-[12px]">
                <span className="text-right text-muted-foreground truncate" title={e.name}>{e.name} <span className="text-foreground font-semibold tabular-nums">{fmt(e.total)}</span></span>
                <Stack height="h-2" labels={false} parts={[{ k: 'Positive', v: e.praise, c: '#1B7A4E' }, { k: 'Neutral', v: e.news, c: '#5B6B78' }, { k: 'Negative', v: e.crit, c: '#B42318' }]} />
                <span className="tabular-nums text-muted-foreground text-right">{pct(e.crit, e.total)} neg.</span>
              </div>
            ))}
          </div>
        ) : (
          !(report?.leaders || []).length && <p className="text-[12.5px] text-muted-foreground m-0">No people or groups are classified.</p>
        )}
      </Section>

      <Section n={5} name="Accounts to watch">
        {accounts.length > 0 ? (
          <div className="space-y-0">
            {accounts.map((a) => (
              <div key={`${a.platform}-${a.author}`} className="py-2.5 border-t border-border/60 first:border-t-0 first:pt-0 text-[12.5px]">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">@{String(a.author || '').replace(/^@/, '')}</span>
                  <span className="text-muted-foreground">{platLabel(a.platform)}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${ROLE_STYLE[a.tier]}`}>{ROLE_LABEL[a.tier]}</span>
                </div>
                <div className="text-muted-foreground mt-0.5">{a.reasons.join(' ')} <span className="text-[11px]">{citeBtns((a.posts || []).slice(0, 3), onCite)}</span></div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12.5px] text-muted-foreground m-0">{(report?.amplifiers || []).length ? '' : 'Regenerate the report to list the accounts.'}</p>
        )}
        {(report?.amplifiers || []).length > 0 && (
          <ul className="m-0 mt-3 pl-4 text-[12.5px] space-y-1">
            {report.amplifiers.map((a) => (
              <li key={a.account}><strong>{a.account}</strong> — {a.why} <span className="text-[11px] text-muted-foreground">{citeBtns(a.posts, onCite)}</span></li>
            ))}
          </ul>
        )}
      </Section>

      <Section n={6} name="Public reaction and tone">
        <Stack height="h-2.5" labels={false} parts={[{ k: 'Positive', v: sent.positive, c: '#1B7A4E' }, { k: 'Neutral', v: sent.neutral, c: '#5B6B78' }, { k: 'Negative', v: sent.negative, c: '#B42318' }]} />
        <div className="flex gap-4 text-[11px] mt-1.5 mb-3 text-muted-foreground">
          <span>Positive {fmt(sent.positive)}</span><span>Neutral {fmt(sent.neutral)}</span><span>Negative {fmt(sent.negative)}</span>
        </div>
        {report?.sentimentCommentary && <Md onCite={onCite}>{report.sentimentCommentary}</Md>}
        {N.length > 0 && (
          <div className="space-y-4 mt-4">
            {N.map((n, i) => (
              <div key={n.code || n.title} className="grid grid-cols-[3px_1fr] gap-3">
                <div className="rounded-full" style={{ background: NARR_COLORS[i % NARR_COLORS.length] }} />
                <div>
                  <div className="text-[13.5px] font-semibold leading-snug">{n.title}</div>
                  <Md onCite={onCite} className="!text-[12.5px] mt-1">{n.discussed}</Md>
                  {n.posts?.length > 0 && <div className="text-[11px] text-muted-foreground mt-1.5">Evidence: {citeBtns(n.posts, onCite)}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section n={7} name="Recommended actions">
        {(report?.actions || []).length > 0 ? (
          <ol className="m-0 p-0 list-none">
            {report.actions.map((a, i) => (
              <li key={a.action} className="flex gap-3 py-3 border-t border-border/60 first:border-t-0 first:pt-0">
                <span className="text-[12px] font-semibold tabular-nums text-muted-foreground w-5 shrink-0 pt-0.5">{String(i + 1).padStart(2, '0')}</span>
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold leading-snug">{a.action}</div>
                  <Md onCite={onCite} className="!text-[12.5px] mt-1">{`${a.detail}${cites(a.posts)}`}</Md>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-[12.5px] text-muted-foreground m-0">Maintain baseline monitoring. No escalation is needed from these posts.</p>
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
        {(() => {
          const r = riskLevelOf(stats);
          return (
            <div className={`rounded-md border px-3 py-2 mb-4 text-[12.5px] ${LEVEL_STYLE[r.level]}`}>
              <strong>Public order risk: {r.level}.</strong>{' '}
              {r.hasFacts
                ? `${fmt(r.calls)} post(s) call people to act, ${fmt(r.violence)} mention violence, ${fmt(r.highRisk)} rated high risk. `
                : `${fmt(r.highRisk)} post(s) rated high risk. `}
              Negative tone alone does not raise the level.
            </div>
          );
        })()}
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
