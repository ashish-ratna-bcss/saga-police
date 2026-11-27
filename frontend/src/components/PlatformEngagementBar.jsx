import React from 'react';
import {
  Bookmark,
  Eye,
  Heart,
  MessageCircle,
  MessageSquare,
  Play,
  Quote,
  Repeat,
  Share2,
  ThumbsUp,
} from 'lucide-react';

const formatMetric = (num) => {
  const n = Number(num);
  if (!Number.isFinite(n)) return '';
  if (n === 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

const isPresentMetric = (value) =>
  value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value));

/**
 * Platform-aware engagement metrics (same rules as Alert cards).
 * Only includes fields that exist on engagement (real API data).
 * Legacy Facebook shares stored as retweets are labeled Shares.
 */
export const buildPlatformEngagementItems = (platform, engagement = {}) => {
  const e = engagement && typeof engagement === 'object' ? engagement : {};
  const p = String(platform || '').trim().toLowerCase();
  const normalized = p === 'twitter' ? 'x' : p;

  const items = [];
  const push = (key, label, value, Icon, hoverClass) => {
    if (!isPresentMetric(value)) return;
    items.push({ key, label, value: Number(value), Icon, hoverClass });
  };

  if (normalized === 'youtube') {
    push('views', 'Views', e.views ?? e.view_count, Eye, 'hover:text-foreground');
    push('likes', 'Likes', e.likes ?? e.like_count, ThumbsUp, 'hover:text-blue-500');
    push('comments', 'Comments', e.comments ?? e.comment_count, MessageSquare, 'hover:text-blue-500');
    return items;
  }

  if (normalized === 'facebook') {
    const shares = isPresentMetric(e.shares) ? e.shares : e.retweets;
    push('views', 'Views', e.views ?? e.view_count, Eye, 'hover:text-foreground');
    push('likes', 'Likes', e.likes ?? e.reactions ?? e.like_count, ThumbsUp, 'hover:text-blue-500');
    push('comments', 'Comments', e.comments ?? e.comment_count, MessageCircle, 'hover:text-blue-500');
    push('shares', 'Shares', shares, Share2, 'hover:text-emerald-500');
    return items;
  }

  if (normalized === 'instagram') {
    push('views', 'Plays', e.views ?? e.play_count ?? e.view_count, Play, 'hover:text-foreground');
    push('likes', 'Likes', e.likes ?? e.like_count, Heart, 'hover:text-pink-600');
    push('comments', 'Comments', e.comments ?? e.comment_count, MessageCircle, 'hover:text-blue-500');
    push('shares', 'Shares', e.shares, Share2, 'hover:text-emerald-500');
    push('saves', 'Saves', e.saves, Bookmark, 'hover:text-amber-500');
    return items;
  }

  push('views', 'Views', e.views ?? e.view_count ?? e.impression_count, Eye, 'hover:text-foreground');
  push('likes', 'Likes', e.likes ?? e.like_count ?? e.favorites, Heart, 'hover:text-pink-600');
  push('replies', 'Replies', e.replies ?? e.comments ?? e.reply_count, MessageCircle, 'hover:text-blue-500');
  push('retweets', 'Reposts', e.retweets ?? e.reposts ?? e.shares, Repeat, 'hover:text-emerald-500');
  push('quotes', 'Quotes', e.quotes, Quote, 'hover:text-blue-500');
  return items;
};

export const PlatformEngagementBar = ({ platform, engagement, className = '' }) => {
  const items = buildPlatformEngagementItems(platform, engagement);
  if (items.length === 0) return null;

  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 py-1.5 px-1 ${className}`}>
      {items.map(({ key, label, value, Icon, hoverClass }) => (
        <div
          key={key}
          className={`flex items-center gap-1 text-muted-foreground ${hoverClass || ''}`.trim()}
          title={label}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="text-[11px] font-medium tabular-nums text-foreground">
            {formatMetric(value)}
          </span>
          <span className="text-[10px] text-muted-foreground">{label}</span>
        </div>
      ))}
    </div>
  );
};

export default PlatformEngagementBar;
