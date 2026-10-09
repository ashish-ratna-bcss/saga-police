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
  <section className="mb-7">
    <div className="flex items-center gap-2.5 mb-3">
      <span className="rounded bg-slate-800 dark:bg-slate-200 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white dark:text-slate-900">{String(n).padStart(2, '0')}.</span>
      <span className="text-[15px] font-semibold tracking-tight text-foreground">{name}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
    {children}
  </section>
);

const Kpi = ({ n, l, sub }) => (
  <div className="px-2 py-3 text-center min-w-0">
    <div className="text-xl font-semibold tabular-nums leading-none text-foreground">{n}</div>
    <div className="mt-1.5 text-[10px] uppercase tracking-wide text-muted-foreground leading-tight">{l}</div>
    {sub ? <div className="text-[10px] text-muted-foreground/80 mt-0.5">{sub}</div> : null}
  </div>
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
  const violenceAccounts = n0(facts?.violence?.accounts ?? facts?.violence?.count);
  const alleged = n0(facts?.alleged?.count);
  const detentions = n0(facts?.detentions?.count);
  const mobilising = n0(facts?.mobilising?.count);
  // Same rule as the PDF reports: High needs violence from two accounts; arrests and allegations are Medium, never violence.
  const level = violenceAccounts > 1 ? 'High'
    : (violence > 0 || alleged > 0 || detentions > 0 || calls > 0 || highRisk > 0) ? 'Medium' : 'Low';
  return { level, calls, violence, violenceAccounts, alleged, detentions, mobilising, highRisk, hasFacts: Boolean(facts) };
};

const LEVEL_STYLE = {
  High: 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
  Medium: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
  Low: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
};
const LEVEL_PANEL = { High: 'bg-rose-600', Medium: 'bg-amber-600', Low: 'bg-emerald-600' };
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
  const tenant = (tenantName || '').replace(/blura\s*saga/gi, '').replace(/\s+/g, ' ').trim();
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
  const metaParts = [];
  const keyDates = report?.keyDates || [];

  let sectionNo = 0;
  const nx = () => { sectionNo += 1; return sectionNo; };
  const hasReport = Boolean(report);
  const showSituation = Boolean(report?.situation || report?.publicOrder || (report?.claims || []).length);
  const showWhere = Boolean(facts?.places?.length || (report?.geography || []).length);
  const showActivity = Boolean((report?.activities || []).length || (report?.presence || []).length);
  const showActors = Boolean((report?.leaders || []).length || entities.length);
  const showAccounts = Boolean(accounts.length || (report?.amplifiers || []).length);
  const windowLabel = stats.timeframe_label
    || (stats.date_range?.start && stats.date_range?.end ? `${new Date(stats.date_range.start).toLocaleDateString('en-GB')} – ${new Date(stats.date_range.end).toLocaleDateString('en-GB')}` : '—');
  const generatedLabel = summaryData?.generated_at ? new Date(summaryData.generated_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const onSitePosts = [...new Set(geo.inside.filter((p) => p.active).flatMap((p) => p.posts || []))];
  const priorityAccounts = accounts.filter((a) => a.tier === 'priority').length;
  const narrativesWatch = (report?.narrativesToWatch || []).length || (report?.claims || []).length;
  const strands = report?.issueStrands || [];
  const known = report?.known || [];
  const notKnown = report?.notKnown || [];
  const watchRows = report?.narrativesToWatch?.length
    ? report.narrativesToWatch.map((n) => ({ key: n.narrative, title: n.narrative, note: n.riskNote || n.sourceAccounts || '', posts: n.posts }))
    : (report?.claims || []).map((c) => ({ key: c.claim, title: c.claim, note: c.note || (c.triage === 'VERIFY' ? 'Requires official verification' : 'Monitoring required'), posts: c.posts }));
  const plural1 = (n, one, many) => (n === 1 ? one : many);
  const riskWhy = [
    risk.hasFacts ? '' : 'Detailed post analysis is not available for this summary, so the level rests on high-risk ratings only.',
    risk.hasFacts && risk.violenceAccounts > 1 ? `${fmt(risk.violence)} posts report violence or damage.` : '',
    risk.hasFacts && risk.violence > 0 && risk.violenceAccounts <= 1 ? `${fmt(risk.violence)} ${plural1(risk.violence, 'post mentions', 'posts mention')} violence or damage, and no other account confirms it.` : '',
    risk.hasFacts && !risk.violence ? 'No post confirms violence or damage.' : '',
    risk.alleged ? `${fmt(risk.alleged)} ${plural1(risk.alleged, 'post alleges or warns', 'posts allege or warn')} of violence; this is not confirmed.` : '',
    risk.detentions ? `${fmt(risk.detentions)} ${plural1(risk.detentions, 'post reports', 'posts report')} arrests, detentions or a refused permission; these are not violence.` : '',
    risk.hasFacts ? (risk.calls ? `${fmt(risk.calls)} ${plural1(risk.calls, 'post calls', 'posts call')} people to join or act in their own words.` : (keyDates.some((k) => k.type === 'upcoming' && !k.outside) ? 'The posts report planned activity (see key dates); none of them is itself a call to join.' : 'No post calls for a bandh, blockade or gathering in its own words.')) : '',
    risk.mobilising ? `${fmt(risk.mobilising)} ${plural1(risk.mobilising, 'post reports', 'posts report')} that a group is mobilising people.` : '',
    risk.highRisk ? `${fmt(risk.highRisk)} ${plural1(risk.highRisk, 'post is', 'posts are')} rated high risk.` : '',
    `${pct(sent.negative, sentTotal)} of posts are negative in tone. Negative tone is criticism, not a risk signal.`,
  ].filter(Boolean).join(' ');

  return (
    <div className="text-foreground w-full">
      {/* Cover */}
      <header className="relative overflow-hidden rounded-lg bg-slate-800 text-white mb-4">
        <div className="absolute inset-y-0 left-0 w-1.5 bg-orange-600" />
        <div className="px-6 pt-4">
          <div className="text-[10px] font-semibold tracking-[0.14em] uppercase text-slate-300 mb-1.5">
            {[tenant, 'Event intelligence brief'].filter(Boolean).join(' · ')}
          </div>
          <h2 className="text-2xl font-semibold tracking-tight leading-tight m-0">{title}</h2>
          {metaParts.length > 0 && <p className="mt-1 mb-0 text-[12.5px] text-slate-300">{metaParts.join(' · ')}</p>}
        </div>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 border-t border-slate-600/60">
          {[
            ['Monitoring window', windowLabel],
            ['Generated', generatedLabel],
            ['Region', eventLoc || '—'],
            ['Analysis', summaryData?.summary_source === 'llm_partial' ? 'AI summary (shortened)' : isFallback ? 'Written from counted facts' : 'AI summary'],
          ].map(([k, v], i) => (
            <div key={k} className={`px-6 py-2.5 ${i > 0 ? 'md:border-l border-slate-600/60' : ''}`}>
              <div className="text-[10px] uppercase tracking-[0.08em] text-slate-400">{k}</div>
              <div className="text-[13px] font-semibold mt-0.5 leading-snug">{v}</div>
            </div>
          ))}
        </div>
      </header>

      {/* Assessment: risk level + the answer */}
      <div className="grid md:grid-cols-[9.5rem_1fr] rounded-lg border bg-card overflow-hidden mb-4">
        <div className={`${LEVEL_PANEL[risk.level]} text-white flex flex-col items-center justify-center text-center px-4 py-5`}>
          <div className="text-[10px] font-semibold tracking-[0.14em] uppercase opacity-90">Public order risk</div>
          <div className="text-3xl font-bold tracking-wide uppercase my-1.5 leading-none">{risk.level}</div>
          <div className="text-[11px] opacity-90">{fmt(risk.highRisk)} high-risk post{risk.highRisk === 1 ? '' : 's'}</div>
        </div>
        <div className="p-4 min-w-0">
          {report?.bottomLine && (
            <div className="mb-2">
              <span className="text-[10px] font-semibold tracking-[0.12em] uppercase text-muted-foreground mr-2">Bottom line</span>
              <Md onCite={onCite} className="!text-[15px] !leading-7 prose-p:text-foreground/90 mt-1">{report.bottomLine}</Md>
            </div>
          )}
          <p className="text-[12px] leading-5 text-muted-foreground m-0 mb-3">{riskWhy}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              ['Mobilisation', risk.calls ? `${fmt(risk.calls)} post${risk.calls === 1 ? '' : 's'} call people to act` : onSitePosts.length ? `${fmt(onSitePosts.length)} post${onSitePosts.length === 1 ? '' : 's'} report people on site` : 'No call to act found', risk.calls ? (facts?.calls?.posts || []) : onSitePosts],
              ['Narratives to watch', `${fmt(narrativesWatch)} flagged`, (report?.narrativesToWatch || []).flatMap((n) => n.posts || [])],
              ['Surveillance priority', priorityAccounts ? `${fmt(priorityAccounts)} priority account${priorityAccounts === 1 ? '' : 's'}` : 'Baseline monitoring', null],
            ].map(([k, v, refs]) => (
              <div key={k} className="rounded-md bg-muted/60 px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{k}</div>
                <div className="text-[12.5px] font-semibold mt-0.5">{v}</div>
                {refs && refs.length > 0 ? <div className="text-[11px] text-muted-foreground mt-0.5">{citeBtns([...new Set(refs)].slice(0, 6), onCite)}</div> : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-3 md:grid-cols-6 rounded-lg border bg-card divide-x divide-border mb-6">
        <Kpi n={fmt(total)} l="Posts analysed" />
        <Kpi n={fmt(interactions)} l="Interactions" sub={n0(eng.views) ? `${fmt(eng.views)} views` : ''} />
        <Kpi n={risk.hasFacts ? fmt(risk.calls) : '—'} l="Calls to act" />
        <Kpi n={risk.hasFacts ? fmt(risk.violenceAccounts > 1 ? risk.violence : 0) : '—'} l={risk.violence > 0 && risk.violenceAccounts <= 1 ? 'Violence confirmed (1 mentioned)' : 'Violence confirmed'} />
        <Kpi n={fmt(risk.highRisk)} l="High / critical risk" />
        <Kpi n={fmt(geo.inside.length)} l="Places covered" />
      </div>

      {!hasReport && (
        <div className="rounded-lg border border-dashed bg-muted/30 px-5 py-4 mb-6 text-[13px] text-muted-foreground">
          <strong className="text-foreground">No detailed analysis for this summary yet.</strong> The counts above are live. Regenerate the report to add the issue, places, activity, actors, accounts and recommended actions.
        </div>
      )}

      {(strands.length > 0 || known.length > 0 || notKnown.length > 0) && (
        <Section n={nx()} name="What the issue is">
          {strands.length > 0 && (
            <div className="rounded-lg border bg-card overflow-hidden mb-3">
              <div className="hidden md:grid grid-cols-[1fr_1fr_1.6fr_1fr] gap-3 bg-muted/60 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Strand</span><span>Who</span><span>What they ask or do</span><span>Where it stands</span>
              </div>
              {strands.map((x) => (
                <div key={x.title} className="grid md:grid-cols-[1fr_1fr_1.6fr_1fr] gap-x-3 gap-y-0.5 px-4 py-2.5 border-t first:border-t-0 text-[12.5px]">
                  <span className="font-semibold">{x.title}</span>
                  <span className="text-foreground/85">{x.who || '—'}</span>
                  <span className="text-foreground/85">{x.demand || '—'} {x.posts?.length ? <span className="text-[11px] text-muted-foreground">{citeBtns(x.posts, onCite)}</span> : null}</span>
                  <span className="text-foreground/85">{x.status || '—'}</span>
                </div>
              ))}
            </div>
          )}
          {report?.issueLink && <p className="text-[13px] text-foreground/85 mt-0 mb-3">{report.issueLink}</p>}
          {(known.length > 0 || notKnown.length > 0) && (
            <div className="grid md:grid-cols-2 gap-3">
              <div className="rounded-lg border border-emerald-200 dark:border-emerald-900 border-l-4 border-l-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/20 px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300 mb-1.5">What we know</div>
                <ul className="m-0 pl-4 list-disc text-[12.5px] space-y-1">
                  {known.map((k) => <li key={k.text}>{k.text} {k.posts?.length ? <span className="text-[11px] text-muted-foreground">{citeBtns(k.posts, onCite)}</span> : null}</li>)}
                </ul>
              </div>
              <div className="rounded-lg border border-amber-200 dark:border-amber-900 border-l-4 border-l-amber-600 bg-amber-50/60 dark:bg-amber-950/20 px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300 mb-1.5">What we do not know yet</div>
                <ul className="m-0 pl-4 list-disc text-[12.5px] space-y-1">
                  {notKnown.map((t) => <li key={typeof t === 'string' ? t : t.text}>{typeof t === 'string' ? t : t.text}</li>)}
                </ul>
              </div>
            </div>
          )}
        </Section>
      )}

      {(keyDates.length > 0 || watchRows.length > 0) && (
        <div className="grid md:grid-cols-2 gap-3 mb-7">
          {keyDates.length > 0 && (
            <div className="rounded-lg border border-l-4 border-l-blue-600 bg-card px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-blue-900 dark:text-blue-300 mb-2">Operational timeline and key dates</div>
              <ul className="m-0 p-0 list-none space-y-2">
                {keyDates.map((k) => (
                  <li key={`${k.date}-${k.event}`} className={`text-[12.5px] ${k.outside ? 'text-muted-foreground' : ''}`}>
                    <span className="font-semibold tabular-nums">{k.date}</span>
                    <span className={`ml-1.5 text-[10px] font-medium ${k.type === 'upcoming' ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}>{k.type}</span>
                    <div className="text-foreground/85">{k.event} {k.posts?.length ? <span className="text-[11px] text-muted-foreground">{citeBtns(k.posts, onCite)}</span> : null}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {watchRows.length > 0 && (
            <div className="rounded-lg border border-l-4 border-l-amber-600 bg-amber-50/50 dark:bg-amber-950/10 px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-300 mb-2">Narratives to watch</div>
              <ul className="m-0 p-0 list-none space-y-2">
                {watchRows.map((w) => (
                  <li key={w.key} className="text-[12.5px]">
                    <span className="font-semibold">{w.title}</span>
                    {w.note ? <div className="text-foreground/80">{w.note}</div> : null}
                    {w.posts?.length ? <div className="text-[11px] text-muted-foreground">{citeBtns(w.posts, onCite)}</div> : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {showSituation && (
      <Section n={nx()} name="Situation and risk">
        {report?.situation && <Md onCite={onCite}>{report.situation}</Md>}
        {report?.publicOrder && <Md onCite={onCite}>{`**Public order:** ${report.publicOrder}`}</Md>}
        {(report?.claims || []).length > 0 && (
          <div className="mt-3 rounded-lg border bg-card px-4 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground py-1.5">Claims in the posts (not confirmed)</div>
            {report.claims.map((c) => (
              <div key={c.claim} className="py-2 border-t border-border/60 grid grid-cols-[3px_1fr] gap-3">
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
      )}

      {showWhere && (
      <Section n={nx()} name="Where it is happening">
        {facts?.places?.length ? (
          <>
            {geo.inside.length > 0 ? (
              <div className="rounded-lg border bg-card px-4 py-3 space-y-2.5">
                {geo.inside.slice(0, 10).map((p) => (
                  <div key={p.name} className="grid grid-cols-[8rem_1fr_auto] items-center gap-3 text-[12.5px]">
                    <span className="font-semibold truncate" title={p.name}>{p.name}</span>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-slate-700 dark:bg-slate-300" style={{ width: `${(100 * n0(p.mentioned)) / Math.max(n0(geo.inside[0]?.mentioned), 1)}%` }} />
                    </div>
                    <span className="tabular-nums text-muted-foreground whitespace-nowrap">
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
          <ul className="m-0 pl-4 list-disc text-[12.5px] space-y-1">
            {report.geography.map((g) => (
              <li key={g.place}><strong>{g.place}</strong> — {g.note} <span className="text-[11px] text-muted-foreground">{citeBtns(g.posts, onCite)}</span></li>
            ))}
          </ul>
        ) : (
          <p className="text-[12.5px] text-muted-foreground m-0">No place is named in the posts.</p>
        )}
      </Section>
      )}

      {showActivity && (
      <Section n={nx()} name="Activity and ground presence">
        {(report?.activities || []).length > 0 ? (
          <div className="rounded-lg border bg-card divide-y">
            {report.activities.map((a) => (
              <div key={`${a.what}-${a.when}-${a.where}`} className="px-4 py-2.5 text-[12.5px] flex flex-wrap items-baseline gap-x-2">
                <strong>{a.what}</strong>
                <span className="text-foreground/85">{[a.where, a.when].filter(Boolean).join(' · ')}</span>
                <span className="text-[11px] text-muted-foreground">{citeBtns(a.posts, onCite)}</span>
              </div>
            ))}
          </div>
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
      </Section>
      )}

      {showActors && (
      <Section n={nx()} name="Key actors and figures">
        {(report?.leaders || []).length > 0 && (
          <div className="grid sm:grid-cols-2 gap-2 mb-3">
            {report.leaders.map((l) => (
              <div key={l.name} className="rounded-lg border bg-card px-3.5 py-2.5 text-[12.5px]">
                <div className="font-semibold">{l.name}</div>
                {l.role ? <div className="text-muted-foreground">{l.role}</div> : null}
                {l.posts?.length ? <div className="text-[11px] text-muted-foreground mt-0.5">{citeBtns(l.posts, onCite)}</div> : null}
              </div>
            ))}
          </div>
        )}
        {entities.length ? (
          <div className="rounded-lg border bg-card px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2.5">Tone by entity</div>
            <div className="space-y-2.5">
              {entities.map((e) => (
                <div key={e.name} className="grid grid-cols-[8rem_1fr_4.5rem] items-center gap-2 text-[12px]">
                  <span className="text-muted-foreground truncate" title={e.name}>{e.name} <span className="text-foreground font-semibold tabular-nums">{fmt(e.total)}</span></span>
                  <Stack height="h-2" labels={false} parts={[{ k: 'Positive', v: e.praise, c: '#1B7A4E' }, { k: 'Neutral', v: e.news, c: '#94A3B8' }, { k: 'Negative', v: e.crit, c: '#B42318' }]} />
                  <span className="tabular-nums text-muted-foreground text-right">{pct(e.crit, e.total)} neg.</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          !(report?.leaders || []).length && <p className="text-[12.5px] text-muted-foreground m-0">No people or groups are classified.</p>
        )}
      </Section>
      )}

      {showAccounts && (
      <Section n={nx()} name="Accounts to watch">
        {accounts.length > 0 ? (
          <div className="rounded-lg border bg-card overflow-hidden">
            {accounts.map((a) => (
              <div key={`${a.platform}-${a.author}`} className="px-4 py-2.5 border-t first:border-t-0 text-[12.5px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">@{String(a.author || '').replace(/^@/, '')}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-white px-1.5 py-0.5 rounded" style={{ background: platColor(a.platform) }}>{platLabel(a.platform)}</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ROLE_STYLE[a.tier]}`}>{ROLE_LABEL[a.tier]}</span>
                </div>
                <div className="text-muted-foreground mt-1">{a.reasons.join(' ')} <span className="text-[11px]">{citeBtns((a.posts || []).slice(0, 3), onCite)}</span></div>
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
      )}

      <Section n={nx()} name="Public reaction and tone">
        <div className="grid md:grid-cols-2 gap-3 mb-3">
          <div className="rounded-lg border bg-card px-4 py-3">
            <div className="text-[13px] font-semibold mb-2">Tone breakdown</div>
            {[['Positive', sent.positive, '#1B7A4E'], ['Neutral', sent.neutral, '#94A3B8'], ['Negative', sent.negative, '#B42318']].map(([k, v, c]) => (
              <div key={k} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-2 py-1 text-[12px]">
                <span className="flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-full" style={{ background: c }} />{k} <strong className="tabular-nums">{fmt(v)}</strong></span>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(100 * v) / sentTotal}%`, background: c }} /></div>
                <span className="tabular-nums text-muted-foreground w-9 text-right">{pct(v, sentTotal)}</span>
              </div>
            ))}
          </div>
          <div className="rounded-lg border bg-card px-4 py-3">
            <div className="text-[13px] font-semibold mb-2">Platform distribution</div>
            {plats.length > 0 ? plats.map((p) => (
              <div key={p.key} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 py-1 text-[12px]">
                <span className="text-muted-foreground">{p.label}</span>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(100 * p.count) / Math.max(plats[0].count, 1)}%`, background: platColor(p.key) }} />
                </div>
                <span className="tabular-nums font-medium text-right min-w-[5rem]">{fmt(p.count)} · {pct(p.count, total)}</span>
              </div>
            )) : <p className="text-[12px] text-muted-foreground m-0">No platform split.</p>}
          </div>
        </div>
        {report?.sentimentCommentary && <Md onCite={onCite}>{report.sentimentCommentary}</Md>}
        {N.length > 0 && (
          <div className="grid md:grid-cols-2 gap-3 mt-3">
            {N.map((n, i) => (
              <div key={n.code || n.title} className="rounded-lg border bg-card border-l-4 px-4 py-3" style={{ borderLeftColor: NARR_COLORS[i % NARR_COLORS.length] }}>
                <div className="text-[13.5px] font-semibold leading-snug">{n.title}</div>
                <Md onCite={onCite} className="!text-[12.5px] mt-1">{n.discussed}</Md>
                {n.posts?.length > 0 && <div className="text-[11px] text-muted-foreground mt-1.5">Evidence: {citeBtns(n.posts, onCite)}</div>}
              </div>
            ))}
          </div>
        )}
      </Section>

      {hasReport && (
      <Section n={nx()} name="Recommended actions">
        {(report?.actions || []).length > 0 ? (
          <ol className="m-0 p-0 list-none rounded-lg border bg-card divide-y">
            {report.actions.map((a, i) => (
              <li key={a.action} className="flex gap-3 px-4 py-3">
                <span className="grid place-items-center h-6 w-6 shrink-0 rounded-full bg-slate-800 dark:bg-slate-200 text-[11px] font-semibold tabular-nums text-white dark:text-slate-900">{i + 1}</span>
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
      )}
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
