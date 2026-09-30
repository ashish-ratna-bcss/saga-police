import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import {
  Search, Loader2, Phone, Mail, User, Radar, Trash2, CheckCircle, XCircle, Database,
  Network, ShieldAlert, Fingerprint, MapPin, Smartphone, Clock, Zap
} from 'lucide-react';
import { osintApi } from '../../../api';
import { toast } from 'sonner';

const HISTORY_KEY = 'osint_runs_v2';
const MAX_RUNS = 30;

const errMsg = (err, fallback) =>
  err.response?.data?.detail || err.response?.data?.error?.message || fallback;
const loadHistory = () => {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
};

/* ---------- target detection ---------- */

const MODES = [
  { value: 'phone', label: 'Phone lookup', icon: Phone, group: 'lookup', placeholder: 'Enter phone number with country code' },
  { value: 'email', label: 'Email lookup', icon: Mail, group: 'lookup', placeholder: 'Enter email address' },
  { value: 'username', label: 'Username lookup', icon: User, group: 'lookup', placeholder: 'Enter username' },
  { value: 'general', label: 'Investigation · General', icon: Radar, group: 'investigation' },
  { value: 'deep', label: 'Investigation · Deep', icon: Radar, group: 'investigation' },
];
const modeOf = (v) => MODES.find((m) => m.value === v) || MODES[MODES.length - 2];

const timeAgo = (ts) => {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const STATUS = {
  completed: { dot: 'bg-emerald-500', cls: 'text-emerald-600 border-emerald-500/30 bg-emerald-500/10' },
  failed: { dot: 'bg-red-500', cls: 'text-red-600 border-red-500/30 bg-red-500/10' },
  running: { dot: 'bg-amber-500 animate-pulse', cls: 'text-amber-600 border-amber-500/30 bg-amber-500/10' },
};
const statusKey = (s) => (STATUS[s] ? s : 'running');
const isRunning = (r) => r.group === 'investigation' && !['completed', 'failed'].includes(r.status);

const StatusBadge = ({ status }) => {
  const k = statusKey(status);
  return (
    <Badge variant="outline" className={`text-[10px] px-2 py-0.5 gap-1.5 font-semibold capitalize ${STATUS[k].cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS[k].dot}`} />
      {status || 'running'}
    </Badge>
  );
};

const Chip = ({ dot, label, value }) => (
  <span className="inline-flex items-baseline gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground">
    {dot && <span className={`h-1.5 w-1.5 rounded-full self-center ${dot}`} />}
    <span className="tabular-nums font-semibold text-foreground">{value}</span> {label}
  </span>
);

const Label = ({ children, count }) => (
  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
    {children}{count != null && <span className="rounded bg-muted px-1 tabular-nums">{count}</span>}
  </div>
);

/* ---------- relationship graph ---------- */

const nodeName = (x) => (typeof x === 'string' ? x : x?.name || x?.id || '');

const Graph = ({ center, entities = [], relationships = [] }) => {
  const { nodes, edges } = useMemo(() => {
    const names = new Set();
    entities.forEach((e) => nodeName(e) && names.add(nodeName(e)));
    relationships.forEach((r) => { if (r.source) names.add(String(r.source)); if (r.target) names.add(String(r.target)); });
    names.delete(center);
    const list = [...names].slice(0, 16);
    const es = relationships
      .filter((r) => r.source && r.target)
      .map((r) => [String(r.source), String(r.target), r.type])
      .filter(([a, b]) => (a === center || list.includes(a)) && (b === center || list.includes(b)));
    const linked = new Set(es.flatMap(([a, b]) => [a, b]));
    list.forEach((n) => { if (!linked.has(n)) es.push([center, n, null]); });
    return { nodes: list, edges: es };
  }, [center, entities, relationships]);

  const W = 560, H = 300, cx = W / 2, cy = H / 2, R = 108;
  const pos = { [center]: [cx, cy] };
  nodes.forEach((n, i) => {
    const a = (i / Math.max(nodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
    pos[n] = [cx + R * 1.55 * Math.cos(a), cy + R * Math.sin(a)];
  });
  const clip = (s) => (s.length > 18 ? `${s.slice(0, 17)}…` : s);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Relationship graph">
      {edges.map(([a, b, t], i) => pos[a] && pos[b] && (
        <g key={i}>
          <line x1={pos[a][0]} y1={pos[a][1]} x2={pos[b][0]} y2={pos[b][1]} className="stroke-border" strokeWidth="1.5" />
          {t && <text x={(pos[a][0] + pos[b][0]) / 2} y={(pos[a][1] + pos[b][1]) / 2 - 3} textAnchor="middle" className="fill-muted-foreground" fontSize="9">{t}</text>}
        </g>
      ))}
      {nodes.map((n) => (
        <g key={n}>
          <circle cx={pos[n][0]} cy={pos[n][1]} r="8" className="fill-primary/20 stroke-primary" strokeWidth="1.5" />
          <text x={pos[n][0]} y={pos[n][1] + 21} textAnchor="middle" className="fill-foreground" fontSize="10">{clip(n)}</text>
        </g>
      ))}
      <circle cx={cx} cy={cy} r="15" className="fill-primary stroke-primary" />
      <text x={cx} y={cy + 30} textAnchor="middle" className="fill-foreground" fontSize="11" fontWeight="600">{clip(center)}</text>
    </svg>
  );
};

/* ---------- report ---------- */

const PHONE_FIELDS = [['carrier', 'Carrier', Phone], ['location', 'Location', MapPin], ['line_type', 'Line type', Smartphone], ['timezones', 'Timezone', Clock]];

const fieldTiles = (meta, phone) => {
  if (!meta || typeof meta !== 'object') return [];
  if (phone) {
    return PHONE_FIELDS.filter(([k]) => meta[k] && (!Array.isArray(meta[k]) || meta[k].length)).map(([k, label, icon]) => {
      let v = Array.isArray(meta[k]) ? meta[k].join(', ') : meta[k];
      if (k === 'location' && meta.region_code) v = `${v} (${meta.region_code})`;
      return { key: k, label, icon, value: String(v) };
    });
  }
  return Object.entries(meta)
    .filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v))
    .map(([k, v]) => ({ key: k, label: k.replace(/_/g, ' '), icon: Fingerprint, value: typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v) }));
};

const Tile = ({ icon: Icon, label, value }) => (
  <div className="flex items-center gap-2.5 rounded-lg border border-border bg-background p-2.5">
    <span className="h-8 w-8 shrink-0 rounded-md bg-primary/10 text-primary flex items-center justify-center"><Icon className="h-4 w-4" /></span>
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-xs font-semibold break-words">{value}</p>
    </div>
  </div>
);

const Empty = ({ children }) => <p className="text-xs text-muted-foreground py-8 text-center">{children}</p>;

const Report = ({ run }) => {
  const [tab, setTab] = useState('overview');
  useEffect(() => setTab('overview'), [run.id]);
  const d = run.result;
  const isInv = run.group === 'investigation';
  const tabs = isInv
    ? [['overview', 'Overview'], ['entities', 'Entities'], ['relationships', 'Relationships'], ['evidence', 'Evidence'], ['raw', 'Raw']]
    : [['overview', 'Overview'], ['sources', 'Sources'], ['raw', 'Raw']];
  const valid = d?.evidence?.[0]?.raw_metadata?.is_valid;
  const title = d?.normalized_identifier || run.target;

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="px-4 pt-3 pb-0 border-b border-border">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-heading font-bold tracking-tight truncate max-w-full">{title}</h2>
          {valid === true && <CheckCircle className="h-4 w-4 text-emerald-500" />}
          {valid === false && <XCircle className="h-4 w-4 text-red-500" />}
          <StatusBadge status={run.status} />
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {modeOf(run.kind).label} · ID {run.id}
          {isInv && d && ` · ${d.entities?.length || 0} entities · ${d.relationships?.length || 0} relations`}
        </p>
        <div className="flex gap-0.5 mt-2 -mb-px overflow-x-auto no-scrollbar">
          {tabs.map(([v, l]) => (
            <button key={v} onClick={() => setTab(v)}
              className={`px-3 py-2 text-xs whitespace-nowrap border-b-2 transition-colors ${tab === v ? 'border-primary text-foreground font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isInv && isRunning(run) && (
          <div className="rounded-lg border border-border bg-background p-3">
            <div className="flex justify-between text-[11px] mb-1.5">
              <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Gathering intelligence. This refreshes every 5 seconds.</span>
              <span className="tabular-nums font-semibold">{run.progress || 0}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary transition-all duration-700" style={{ width: `${Math.max(run.progress || 0, 4)}%` }} />
            </div>
          </div>
        )}
        {run.status === 'failed' && <p className="text-xs text-red-600">This investigation failed.</p>}

        {tab === 'overview' && isInv && d && (
          <>
            {d.summary && <p className="text-xs rounded-lg bg-primary/5 border border-primary/20 p-3">{d.summary}</p>}
            <div className="grid grid-cols-3 gap-2">
              {[['Entities', d.entities?.length || 0, Database], ['Relations', d.relationships?.length || 0, Network], ['Evidence', d.evidence?.length || 0, ShieldAlert]].map(([l, n, I]) => (
                <Tile key={l} icon={I} label={l} value={n} />
              ))}
            </div>
            <div className="rounded-lg border border-border bg-background p-2">
              <Label>Relationship graph</Label>
              <Graph center={run.target} entities={d.entities} relationships={d.relationships} />
            </div>
          </>
        )}
        {tab === 'overview' && isInv && !d && !isRunning(run) && run.status !== 'failed' && <Empty>Loading findings…</Empty>}

        {tab === 'overview' && !isInv && d && (
          <>
            {d.summary && <p className="text-xs rounded-lg bg-primary/5 border border-primary/20 p-3">{d.summary}</p>}
            {(() => {
              const tiles = (d.evidence || []).flatMap((ev) => fieldTiles(ev.raw_metadata, run.kind === 'phone' && ev.source_name === 'phonenumbers'));
              return tiles.length
                ? <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">{tiles.map((t, i) => <Tile key={`${t.key}${i}`} {...t} />)}</div>
                : <Empty>No structured fields returned.</Empty>;
            })()}
          </>
        )}

        {tab === 'entities' && (d?.entities?.length
          ? <div className="flex flex-wrap gap-1.5">{d.entities.map((e, i) => <span key={i} className="rounded-md border border-border bg-muted/40 px-2 py-1 text-xs">{nodeName(e) || JSON.stringify(e)}</span>)}</div>
          : <Empty>No entities found.</Empty>)}

        {tab === 'relationships' && (d?.relationships?.length
          ? <div className="rounded-lg border border-border overflow-hidden"><table className="w-full text-xs"><tbody>
            {d.relationships.map((r, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-medium">{r.source}</td><td className="text-muted-foreground">→</td>
                <td className="px-3 py-2 font-medium">{r.target}</td><td className="px-3 py-2 text-right text-muted-foreground">{r.type}</td>
              </tr>))}
          </tbody></table></div>
          : <Empty>No relationships found.</Empty>)}

        {tab === 'evidence' && (d?.evidence?.length
          ? <ul className="space-y-1.5">{d.evidence.map((ev, i) => <li key={i} className="rounded-lg border border-border px-3 py-2 text-xs">{ev.description || JSON.stringify(ev)}</li>)}</ul>
          : <Empty>No evidence recorded.</Empty>)}

        {tab === 'sources' && (d?.evidence?.length
          ? <div className="rounded-lg border border-border overflow-hidden"><table className="w-full text-xs"><tbody>
            {d.evidence.map((ev, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-medium capitalize">{ev.source_name || 'Analysis engine'}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">{fieldTiles(ev.raw_metadata).length} fields</td>
              </tr>))}
          </tbody></table></div>
          : <Empty>No sources returned.</Empty>)}

        {tab === 'raw' && (
          <pre className="rounded-lg bg-gray-950 p-3 overflow-x-auto text-gray-300 font-mono text-[11px] leading-relaxed">{JSON.stringify(d || run, null, 2)}</pre>
        )}
      </div>
    </div>
  );
};

/* ---------- page ---------- */

const OsintWorkspace = () => {
  const [runs, setRuns] = useState(loadHistory);
  const [selectedId, setSelectedId] = useState(() => loadHistory()[0]?.id || null);
  const [mode, setMode] = useState('general');
  const [target, setTarget] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const runsRef = useRef(runs);
  runsRef.current = runs;

  useEffect(() => {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(runs.slice(0, MAX_RUNS))); } catch { /* ignore */ }
  }, [runs]);

  const patch = useCallback((id, p) => setRuns((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r))), []);

  const hasRunning = runs.some(isRunning);
  useEffect(() => {
    if (!hasRunning) return undefined;
    const t = setInterval(async () => {
      for (const r of runsRef.current) {
        if (!isRunning(r)) continue;
        try {
          const s = await osintApi.getInvestigationStatus(r.id);
          patch(r.id, { status: s.status, progress: s.progress || 0 });
          if (s.status === 'completed') {
            toast.success(`Investigation completed: ${r.target}`);
            patch(r.id, { result: await osintApi.getInvestigation(r.id) });
          } else if (s.status === 'failed') toast.error(`Investigation failed: ${r.target}`);
        } catch (e) { console.error(e); }
      }
    }, 5000);
    return () => clearInterval(t);
  }, [hasRunning, patch]);

  const resolved = mode;
  const resolvedMode = modeOf(resolved);
  const selected = runs.find((r) => r.id === selectedId) || null;
  const counts = {
    total: runs.length, running: runs.filter(isRunning).length,
    done: runs.filter((r) => r.status === 'completed').length, failed: runs.filter((r) => r.status === 'failed').length,
  };

  const submit = async (e) => {
    e?.preventDefault();
    const value = target.trim().replace(/^@(?=.)/, (m) => (resolved === 'username' ? '' : m));
    if (!value) return toast.error('Enter a target first');
    setSubmitting(true);
    try {
      let run;
      if (resolvedMode.group === 'investigation') {
        const res = await osintApi.createInvestigation({ target: value, investigation_type: resolved });
        run = { id: String(res.investigation_id || res.id), status: 'running', progress: 0, result: null };
      } else {
        const fn = { phone: osintApi.lookupPhone, email: osintApi.lookupEmail, username: osintApi.lookupUsername }[resolved];
        const res = await fn(value);
        run = { id: `lk-${Date.now()}`, status: res.status || 'completed', result: res };
      }
      const full = { ...run, kind: resolved, group: resolvedMode.group, target: value, ts: Date.now() };
      setRuns((rs) => [full, ...rs].slice(0, MAX_RUNS));
      setSelectedId(full.id);
      setTarget('');
      toast.success(full.group === 'investigation' ? 'Investigation started' : 'Lookup complete');
    } catch (err) {
      toast.error(errMsg(err, resolvedMode.group === 'investigation' ? 'Failed to start investigation' : 'Lookup failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const remove = (id) => {
    setRuns((rs) => rs.filter((r) => r.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  return (
    <div className="p-4 space-y-3 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-xl font-heading font-bold tracking-tight leading-none">OSINT</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">Look up an identifier or investigate a subject across open sources</p>
        </div>
        <div className="ml-auto flex items-center gap-1 flex-wrap">
          <Chip label="total" value={counts.total} />
          <Chip dot="bg-amber-500 animate-pulse" label="running" value={counts.running} />
          <Chip dot="bg-emerald-500" label="done" value={counts.done} />
          <Chip dot="bg-red-500" label="failed" value={counts.failed} />
        </div>
      </div>

      <form onSubmit={submit} className="rounded-xl border border-border bg-card p-2.5">
        <div className="flex flex-col md:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={target} onChange={(e) => setTarget(e.target.value)}
              placeholder={resolvedMode.placeholder || 'Subject, domain or identifier to investigate'}
              className="h-10 pl-9 text-sm" />
          </div>
          <Select value={mode} onValueChange={setMode}>
            <SelectTrigger className="h-10 md:w-56 text-xs" aria-label="Mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODES.map((m) => (
                <SelectItem key={m.value} value={m.value} className="text-xs">
                  <span className="flex items-center gap-2">
                    <m.icon className="h-3.5 w-3.5 text-muted-foreground" />
                    {m.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" disabled={submitting} className="h-10 px-5 gap-1.5 text-sm">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {resolvedMode.group === 'lookup' ? 'Run lookup' : 'Investigate'}
          </Button>
        </div>
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-3 items-start">
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-3 py-2 border-b border-border bg-muted/10"><Label count={runs.length}>Recent runs</Label></div>
          <div className="max-h-[calc(100dvh-22rem)] min-h-[120px] overflow-y-auto">
            {runs.length === 0 && <p className="p-6 text-xs text-muted-foreground text-center">Nothing yet. Enter a target above.</p>}
            {runs.map((r) => {
              const M = modeOf(r.kind);
              const Icon = M.icon || Radar;
              const pct = r.status === 'completed' ? 100 : r.progress || 0;
              return (
                <div key={r.id} onClick={() => setSelectedId(r.id)}
                  className={`group px-3 py-2 cursor-pointer border-b border-border last:border-0 ${selectedId === r.id ? 'bg-primary/10' : 'hover:bg-accent/50'}`}>
                  <div className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <p className="text-xs font-medium truncate flex-1">{r.target}</p>
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${STATUS[statusKey(r.status)].dot}`} />
                    <button onClick={(e) => { e.stopPropagation(); remove(r.id); }} aria-label="Delete run"
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 pl-5">{M.label} · {timeAgo(r.ts)}</p>
                  {isRunning(r) && <div className="h-1 rounded-full bg-muted overflow-hidden mt-1.5 ml-5"><div className="h-full bg-primary" style={{ width: `${Math.max(pct, 4)}%` }} /></div>}
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden min-h-[420px] lg:h-[calc(100dvh-16rem)]">
          {selected ? <Report run={selected} /> : (
            <div className="h-full flex flex-col items-center justify-center text-center gap-2 p-8">
              <Radar className="h-7 w-7 text-primary/60" />
              <p className="text-sm font-semibold">Your report appears here</p>
              <p className="text-xs text-muted-foreground max-w-sm">
                Choose a lookup type for an instant result, or start an investigation to build entities, relationships and evidence.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OsintWorkspace;
