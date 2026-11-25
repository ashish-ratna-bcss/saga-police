import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BrainCircuit, RefreshCw, Copy, Check, Download, AlertTriangle, ShieldAlert, Clock, ExternalLink,
  Loader2, Info, CheckCircle2, CircleDot, Hash, AtSign, X as XIcon, ChevronDown, FileText, FileCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { profileReportApi } from '../../../api/profileReport.api';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import { Progress } from '../../../components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { cn } from '../../../lib/utils';
import {
  ATTENTION_STYLES, analysisProgress, citesIn, dayLabel, formatCount, formatWhen, hourLabel, limitationsOf, platformLabel, postBody, postingRate, readingOf, responseText,
  spanText, splitCites, timelineTicks, toneShare, WEEKDAYS,
} from './reportFormat';

const POLL_MS = 3500;

// The two PDF reports, the same pair as the event report. Both come from the same saved analysis.
const REPORT_FORMATS = [
  { title: 'Executive Summary', note: 'The assessment, risk and findings, without the post-by-post list', evidence: false, tag: 'Executive_Summary', Icon: FileText, color: 'text-primary' },
  { title: 'Full Report with Evidence', note: 'The same report, with every cited post listed and linked', evidence: true, tag: 'With_Evidence', Icon: FileCheck, color: 'text-emerald-600 dark:text-emerald-400' },
];

const STEPS = [
  { at: 0, label: "Reading the profile's posts" },
  { at: 15, label: 'Measuring posting rhythm, tone and risk' },
  { at: 35, label: 'Writing the behaviour analysis' },
  { at: 88, label: 'Checking every citation against the posts' },
];

const PILL = {
  // evidence strength
  Observed: 'border-sky-300 bg-sky-50 text-sky-700',
  Likely: 'border-slate-300 bg-slate-50 text-slate-700',
  Unclear: 'border-stone-300 bg-stone-50 text-stone-600',
  // theme share
  Main: 'border-indigo-300 bg-indigo-50 text-indigo-700',
  Frequent: 'border-violet-300 bg-violet-50 text-violet-700',
  Occasional: 'border-slate-300 bg-slate-50 text-slate-600',
  // attitude
  Supportive: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  Critical: 'border-orange-300 bg-orange-50 text-orange-700',
  Hostile: 'border-rose-300 bg-rose-50 text-rose-700',
  Neutral: 'border-slate-300 bg-slate-50 text-slate-700',
  Mixed: 'border-violet-300 bg-violet-50 text-violet-700',
  // severity
  High: 'border-rose-300 bg-rose-50 text-rose-700',
  Medium: 'border-amber-300 bg-amber-50 text-amber-800',
  Low: 'border-emerald-300 bg-emerald-50 text-emerald-700',
};
const TONE = {
  positive: 'bg-emerald-500',
  neutral: 'bg-slate-400',
  negative: 'bg-rose-500',
};

const Pill = ({ children, className }) => (
  <span className={cn('inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold', PILL[children], className)}>
    {children}
  </span>
);

const CiteChip = ({ n, onCite }) => (
  <button
    type="button"
    onClick={() => onCite(n)}
    className="mx-0.5 inline-flex h-4 items-center rounded bg-indigo-50 px-1 align-[1px] text-[10px] font-bold text-indigo-700 hover:bg-indigo-100"
    title={`Show post P${n}`}
  >
    P{n}
  </button>
);

/** Text with [P3] citations turned into clickable chips. */
const Rich = ({ text, onCite }) => (
  <>
    {splitCites(text).map((part, i) => (typeof part === 'number'
      ? <CiteChip key={i} n={part} onCite={onCite} />
      : <React.Fragment key={i}>{part}</React.Fragment>))}
  </>
);

const Cites = ({ posts, onCite }) => (posts && posts.length
  ? <span className="ml-0.5">{posts.map((n) => <CiteChip key={n} n={n} onCite={onCite} />)}</span>
  : null);

const Section = ({ title, hint, children, className }) => (
  <section className={cn('rounded-lg border bg-card p-3.5', className)}>
    <div className="mb-2 flex items-baseline justify-between gap-2">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</h3>
      {hint ? <span className="text-[10px] text-muted-foreground">{hint}</span> : null}
    </div>
    {children}
  </section>
);

const Empty = ({ children }) => <p className="text-xs text-muted-foreground">{children}</p>;

const Stat = ({ label, value, sub, tone }) => (
  <div className="rounded-lg border bg-card px-3 py-2">
    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className={cn('mt-0.5 text-lg font-bold tabular-nums leading-tight', tone)}>{value}</p>
    {sub ? <p className="truncate text-[10px] text-muted-foreground">{sub}</p> : null}
  </div>
);

/** Columns with their counts above them, so a handful of posts can be read without guessing. */
const Bars = ({ values, labels, color, height = 84 }) => {
  const max = Math.max(1, ...values);
  return (
    <div className="flex items-end gap-[3px]" style={{ height }}>
      {values.map((v, i) => (
        <div key={i} className="flex h-full flex-1 flex-col justify-end" title={`${labels[i] || i}: ${v} posts`}>
          <span className="h-3 text-center text-[9px] font-medium leading-3 tabular-nums text-foreground">{v || ''}</span>
          <div className={cn('min-h-[2px] rounded-t-sm', v ? color : 'bg-slate-100')} style={{ height: `${Math.round((v / max) * 72)}%` }} />
          <span className="mt-1 h-3 text-center text-[9px] leading-3 text-muted-foreground">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
};

/** Posts per month (or quarter, or year) over the whole period, so bursts and long silences show. */
const Timeline = ({ cad }) => {
  const tl = cad.timeline;
  if (!tl || !Array.isArray(tl.buckets) || tl.buckets.length < 2) return null;
  const max = Math.max(1, ...tl.buckets.map((b) => b.posts));
  const gap = cad.longest_gap;
  return (
    <div className="mb-4" data-timeline>
      <p className="mb-1 text-[11px] text-muted-foreground">
        Posts per {tl.unit} · posted in <b className="text-foreground">{tl.active}</b> of {tl.buckets.length} {tl.unit}s
        {tl.peak ? <> · busiest <b className="text-foreground">{tl.peak.label}</b> ({tl.peak.posts} posts)</> : null}
      </p>
      <div className="flex items-end gap-px" style={{ height: 84 }}>
        {tl.buckets.map((b) => (
          <div key={b.key} className="flex h-full flex-1 flex-col justify-end" title={`${b.label}: ${b.posts} posts`}>
            <span className="h-3 text-center text-[8px] leading-3 tabular-nums text-foreground">{b.posts || ''}</span>
            <div className={cn('min-h-[1px] rounded-t-sm', b.posts ? 'bg-violet-500' : 'bg-slate-100')} style={{ height: `${Math.round((b.posts / max) * 72)}%` }} />
          </div>
        ))}
      </div>
      <div className="relative mt-1 h-3.5">
        {timelineTicks(tl).map((t) => (
          <span key={t.i} className="absolute -translate-x-1/2 whitespace-nowrap text-[10px] text-muted-foreground" style={{ left: `${t.at}%` }}>{t.text}</span>
        ))}
      </div>
      {gap && gap.days >= 30 ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Longest silence <b className="tabular-nums text-foreground">{formatCount(gap.days)} days</b> ({dayLabel(gap.from)} → {dayLabel(gap.to)})
        </p>
      ) : null}
    </div>
  );
};

const ToneBar = ({ sentiment }) => {
  const share = toneShare(sentiment);
  if (!share.total) return <Empty>No analysed posts yet.</Empty>;
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
        {['positive', 'neutral', 'negative'].map((k) => (share[k] ? <div key={k} className={TONE[k]} style={{ width: `${share[k]}%` }} /> : null))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {['positive', 'neutral', 'negative'].map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <i className={cn('h-2 w-2 rounded-sm', TONE[k])} />
            <span className="capitalize">{k}</span> <b className="tabular-nums text-foreground">{sentiment[k] || 0}</b> ({share[k]}%)
          </span>
        ))}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------------- progress ----------------------- */

const Generating = ({ startedAt, onCancel, cancelling }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const elapsed = Math.max(0, Math.floor((now - (startedAt ? new Date(startedAt).getTime() : now)) / 1000));
  const progress = Math.min(95, Math.round(6 + elapsed * 1.15));
  const active = [...STEPS].reverse().find((s) => progress >= s.at) || STEPS[0];
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-14 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50">
        <BrainCircuit className="h-6 w-6 animate-pulse text-indigo-600" />
      </div>
      <p className="text-sm font-semibold">Writing the behaviour report</p>
      <p className="mt-1 text-xs text-muted-foreground">
        This usually takes under a minute. You can close this window; the report keeps generating and is saved.
      </p>
      <Progress value={progress} className="mt-5 h-1.5 w-full" />
      <ul className="mt-4 w-full space-y-1.5 text-left">
        {STEPS.map((s) => {
          const done = progress > s.at && s !== active && STEPS.indexOf(s) < STEPS.indexOf(active);
          const current = s === active;
          return (
            <li key={s.label} className={cn('flex items-center gap-2 text-xs', current ? 'font-medium text-foreground' : done ? 'text-muted-foreground' : 'text-muted-foreground/60')}>
              {done ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : current ? <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" /> : <CircleDot className="h-3.5 w-3.5" />}
              {s.label}
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-[11px] tabular-nums text-muted-foreground">{elapsed}s elapsed</p>
      <Button variant="ghost" size="sm" className="mt-2 h-7 text-xs" onClick={onCancel} disabled={cancelling}>
        {cancelling ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <XIcon className="mr-1 h-3 w-3" />} Cancel
      </Button>
    </div>
  );
};

/* ------------------------------------------------------------------------- report tabs -------------------- */

const BehaviourTab = ({ report, facts, onCite }) => {
  const content = facts.content || {};
  return (
    <div className="space-y-3">
      <Section title="Behaviour traits" hint="Observed = seen in 2+ posts · Likely = 1 post or indirect">
        {report.behaviour_traits?.length ? (
          <div className="grid gap-2 md:grid-cols-2">
            {report.behaviour_traits.map((t, i) => (
              <div key={i} className="rounded-md border bg-muted/20 p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[13px] font-semibold leading-snug">{t.trait}</p>
                  <Pill>{t.evidence_level}</Pill>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  <Rich text={t.detail} onCite={onCite} /><Cites posts={t.posts} onCite={onCite} />
                </p>
              </div>
            ))}
          </div>
        ) : <Empty>No behaviour traits were written for this report.</Empty>}
      </Section>

      <div className="grid gap-3 md:grid-cols-2">
        <Section title="Themes">
          {report.themes?.length ? (
            <ul className="divide-y">
              {report.themes.map((t, i) => (
                <li key={i} className="py-2 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-medium">{t.theme}</p>
                    <Pill>{t.share}</Pill>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground"><Rich text={t.detail} onCite={onCite} /><Cites posts={t.posts} onCite={onCite} /></p>
                </li>
              ))}
            </ul>
          ) : <Empty>No themes.</Empty>}
        </Section>

        <Section title="Tone">
          <ToneBar sentiment={facts.sentiment || {}} />
          {report.tone ? <p className="mt-2.5 text-xs leading-relaxed"><Rich text={report.tone} onCite={onCite} /></p> : null}
        </Section>
      </div>

      <Section title="Who the posts are about">
        {report.targets?.length ? (
          <div className="divide-y">
            {report.targets.map((t, i) => (
              <div key={i} className="grid grid-cols-[minmax(120px,200px)_90px_1fr] items-start gap-3 py-2 first:pt-0 last:pb-0">
                <p className="text-[13px] font-medium">{t.target}</p>
                <div><Pill>{t.attitude}</Pill></div>
                <p className="text-xs text-muted-foreground"><Rich text={t.detail} onCite={onCite} /><Cites posts={t.posts} onCite={onCite} /></p>
              </div>
            ))}
          </div>
        ) : <Empty>The posts do not single out any person, party or institution.</Empty>}
      </Section>

      <Section title="Communication style">
        {report.communication_style ? <p className="text-xs leading-relaxed"><Rich text={report.communication_style} onCite={onCite} /></p> : null}
        <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px]">
          {[
            ['Original', content.original], ['Shared', content.shared], ['Replies', content.replies],
            ['Photo / video', content.with_media], ['Text read from images', content.with_image_text], ['With links', content.with_links], ['Avg length', `${content.avg_length || 0} chars`],
          ].map(([k, v]) => (
            <span key={k} className="rounded-full border bg-muted/30 px-2 py-0.5"><span className="text-muted-foreground">{k}</span> <b className="tabular-nums">{v ?? 0}</b></span>
          ))}
          {(content.languages || []).map((l) => (
            <span key={l.language} className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 uppercase text-sky-800">{l.language} <b className="tabular-nums">{l.count}</b></span>
          ))}
        </div>
      </Section>
    </div>
  );
};

const PatternTab = ({ report, facts, onCite }) => {
  const cad = facts.cadence || {};
  const eng = facts.engagement || {};
  const content = facts.content || {};
  const weeks = cad.weeks || [];
  const weekMax = Math.max(1, ...weeks.map((w) => w.posts));
  const platforms = facts.by_platform || [];
  return (
    <div className="space-y-3">
      {platforms.length > 1 ? (
        <Section title="By platform" hint="Every collected post, per account">
          {report.platform_differences ? <p className="mb-3 text-xs leading-relaxed"><Rich text={report.platform_differences} onCite={onCite} /></p> : null}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-1.5 pr-3 font-semibold">Platform</th>
                  <th className="py-1.5 pr-3 font-semibold">Posts</th>
                  <th className="py-1.5 pr-3 font-semibold">Negative</th>
                  <th className="py-1.5 pr-3 font-semibold">Serious risk</th>
                  <th className="py-1.5 pr-3 font-semibold">Engagement a post</th>
                  <th className="py-1.5 font-semibold">Period</th>
                </tr>
              </thead>
              <tbody>
                {platforms.map((p) => (
                  <tr key={p.platform} className="border-b last:border-0">
                    <td className="py-1.5 pr-3 font-medium">{platformLabel(p.platform)}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{formatCount(p.posts)}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{p.negative_share}% <span className="text-muted-foreground">of {formatCount(p.analysed)}</span></td>
                    <td className={cn('py-1.5 pr-3 tabular-nums', p.high_risk ? 'font-semibold text-rose-600' : '')}>{formatCount(p.high_risk)}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{formatCount(p.avg_engagement)}</td>
                    <td className="py-1.5 tabular-nums text-muted-foreground">{dayLabel(p.first_post)} → {dayLabel(p.last_post)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      <Section title="Posting rhythm" hint={`Times in ${facts.timezone || 'local time'}`}>
        {report.posting_pattern ? <p className="mb-3 text-xs leading-relaxed"><Rich text={report.posting_pattern} onCite={onCite} /></p> : null}
        <Timeline cad={cad} />
        <div className="grid gap-5 md:grid-cols-[2fr_1fr]">
          <div>
            <p className="mb-1 text-[11px] text-muted-foreground">Posts by hour of day</p>
            <Bars values={cad.by_hour || Array(24).fill(0)} labels={Array.from({ length: 24 }, (_, h) => (h % 3 === 0 ? String(h).padStart(2, '0') : ''))} color="bg-blue-500" />
          </div>
          <div>
            <p className="mb-1 text-[11px] text-muted-foreground">Posts by day of week</p>
            <Bars values={cad.by_weekday || Array(7).fill(0)} labels={WEEKDAYS} color="bg-teal-500" />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
          <span>Busiest hours <b className="text-foreground">{cad.busiest_hours ? `${hourLabel(cad.busiest_hours.from)}–${hourLabel(cad.busiest_hours.to)}` : '—'}</b></span>
          <span>Busiest day <b className="text-foreground">{cad.busiest_day?.day || '—'}</b></span>
          <span>Night posts (00–05) <b className="tabular-nums text-foreground">{cad.night_posts ?? 0}</b></span>
          {cad.timeline ? null : <span>Longest silence <b className="tabular-nums text-foreground">{cad.longest_gap_days ?? 0} days</b></span>}
        </div>
      </Section>

      {weeks.length > 1 && (!cad.timeline || (facts.coverage?.span_days ?? 0) <= 120) ? (
        <Section title="Week by week" hint="Red = negative posts · dot = serious-risk posts">
          <div className="space-y-1">
            {weeks.map((w) => (
              <div key={w.week} className="grid grid-cols-[72px_1fr_36px] items-center gap-2 text-[11px]">
                <span className="tabular-nums text-muted-foreground">{w.week.slice(5)}</span>
                <div className="flex h-3 overflow-hidden rounded bg-slate-100">
                  <div className="bg-rose-400" style={{ width: `${(w.negative / weekMax) * 100}%` }} />
                  <div className="bg-slate-400" style={{ width: `${((w.posts - w.negative) / weekMax) * 100}%` }} />
                </div>
                <span className="flex items-center gap-1 tabular-nums">
                  {w.posts}{w.high_risk ? <i className="h-1.5 w-1.5 rounded-full bg-rose-600" title={`${w.high_risk} serious-risk`} /> : null}
                </span>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <Section title="Reach">
          {report.influence ? <p className="text-xs leading-relaxed"><Rich text={report.influence} onCite={onCite} /></p> : null}
          <div className={cn('mt-2 grid gap-2 text-center', eng.shares_reported === false ? 'grid-cols-3' : 'grid-cols-4')}>
            {[['Likes', eng.total?.likes], ...(eng.shares_reported === false ? [] : [['Shares', eng.total?.shares]]), ['Comments', eng.total?.comments], ['Views', eng.total?.views]].map(([k, v]) => (
              <div key={k} className="rounded-md bg-muted/40 py-1.5">
                <p className="text-sm font-bold tabular-nums">{Number(v || 0).toLocaleString('en-IN')}</p>
                <p className="text-[10px] text-muted-foreground">{k}</p>
              </div>
            ))}
          </div>
        </Section>
        <Section title="Hashtags and mentions">
          <div className="flex flex-wrap gap-1.5">
            {(content.hashtags || []).map((h) => (
              <span key={h.tag} className="inline-flex items-center gap-0.5 rounded-full border bg-muted/30 px-2 py-0.5 text-[11px]"><Hash className="h-2.5 w-2.5" />{h.tag.slice(1)} <b className="ml-0.5 tabular-nums">{h.count}</b></span>
            ))}
            {(content.mentions || []).map((m) => (
              <span key={m.handle} className="inline-flex items-center gap-0.5 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-800"><AtSign className="h-2.5 w-2.5" />{m.handle.slice(1)} <b className="ml-0.5 tabular-nums">{m.count}</b></span>
            ))}
            {!content.hashtags?.length && !content.mentions?.length ? <Empty>No hashtags or mentions.</Empty> : null}
          </div>
          {content.pictures?.terms?.length ? (
            <div className="mt-3 border-t pt-2" data-picture-terms>
              <p className="mb-1 text-[11px] text-muted-foreground">
                What the pictures show <span className="text-muted-foreground/80">({content.pictures.described} of {content.pictures.with_pictures} pictures described)</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {content.pictures.terms.map((t) => (
                  <span key={t.term} className="inline-flex items-center gap-0.5 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] text-violet-800">{t.term} <b className="ml-0.5 tabular-nums">{t.count}</b></span>
                ))}
              </div>
            </div>
          ) : null}
          {content.tones?.length ? (
            <div className="mt-3 border-t pt-2" data-tones>
              <p className="mb-1 text-[11px] text-muted-foreground">
                How the posts are meant <span className="text-muted-foreground/80">({content.read_in_context ?? 0} of {facts.coverage?.read ?? 0} read in context)</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {content.tones.map((t) => (
                  <span key={t.term} className="inline-flex items-center gap-0.5 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] capitalize text-violet-800">{t.term} <b className="ml-0.5 tabular-nums">{t.count}</b></span>
                ))}
              </div>
            </div>
          ) : null}
          {content.pictures?.signals?.length ? (
            <div className="mt-3 border-t pt-2" data-picture-signals>
              <p className="mb-1 text-[11px] text-muted-foreground">Flagged in pictures <span className="text-muted-foreground/80">(flags, symbols, weapons, crowds ...)</span></p>
              <div className="flex flex-wrap gap-1.5">
                {content.pictures.signals.map((t) => (
                  <span key={t.term} className="inline-flex items-center gap-0.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-900">{t.term} <b className="ml-0.5 tabular-nums">{t.count}</b></span>
                ))}
              </div>
            </div>
          ) : null}
        </Section>
      </div>

      <Section title="Changes over time">
        {report.changes_over_time?.length ? (
          <ul className="space-y-2">
            {report.changes_over_time.map((c, i) => (
              <li key={i} className="grid grid-cols-[1fr_auto_1fr] items-start gap-2 text-xs">
                <span className="rounded-md bg-muted/40 p-2"><Rich text={c.from} onCite={onCite} /></span>
                <span className="pt-2 text-muted-foreground">→</span>
                <span className="rounded-md bg-indigo-50/60 p-2"><Rich text={c.to} onCite={onCite} /><Cites posts={c.posts} onCite={onCite} /></span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>
            {facts.trend
              ? `No clear change: negativity is ${facts.trend.negativity} (${facts.trend.earlier.negative_share}% → ${facts.trend.later.negative_share}%) and serious risk is ${facts.trend.risk}.`
              : 'Too few dated posts to compare earlier and later behaviour.'}
          </Empty>
        )}
      </Section>
    </div>
  );
};

const RiskTab = ({ report, facts, onCite }) => {
  const r = facts.risk || {};
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Critical" value={r.critical || 0} tone={r.critical ? 'text-rose-700' : ''} />
        <Stat label="High" value={r.high || 0} tone={r.high ? 'text-rose-600' : ''} />
        <Stat label="Medium" value={r.medium || 0} tone={r.medium ? 'text-amber-700' : ''} />
        <Stat label="Low" value={r.low || 0} sub={`highest score ${r.max_score || 0}/100`} />
      </div>

      <Section title="Risk indicators" hint="Explicit signals in posts only. Criticism alone is not a risk.">
        {report.risk_indicators?.length ? (
          <ul className="space-y-2">
            {report.risk_indicators.map((x, i) => (
              <li key={i} className={cn('rounded-md border-l-4 bg-muted/20 p-2.5', x.severity === 'High' ? 'border-l-rose-500' : x.severity === 'Medium' ? 'border-l-amber-500' : 'border-l-emerald-500')}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold">{x.indicator}</p>
                  <Pill>{x.severity}</Pill>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground"><Rich text={x.detail} onCite={onCite} /><Cites posts={x.posts} onCite={onCite} /></p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex items-center gap-2 rounded-md bg-emerald-50 p-2.5 text-xs text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            No explicit risk indicator (threat, incitement, call for a bandh or blockade, doxxing) in the posts read.
          </div>
        )}
      </Section>

      <div className="grid gap-3 md:grid-cols-2">
        <Section title="Watch points">
          {report.watch_points?.length ? (
            <ul className="list-disc space-y-1 pl-4 text-xs">{report.watch_points.map((w, i) => <li key={i}><Rich text={w} onCite={onCite} /></li>)}</ul>
          ) : <Empty>None.</Empty>}
        </Section>
        <Section title="Limitations">
          {limitationsOf(report, facts).length ? (
            <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">{limitationsOf(report, facts).map((w, i) => <li key={i}><Rich text={w} onCite={onCite} /></li>)}</ul>
          ) : <Empty>None noted.</Empty>}
        </Section>
      </div>
    </div>
  );
};

/** What an evidence post says, each sentence once; a picture-only post shows the text read from it, labelled. */
const PostText = ({ post }) => {
  const body = postBody({ text: post.text, image_text: post.image_text, english: post.english, scene: post.scene });
  return (
    <>
      <p className="mt-1.5 whitespace-pre-line break-words text-[13px] leading-relaxed">
        {body.imageOnly ? <span className="mr-1.5 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">Image post</span> : null}
        {body.main || <span className="text-muted-foreground">{body.noWords ? 'no caption, no text on the picture' : '(no caption)'}</span>}
      </p>
      {body.english ? <p className="mt-1 border-l-2 border-sky-200 pl-2 text-xs text-muted-foreground"><span className="font-semibold text-sky-700">EN</span> {body.english}</p> : null}
      {body.imageText ? <p className="mt-1 border-l-2 border-violet-200 pl-2 text-xs text-muted-foreground"><span className="font-semibold text-violet-700">Image text</span> {body.imageText}</p> : null}
      {body.picture ? <p className="mt-1 border-l-2 border-fuchsia-200 pl-2 text-xs text-muted-foreground"><span className="font-semibold text-fuchsia-700">Picture</span> {body.picture}</p> : null}
      {post.picture_signals?.length ? (
        <p className="mt-1 flex flex-wrap items-center gap-1 pl-2 text-xs" data-picture-seen>
          <span className="font-semibold text-amber-800">Seen in the picture</span>
          {post.picture_signals.map((s) => <span key={s} className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-900">{s}</span>)}
        </p>
      ) : null}
    </>
  );
};

const EvidenceTab = ({ evidence, report, highlight, timezone, coverage = {} }) => {
  const cited = useMemo(() => citesIn(report), [report]);
  const notable = useMemo(() => new Map((report.notable_posts || []).map((x) => [x.post, x.why])), [report]);
  if (!evidence.length) return <Empty>No posts.</Empty>;
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">
        The {evidence.length} posts the analysis read, oldest first. {cited.size} are cited in the report.
        {coverage.no_text ? ` Not listed: ${coverage.no_text} ${coverage.no_text === 1 ? 'post' : 'posts'} with no caption and nothing readable in the picture.` : ''}
      </p>
      {evidence.map((e) => (
        <article
          key={e.n}
          id={`bev-P${e.n}`}
          className={cn(
            'rounded-lg border bg-card p-3 transition-shadow',
            highlight === e.n && 'ring-2 ring-indigo-400',
            !cited.has(e.n) && 'opacity-80'
          )}
        >
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white">P{e.n}</span>
            <span className="tabular-nums text-muted-foreground">{e.posted_at ? formatWhen(e.posted_at, timezone) : 'undated'}</span>
            <span className="text-muted-foreground">· {platformLabel(e.platform) || 'unknown'}{e.shared ? ' · shared' : e.reply ? ' · reply' : ''}</span>
            {e.sentiment ? <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold capitalize text-white', TONE[e.sentiment])}>{e.sentiment}</span> : <span className="text-[10px] text-muted-foreground">not analysed</span>}
            {e.tone ? <span className="rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium capitalize text-violet-800" data-tone>{e.tone}</span> : null}
            {e.risk_level && e.risk_level !== 'low' ? (
              <span className={cn('rounded-full border px-1.5 py-0.5 text-[10px] font-semibold', e.risk_level === 'medium' ? PILL.Medium : PILL.High)}>
                risk {e.risk_level} · {e.risk_score}
              </span>
            ) : null}
            <span className="ml-auto tabular-nums text-muted-foreground">{responseText(e)}</span>
          </div>
          <PostText post={e} />
          {readingOf(e) ? (
            <p className="mt-1 text-xs text-muted-foreground" data-meaning><span className="font-semibold text-foreground">Reading:</span> {readingOf(e)}</p>
          ) : null}
          {notable.has(e.n) ? <p className="mt-1.5 text-xs"><span className="font-semibold text-indigo-700">Notable:</span> {notable.get(e.n)}</p> : null}
          {e.url ? (
            <a href={e.url} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-blue-700 hover:underline">
              <ExternalLink className="h-3 w-3" /> Open original post
            </a>
          ) : null}
        </article>
      ))}
    </div>
  );
};

/* --------------------------------------------------------------------------- dialog ----------------------- */

/**
 * Tools → Profile Report → Generate report.
 * Opens the saved report, or starts one when there is none. Same background flow as the event report:
 * closing the dialog does not stop generation; reopening joins it.
 */
export default function ProfileReportDialog({ open, onOpenChange, profile, onReportChange }) {
  const subjectId = profile?.id;
  const [phase, setPhase] = useState('loading'); // loading | running | ready | error | cancelled
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [startedAt, setStartedAt] = useState(null);
  const [tab, setTab] = useState('behaviour');
  const [highlight, setHighlight] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);

  const runRef = useRef(0);          // bumps on every open / start / cancel; stale responses are ignored
  const timerRef = useRef(null);
  const pollRef = useRef(() => {});
  const onReportChangeRef = useRef(onReportChange);
  onReportChangeRef.current = onReportChange;

  const stopPolling = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const accept = useCallback((payload, run, { announce = false } = {}) => {
    if (run !== runRef.current) return;
    if (payload?.status === 'running') {
      setPhase('running');
      setStartedAt(payload.started_at || new Date().toISOString());
      timerRef.current = setTimeout(() => pollRef.current(run, announce), POLL_MS);
      return;
    }
    stopPolling();
    if (payload?.report) {
      setData(payload);
      setPhase('ready');
      setError(null);
      onReportChangeRef.current?.(subjectId, {
        generated_at: payload.generated_at,
        attention_level: payload.report.attention_level,
        summary_source: payload.summary_source,
      });
      if (payload.regenerate_error) toast.error('Regenerate failed', { description: payload.regenerate_error });
      else if (announce && payload.summary_source === 'fallback') toast.warning('AI model unavailable', { description: payload.llm_notice });
      else if (announce) toast.success('Behaviour report ready');
      return;
    }
    if (payload?.status === 'failed') {
      setPhase('error');
      setError(payload.message || 'The report could not be generated.');
      return;
    }
    if (payload?.status === 'cancelled') {
      setPhase('cancelled');
      return;
    }
    // { status: 'none' }: nothing saved and nothing running
    setPhase('none');
  }, [subjectId, stopPolling]);

  const poll = useCallback(async (run, announce) => {
    try {
      const res = await profileReportApi.getReport(subjectId);
      accept(res?.data, run, { announce });
    } catch (err) {
      if (run !== runRef.current) return;
      setPhase('error');
      setError(err?.response?.data?.message || err?.message || 'Could not load the report.');
    }
  }, [subjectId, accept]);
  pollRef.current = poll;

  const start = useCallback(async () => {
    if (!subjectId) return;
    stopPolling();
    const run = ++runRef.current;
    setPhase('running');
    setError(null);
    setStartedAt(new Date().toISOString());
    try {
      const res = await profileReportApi.startReport(subjectId);
      accept(res?.data, run, { announce: true });
    } catch (err) {
      if (run !== runRef.current) return;
      setPhase('error');
      setError(err?.response?.data?.message || err?.message || 'Could not start the report.');
    }
  }, [subjectId, accept, stopPolling]);

  // Open: show the saved report, join a running job, or start one (the user clicked Generate).
  useEffect(() => {
    if (!open || !subjectId) return undefined;
    const run = ++runRef.current;
    setPhase('loading');
    setData(null);
    setError(null);
    setTab('behaviour');
    setHighlight(null);
    (async () => {
      try {
        const res = await profileReportApi.getReport(subjectId);
        if (run !== runRef.current) return;
        if (res?.data?.status === 'none') start();
        else accept(res?.data, run, { announce: true });
      } catch (err) {
        if (run !== runRef.current) return;
        setPhase('error');
        setError(err?.response?.data?.message || err?.message || 'Could not load the report.');
      }
    })();
    return () => { runRef.current += 1; stopPolling(); };
    // Runs once per open / profile; start, accept and stopPolling only change with subjectId.
  }, [open, subjectId]);

  const cancel = useCallback(async () => {
    setCancelling(true);
    const run = ++runRef.current;
    stopPolling();
    try {
      await profileReportApi.cancelReport(subjectId);
      const res = await profileReportApi.getReport(subjectId);
      accept(res?.data, run);
      if (!res?.data?.report) setPhase('cancelled');
    } catch (err) {
      toast.error('Could not cancel', { description: err?.response?.data?.message || err?.message });
    } finally {
      setCancelling(false);
    }
  }, [subjectId, accept, stopPolling]);

  const showPost = useCallback((n) => {
    setTab('evidence');
    setHighlight(n);
    setTimeout(() => {
      document.getElementById(`bev-P${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
    setTimeout(() => setHighlight((h) => (h === n ? null : h)), 2400);
  }, []);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(data?.markdown || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      toast.error('Could not copy');
    }
  }, [data]);

  // Two reports from the same saved analysis (same pair as the event report): `evidence` = every cited post listed and linked.
  const downloadPdf = useCallback(async ({ evidence = true, tag = 'With_Evidence' } = {}) => {
    setDownloading(true);
    try {
      const res = await profileReportApi.downloadReportPdf(subjectId, { evidence });
      const header = res.headers?.['content-disposition'] || '';
      const name = (header.match(/filename="?([^"]+)"?/) || [])[1] || `Behaviour_Report_${tag}.pdf`;
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      let message = err?.message;
      try { message = JSON.parse(await err.response.data.text()).message || message; } catch (e) { /* not JSON */ }
      toast.error('PDF download failed', { description: message });
    } finally {
      setDownloading(false);
    }
  }, [subjectId]);

  const report = data?.report || null;
  const facts = data?.facts || {};
  const evidence = data?.evidence || [];
  const cov = facts.coverage || {};
  const sent = facts.sentiment || {};
  const tone = toneShare(sent);
  const att = ATTENTION_STYLES[report?.attention_level] || ATTENTION_STYLES.Low;
  const tz = facts.timezone;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] max-w-5xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-0 border-b px-5 py-3.5 text-left">
          <div className="flex items-start justify-between gap-3 pr-6">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
                <BrainCircuit className="h-5 w-5 text-indigo-600" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="truncate text-base">Behaviour report · {profile?.display_name || 'Profile'}</DialogTitle>
                <DialogDescription className="truncate text-xs">
                  {(profile?.accounts || []).map((a) => `${platformLabel(a.platform)} ${a.handle}`).join(' · ')}
                  {phase === 'ready' && data?.generated_at ? ` · generated ${formatWhen(data.generated_at)}${data.generated_by?.name ? ` by ${data.generated_by.name}` : ''}` : ''}
                </DialogDescription>
              </div>
            </div>
            {phase === 'ready' ? (
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs font-medium" onClick={start} title="Read the posts again and write a new report">
                  <RefreshCw className="h-3.5 w-3.5" /> Regenerate
                </Button>
                <Button variant="outline" size="sm" className="h-9 w-9 p-0" onClick={copy} title="Copy report text" aria-label="Copy report text">
                  {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" disabled={downloading} className="h-9 gap-1.5 text-xs font-semibold" title="Download the report as PDF">
                      {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                      <span>{downloading ? 'Preparing…' : 'Download Report'}</span>
                      <ChevronDown className="ml-0.5 h-3 w-3 opacity-70" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-80">
                    <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Select Report Format
                    </DropdownMenuLabel>
                    {REPORT_FORMATS.map((f) => (
                      <DropdownMenuItem
                        key={f.tag}
                        onClick={() => downloadPdf(f)}
                        disabled={downloading}
                        className="flex cursor-pointer items-start gap-2.5 px-2.5 py-2"
                      >
                        <f.Icon className={cn('mt-0.5 h-4 w-4 shrink-0', f.color)} />
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-semibold text-foreground">{f.title}</span>
                          <span className="text-[11px] leading-tight text-muted-foreground">{f.note}</span>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : null}
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20 px-5 py-4">
          {phase === 'loading' ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : null}

          {phase === 'running' ? <Generating startedAt={startedAt} onCancel={cancel} cancelling={cancelling} /> : null}

          {phase === 'error' || phase === 'cancelled' || phase === 'none' ? (
            <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
              {phase === 'error' ? <AlertTriangle className="h-8 w-8 text-amber-500" /> : <Info className="h-8 w-8 text-slate-400" />}
              <p className="mt-3 text-sm font-medium">
                {phase === 'error' ? 'The report could not be generated' : phase === 'cancelled' ? 'Generation was cancelled' : 'No report yet'}
              </p>
              {error ? <p className="mt-1 text-xs text-muted-foreground">{error}</p> : null}
              <Button size="sm" className="mt-4 h-8 gap-1.5 text-xs" onClick={start}>
                <BrainCircuit className="h-3.5 w-3.5" /> Generate Report
              </Button>
            </div>
          ) : null}

          {phase === 'ready' && report ? (
            <div className="space-y-3">
              {data.is_stale ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <span className="flex items-center gap-2"><Clock className="h-3.5 w-3.5" />
                    {data.new_posts_count > 0
                      ? `${formatCount(data.new_posts_count)} new post${data.new_posts_count === 1 ? '' : 's'} collected since this report.`
                      : data.new_analysed_count > 0
                        ? `${formatCount(data.new_analysed_count)} more post${data.new_analysed_count === 1 ? ' has' : 's have'} been analysed since this report.`
                        : 'Posts have changed since this report.'}
                  </span>
                  <button type="button" className="font-semibold underline-offset-2 hover:underline" onClick={start}>Regenerate</button>
                </div>
              ) : null}
              {data.analysis?.waiting > 0 ? (
                <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  Still analysing posts: {formatCount(data.analysis.analysed)} of {formatCount(data.analysis.posts)} done. This report uses the analysed posts; regenerate when analysis finishes for the full picture.
                </div>
              ) : null}
              {data.llm_notice ? (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {data.llm_notice}
                </div>
              ) : null}

              {/* Bottom line */}
              <div className={cn('rounded-lg border border-l-4 bg-card p-4', att.border)}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold', att.pill)}>
                    <ShieldAlert className="h-3.5 w-3.5" /> Attention: {report.attention_level}
                  </span>
                  <span className="rounded-full border bg-muted/40 px-2.5 py-0.5 text-xs font-medium">{report.account_type}</span>
                </div>
                <p className="mt-2.5 text-[15px] leading-relaxed"><Rich text={report.bottom_line} onCite={showPost} /></p>
                {report.attention_reason ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    <b className="text-foreground">Why {report.attention_level}:</b> <Rich text={report.attention_reason} onCite={showPost} />
                  </p>
                ) : null}
                {report.account_type_basis ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    <b className="text-foreground">Account type:</b> <Rich text={report.account_type_basis} onCite={showPost} />
                  </p>
                ) : null}
                {report.regional_link ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    <b className="text-foreground">Regional link:</b> <Rich text={report.regional_link} onCite={showPost} />
                  </p>
                ) : null}
              </div>

              {/* Key figures */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <Stat label="Posts collected" value={formatCount(cov.read)} sub={`${formatCount(cov.analysed)} analysed${cov.no_text ? ` · ${formatCount(cov.no_text)} no text` : ''}${cov.waiting ? ` · ${formatCount(cov.waiting)} waiting` : ''}`} />
                <Stat label="Period" value={spanText(cov)} sub={`${dayLabel(cov.first_post)} → ${dayLabel(cov.last_post)}`} />
                <Stat label={postingRate(facts).label} value={postingRate(facts).value} sub={`${facts.cadence?.active_days ?? 0} active days`} />
                <Stat label="Engagement a post" value={facts.engagement?.avg_score ?? 0} sub={`average · median ${facts.engagement?.median_score ?? 0}`} />
                <Stat label="Negative" value={`${tone.negative}%`} sub={`${sent.negative || 0} of ${tone.total} analysed`} tone={tone.negative >= 50 ? 'text-rose-600' : ''} />
                <Stat
                  label="Serious risk"
                  value={(facts.risk?.critical || 0) + (facts.risk?.high || 0)}
                  sub={`${facts.risk?.medium || 0} medium`}
                  tone={(facts.risk?.critical || 0) + (facts.risk?.high || 0) ? 'text-rose-600' : ''}
                />
              </div>

              <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="h-9">
                  <TabsTrigger value="behaviour" className="text-xs">Behaviour</TabsTrigger>
                  <TabsTrigger value="pattern" className="text-xs">Activity pattern</TabsTrigger>
                  <TabsTrigger value="risk" className="text-xs">
                    Risk{report.risk_indicators?.length ? <span className="ml-1 rounded-full bg-rose-100 px-1.5 text-[10px] text-rose-700">{report.risk_indicators.length}</span> : null}
                  </TabsTrigger>
                  <TabsTrigger value="evidence" className="text-xs">Evidence <span className="ml-1 text-muted-foreground">{evidence.length}</span></TabsTrigger>
                </TabsList>
                <TabsContent value="behaviour" className="mt-3"><BehaviourTab report={report} facts={facts} onCite={showPost} /></TabsContent>
                <TabsContent value="pattern" className="mt-3"><PatternTab report={report} facts={facts} onCite={showPost} /></TabsContent>
                <TabsContent value="risk" className="mt-3"><RiskTab report={report} facts={facts} onCite={showPost} /></TabsContent>
                <TabsContent value="evidence" className="mt-3"><EvidenceTab evidence={evidence} report={report} highlight={highlight} timezone={tz} coverage={cov} /></TabsContent>
              </Tabs>

              <p className="pb-1 text-center text-[10px] text-muted-foreground">
                Analyst aid written from the profile&apos;s public posts{data.summary_source === 'llm' ? ' with AI assistance' : ''}. Numbers are computed from the stored posts; P-numbers link to the evidence. Check the original posts before taking any action.
              </p>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
