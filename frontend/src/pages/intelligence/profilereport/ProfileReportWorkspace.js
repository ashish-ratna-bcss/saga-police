import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Loader2, Lock, Pencil, Plus, RefreshCw, Search, Sparkles, Trash2, UserSearch,
} from 'lucide-react';
import { toast } from 'sonner';
import { profileReportApi } from '../../../api/profileReport.api';
import { socialProfilesApi } from '../../../api/socialProfiles.api';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Progress } from '../../../components/ui/progress';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../../../components/ui/alert-dialog';
import { cn } from '../../../lib/utils';
import { publicText } from '../../../lib/publicError';
import AddProfileDialog from './AddProfileDialog';
import PostsPanel from './PostsPanel';
import ProfileReportDialog from './ProfileReportDialog';
import {
  ATTENTION_STYLES, DEFAULT_SUPPORTED_PLATFORMS, analysisProgress, formatCount, platformLabel, progressOf, relativeTime, reportLockReason,
} from './reportFormat';

const POLL_MS = 5000;
const normalise = (slug) => (String(slug || '').toLowerCase() === 'twitter' ? 'x' : String(slug || '').toLowerCase());
const errText = (err, fallback) => publicText(err?.response?.data?.message || err?.response?.data?.error || fallback, err?.response?.status);

const PHASE_STYLE = {
  collecting: 'border-sky-200 bg-sky-50 text-sky-700',
  analysing: 'border-violet-200 bg-violet-50 text-violet-700',
  failed: 'border-rose-200 bg-rose-50 text-rose-700',
  ready: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  empty: 'border-slate-200 bg-slate-50 text-slate-600',
};

const PhaseChip = ({ subject }) => {
  const p = progressOf(subject);
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold', PHASE_STYLE[p.phase])}>
      {p.phase === 'collecting' || p.phase === 'analysing' ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : null}
      {p.phase === 'failed' ? <AlertTriangle className="h-2.5 w-2.5" /> : null}
      {p.phase === 'ready' ? <CheckCircle2 className="h-2.5 w-2.5" /> : null}
      {p.label}
    </span>
  );
};

const AttentionDot = ({ report }) => {
  if (!report?.generated_at) return null;
  const style = ATTENTION_STYLES[report.attention_level] || ATTENTION_STYLES.Low;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground" title={`Attention: ${report.attention_level || '—'}`}>
      <i className={cn('h-1.5 w-1.5 rounded-full', style.dot)} />
      {report.attention_level || 'Low'} · {relativeTime(report.generated_at)}
    </span>
  );
};

/* ---------------------------------------------------------------------------- left list ------------------- */

const ProfileList = ({ subjects, selectedId, onSelect, loading, query, onQuery, onAdd, canAdd }) => (
  <aside className="flex w-full shrink-0 flex-col border-b bg-card lg:w-[22rem] lg:border-b-0 lg:border-r">
    <div className="space-y-2 border-b p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold leading-none">Profile Report</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">Every post of a profile, analysed, with an AI behaviour report</p>
        </div>
        <Button size="sm" className="h-8 gap-1 text-xs" onClick={onAdd} disabled={!canAdd}>
          <Plus className="h-3.5 w-3.5" /> Add profile
        </Button>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search profiles" className="h-8 pl-8 text-xs" aria-label="Search profiles" />
      </div>
    </div>

    <div className="min-h-0 flex-1 overflow-y-auto p-2 lg:max-h-[calc(100dvh-12rem)]">
      {loading && !subjects.length ? (
        <div className="flex items-center justify-center py-10 text-xs text-muted-foreground"><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Loading…</div>
      ) : null}
      {!loading && !subjects.length ? (
        <p className="px-3 py-10 text-center text-xs text-muted-foreground">{query ? 'No profile matches your search.' : 'No profiles yet.'}</p>
      ) : null}
      <ul className="space-y-1.5">
        {subjects.map((s) => {
          const progress = analysisProgress(s);
          const active = s.id === selectedId;
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onSelect(s.id)}
                className={cn('w-full rounded-lg border p-2.5 text-left transition-colors hover:bg-muted/40', active ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20' : 'bg-background')}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-[13px] font-semibold leading-tight">{s.display_name}</p>
                  <PhaseChip subject={s} />
                </div>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {s.accounts.map((a) => `${platformLabel(a.platform)} ${a.handle}`).join(' · ')}
                </p>
                <div className="mt-2 flex items-center justify-between text-[11px] tabular-nums text-muted-foreground">
                  <span><b className="text-foreground">{formatCount(s.posts)}</b> posts</span>
                  <span>{formatCount(s.analysed)} analysed{s.waiting > 0 ? ` · ${formatCount(s.waiting)} waiting` : ''}</span>
                  <AttentionDot report={s.report} />
                </div>
                {s.posts > 0 && progress.percent < 100 ? <Progress value={progress.percent} className="mt-1.5 h-1" /> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  </aside>
);

/* --------------------------------------------------------------------------------- detail --------------- */

const Stat = ({ label, value, sub, tone }) => (
  <div className="rounded-lg border bg-card px-3 py-2">
    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className={cn('mt-0.5 text-lg font-bold tabular-nums leading-tight', tone)}>{value}</p>
    {sub ? <p className="truncate text-[10px] text-muted-foreground">{sub}</p> : null}
  </div>
);

const AccountChip = ({ a }) => {
  const working = a.fetch_status === 'pending' || a.fetch_status === 'running';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]',
        a.fetch_status === 'failed' ? 'border-rose-200 bg-rose-50 text-rose-700' : working ? 'border-sky-200 bg-sky-50 text-sky-800' : 'bg-muted/30'
      )}
      title={a.fetch_error || undefined}
    >
      {working ? <Loader2 className="h-3 w-3 animate-spin" /> : a.fetch_status === 'failed' ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3 text-emerald-600" />}
      <b>{platformLabel(a.platform)}</b> {a.handle}
      <span className="tabular-nums text-muted-foreground">· {formatCount(a.posts_fetched)} posts</span>
    </span>
  );
};

const ProfileDetail = ({ subject, onGenerate, onRefresh, onRetry, onEdit, onDelete, busyAction }) => {
  const progress = progressOf(subject);
  const analysis = analysisProgress(subject);
  const lock = reportLockReason(subject);
  const failedAccounts = subject.accounts.filter((a) => a.fetch_status === 'failed');
  const idle = progress.phase !== 'collecting';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-bold leading-tight">{subject.display_name}</h2>
            <PhaseChip subject={subject} />
          </div>
          {subject.notes ? <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">{subject.notes}</p> : null}
          <div className="mt-2 flex flex-wrap gap-1.5">{subject.accounts.map((a) => <AccountChip key={a.id} a={a} />)}</div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span title={lock || undefined} className="inline-block">
            {/* same look as the event page's View Report: purple, with a green tick once a report has been written */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="relative h-8 gap-1.5 border-purple-200 bg-purple-50/70 px-2.5 text-xs font-medium text-purple-700 shadow-2xs hover:bg-purple-100 hover:text-purple-800 dark:border-purple-800/70 dark:bg-purple-950/40 dark:text-purple-300 dark:hover:bg-purple-900/50"
              disabled={Boolean(lock)}
              onClick={onGenerate}
              title={subject.report ? 'Report already generated: click to view' : undefined}
            >
              {lock ? <Lock className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />}
              {subject.report ? 'View Report' : 'Generate Report'}
              {subject.report ? <CheckCircle2 className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-background text-emerald-600 dark:text-emerald-400" data-report-ready /> : null}
            </Button>
          </span>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={onRefresh} disabled={!idle || busyAction === 'refresh'} title="Fetch posts published since the last fetch">
            <RefreshCw className={cn('h-3.5 w-3.5', busyAction === 'refresh' && 'animate-spin')} /> Refresh posts
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700" onClick={onDelete} title="Delete profile" aria-label="Delete profile"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>

      {lock ? <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Lock className="h-3 w-3" /> {lock}</p> : null}
      {subject.report ? <div><AttentionDot report={subject.report} /></div> : null}

      {failedAccounts.length ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          <span className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{failedAccounts[0].fetch_error || 'Collection stopped.'}</span></span>
          <Button size="sm" variant="outline" className="h-7 gap-1 border-rose-300 text-xs" onClick={onRetry} disabled={busyAction === 'retry'}>
            <RefreshCw className="h-3 w-3" /> Retry
          </Button>
        </div>
      ) : null}

      {progress.phase === 'collecting' ? (
        <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Collecting every post from the platform{subject.accounts.length > 1 ? 's' : ''}… <b className="tabular-nums">{formatCount(subject.posts)}</b> saved so far. Analysis starts as soon as the profile is saved.
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Posts collected" value={formatCount(subject.posts)} sub={`${subject.accounts.length} account${subject.accounts.length === 1 ? '' : 's'}`} />
        <Stat label="Analysed" value={formatCount(subject.analysed)} sub={analysis.total ? `${analysis.percent}% processed` : '—'} />
        <Stat label="Waiting" value={formatCount(subject.waiting)} sub={subject.waiting ? 'being analysed one by one' : 'none'} tone={subject.waiting ? 'text-violet-600' : ''} />
        <Stat label="No text / failed" value={`${formatCount(subject.skipped)} / ${formatCount(subject.failed)}`} sub="skipped / could not analyse" tone={subject.failed ? 'text-rose-600' : ''} />
      </div>
      {analysis.total > 0 && analysis.percent < 100 ? (
        <div>
          <Progress value={analysis.percent} className="h-1.5" />
          <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">{formatCount(analysis.processed)} of {formatCount(analysis.total)} posts analysed (text, text read from images, tone, risk). Newest first.</p>
        </div>
      ) : null}
    </div>
  );
};

/* -------------------------------------------------------------------------------- workspace ------------- */

export default function ProfileReportWorkspace() {
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [platforms, setPlatforms] = useState([]);
  const [supported, setSupported] = useState(DEFAULT_SUPPORTED_PLATFORMS);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [busyAction, setBusyAction] = useState(null);
  const reqRef = useRef(0);

  const load = useCallback(async ({ quiet = false } = {}) => {
    const run = ++reqRef.current;
    if (!quiet) setLoading(true);
    try {
      const res = await profileReportApi.list(query.trim() ? { search: query.trim() } : undefined);
      if (run !== reqRef.current) return;
      setSubjects(Array.isArray(res.data?.subjects) ? res.data.subjects : []);
      if (Array.isArray(res.data?.supported_platforms)) setSupported(res.data.supported_platforms);
    } catch (err) {
      if (!quiet) toast.error(errText(err, 'Could not load profiles'));
    } finally {
      if (run === reqRef.current && !quiet) setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const t = setTimeout(() => load(), query ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  useEffect(() => {
    socialProfilesApi.listPlatforms()
      .then((res) => setPlatforms(Array.isArray(res.data) ? res.data : []))
      .catch(() => toast.error('Could not load the platforms'));
  }, []);

  const collectable = useMemo(() => platforms.filter((p) => supported.includes(normalise(p.slug))), [platforms, supported]);

  // Collection and analysis run in the background: keep the numbers moving while there is work.
  const working = useMemo(() => subjects.some((s) => s.collecting > 0 || s.waiting > 0), [subjects]);
  useEffect(() => {
    if (!working) return undefined;
    const id = setInterval(() => { if (document.visibilityState === 'visible') load({ quiet: true }); }, POLL_MS);
    return () => clearInterval(id);
  }, [working, load]);

  // Keep a valid selection: the first profile when nothing (or something removed) is selected.
  useEffect(() => {
    if (selectedId && subjects.some((s) => s.id === selectedId)) return;
    setSelectedId(subjects[0]?.id ?? null);
  }, [subjects, selectedId]);

  const selected = subjects.find((s) => s.id === selectedId) || null;

  const act = async (name, fn, okMessage) => {
    setBusyAction(name);
    try {
      await fn();
      if (okMessage) toast.success(okMessage);
      await load({ quiet: true });
    } catch (err) {
      toast.error(errText(err, 'That did not work. Try again in a moment.'));
    } finally {
      setBusyAction(null);
    }
  };

  const openEdit = async () => {
    try {
      const res = await profileReportApi.get(selected.id);
      setEditing(res.data);
    } catch (err) {
      toast.error(errText(err, 'Could not open the profile'));
    }
  };

  const confirmDelete = async () => {
    const target = deleting;
    setDeleting(null);
    await act('delete', () => profileReportApi.remove(target.id), 'Profile deleted');
  };

  const onSaved = (saved) => {
    setAddOpen(false);
    setEditing(null);
    if (saved?.id) setSelectedId(saved.id);
    load({ quiet: true });
  };

  return (
    <div className="flex h-full min-h-[calc(100dvh-4rem)] flex-col bg-background lg:flex-row">
      <ProfileList
        subjects={subjects}
        selectedId={selectedId}
        onSelect={setSelectedId}
        loading={loading}
        query={query}
        onQuery={setQuery}
        onAdd={() => setAddOpen(true)}
        canAdd={collectable.length > 0}
      />

      <main className="min-w-0 flex-1 overflow-y-auto p-4 lg:p-5">
        {selected ? (
          <div className="space-y-5">
            <ProfileDetail
              subject={selected}
              busyAction={busyAction}
              onGenerate={() => setReportOpen(true)}
              onRefresh={() => act('refresh', () => profileReportApi.refresh(selected.id), 'Looking for newer posts')}
              onRetry={() => act('retry', () => profileReportApi.retry(selected.id), 'Continuing')}
              onEdit={openEdit}
              onDelete={() => setDeleting(selected)}
            />
            <PostsPanel subject={selected} busy={selected.collecting > 0 || selected.waiting > 0} />
          </div>
        ) : (
          <div className="mx-auto flex max-w-md flex-col items-center py-24 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50"><UserSearch className="h-7 w-7 text-indigo-600" /></div>
            <h2 className="text-base font-bold">{loading ? 'Loading…' : 'Study a profile in full'}</h2>
            {!loading ? (
              <>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Add a person or page with their accounts. Every post is collected once and saved in your workspace, the text in images is read,
                  tone and risk are analysed post by post, and an AI behaviour report is written from all of it.
                </p>
                <Button size="sm" className="mt-4 h-8 gap-1.5 text-xs" onClick={() => setAddOpen(true)} disabled={collectable.length === 0}>
                  <Plus className="h-3.5 w-3.5" /> Add profile
                </Button>
              </>
            ) : null}
          </div>
        )}
      </main>

      <AddProfileDialog
        open={addOpen || Boolean(editing)}
        onOpenChange={(next) => { if (!next) { setAddOpen(false); setEditing(null); } }}
        platforms={collectable}
        subject={editing}
        onSaved={onSaved}
      />

      <ProfileReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        profile={selected}
        onReportChange={(id, flag) => setSubjects((prev) => prev.map((s) => (s.id === id ? { ...s, report: flag } : s)))}
      />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(next) => { if (!next) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this profile?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? `${deleting.display_name} and its ${formatCount(deleting.posts)} collected posts, their analysis and the saved report are removed from your workspace.` : ''}
              {' '}This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
