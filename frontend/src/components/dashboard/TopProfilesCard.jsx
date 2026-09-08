import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Users } from 'lucide-react';
import { PlatformBrandIcon } from '../PlatformBrandIcon';
import { cn } from '../../lib/utils';

const formatScore = (n) => {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(Math.round(v));
};

const TopProfilesCard = ({ items = [], className }) => (
  <section className={cn('flex h-full min-h-0 flex-col bg-card', className)}>
    <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <Users className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold leading-tight">Top profiles</h2>
          <p className="text-[10px] text-muted-foreground">Engagement in range</p>
        </div>
      </div>
      <Link
        to="/social-profiles"
        className="inline-flex items-center gap-0.5 text-[11px] font-medium text-primary hover:underline"
      >
        All <ArrowRight className="h-3 w-3" />
      </Link>
    </header>

    {items.length === 0 ? (
      <div className="flex flex-1 items-center justify-center px-3 text-sm text-muted-foreground">
        No profile activity in range.
      </div>
    ) : (
      <ol className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
        {items.map((row, idx) => (
          <li key={row.account_id || idx} className="flex items-center gap-2.5 px-3 py-2">
            <span className="w-4 shrink-0 text-xs font-bold tabular-nums text-muted-foreground">
              {idx + 1}
            </span>
            <PlatformBrandIcon platform={row.platform} className="h-3.5 w-3.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{row.display_name || row.handle}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                @{row.handle} · {row.posts} posts
              </p>
            </div>
            <span className="shrink-0 text-xs font-semibold tabular-nums">
              {formatScore(row.score)}
            </span>
          </li>
        ))}
      </ol>
    )}
  </section>
);

export default TopProfilesCard;
