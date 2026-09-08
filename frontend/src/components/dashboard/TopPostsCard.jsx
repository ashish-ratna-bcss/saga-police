import React from 'react';
import { ExternalLink, Flame } from 'lucide-react';
import { PlatformBrandIcon } from '../PlatformBrandIcon';
import { cn } from '../../lib/utils';

const formatScore = (n) => {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(Math.round(v));
};

const TopPostsCard = ({ items = [], className }) => (
  <section className={cn('flex h-full min-h-0 flex-col bg-card', className)}>
    <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
      <Flame className="h-3.5 w-3.5 shrink-0 text-orange-500" />
      <div className="min-w-0">
        <h2 className="text-sm font-semibold leading-tight">Top posts</h2>
        <p className="text-[10px] text-muted-foreground">Highest engagement</p>
      </div>
    </header>

    {items.length === 0 ? (
      <div className="flex flex-1 items-center justify-center px-3 text-sm text-muted-foreground">
        No posts scored for this filter.
      </div>
    ) : (
      <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
        {items.map((post) => (
          <li key={post.id} className="px-3 py-2">
            <div className="flex items-start gap-2">
              <PlatformBrandIcon platform={post.platform} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="min-w-0 truncate text-xs font-semibold">
                    {post.author_name || post.profile_name || post.author_handle || 'Unknown'}
                  </p>
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                    {formatScore(post.score)}
                  </span>
                  {post.url ? (
                    <a
                      href={post.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto shrink-0 text-muted-foreground hover:text-primary"
                      title="Open original"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                </div>
                <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted-foreground">
                  {post.text || '—'}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    )}
  </section>
);

export default TopPostsCard;
