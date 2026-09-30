import React from 'react';
import { Zap } from 'lucide-react';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../ui/table';
import { PlatformBrandIcon } from '../PlatformBrandIcon';
import { cn } from '../../lib/utils';

/**
 * Viral Alerts: how many engagements (likes, shares, comments) a post needs inside the time window
 * before a viral alert fires, per platform. One row per active platform.
 */

const toInt = (raw) => {
  const digits = String(raw).replace(/[^0-9]/g, '');
  return digits === '' ? 0 : parseInt(digits, 10);
};

const slugFor = (t) => {
  const s = String(t.platform || '').toLowerCase();
  return s === 'twitter' ? 'x' : s;
};

export default function ViralAlertsCard({ enabled, onToggle, thresholds, getName, onPatch }) {
  const rowInvalid = (t) => !((t.low_threshold ?? 0) < (t.medium_threshold ?? 0) && (t.medium_threshold ?? 0) < (t.high_threshold ?? 0));
  const anyInvalid = thresholds.some(rowInvalid);

  return (
    <section className="h-full w-full overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border bg-muted/20">
        <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
          <Zap className="h-4 w-4 text-amber-600" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold leading-none">Viral alerts</h2>
          <p className="text-[11px] text-muted-foreground mt-1">
            A post is flagged as viral when its engagement reaches a level below within the time window.
          </p>
        </div>
        <label className="flex items-center gap-2 shrink-0 cursor-pointer">
          <span className={cn('text-[11px] font-medium', enabled ? 'text-foreground' : 'text-muted-foreground')}>
            {enabled ? 'On' : 'Off'}
          </span>
          <Switch checked={enabled} onCheckedChange={onToggle} aria-label="Turn viral alerts on or off" />
        </label>
      </div>

      {thresholds.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <p className="text-sm font-semibold">No platforms yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Connect BluGate under the Platforms tab, and each platform appears here.</p>
        </div>
      ) : (
        <div className={cn('overflow-x-auto', !enabled && 'pointer-events-none opacity-50')}>
          <Table className="min-w-[560px]">
            <TableHeader>
              <TableRow className="text-[11px]">
                <TableHead className="h-9 pl-4">Platform</TableHead>
                <TableHead className="h-9 text-center text-emerald-600">Low</TableHead>
                <TableHead className="h-9 text-center text-amber-600">Medium</TableHead>
                <TableHead className="h-9 text-center text-red-600">High</TableHead>
                <TableHead className="h-9 pr-4 text-center">Window (hours)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {thresholds.map((t) => {
                const bad = rowInvalid(t);
                return (
                  <TableRow key={t.platform} className="text-xs">
                    <TableCell className="py-1.5 pl-4">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background">
                          <PlatformBrandIcon platform={slugFor(t)} className="h-3.5 w-3.5" />
                        </span>
                        <span className="text-sm font-medium">{getName(t)}</span>
                      </div>
                    </TableCell>
                    {['low_threshold', 'medium_threshold', 'high_threshold'].map((field) => (
                      <TableCell key={field} className="py-1.5 px-1.5 text-center">
                        <Input
                          type="text"
                          inputMode="numeric"
                          aria-label={`${getName(t)} ${field.replace('_threshold', '')} level`}
                          value={t[field] ?? 0}
                          onChange={(e) => onPatch(t.platform, field, toInt(e.target.value))}
                          className={cn('mx-auto h-8 w-full max-w-[5.5rem] text-center text-xs tabular-nums', bad && 'border-red-500')}
                        />
                      </TableCell>
                    ))}
                    <TableCell className="py-1.5 pr-4 text-center">
                      <Input
                        type="text"
                        inputMode="numeric"
                        aria-label={`${getName(t)} window in hours`}
                        value={Math.round((t.time_window_minutes ?? 0) / 60)}
                        onChange={(e) => onPatch(t.platform, 'time_window_minutes', toInt(e.target.value) * 60)}
                        className="mx-auto h-8 w-full max-w-[5rem] text-center text-xs tabular-nums"
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {anyInvalid && enabled && thresholds.length > 0 && (
        <p className="border-t border-border px-4 py-2.5 text-[11px] font-medium text-red-600" role="alert">
          In each row, Low must be smaller than Medium, and Medium smaller than High.
        </p>
      )}
    </section>
  );
}

export const viralAlertsValid = (thresholds) =>
  thresholds.every((t) => (t.low_threshold ?? 0) < (t.medium_threshold ?? 0) && (t.medium_threshold ?? 0) < (t.high_threshold ?? 0));
