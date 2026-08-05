import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Card } from '../ui/card';
import { Download, RefreshCw, Activity, Users } from 'lucide-react';
import { AlertService } from '@/features/alerts/api/alertService';

const STATUSES = [
  { key: 'acknowledged', label: 'Acknowledged', color: '#8b5cf6' },
  { key: 'escalated', label: 'Escalated', color: '#ef4444' },
  { key: 'resolved', label: 'Resolved', color: '#10b981' },
  { key: 'false_positive', label: 'False Positive', color: '#6b7280' }
];

// Today in IST as YYYY-MM-DD — used for the default range and the max
// selectable date on the pickers. We deliberately use IST because the
// aggregation buckets by IST on the server.
const istToday = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

const WorkflowKpiCard = () => {
  const todayStr = istToday();
  const [start, setStart] = useState(todayStr);
  const [end, setEnd] = useState(todayStr);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await AlertService.getWorkflowKpi({ start, end });
      // eslint-disable-next-line no-console
      console.log('[WorkflowKpiCard] response', res.status, res.data);
      setData(res.data);
    } catch (err) {
      const msg = err?.response?.status
        ? `HTTP ${err.response.status} ${err.response.data?.message || err.response.statusText || ''}`
        : (err.message || 'Failed to load');
      // eslint-disable-next-line no-console
      console.error('[WorkflowKpiCard] error', err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [start, end]);

  // Poll every 15s so an Ack/Escalate on the Alerts page is reflected on the
  // dashboard within seconds. Pauses while the tab is hidden, and re-fetches
  // immediately on visibility-regain.
  useEffect(() => {
    fetchData();
    let timer = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (document.visibilityState === 'visible') fetchData();
      }, 15000);
    };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const onVis = () => {
      if (document.visibilityState === 'visible') { fetchData(); start(); }
      else stop();
    };
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', fetchData);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', fetchData);
    };
  }, [fetchData]);

  const maxDailyTotal = useMemo(() => {
    if (!data?.daily?.length) return 1;
    return Math.max(1, ...data.daily.map((d) => d.total));
  }, [data]);

  const downloadCsv = async () => {
    try {
      const res = await AlertService.getWorkflowKpi(
        { start, end, format: 'csv' },
        { responseType: 'blob' }
      );
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `alert-workflow-${start}_to_${end}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Export failed');
    }
  };

  return (
    <Card className="relative overflow-hidden border border-indigo-200/50 dark:border-indigo-500/20 shadow-sm hover:shadow-lg hover:shadow-indigo-500/5 transition-all duration-300">
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">
              <Activity className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Alert Workflow KPI</h3>
              <p className="text-[10px] text-muted-foreground">Daily triage throughput by status</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={fetchData}
              disabled={loading}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={downloadCsv}
              disabled={!data}
              className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 disabled:opacity-50"
              title="Export CSV"
            >
              <Download className="h-3 w-3" />
              CSV
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <label className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">From</label>
          <input
            type="date"
            value={start}
            max={end}
            onChange={(e) => setStart(e.target.value)}
            className="text-xs px-2 py-1 rounded border border-border bg-background"
          />
          <label className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">To</label>
          <input
            type="date"
            value={end}
            min={start}
            max={todayStr}
            onChange={(e) => setEnd(e.target.value)}
            className="text-xs px-2 py-1 rounded border border-border bg-background"
          />
        </div>

        {/* Totals row */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          {STATUSES.map((s) => (
            <div key={s.key} className="rounded-md p-2 border border-border/50 bg-muted/30">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</div>
              <div className="text-lg font-black" style={{ color: s.color }}>
                {data?.totals?.[s.key] ?? 0}
              </div>
            </div>
          ))}
        </div>

        {/* Daily breakdown table */}
        <div className="border-t border-border/50 pt-2 max-h-56 overflow-y-auto">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-background">
              <tr className="text-muted-foreground">
                <th className="text-left font-semibold py-1">Date</th>
                {STATUSES.map((s) => (
                  <th key={s.key} className="text-right font-semibold py-1" style={{ color: s.color }}>
                    {s.label.split(' ')[0]}
                  </th>
                ))}
                <th className="text-right font-semibold py-1">Total</th>
                <th className="w-20 pl-2"></th>
              </tr>
            </thead>
            <tbody>
              {data?.daily?.length ? data.daily.slice().reverse().map((row) => (
                <tr key={row.date} className="border-t border-border/30">
                  <td className="py-1 font-mono">{row.date}</td>
                  {STATUSES.map((s) => (
                    <td key={s.key} className="py-1 text-right tabular-nums">{row[s.key] || 0}</td>
                  ))}
                  <td className="py-1 text-right font-bold tabular-nums">{row.total}</td>
                  <td className="py-1 pl-2">
                    <div className="flex h-2 rounded overflow-hidden bg-muted">
                      {row.total > 0 && STATUSES.map((s) => (
                        row[s.key] > 0 ? (
                          <div
                            key={s.key}
                            style={{
                              width: `${(row[s.key] / maxDailyTotal) * 100}%`,
                              backgroundColor: s.color
                            }}
                            title={`${s.label}: ${row[s.key]}`}
                          />
                        ) : null
                      ))}
                    </div>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={STATUSES.length + 3} className="py-3 text-center text-muted-foreground">
                  {loading ? 'Loading…' : 'No transitions in this range.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Per-user breakdown */}
        <div className="border-t border-border/50 mt-3 pt-2">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Users className="h-3.5 w-3.5 text-indigo-500" />
            <h4 className="text-[11px] font-bold text-foreground uppercase tracking-wider">By User</h4>
            <span className="text-[10px] text-muted-foreground">
              {data?.byUser?.length ? `${data.byUser.length} user${data.byUser.length === 1 ? '' : 's'}` : ''}
            </span>
          </div>
          <div className="max-h-56 overflow-y-auto">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-background">
                <tr className="text-muted-foreground">
                  <th className="text-left font-semibold py-1">User</th>
                  {STATUSES.map((s) => (
                    <th key={s.key} className="text-right font-semibold py-1" style={{ color: s.color }}>
                      {s.label.split(' ')[0]}
                    </th>
                  ))}
                  <th className="text-right font-semibold py-1">Total</th>
                </tr>
              </thead>
              <tbody>
                {data?.byUser?.length ? data.byUser.map((u) => (
                  <tr key={u.user_id} className="border-t border-border/30">
                    <td className="py-1 pr-2">
                      <div className="font-semibold truncate max-w-[180px]" title={u.name || u.email || u.user_id}>
                        {u.name || u.email || u.user_id}
                      </div>
                      {u.name && u.email && (
                        <div className="text-[9px] text-muted-foreground truncate max-w-[180px]">{u.email}</div>
                      )}
                    </td>
                    {STATUSES.map((s) => (
                      <td key={s.key} className="py-1 text-right tabular-nums" style={{ color: u[s.key] > 0 ? s.color : undefined }}>
                        {u[s.key] || 0}
                      </td>
                    ))}
                    <td className="py-1 text-right font-bold tabular-nums">{u.total}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={STATUSES.length + 2} className="py-3 text-center text-muted-foreground">
                    {loading ? 'Loading…' : 'No user activity in this range.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {error && <div className="mt-2 text-[11px] text-red-500">{error}</div>}
      </div>
    </Card>
  );
};

export default WorkflowKpiCard;
