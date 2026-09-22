import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  BarChart3, AlertTriangle, MessageSquare, CalendarDays, Contact2, Loader2, RefreshCw,
  Search, ExternalLink, Download, Shield, Activity, TrendingUp, TrendingDown,
  ArrowRight, ThumbsUp, Users, Flame, Eye, X, Filter, CheckCircle2, ChevronRight,
  Sparkles, Layers, Info
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
} from 'recharts';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { analyticsHubApi } from '../../api';
import KeywordAnalysisDialog from '../events/KeywordAnalysisDialog';
import { Card, CardContent } from '../../components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Progress } from '../../components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { cn } from '../../lib/utils';
import {
  AllPlatformsLogo,
  XBrandLogo,
  YoutubeBrandLogo,
  FacebookBrandLogo,
  InstagramBrandLogo,
  TelegramBrandLogo,
} from '../../components/PlatformBrandIcon';
import { usePagePlatforms } from '../../hooks/usePagePlatforms';

/* ── Platform Styling & Colors ── */
const getPlatformIcon = (slug) => {
  const s = String(slug || '').toLowerCase();
  if (s === 'x' || s === 'twitter') return XBrandLogo;
  if (s === 'facebook' || s === 'fb') return FacebookBrandLogo;
  if (s === 'youtube') return YoutubeBrandLogo;
  if (s === 'instagram') return InstagramBrandLogo;
  if (s === 'telegram') return TelegramBrandLogo;
  return Activity;
};

const getPlatformLabel = (slug) => {
  const s = String(slug || '').toLowerCase();
  if (!s || s === 'all') return 'All Platforms';
  if (s === 'x' || s === 'twitter') return 'X / Twitter';
  if (s === 'facebook') return 'Facebook';
  if (s === 'youtube') return 'YouTube';
  if (s === 'instagram') return 'Instagram';
  if (s === 'telegram') return 'Telegram';
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const RANGE_OPTIONS = [
  { value: 'all', label: 'All Time' },
  { value: '24h', label: 'Last 24 Hours' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: '90d', label: 'Last 90 Days' },
];

const REFRESH_OPTIONS = [
  { value: '0', label: 'Auto Refresh: Off' },
  { value: '30', label: 'Auto: 30s' },
  { value: '60', label: 'Auto: 1m' },
  { value: '300', label: 'Auto: 5m' },
];

const TABS = [
  { value: 'all', label: 'Executive Overview', icon: BarChart3 },
  { value: 'events', label: 'Events Intelligence', icon: CalendarDays },
  { value: 'alerts', label: 'Threat Alerts & Risk', icon: AlertTriangle },
  { value: 'grievances', label: 'Citizen Grievances', icon: MessageSquare },
  { value: 'profiles', label: 'Target Profiles', icon: Contact2 },
];

const formatWhen = (value) => {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
};

/* ── 3-Level Metric Cards ── */

/** 1. 3-Level Stance Matrix Card */
const StanceMatrixCard = ({
  stats = {},
  title = 'Stance Assessment',
  subtitle = 'Favourable vs Unfavourable stance index',
  onViewDetail,
}) => {
  const {
    favourable = 0,
    unfavourable = 0,
    neutral = 0,
    total = 0,
    favourable_pct = 0,
    unfavourable_pct = 0,
    neutral_pct = 0,
    polarized_favourable_pct = 50,
    polarized_unfavourable_pct = 50,
  } = stats || {};

  const netDiff = Number((favourable_pct - unfavourable_pct).toFixed(1));
  const isNetPositive = netDiff >= 0;

  return (
    <Card className={cn(
      'border-border/70 bg-card/90 shadow-xs rounded-xl overflow-hidden backdrop-blur-xs transition-all',
      onViewDetail && 'hover:border-primary/50'
    )}>
      <CardContent className="p-3.5 sm:p-4">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div>
            <div className="flex items-center gap-1.5">
              <ThumbsUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">{title}</h3>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold',
                isNetPositive
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20'
              )}
            >
              {isNetPositive ? <TrendingUp className="h-2.5 w-2.5 mr-0.5" /> : <TrendingDown className="h-2.5 w-2.5 mr-0.5" />}
              {isNetPositive ? '+' : ''}{netDiff}% Net
            </span>
            {onViewDetail && (
              <button
                type="button"
                onClick={() => onViewDetail('stance', 'all')}
                className="h-5 px-1.5 rounded text-[10px] font-bold text-primary hover:bg-primary/10 transition-colors inline-flex items-center gap-0.5"
                title="View Stance Breakdown"
              >
                View <ChevronRight className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
        </div>

        {/* Polarized Head-to-Head Ratio Bar */}
        <div
          onClick={() => onViewDetail && onViewDetail('stance', 'all')}
          className={cn(
            'space-y-1.5 mb-3 bg-muted/20 p-2 rounded-lg border border-border/40 transition-all',
            onViewDetail && 'cursor-pointer hover:bg-muted/30 hover:border-border/70'
          )}
        >
          <div className="flex justify-between items-center text-[11px] font-semibold">
            <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Favourable ({favourable_pct}%)
            </span>
            <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1">
              Unfavourable ({unfavourable_pct}%)
              <span className="h-2 w-2 rounded-full bg-rose-500" />
            </span>
          </div>
          <div className="h-2.5 w-full bg-muted/50 rounded-full overflow-hidden flex">
            <div
              className="bg-emerald-500 h-full transition-all duration-500"
              style={{ width: `${polarized_favourable_pct}%` }}
              title={`Favourable: ${polarized_favourable_pct}% of polarized stance`}
            />
            <div
              className="bg-rose-500 h-full transition-all duration-500"
              style={{ width: `${polarized_unfavourable_pct}%` }}
              title={`Unfavourable: ${polarized_unfavourable_pct}% of polarized stance`}
            />
          </div>
          <div className="flex justify-between text-[9px] text-muted-foreground pt-0.5">
            <span>Ratio: {polarized_favourable_pct}%</span>
            <span>Ratio: {polarized_unfavourable_pct}%</span>
          </div>
        </div>

        {/* 3-Level Stats Chips */}
        <div className="grid grid-cols-3 gap-1.5 pt-0.5">
          <div
            onClick={() => onViewDetail && onViewDetail('stance', 'favourable')}
            className={cn(
              'px-2 py-1.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-center transition-all',
              onViewDetail && 'cursor-pointer hover:bg-emerald-500/15 hover:border-emerald-500/40 hover:scale-[1.02]'
            )}
          >
            <p className="text-[9px] font-bold uppercase text-emerald-700 dark:text-emerald-300">Favourable</p>
            <p className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">{favourable}</p>
            <p className="text-[9px] text-muted-foreground">{favourable_pct}%</p>
          </div>
          <div
            onClick={() => onViewDetail && onViewDetail('stance', 'neutral')}
            className={cn(
              'px-2 py-1.5 rounded-lg bg-slate-500/5 border border-slate-500/20 text-center transition-all',
              onViewDetail && 'cursor-pointer hover:bg-slate-500/15 hover:border-slate-500/40 hover:scale-[1.02]'
            )}
          >
            <p className="text-[9px] font-bold uppercase text-muted-foreground">Neutral</p>
            <p className="text-sm font-extrabold text-foreground tabular-nums">{neutral}</p>
            <p className="text-[9px] text-muted-foreground">{neutral_pct}%</p>
          </div>
          <div
            onClick={() => onViewDetail && onViewDetail('stance', 'unfavourable')}
            className={cn(
              'px-2 py-1.5 rounded-lg bg-rose-500/5 border border-rose-500/20 text-center transition-all',
              onViewDetail && 'cursor-pointer hover:bg-rose-500/15 hover:border-rose-500/40 hover:scale-[1.02]'
            )}
          >
            <p className="text-[9px] font-bold uppercase text-rose-700 dark:text-rose-300">Unfavourable</p>
            <p className="text-sm font-extrabold text-rose-600 dark:text-rose-400 tabular-nums">{unfavourable}</p>
            <p className="text-[9px] text-muted-foreground">{unfavourable_pct}%</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

/** 2. 3-Level Sentiment Matrix Card */
const SentimentMatrixCard = ({
  stats = {},
  title = 'Sentiment Spectrum',
  subtitle = 'Algorithmic emotional valence',
  onViewDetail,
}) => {
  const {
    positive = 0,
    negative = 0,
    neutral = 0,
    positive_pct = 0,
    negative_pct = 0,
    neutral_pct = 0,
    net_sentiment_score = 0,
  } = stats || {};

  return (
    <Card className={cn(
      'border-border/70 bg-card/90 shadow-xs rounded-xl overflow-hidden backdrop-blur-xs transition-all',
      onViewDetail && 'hover:border-primary/50'
    )}>
      <CardContent className="p-3.5 sm:p-4">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div>
            <div className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">{title}</h3>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'px-2 py-0.5 rounded-full text-[10px] font-bold border',
                net_sentiment_score > 0
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
                  : net_sentiment_score < 0
                    ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20'
                    : 'bg-muted text-muted-foreground border-border'
              )}
            >
              Net {net_sentiment_score > 0 ? `+${net_sentiment_score}` : net_sentiment_score}
            </span>
            {onViewDetail && (
              <button
                type="button"
                onClick={() => onViewDetail('sentiment', 'all')}
                className="h-5 px-1.5 rounded text-[10px] font-bold text-primary hover:bg-primary/10 transition-colors inline-flex items-center gap-0.5"
                title="View Sentiment Breakdown"
              >
                View <ChevronRight className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
        </div>

        {/* Stacked 3-Level Sentiment Bar */}
        <div
          onClick={() => onViewDetail && onViewDetail('sentiment', 'all')}
          className={cn(
            'space-y-1.5 mb-3 bg-muted/20 p-2 rounded-lg border border-border/40 transition-all',
            onViewDetail && 'cursor-pointer hover:bg-muted/30 hover:border-border/70'
          )}
        >
          <div className="flex justify-between items-center text-[10px] text-muted-foreground">
            <span className="text-emerald-600 font-semibold">{positive_pct}% Positive</span>
            <span className="text-sky-600 dark:text-sky-400 font-semibold">{neutral_pct}% Neutral (News)</span>
            <span className="text-rose-600 font-semibold">{negative_pct}% Negative</span>
          </div>
          <div className="h-2.5 w-full bg-muted/50 rounded-full overflow-hidden flex">
            <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${positive_pct}%` }} title={`Positive: ${positive_pct}%`} />
            <div className="bg-sky-400 dark:bg-sky-500 h-full transition-all duration-500" style={{ width: `${neutral_pct}%` }} title={`Neutral: ${neutral_pct}%`} />
            <div className="bg-rose-500 h-full transition-all duration-500" style={{ width: `${negative_pct}%` }} title={`Negative: ${negative_pct}%`} />
          </div>
          <div className="flex justify-between text-[9px] text-muted-foreground pt-0.5">
            <span>Score Scale: -100 to +100</span>
            <span className="font-semibold text-foreground">Score: {net_sentiment_score}</span>
          </div>
        </div>

        {/* 3-Level Metric Chips */}
        <div className="grid grid-cols-3 gap-1.5 pt-0.5">
          <div
            onClick={() => onViewDetail && onViewDetail('sentiment', 'positive')}
            className={cn(
              'px-2 py-1.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-center transition-all',
              onViewDetail && 'cursor-pointer hover:bg-emerald-500/15 hover:border-emerald-500/40 hover:scale-[1.02]'
            )}
          >
            <p className="text-[9px] font-bold uppercase text-emerald-700 dark:text-emerald-300">Positive</p>
            <p className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">{positive}</p>
            <p className="text-[9px] text-muted-foreground">{positive_pct}%</p>
          </div>
          <div
            onClick={() => onViewDetail && onViewDetail('sentiment', 'neutral')}
            className={cn(
              'px-2 py-1.5 rounded-lg bg-sky-500/5 border border-sky-500/20 text-center transition-all',
              onViewDetail && 'cursor-pointer hover:bg-sky-500/15 hover:border-sky-500/40 hover:scale-[1.02]'
            )}
          >
            <p className="text-[9px] font-bold uppercase text-sky-700 dark:text-sky-300">Neutral (News)</p>
            <p className="text-sm font-extrabold text-sky-600 dark:text-sky-400 tabular-nums">{neutral}</p>
            <p className="text-[9px] text-muted-foreground">{neutral_pct}%</p>
          </div>
          <div
            onClick={() => onViewDetail && onViewDetail('sentiment', 'negative')}
            className={cn(
              'px-2 py-1.5 rounded-lg bg-rose-500/5 border border-rose-500/20 text-center transition-all',
              onViewDetail && 'cursor-pointer hover:bg-rose-500/15 hover:border-rose-500/40 hover:scale-[1.02]'
            )}
          >
            <p className="text-[9px] font-bold uppercase text-rose-700 dark:text-rose-300">Negative</p>
            <p className="text-sm font-extrabold text-rose-600 dark:text-rose-400 tabular-nums">{negative}</p>
            <p className="text-[9px] text-muted-foreground">{negative_pct}%</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

/** 3. 3-Level Risk Matrix Card */
const RiskMatrixCard = ({
  stats = {},
  title = 'Threat & Risk Level',
  subtitle = 'Severity classification breakdown',
  onViewDetail,
}) => {
  const {
    high = 0,
    medium = 0,
    low = 0,
    high_pct = 0,
    medium_pct = 0,
    low_pct = 0,
    total = 0,
  } = stats || {};

  return (
    <Card className={cn(
      'border-border/70 bg-card/90 shadow-xs rounded-xl overflow-hidden backdrop-blur-xs transition-all',
      onViewDetail && 'hover:border-primary/50'
    )}>
      <CardContent className="p-3.5 sm:p-4">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div>
            <div className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">{title}</h3>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'px-2 py-0.5 rounded-full text-[10px] font-bold border',
                high > 0
                  ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30 animate-pulse'
                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
              )}
            >
              {high > 0 ? `${high} Critical/High` : 'Normal Risk'}
            </span>
            {onViewDetail && (
              <button
                type="button"
                onClick={() => onViewDetail('risk', 'all')}
                className="h-5 px-1.5 rounded text-[10px] font-bold text-primary hover:bg-primary/10 transition-colors inline-flex items-center gap-0.5"
                title="View Risk Breakdown"
              >
                View <ChevronRight className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
        </div>

        {/* Stacked Risk Level Bar */}
        <div
          onClick={() => onViewDetail && onViewDetail('risk', 'all')}
          className={cn(
            'space-y-1.5 mb-3 bg-muted/20 p-2 rounded-lg border border-border/40 transition-all',
            onViewDetail && 'cursor-pointer hover:bg-muted/30 hover:border-border/70'
          )}
        >
          <div className="flex justify-between items-center text-[10px] text-muted-foreground">
            <span className="text-red-600 font-semibold">{high_pct}% High</span>
            <span className="text-amber-600 font-semibold">{medium_pct}% Medium</span>
            <span className="text-emerald-600 font-semibold">{low_pct}% Low</span>
          </div>
          <div className="h-2.5 w-full bg-muted/50 rounded-full overflow-hidden flex">
            <div className="bg-red-500 h-full transition-all duration-500" style={{ width: `${high_pct}%` }} />
            <div className="bg-amber-500 h-full transition-all duration-500" style={{ width: `${medium_pct}%` }} />
            <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${low_pct}%` }} />
          </div>
          <div className="flex justify-between text-[9px] text-muted-foreground pt-0.5">
            <span>Classified: {total} items</span>
            <span className="font-semibold text-foreground">{(100 - high_pct).toFixed(1)}% Safe</span>
          </div>
        </div>

        {/* 3-Level Risk Chips */}
        <div className="grid grid-cols-3 gap-1.5 pt-0.5">
          <div
            onClick={() => onViewDetail && onViewDetail('risk', 'high')}
            className={cn(
              'px-2 py-1.5 rounded-lg bg-red-500/5 border border-red-500/20 text-center transition-all',
              onViewDetail && 'cursor-pointer hover:bg-red-500/15 hover:border-red-500/40 hover:scale-[1.02]'
            )}
          >
            <p className="text-[9px] font-bold uppercase text-red-700 dark:text-red-300">High / Critical</p>
            <p className="text-sm font-extrabold text-red-600 dark:text-red-400 tabular-nums">{high}</p>
            <p className="text-[9px] text-muted-foreground">{high_pct}%</p>
          </div>
          <div
            onClick={() => onViewDetail && onViewDetail('risk', 'medium')}
            className={cn(
              'px-2 py-1.5 rounded-lg bg-amber-500/5 border border-amber-500/20 text-center transition-all',
              onViewDetail && 'cursor-pointer hover:bg-amber-500/15 hover:border-amber-500/40 hover:scale-[1.02]'
            )}
          >
            <p className="text-[9px] font-bold uppercase text-amber-700 dark:text-amber-300">Medium</p>
            <p className="text-sm font-extrabold text-amber-600 dark:text-amber-400 tabular-nums">{medium}</p>
            <p className="text-[9px] text-muted-foreground">{medium_pct}%</p>
          </div>
          <div
            onClick={() => onViewDetail && onViewDetail('risk', 'low')}
            className={cn(
              'px-2 py-1.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-center transition-all',
              onViewDetail && 'cursor-pointer hover:bg-emerald-500/15 hover:border-emerald-500/40 hover:scale-[1.02]'
            )}
          >
            <p className="text-[9px] font-bold uppercase text-emerald-700 dark:text-emerald-300">Low</p>
            <p className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">{low}</p>
            <p className="text-[9px] text-muted-foreground">{low_pct}%</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

/** High-Density Trend Area Chart */
const CompactTrendChart = ({ data = [], height = 180, color = '#3b82f6', label = 'Telemetry Velocity' }) => {
  const hasData = Array.isArray(data) && data.some((d) => d.total > 0);
  return (
    <div style={{ height }} className="w-full">
      {!hasData ? (
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground bg-muted/10 rounded-lg">
          No trend data recorded for selected period
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${label.replace(/\s+/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.45} />
                <stop offset="95%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 2" className="stroke-border/40" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#64748b' }}
              tickFormatter={(v) => (v && v.length >= 10 ? v.slice(5) : v)}
              minTickGap={20}
              stroke="#94a3b8"
            />
            <YAxis tick={{ fontSize: 10, fill: '#64748b' }} allowDecimals={false} stroke="#94a3b8" />
            <RechartsTooltip
              contentStyle={{
                fontSize: 11,
                borderRadius: 8,
                backgroundColor: 'var(--popover, #fff)',
                border: '1px solid var(--border, #e2e8f0)',
                boxShadow: '0 4px 14px rgba(0,0,0,0.1)',
                padding: '6px 10px',
              }}
              labelFormatter={(v) => `Date: ${v}`}
              formatter={(val) => [`${Number(val).toLocaleString()} posts/items`, label]}
            />
            <Area
              type="monotone"
              dataKey="total"
              name={label}
              stroke={color}
              strokeWidth={2.5}
              activeDot={{ r: 5, fill: color, stroke: '#fff', strokeWidth: 2 }}
              fill={`url(#grad-${label.replace(/\s+/g, '')})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

/** Compact Section Card */
const SectionCard = ({ title, subtitle, badge, action, children, className }) => (
  <Card className={cn('border-border/70 bg-card/90 rounded-xl shadow-xs overflow-hidden backdrop-blur-xs', className)}>
    <CardContent className="p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2 mb-3 border-b border-border/50 pb-2">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
            {title}
          </h3>
          {subtitle && <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          {badge && (
            <span className="text-[10px] font-bold uppercase tracking-wide bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full">
              {badge}
            </span>
          )}
          {action}
        </div>
      </div>
      {children}
    </CardContent>
  </Card>
);

/* ══════════════════════════════════════════════════════════════
   POPUP MODAL: EVENT INTELLIGENCE, POSTS & PROFILES BREAKDOWN
   ══════════════════════════════════════════════════════════════ */
const EventIntelligenceModal = ({
  eventId,
  eventName,
  isOpen,
  onClose,
  range,
  platform,
  initialDimension = 'all',
  initialFilter = 'all',
}) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [activeDimension, setActiveDimension] = useState(initialDimension || 'all');
  const [modalTab, setModalTab] = useState('profiles'); // 'profiles' | 'posts'
  const [stanceFilter, setStanceFilter] = useState('all');
  const [sentimentFilter, setSentimentFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Sync state when opened with initial dimension/filter
  useEffect(() => {
    if (isOpen) {
      const dim = initialDimension || 'all';
      setActiveDimension(dim);
      setSearchQuery('');
      setModalTab('profiles');
      if (dim === 'stance') {
        setStanceFilter(initialFilter || 'all');
        setSentimentFilter('all');
        setRiskFilter('all');
      } else if (dim === 'sentiment') {
        setSentimentFilter(initialFilter || 'all');
        setStanceFilter('all');
        setRiskFilter('all');
      } else if (dim === 'risk') {
        setRiskFilter(initialFilter || 'all');
        setStanceFilter('all');
        setSentimentFilter('all');
      } else {
        setStanceFilter('all');
        setSentimentFilter('all');
        setRiskFilter('all');
      }
    }
  }, [isOpen, initialDimension, initialFilter]);

  useEffect(() => {
    if (!isOpen || !eventId) return;
    setLoading(true);
    analyticsHubApi
      .eventDetails(eventId, { range, platform })
      .then((res) => {
        setData(res.data);
      })
      .catch((err) => {
        toast.error(err.response?.data?.error || 'Failed to load event details');
      })
      .finally(() => setLoading(false));
  }, [isOpen, eventId, range, platform]);

  const profiles = data?.profiles || [];
  const posts = data?.posts || [];

  // Counts for each dimension
  const stanceCounts = useMemo(() => {
    let fav = 0;
    let unfav = 0;
    let neu = 0;
    posts.forEach((p) => {
      const st = (p.stance || '').toLowerCase();
      if (st === 'support' || st === 'favourable') fav++;
      else if (st === 'oppose' || st === 'unfavourable') unfav++;
      else neu++;
    });
    return { all: posts.length, favourable: fav, unfavourable: unfav, neutral: neu };
  }, [posts]);

  const sentimentCounts = useMemo(() => {
    let pos = 0;
    let neg = 0;
    let neu = 0;
    let pending = 0;
    posts.forEach((p) => {
      const s = (p.sentiment || '').toLowerCase();
      if (s === 'positive') pos++;
      else if (s === 'negative') neg++;
      else if (s === 'neutral') neu++;
      else pending++;
    });
    return { all: posts.length, positive: pos, negative: neg, neutral: neu, pending };
  }, [posts]);

  const riskCounts = useMemo(() => {
    let high = 0;
    let med = 0;
    let low = 0;
    posts.forEach((p) => {
      const r = (p.risk_level || '').toLowerCase();
      if (r === 'high' || r === 'critical') high++;
      else if (r === 'medium') med++;
      else low++;
    });
    return { all: posts.length, high, medium: med, low };
  }, [posts]);

  // Profiles filtered and sorted dynamically per dimension
  const filteredProfiles = useMemo(() => {
    let list = profiles;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((p) =>
        p.author_name.toLowerCase().includes(q) ||
        (p.author_handle && p.author_handle.toLowerCase().includes(q))
      );
    }

    if (activeDimension === 'stance') {
      return [...list].sort((a, b) =>
        (b.favourable_count + b.unfavourable_count) - (a.favourable_count + a.unfavourable_count) ||
        b.posts_count - a.posts_count
      );
    }
    if (activeDimension === 'risk') {
      return [...list].sort((a, b) =>
        b.risk_high_count - a.risk_high_count ||
        b.risk_medium_count - a.risk_medium_count ||
        b.posts_count - a.posts_count
      );
    }
    if (activeDimension === 'sentiment') {
      return [...list].sort((a, b) =>
        (b.positive_count + b.negative_count) - (a.positive_count + a.negative_count) ||
        b.posts_count - a.posts_count
      );
    }
    return list;
  }, [profiles, activeDimension, searchQuery]);

  // Posts filtered dynamically per dimension & filters
  const filteredPosts = useMemo(() => {
    let list = posts;

    if (activeDimension === 'stance') {
      if (stanceFilter === 'favourable') {
        list = list.filter((p) => {
          const s = (p.stance || '').toLowerCase();
          return s === 'support' || s === 'favourable';
        });
      } else if (stanceFilter === 'unfavourable') {
        list = list.filter((p) => {
          const s = (p.stance || '').toLowerCase();
          return s === 'oppose' || s === 'unfavourable';
        });
      } else if (stanceFilter === 'neutral') {
        list = list.filter((p) => {
          const s = (p.stance || '').toLowerCase();
          return s === 'neutral' || s === 'unclear' || !s;
        });
      }
    } else if (activeDimension === 'sentiment') {
      if (sentimentFilter !== 'all') {
        list = list.filter((p) => (p.sentiment || '').toLowerCase() === sentimentFilter);
      }
    } else if (activeDimension === 'risk') {
      if (riskFilter === 'high') {
        list = list.filter((p) => {
          const r = (p.risk_level || '').toLowerCase();
          return r === 'high' || r === 'critical';
        });
      } else if (riskFilter === 'medium') {
        list = list.filter((p) => (p.risk_level || '').toLowerCase() === 'medium');
      } else if (riskFilter === 'low') {
        list = list.filter((p) => (p.risk_level || '').toLowerCase() === 'low');
      }
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((p) =>
        (p.text && p.text.toLowerCase().includes(q)) ||
        (p.author_name && p.author_name.toLowerCase().includes(q)) ||
        (p.author_handle && p.author_handle.toLowerCase().includes(q))
      );
    }
    return list;
  }, [posts, activeDimension, stanceFilter, sentimentFilter, riskFilter, searchQuery]);

  const dimensionTitle = useMemo(() => {
    if (activeDimension === 'stance') return 'Stance Index Intelligence';
    if (activeDimension === 'sentiment') return 'Narrative Sentiment Intelligence';
    if (activeDimension === 'risk') return 'Threat & Risk Classification';
    return 'Comprehensive Event Intelligence';
  }, [activeDimension]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl max-h-[92vh] h-[92vh] flex flex-col p-0 overflow-hidden bg-card border-border/80 shadow-2xl">
        {/* Modal Header */}
        <DialogHeader className="p-3.5 sm:p-4 border-b border-border/60 bg-muted/20 shrink-0">
          <div className="flex items-center justify-between gap-3 pr-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <DialogTitle className="text-base font-extrabold text-foreground truncate">
                  {eventName || 'All Monitored Events'}
                </DialogTitle>
                <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20 font-bold">
                  {dimensionTitle}
                </Badge>
                {eventId && eventId !== 'all' && (
                  <Badge variant="secondary" className="text-[10px] font-semibold">
                    ID #{eventId}
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {activeDimension === 'stance' && 'Public stance posture: favourable vs unfavourable opinion ratios and supporting personas.'}
                {activeDimension === 'sentiment' && 'Emotional valence spectrum: positive, neutral and negative polarity across posts and creators.'}
                {activeDimension === 'risk' && 'Severity categorization: high threat, medium alert and low severity distribution with persona risk.'}
                {activeDimension === 'all' && 'Full 3-level stance, sentiment, risk assessment, contributing personas, and post telemetry stream.'}
              </p>
            </div>

            {/* Quick Summary Badges */}
            <div className="flex items-center gap-1.5 shrink-0 hidden sm:flex">
              {activeDimension === 'stance' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                  {data?.stance_stats?.net_polarized_diff ?? 0}% Net Polarized
                </span>
              )}
              {activeDimension === 'sentiment' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20">
                  Score: {data?.sentiment_stats?.net_sentiment_score ?? 0}
                </span>
              )}
              {activeDimension === 'risk' && (
                <span className={cn(
                  'px-2 py-0.5 rounded-full text-[10px] font-bold border',
                  data?.risk_stats?.high > 0
                    ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20 animate-pulse'
                    : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
                )}>
                  {data?.risk_stats?.high > 0 ? `${data.risk_stats.high} High Threat` : 'Normal Safe Level'}
                </span>
              )}
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground border border-border">
                {data?.total_posts ?? posts.length} Posts Analyzed
              </span>
            </div>
          </div>

          {/* Dimension Switcher Pills */}
          <div className="flex items-center gap-1.5 pt-2.5 overflow-x-auto">
            <button
              onClick={() => {
                setActiveDimension('stance');
                setStanceFilter('all');
              }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg border transition-all whitespace-nowrap',
                activeDimension === 'stance'
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 shadow-xs'
                  : 'bg-card text-muted-foreground border-border/70 hover:text-foreground hover:bg-muted/60'
              )}
            >
              <ThumbsUp className="h-3 w-3 text-emerald-600" />
              Stance Index
            </button>
            <button
              onClick={() => {
                setActiveDimension('sentiment');
                setSentimentFilter('all');
              }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg border transition-all whitespace-nowrap',
                activeDimension === 'sentiment'
                  ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/40 shadow-xs'
                  : 'bg-card text-muted-foreground border-border/70 hover:text-foreground hover:bg-muted/60'
              )}
            >
              <Activity className="h-3 w-3 text-blue-600" />
              Narrative Sentiment
            </button>
            <button
              onClick={() => {
                setActiveDimension('risk');
                setRiskFilter('all');
              }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg border transition-all whitespace-nowrap',
                activeDimension === 'risk'
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40 shadow-xs'
                  : 'bg-card text-muted-foreground border-border/70 hover:text-foreground hover:bg-muted/60'
              )}
            >
              <Shield className="h-3 w-3 text-amber-600" />
              Risk Classification
            </button>
            <button
              onClick={() => {
                setActiveDimension('all');
                setStanceFilter('all');
                setSentimentFilter('all');
                setRiskFilter('all');
              }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg border transition-all whitespace-nowrap ml-auto',
                activeDimension === 'all'
                  ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                  : 'bg-card text-muted-foreground border-border/70 hover:text-foreground hover:bg-muted/60'
              )}
            >
              <Sparkles className="h-3 w-3" />
              All Intelligence
            </button>
          </div>
        </DialogHeader>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <div className="flex h-64 flex-col items-center justify-center text-muted-foreground">
              <Loader2 className="h-7 w-7 animate-spin text-primary mb-2" />
              <p className="text-xs font-semibold">Loading intelligence details…</p>
            </div>
          ) : (
            <>
              {/* Card Presentation Area: Shows ONLY that card's related info when a dimension is active! */}
              {activeDimension === 'stance' && (
                <div className="w-full">
                  <StanceMatrixCard
                    stats={data?.stance_stats}
                    title={eventName ? `${eventName} — Stance Index` : 'Events Stance Index'}
                    subtitle="Favourable vs unfavourable public stance breakdown"
                    onViewDetail={(dim, filt) => {
                      setModalTab('posts');
                      if (filt && filt !== 'all') setStanceFilter(filt);
                    }}
                  />
                </div>
              )}

              {activeDimension === 'sentiment' && (
                <div className="w-full">
                  <SentimentMatrixCard
                    stats={data?.sentiment_stats}
                    title={eventName ? `${eventName} — Narrative Sentiment` : 'Event Narrative Sentiment'}
                    subtitle="Positive, neutral and negative emotional tone breakdown"
                    onViewDetail={(dim, filt) => {
                      setModalTab('posts');
                      if (filt && filt !== 'all') setSentimentFilter(filt);
                    }}
                  />
                </div>
              )}

              {activeDimension === 'risk' && (
                <div className="w-full">
                  <RiskMatrixCard
                    stats={data?.risk_stats}
                    title={eventName ? `${eventName} — Risk Classification` : 'Event Threat & Risk Classification'}
                    subtitle="Severity distribution of analyzed media"
                    onViewDetail={(dim, filt) => {
                      setModalTab('posts');
                      if (filt && filt !== 'all') setRiskFilter(filt);
                    }}
                  />
                </div>
              )}

              {activeDimension === 'all' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  <StanceMatrixCard
                    stats={data?.stance_stats}
                    title="Events Stance Index"
                    subtitle="Favourable vs unfavourable stance"
                    onViewDetail={(dim, filt) => {
                      setActiveDimension('stance');
                      setModalTab('posts');
                      if (filt && filt !== 'all') setStanceFilter(filt);
                    }}
                  />
                  <SentimentMatrixCard
                    stats={data?.sentiment_stats}
                    title="Event Narrative Sentiment"
                    subtitle="Emotional valence tone"
                    onViewDetail={(dim, filt) => {
                      setActiveDimension('sentiment');
                      setModalTab('posts');
                      if (filt && filt !== 'all') setSentimentFilter(filt);
                    }}
                  />
                  <RiskMatrixCard
                    stats={data?.risk_stats}
                    title="Event Risk Classification"
                    subtitle="Severity distribution"
                    onViewDetail={(dim, filt) => {
                      setActiveDimension('risk');
                      setModalTab('posts');
                      if (filt && filt !== 'all') setRiskFilter(filt);
                    }}
                  />
                </div>
              )}

              {/* Sub Tab Navigation Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/50">
                <div className="flex items-center gap-1 bg-muted/50 p-0.5 rounded-lg border border-border/60">
                  <button
                    onClick={() => { setModalTab('profiles'); setSearchQuery(''); }}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all',
                      modalTab === 'profiles'
                        ? 'bg-background text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Users className="h-3.5 w-3.5 text-primary" />
                    Contributing Profiles ({profiles.length})
                  </button>
                  <button
                    onClick={() => { setModalTab('posts'); setSearchQuery(''); }}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all',
                      modalTab === 'posts'
                        ? 'bg-background text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Activity className="h-3.5 w-3.5 text-primary" />
                    Related Posts Stream ({filteredPosts.length})
                  </button>
                </div>

                {/* Search Input in Modal */}
                <div className="relative w-48 sm:w-64">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder={modalTab === 'profiles' ? 'Filter profiles...' : 'Search posts text...'}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-7 pl-8 text-xs bg-background"
                  />
                </div>
              </div>

              {modalTab === 'profiles' ? (
                /* Tab A: Profiles & Authors Breakdown */
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      Showing <strong>{filteredProfiles.length}</strong> profiles contributing content to this event
                    </span>
                    <span>
                      {activeDimension === 'stance' && 'Favourable vs Unfavourable stance calculated per persona'}
                      {activeDimension === 'sentiment' && 'Positive vs Negative polarity calculated per persona'}
                      {activeDimension === 'risk' && 'Severity & threat classification calculated per persona'}
                      {activeDimension === 'all' && 'Cross-dimensional metrics calculated per persona'}
                    </span>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-border/70">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-muted/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border/70">
                        <tr>
                          <th className="p-2.5">Profile / Author</th>
                          <th className="p-2.5 text-center">Platform</th>
                          <th className="p-2.5 text-right">Posts Count</th>
                          {activeDimension === 'stance' ? (
                            <>
                              <th className="p-2.5 text-center min-w-[110px]">Favourable %</th>
                              <th className="p-2.5 text-center min-w-[110px]">Unfavourable %</th>
                              <th className="p-2.5 text-center min-w-[130px]">Stance Visual</th>
                            </>
                          ) : activeDimension === 'risk' ? (
                            <>
                              <th className="p-2.5 text-center min-w-[110px]">High / Crit %</th>
                              <th className="p-2.5 text-center min-w-[110px]">Medium %</th>
                              <th className="p-2.5 text-center min-w-[130px]">Risk Severity Visual</th>
                            </>
                          ) : (
                            <>
                              <th className="p-2.5 text-center min-w-[110px]">Positive %</th>
                              <th className="p-2.5 text-center min-w-[110px]">Negative %</th>
                              <th className="p-2.5 text-center min-w-[130px]">Sentiment Visual</th>
                            </>
                          )}
                          <th className="p-2.5 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {filteredProfiles.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="p-8 text-center text-xs text-muted-foreground">
                              No profiles found matching search criteria
                            </td>
                          </tr>
                        ) : (
                          filteredProfiles.map((prof, idx) => {
                            const Icon = getPlatformIcon(prof.platform);
                            return (
                              <tr key={`${prof.author_identifier}-${idx}`} className="hover:bg-muted/30 transition-colors">
                                <td className="p-2.5 max-w-[200px]">
                                  <p className="font-semibold text-foreground truncate">{prof.author_name}</p>
                                  {prof.author_handle && (
                                    <p className="text-[10px] text-muted-foreground truncate">@{prof.author_handle}</p>
                                  )}
                                </td>
                                <td className="p-2.5 text-center">
                                  <span className="inline-flex items-center gap-1 font-medium text-foreground">
                                    <Icon className="h-3.5 w-3.5" />
                                    <span className="capitalize text-[10px]">{prof.platform}</span>
                                  </span>
                                </td>
                                <td className="p-2.5 text-right font-bold tabular-nums text-foreground">
                                  {prof.posts_count}
                                </td>

                                {activeDimension === 'stance' ? (
                                  <>
                                    <td className="p-2.5 text-center">
                                      {prof.analyzed_count > 0 ? (
                                        <span className={cn(
                                          'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums',
                                          prof.favourable_pct > 0
                                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                            : 'text-muted-foreground'
                                        )}>
                                          {prof.favourable_pct}% ({prof.favourable_count})
                                        </span>
                                      ) : (
                                        <span className="text-[10px] text-muted-foreground italic">Pending</span>
                                      )}
                                    </td>
                                    <td className="p-2.5 text-center">
                                      {prof.analyzed_count > 0 ? (
                                        <span className={cn(
                                          'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums',
                                          prof.unfavourable_pct > 0
                                            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                                            : 'text-muted-foreground'
                                        )}>
                                          {prof.unfavourable_pct}% ({prof.unfavourable_count})
                                        </span>
                                      ) : (
                                        <span className="text-[10px] text-muted-foreground italic">Pending</span>
                                      )}
                                    </td>
                                    <td className="p-2.5">
                                      {prof.analyzed_count > 0 ? (
                                        <div className="space-y-1">
                                          <div className="h-2 w-full bg-muted/60 rounded-full overflow-hidden flex">
                                            <div className="bg-emerald-500 h-full" style={{ width: `${prof.favourable_pct}%` }} />
                                            <div className="bg-slate-400 h-full" style={{ width: `${prof.neutral_pct}%` }} />
                                            <div className="bg-rose-500 h-full" style={{ width: `${prof.unfavourable_pct}%` }} />
                                          </div>
                                          <div className="flex justify-between text-[8px] text-muted-foreground">
                                            <span className="text-emerald-600">{prof.favourable_pct}% Fav</span>
                                            <span className="text-rose-600">{prof.unfavourable_pct}% Unfav</span>
                                          </div>
                                        </div>
                                      ) : (
                                        <span className="text-[9px] text-muted-foreground italic block text-center">Pending analysis</span>
                                      )}
                                    </td>
                                  </>
                                ) : activeDimension === 'risk' ? (
                                  <>
                                    <td className="p-2.5 text-center">
                                      {prof.analyzed_count > 0 ? (
                                        <span className={cn(
                                          'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums',
                                          prof.risk_high_pct > 0
                                            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                                            : 'text-muted-foreground'
                                        )}>
                                          {prof.risk_high_pct}% ({prof.risk_high_count})
                                        </span>
                                      ) : (
                                        <span className="text-[10px] text-muted-foreground italic">Pending</span>
                                      )}
                                    </td>
                                    <td className="p-2.5 text-center">
                                      {prof.analyzed_count > 0 ? (
                                        <span className={cn(
                                          'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums',
                                          prof.risk_medium_pct > 0
                                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                                            : 'text-muted-foreground'
                                        )}>
                                          {prof.risk_medium_pct}% ({prof.risk_medium_count})
                                        </span>
                                      ) : (
                                        <span className="text-[10px] text-muted-foreground italic">Pending</span>
                                      )}
                                    </td>
                                    <td className="p-2.5">
                                      {prof.analyzed_count > 0 ? (
                                        <div className="space-y-1">
                                          <div className="h-2 w-full bg-muted/60 rounded-full overflow-hidden flex">
                                            <div className="bg-rose-500 h-full" style={{ width: `${prof.risk_high_pct}%` }} />
                                            <div className="bg-amber-500 h-full" style={{ width: `${prof.risk_medium_pct}%` }} />
                                            <div className="bg-emerald-500 h-full" style={{ width: `${prof.risk_low_pct}%` }} />
                                          </div>
                                          <div className="flex justify-between text-[8px] text-muted-foreground">
                                            <span className="text-rose-600">{prof.risk_high_pct}% High</span>
                                            <span className="text-emerald-600">{prof.risk_low_pct}% Low</span>
                                          </div>
                                        </div>
                                      ) : (
                                        <span className="text-[9px] text-muted-foreground italic block text-center">Pending analysis</span>
                                      )}
                                    </td>
                                  </>
                                ) : (
                                  <>
                                    <td className="p-2.5 text-center">
                                      {prof.analyzed_count > 0 ? (
                                        <span className={cn(
                                          'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums',
                                          prof.positive_pct > 0
                                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                            : 'text-muted-foreground'
                                        )}>
                                          {prof.positive_pct}% ({prof.positive_count})
                                        </span>
                                      ) : (
                                        <span className="text-[10px] text-muted-foreground italic">Pending</span>
                                      )}
                                    </td>
                                    <td className="p-2.5 text-center">
                                      {prof.analyzed_count > 0 ? (
                                        <span className={cn(
                                          'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums',
                                          prof.negative_pct > 0
                                            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                                            : 'text-muted-foreground'
                                        )}>
                                          {prof.negative_pct}% ({prof.negative_count})
                                        </span>
                                      ) : (
                                        <span className="text-[10px] text-muted-foreground italic">Pending</span>
                                      )}
                                    </td>
                                    <td className="p-2.5">
                                      {prof.analyzed_count > 0 ? (
                                        <div className="space-y-1">
                                          <div className="h-2 w-full bg-muted/60 rounded-full overflow-hidden flex">
                                            <div className="bg-emerald-500 h-full" style={{ width: `${prof.positive_pct}%` }} />
                                            <div className="bg-slate-400 h-full" style={{ width: `${prof.neutral_pct}%` }} />
                                            <div className="bg-rose-500 h-full" style={{ width: `${prof.negative_pct}%` }} />
                                          </div>
                                          <div className="flex justify-between text-[8px] text-muted-foreground">
                                            <span className="text-emerald-600">{prof.positive_pct}% +</span>
                                            <span className="text-rose-600">{prof.negative_pct}% -</span>
                                          </div>
                                        </div>
                                      ) : (
                                        <span className="text-[9px] text-muted-foreground italic block text-center">Pending analysis</span>
                                      )}
                                    </td>
                                  </>
                                )}

                                <td className="p-2.5 text-center">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 text-[10px] px-2"
                                    onClick={() => {
                                      setModalTab('posts');
                                      setSearchQuery(prof.author_handle || prof.author_name);
                                    }}
                                  >
                                    View Posts <ChevronRight className="h-3 w-3 ml-0.5" />
                                  </Button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                /* Tab B: Related Posts Stream */
                <div className="space-y-3">
                  {/* Dimension-Specific Filter Chips Toolbar */}
                  <div className="flex items-center justify-between gap-2 flex-wrap pb-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {activeDimension === 'stance' ? (
                        <>
                          <span className="text-[11px] font-bold uppercase text-muted-foreground mr-1">Filter Stance:</span>
                          <button
                            onClick={() => setStanceFilter('all')}
                            className={cn(
                              'px-2.5 py-0.5 rounded-full text-xs font-bold border transition-all',
                              stanceFilter === 'all'
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-card text-muted-foreground border-border hover:bg-muted'
                            )}
                          >
                            All ({stanceCounts.all})
                          </button>
                          <button
                            onClick={() => setStanceFilter('favourable')}
                            className={cn(
                              'px-2.5 py-0.5 rounded-full text-xs font-bold border transition-all',
                              stanceFilter === 'favourable'
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 hover:bg-emerald-500/20'
                            )}
                          >
                            Favourable ({stanceCounts.favourable})
                          </button>
                          <button
                            onClick={() => setStanceFilter('unfavourable')}
                            className={cn(
                              'px-2.5 py-0.5 rounded-full text-xs font-bold border transition-all',
                              stanceFilter === 'unfavourable'
                                ? 'bg-rose-600 text-white border-rose-600'
                                : 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20 hover:bg-rose-500/20'
                            )}
                          >
                            Unfavourable ({stanceCounts.unfavourable})
                          </button>
                          <button
                            onClick={() => setStanceFilter('neutral')}
                            className={cn(
                              'px-2.5 py-0.5 rounded-full text-xs font-bold border transition-all',
                              stanceFilter === 'neutral'
                                ? 'bg-slate-600 text-white border-slate-600'
                                : 'bg-muted text-muted-foreground border-border hover:bg-muted/70'
                            )}
                          >
                            Neutral ({stanceCounts.neutral})
                          </button>
                        </>
                      ) : activeDimension === 'risk' ? (
                        <>
                          <span className="text-[11px] font-bold uppercase text-muted-foreground mr-1">Filter Risk:</span>
                          <button
                            onClick={() => setRiskFilter('all')}
                            className={cn(
                              'px-2.5 py-0.5 rounded-full text-xs font-bold border transition-all',
                              riskFilter === 'all'
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-card text-muted-foreground border-border hover:bg-muted'
                            )}
                          >
                            All ({riskCounts.all})
                          </button>
                          <button
                            onClick={() => setRiskFilter('high')}
                            className={cn(
                              'px-2.5 py-0.5 rounded-full text-xs font-bold border transition-all',
                              riskFilter === 'high'
                                ? 'bg-rose-600 text-white border-rose-600'
                                : 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20 hover:bg-rose-500/20'
                            )}
                          >
                            High / Critical ({riskCounts.high})
                          </button>
                          <button
                            onClick={() => setRiskFilter('medium')}
                            className={cn(
                              'px-2.5 py-0.5 rounded-full text-xs font-bold border transition-all',
                              riskFilter === 'medium'
                                ? 'bg-amber-600 text-white border-amber-600'
                                : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20 hover:bg-amber-500/20'
                            )}
                          >
                            Medium ({riskCounts.medium})
                          </button>
                          <button
                            onClick={() => setRiskFilter('low')}
                            className={cn(
                              'px-2.5 py-0.5 rounded-full text-xs font-bold border transition-all',
                              riskFilter === 'low'
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 hover:bg-emerald-500/20'
                            )}
                          >
                            Low ({riskCounts.low})
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="text-[11px] font-bold uppercase text-muted-foreground mr-1">Filter Sentiment:</span>
                          <button
                            onClick={() => setSentimentFilter('all')}
                            className={cn(
                              'px-2.5 py-0.5 rounded-full text-xs font-bold border transition-all',
                              sentimentFilter === 'all'
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-card text-muted-foreground border-border hover:bg-muted'
                            )}
                          >
                            All ({sentimentCounts.all})
                          </button>
                          <button
                            onClick={() => setSentimentFilter('positive')}
                            className={cn(
                              'px-2.5 py-0.5 rounded-full text-xs font-bold border transition-all',
                              sentimentFilter === 'positive'
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 hover:bg-emerald-500/20'
                            )}
                          >
                            Positive ({sentimentCounts.positive})
                          </button>
                          <button
                            onClick={() => setSentimentFilter('negative')}
                            className={cn(
                              'px-2.5 py-0.5 rounded-full text-xs font-bold border transition-all',
                              sentimentFilter === 'negative'
                                ? 'bg-rose-600 text-white border-rose-600'
                                : 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20 hover:bg-rose-500/20'
                            )}
                          >
                            Negative ({sentimentCounts.negative})
                          </button>
                          <button
                            onClick={() => setSentimentFilter('neutral')}
                            className={cn(
                              'px-2.5 py-0.5 rounded-full text-xs font-bold border transition-all',
                              sentimentFilter === 'neutral'
                                ? 'bg-slate-600 text-white border-slate-600'
                                : 'bg-muted text-muted-foreground border-border hover:bg-muted/70'
                            )}
                          >
                            Neutral ({sentimentCounts.neutral})
                          </button>
                          {sentimentCounts.pending > 0 && (
                            <button
                              onClick={() => setSentimentFilter('pending')}
                              className={cn(
                                'px-2.5 py-0.5 rounded-full text-xs font-bold border transition-all',
                                sentimentFilter === 'pending'
                                  ? 'bg-amber-600 text-white border-amber-600'
                                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20 hover:bg-amber-500/20'
                              )}
                            >
                              Pending ({sentimentCounts.pending})
                            </button>
                          )}
                        </>
                      )}
                    </div>

                    <span className="text-[11px] text-muted-foreground">
                      Showing <strong>{filteredPosts.length}</strong> posts
                    </span>
                  </div>

                  {/* Posts Cards Feed */}
                  {filteredPosts.length === 0 ? (
                    <div className="p-8 text-center text-xs text-muted-foreground rounded-lg border border-dashed border-border bg-muted/10">
                      No posts match the active filter or search criteria
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {filteredPosts.map((post) => {
                        const Icon = getPlatformIcon(post.platform);
                        const isPos = post.sentiment === 'positive';
                        const isNeg = post.sentiment === 'negative';
                        const isPending = post.sentiment === 'pending';
                        const isHighRisk = post.risk_level === 'high' || post.risk_level === 'critical';
                        const isMedRisk = post.risk_level === 'medium';
                        const isFav = post.stance === 'support' || post.stance === 'favourable';
                        const isUnfav = post.stance === 'oppose' || post.stance === 'unfavourable';

                        return (
                          <div
                            key={post.id}
                            className={cn(
                              'p-3 rounded-lg border bg-card shadow-2xs transition-all space-y-2',
                              activeDimension === 'stance'
                                ? isFav ? 'border-emerald-500/30' : isUnfav ? 'border-rose-500/30' : 'border-border/60'
                                : activeDimension === 'risk'
                                  ? isHighRisk ? 'border-rose-500/40 bg-rose-500/5' : isMedRisk ? 'border-amber-500/30 bg-amber-500/5' : 'border-emerald-500/20'
                                  : isPos ? 'border-emerald-500/30' : isNeg ? 'border-rose-500/30' : isPending ? 'border-amber-500/30 bg-amber-500/5' : 'border-border/60'
                            )}
                          >
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="h-6 w-6 rounded-md bg-muted flex items-center justify-center shrink-0">
                                  <Icon className="h-3.5 w-3.5" />
                                </span>
                                <div className="min-w-0">
                                  <span className="font-bold text-xs text-foreground mr-1.5">{post.author_name}</span>
                                  {post.author_handle && (
                                    <span className="text-[11px] text-muted-foreground">@{post.author_handle}</span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 flex-wrap">
                                {activeDimension === 'stance' ? (
                                  <>
                                    <span
                                      className={cn(
                                        'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                                        isFav
                                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
                                          : isUnfav
                                            ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20'
                                            : 'bg-muted text-muted-foreground border border-border'
                                      )}
                                    >
                                      Stance: {post.stance || 'Neutral'}
                                    </span>
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-muted/70 text-muted-foreground">
                                      Sentiment: {post.sentiment}
                                    </span>
                                  </>
                                ) : activeDimension === 'risk' ? (
                                  <>
                                    <span
                                      className={cn(
                                        'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border',
                                        isHighRisk
                                          ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40 animate-pulse'
                                          : isMedRisk
                                            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                                            : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
                                      )}
                                    >
                                      Risk: {post.risk_level || 'low'}
                                    </span>
                                    {post.risk_score > 0 && (
                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-muted/70 text-muted-foreground">
                                        Score: {post.risk_score}/100
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <span
                                      className={cn(
                                        'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                                        isPos
                                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
                                          : isNeg
                                            ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20'
                                            : isPending
                                              ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20'
                                              : 'bg-muted text-muted-foreground border border-border'
                                      )}
                                    >
                                      {isPending ? 'Pending Analysis' : post.sentiment}
                                    </span>
                                    {post.stance && (
                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-muted text-muted-foreground">
                                        Stance: {post.stance}
                                      </span>
                                    )}
                                  </>
                                )}

                                <span className="text-[10px] text-muted-foreground tabular-nums">
                                  {formatWhen(post.posted_at || post.fetched_at)}
                                </span>
                              </div>
                            </div>

                            {/* Text */}
                            <p className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed line-clamp-4">
                              {post.text || 'No text content'}
                            </p>

                            {/* English translation if available */}
                            {post.english_text && post.english_text !== post.text && (
                              <div className="p-2 rounded bg-muted/30 border border-border/40 text-[11px] text-muted-foreground italic">
                                <span className="font-semibold text-foreground not-italic">Translated: </span>
                                {post.english_text}
                              </div>
                            )}

                            {post.url && (
                              <div className="flex justify-end pt-1">
                                <a
                                  href={post.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[10px] text-primary font-medium hover:underline inline-flex items-center gap-0.5"
                                >
                                  Open Original Post <ExternalLink className="h-2.5 w-2.5" />
                                </a>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

/* ══════════════════════════════════════════════════════════════
   1. EXECUTIVE OVERVIEW TAB
   ══════════════════════════════════════════════════════════════ */
const AllTab = ({ data, onGoTab, range, platform }) => {
  const [modalState, setModalState] = useState(null);
  if (!data) return null;
  const { kpis = {}, stance_stats = {}, sentiment_stats = {}, risk_stats = {}, platforms = [] } = data;

  return (
    <div className="space-y-3.5 animate-in fade-in-50 duration-200">
      {/* Top 3-Level Metrics Standard Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StanceMatrixCard
          stats={stance_stats}
          title="Global Stance Index"
          subtitle="Overall public stance toward authority"
          onViewDetail={(dim, filt) =>
            setModalState({
              id: 'all',
              name: 'All Monitored Events',
              dimension: dim || 'stance',
              filter: filt || 'all',
            })
          }
        />
        <SentimentMatrixCard
          stats={sentiment_stats}
          title="Global Sentiment Valence"
          subtitle="Cross-domain sentiment breakdown"
          onViewDetail={(dim, filt) =>
            setModalState({
              id: 'all',
              name: 'All Monitored Events',
              dimension: dim || 'sentiment',
              filter: filt || 'all',
            })
          }
        />
        <RiskMatrixCard
          stats={risk_stats}
          title="Global Threat Profile"
          subtitle="High, medium and low risk distribution"
          onViewDetail={(dim, filt) =>
            setModalState({
              id: 'all',
              name: 'All Monitored Events',
              dimension: dim || 'risk',
              filter: filt || 'all',
            })
          }
        />
      </div>

      {/* Cross-Domain 4 Operational Counters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div
          onClick={() => onGoTab('events')}
          className="p-3 rounded-xl border border-border/70 bg-card/90 shadow-xs hover:border-primary/50 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Monitored Events</span>
            <div className="h-7 w-7 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <CalendarDays className="h-3.5 w-3.5" />
            </div>
          </div>
          <p className="text-xl font-extrabold text-foreground tabular-nums mt-1">{data.events?.total || 0}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center justify-between">
            <span>{data.events?.by_status?.started || 0} active tracking</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors" />
          </p>
        </div>

        <div
          onClick={() => onGoTab('alerts')}
          className="p-3 rounded-xl border border-border/70 bg-card/90 shadow-xs hover:border-red-500/50 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Active Threat Alerts</span>
            <div className="h-7 w-7 rounded-lg bg-red-500/10 text-red-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <AlertTriangle className="h-3.5 w-3.5" />
            </div>
          </div>
          <p className="text-xl font-extrabold text-red-600 dark:text-red-400 tabular-nums mt-1">{kpis.unread_alerts || 0}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center justify-between">
            <span>{data.alerts?.critical_or_high || 0} high priority</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:text-red-500 transition-colors" />
          </p>
        </div>

        <div
          onClick={() => onGoTab('grievances')}
          className="p-3 rounded-xl border border-border/70 bg-card/90 shadow-xs hover:border-amber-500/50 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Citizen Grievances</span>
            <div className="h-7 w-7 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <MessageSquare className="h-3.5 w-3.5" />
            </div>
          </div>
          <p className="text-xl font-extrabold text-foreground tabular-nums mt-1">{data.grievances?.total || 0}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center justify-between">
            <span>{data.grievances?.resolution_rate ?? 0}% resolved</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:text-amber-500 transition-colors" />
          </p>
        </div>

        <div
          onClick={() => onGoTab('profiles')}
          className="p-3 rounded-xl border border-border/70 bg-card/90 shadow-xs hover:border-emerald-500/50 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tracked Target Profiles</span>
            <div className="h-7 w-7 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Users className="h-3.5 w-3.5" />
            </div>
          </div>
          <p className="text-xl font-extrabold text-foreground tabular-nums mt-1">{kpis.accounts_total || 0}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center justify-between">
            <span>{kpis.posts_in_range || 0} posts ingested</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:text-emerald-500 transition-colors" />
          </p>
        </div>
      </div>

      {/* Mid Row: Ingestion Velocity & Platform Share */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2">
          <SectionCard title="Telemetry Discovery Velocity" subtitle="Daily rate of posts and items analyzed across all sources">
            <CompactTrendChart data={data.daily_ingestion || data.trend} height={190} color="#3b82f6" label="Ingestion Count" />
          </SectionCard>
        </div>

        <div>
          <SectionCard
            title="Platform Ingestion Distribution"
            subtitle="Telemetry share by social network"
            badge={
              platforms && platforms.length > 0
                ? `${platforms.reduce((s, x) => s + (x.posts_count || 0), 0).toLocaleString()} Total`
                : undefined
            }
          >
            <div className="space-y-2 pt-1">
              {platforms && platforms.length > 0 ? (
                platforms.map((p) => {
                  const Icon = getPlatformIcon(p.slug);
                  const totalPosts = platforms.reduce((s, x) => s + (x.posts_count || 0), 0);
                  const pct = totalPosts > 0 ? (((p.posts_count || 0) / totalPosts) * 100).toFixed(1) : 0;

                  const isX = p.slug === 'x' || p.slug === 'twitter';
                  const isFb = p.slug === 'facebook';
                  const isYt = p.slug === 'youtube';
                  const isIg = p.slug === 'instagram';
                  const isTg = p.slug === 'telegram';

                  const barColor = isX
                    ? 'bg-zinc-800 dark:bg-zinc-200'
                    : isFb
                    ? 'bg-blue-600'
                    : isYt
                    ? 'bg-red-600'
                    : isIg
                    ? 'bg-gradient-to-r from-purple-500 via-pink-500 to-amber-500'
                    : isTg
                    ? 'bg-sky-500'
                    : 'bg-primary';

                  const badgeColor = isX
                    ? 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200'
                    : isFb
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                    : isYt
                    ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                    : isIg
                    ? 'bg-pink-50 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300'
                    : isTg
                    ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300'
                    : 'bg-muted text-muted-foreground';

                  return (
                    <div key={p.slug} className="p-2.5 rounded-lg bg-card border border-border/50 shadow-2xs hover:border-border transition-colors">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="flex items-center gap-1.5 font-semibold text-foreground">
                          <span className={cn('p-1 rounded-md', badgeColor)}>
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          {getPlatformLabel(p.slug)}
                        </span>
                        <span className="font-bold tabular-nums text-foreground flex items-center gap-1.5">
                          <span>{(p.posts_count || 0).toLocaleString()}</span>
                          <span className="text-[11px] font-medium text-muted-foreground">({pct}%)</span>
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-muted/60 rounded-full overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all duration-500', barColor)}
                          style={{ width: `${Math.min(100, Math.max(Number(pct) || 0, (p.posts_count > 0 ? 3 : 0)))}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-muted-foreground text-center py-6">No platform activity recorded</p>
              )}
            </div>
          </SectionCard>
        </div>
      </div>

      {/* Global Intelligence Modal */}
      {modalState && (
        <EventIntelligenceModal
          eventId={modalState.id}
          eventName={modalState.name}
          isOpen={Boolean(modalState)}
          onClose={() => setModalState(null)}
          initialDimension={modalState.dimension}
          initialFilter={modalState.filter}
          range={range}
          platform={platform}
        />
      )}
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════
   2. EVENTS & KEYWORD PROBES TAB
   ══════════════════════════════════════════════════════════════ */
const EventsTab = ({ data, selectedEventId, onSelectEvent, range, platform }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [modalState, setModalState] = useState(null); // { id, name, dimension, filter }
  const [keywordDialogEvent, setKeywordDialogEvent] = useState(null);

  if (!data) return null;
  const {
    events_list = [],
    stance_stats = {},
    sentiment_stats = {},
    risk_stats = {},
    total = 0,
    total_discovered_media = 0,
    by_status = {},
    content_by_platform = {},
    trend = [],
  } = data;

  const selectedEventObj = useMemo(() => {
    if (!selectedEventId || selectedEventId === 'all') return null;
    return events_list.find((e) => String(e.id) === String(selectedEventId));
  }, [events_list, selectedEventId]);

  const filteredEvents = useMemo(() => {
    let list = events_list;
    if (selectedEventId && selectedEventId !== 'all') {
      list = list.filter((e) => String(e.id) === String(selectedEventId));
    }
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      list = list.filter((e) =>
        e.name.toLowerCase().includes(s) ||
        (e.location && e.location.toLowerCase().includes(s))
      );
    }
    return list;
  }, [events_list, selectedEventId, searchTerm]);

  // Dynamically update the count shown in header based on current selection
  const dynamicMediaCount = selectedEventObj ? selectedEventObj.media_count : total_discovered_media;

  return (
    <div className="space-y-3.5 animate-in fade-in-50 duration-200">
      {/* Events Selector Header Bar */}
      <div className="p-3 rounded-xl border border-border/70 bg-card/90 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 text-primary" />
            Active Scope:
          </span>
          <Select value={String(selectedEventId || 'all')} onValueChange={onSelectEvent}>
            <SelectTrigger className="h-8 text-xs font-semibold w-[280px] bg-background border-border">
              <SelectValue placeholder="All Monitored Events" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs font-semibold">
                All Monitored Events ({events_list.length})
              </SelectItem>
              {events_list.map((e) => (
                <SelectItem key={e.id} value={String(e.id)} className="text-xs">
                  <span className="truncate max-w-[240px] inline-block font-medium">{e.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedEventObj && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSelectEvent('all')}
              className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1 px-2"
            >
              <X className="h-3.5 w-3.5" /> Clear Scope
            </Button>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs">
          <span className="text-muted-foreground">
            Total Events: <strong className="text-foreground">{selectedEventObj ? `1 (${total} Total)` : total}</strong>
          </span>
          <span className="text-muted-foreground">
            Discovered Media: <strong className="text-primary">{dynamicMediaCount}</strong>
          </span>
          <span className="text-muted-foreground">
            Active Probes: <strong className="text-emerald-600">{by_status.started || 0}</strong>
          </span>
        </div>
      </div>

      {/* 3-Level Stance, Sentiment & Risk Row (Selected Event or Overall) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StanceMatrixCard
          stats={selectedEventObj ? selectedEventObj.stance_stats : stance_stats}
          title={selectedEventObj ? `Stance: ${selectedEventObj.name}` : 'Events Stance Index'}
          subtitle="Favourable vs unfavourable public stance"
          onViewDetail={(dim, filt) =>
            setModalState({
              id: selectedEventObj?.id || 'all',
              name: selectedEventObj?.name || 'All Monitored Events',
              dimension: dim || 'stance',
              filter: filt || 'all',
            })
          }
        />
        <SentimentMatrixCard
          stats={selectedEventObj ? selectedEventObj.sentiment_stats : sentiment_stats}
          title={selectedEventObj ? `Sentiment: ${selectedEventObj.name}` : 'Narrative Sentiment'}
          subtitle="Positive, neutral and negative emotional tone"
          onViewDetail={(dim, filt) =>
            setModalState({
              id: selectedEventObj?.id || 'all',
              name: selectedEventObj?.name || 'All Monitored Events',
              dimension: dim || 'sentiment',
              filter: filt || 'all',
            })
          }
        />
        <RiskMatrixCard
          stats={selectedEventObj ? selectedEventObj.risk_stats : risk_stats}
          title={selectedEventObj ? `Risk: ${selectedEventObj.name}` : 'Event Risk Classification'}
          subtitle="Severity distribution of analyzed media"
          onViewDetail={(dim, filt) =>
            setModalState({
              id: selectedEventObj?.id || 'all',
              name: selectedEventObj?.name || 'All Monitored Events',
              dimension: dim || 'risk',
              filter: filt || 'all',
            })
          }
        />
      </div>

      {/* Events Discovery Velocity Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2">
          <SectionCard title="Event Content Discovery Timeline" subtitle="Daily velocity of media items collected">
            <CompactTrendChart data={trend} height={180} color="#06b6d4" label="Discovered Media" />
          </SectionCard>
        </div>

        <div>
          <SectionCard title="Discovered Content by Platform" subtitle="Volume of media collected per network">
            <div className="space-y-2 pt-1">
              {Object.entries(content_by_platform).map(([slug, count]) => {
                const Icon = getPlatformIcon(slug);
                const sum = Object.values(content_by_platform).reduce((a, b) => a + b, 0);
                const pct = sum > 0 ? ((count / sum) * 100).toFixed(1) : 0;
                return (
                  <div key={slug} className="p-2 rounded-lg bg-muted/20 border border-border/40">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="flex items-center gap-1.5 font-medium text-foreground">
                        <Icon className="h-3.5 w-3.5" />
                        {getPlatformLabel(slug)}
                      </span>
                      <span className="font-bold tabular-nums text-foreground">{count} ({pct}%)</span>
                    </div>
                    <Progress value={Number(pct)} className="h-1.5" />
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </div>
      </div>

      {/* Per-Event Breakdown Analytics Table */}
      <SectionCard
        title="Individual Events Analytics Matrix"
        subtitle="Stance percentages, sentiment, risk levels and media discovery share per event"
        badge={`${filteredEvents.length} Event${filteredEvents.length === 1 ? '' : 's'}`}
        action={
          <div className="relative w-48 sm:w-64">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search event name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-7 pl-8 text-xs bg-background"
            />
          </div>
        }
      >
        <div className="overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-muted/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border/60">
              <tr>
                <th className="p-2.5">Event Name</th>
                <th className="p-2.5 text-center">Status</th>
                <th className="p-2.5 text-right">Media Count</th>
                <th className="p-2.5 text-right">% Share</th>
                <th className="p-2.5 text-center min-w-[140px]">Stance (Fav vs Unfav)</th>
                <th className="p-2.5 text-center min-w-[130px]">Sentiment</th>
                <th className="p-2.5 text-center">Risk</th>
                <th className="p-2.5 text-center">Platforms</th>
                <th className="p-2.5 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-xs text-muted-foreground">
                    No matching monitored events found
                  </td>
                </tr>
              ) : (
                filteredEvents.map((ev) => {
                  const isSelected = String(selectedEventId) === String(ev.id);
                  const isLive = ev.monitoring_status === 'started';
                  const favPct = ev.stance_stats?.favourable_pct || 0;
                  const unfavPct = ev.stance_stats?.unfavourable_pct || 0;
                  const posPct = ev.sentiment_stats?.positive_pct || 0;
                  const negPct = ev.sentiment_stats?.negative_pct || 0;
                  const neuPct = ev.sentiment_stats?.neutral_pct || 0;

                  return (
                    <tr
                      key={ev.id}
                      className={cn(
                        'transition-colors hover:bg-muted/30',
                        isSelected && 'bg-primary/5 font-semibold'
                      )}
                    >
                      <td className="p-2.5 max-w-[220px]">
                        <p className="font-semibold text-foreground truncate">{ev.name}</p>
                        {ev.location && (
                          <p className="text-[10px] text-muted-foreground truncate">{ev.location}</p>
                        )}
                      </td>
                      <td className="p-2.5 text-center">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold',
                            isLive
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
                              : 'bg-muted text-muted-foreground border border-border'
                          )}
                        >
                          <span className={cn('h-1.5 w-1.5 rounded-full', isLive ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground')} />
                          {isLive ? 'Live' : 'Stopped'}
                        </span>
                      </td>
                      <td className="p-2.5 text-right font-bold tabular-nums text-foreground">
                        {ev.media_count}
                      </td>
                      <td className="p-2.5 text-right font-semibold tabular-nums text-muted-foreground">
                        {ev.media_percentage}%
                      </td>
                      <td className="p-2.5">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[9px] font-semibold">
                            <span className="text-emerald-600">{favPct}% Fav</span>
                            <span className="text-rose-600">{unfavPct}% Unfav</span>
                          </div>
                          <div className="h-2 w-full bg-muted/60 rounded-full overflow-hidden flex" title={`🟢 Favourable: ${favPct}% | ⚪ Neutral: ${Math.max(0, 100 - favPct - unfavPct)}% | 🔴 Unfavourable: ${unfavPct}%`}>
                            <div className="bg-emerald-500 h-full" style={{ width: `${favPct}%` }} />
                            <div className="bg-slate-300 dark:bg-slate-600 h-full" style={{ width: `${Math.max(0, 100 - favPct - unfavPct)}%` }} />
                            <div className="bg-rose-500 h-full" style={{ width: `${unfavPct}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="p-2.5">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[9px] font-semibold">
                            <span className="text-emerald-600">{posPct}% Pos</span>
                            <span className="text-sky-600 dark:text-sky-400">{neuPct}% Neu</span>
                            <span className="text-rose-600">{negPct}% Neg</span>
                          </div>
                          <div className="h-2 w-full bg-muted/60 rounded-full overflow-hidden flex" title={`🟢 Positive: ${posPct}% | 🔵 Neutral (News): ${neuPct}% | 🔴 Negative: ${negPct}%`}>
                            <div className="bg-emerald-500 h-full" style={{ width: `${posPct}%` }} />
                            <div className="bg-sky-400 h-full" style={{ width: `${neuPct}%` }} />
                            <div className="bg-rose-500 h-full" style={{ width: `${negPct}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="p-2.5 text-center">
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded-full text-[10px] font-bold',
                            (ev.risk_stats?.high || 0) > 0
                              ? 'bg-red-500/10 text-red-600 border border-red-500/20'
                              : (ev.risk_stats?.medium || 0) > 0
                                ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                                : 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                          )}
                        >
                          {(ev.risk_stats?.high || 0) > 0 ? 'High' : (ev.risk_stats?.medium || 0) > 0 ? 'Med' : 'Low'}
                        </span>
                      </td>
                      <td className="p-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {ev.platforms?.map((p) => {
                            const Icon = getPlatformIcon(p);
                            return <Icon key={p} className="h-3 w-3 text-muted-foreground" title={p} />;
                          })}
                        </div>
                      </td>
                      <td className="p-2.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6.5 text-[10px] px-2 gap-1 font-semibold text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800 shadow-2xs"
                            onClick={() => setKeywordDialogEvent({ id: ev.id, name: ev.name })}
                            title="Open Keyword Analytics & Graphs for this event"
                          >
                            <TrendingUp className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
                            Keywords
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6.5 text-[10px] px-2 gap-1 font-semibold hover:bg-primary hover:text-primary-foreground transition-all"
                            onClick={() => setModalState({ id: ev.id, name: ev.name, dimension: 'all', filter: 'all' })}
                          >
                            <Eye className="h-3 w-3" /> Profile
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Keyword Analysis Dialog */}
      {keywordDialogEvent && (
        <KeywordAnalysisDialog
          open={Boolean(keywordDialogEvent)}
          onOpenChange={(open) => { if (!open) setKeywordDialogEvent(null); }}
          eventId={keywordDialogEvent.id}
          eventName={keywordDialogEvent.name}
        />
      )}

      {/* Event Intelligence Modal */}
      {modalState && (
        <EventIntelligenceModal
          eventId={modalState.id}
          eventName={modalState.name}
          isOpen={Boolean(modalState)}
          onClose={() => setModalState(null)}
          initialDimension={modalState.dimension}
          initialFilter={modalState.filter}
          range={range}
          platform={platform}
        />
      )}
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════
   3. THREAT ALERTS & RISK TAB
   ══════════════════════════════════════════════════════════════ */
const AlertsTab = ({ data }) => {
  if (!data) return null;
  const {
    total = 0,
    risk_stats = {},
    sentiment_stats = {},
    by_status = {},
    by_platform = {},
    trend = [],
    recent_threats = [],
  } = data;

  return (
    <div className="space-y-3.5 animate-in fade-in-50 duration-200">
      {/* 3-Level Threat Risk Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <RiskMatrixCard stats={risk_stats} title="Threat Risk Breakdown" subtitle="Critical, medium and low severity alerts" />
        <SentimentMatrixCard stats={sentiment_stats} title="Alert Sentiment Valence" subtitle="Tone of triggering threat intelligence" />
        <Card className="border-border/70 bg-card/90 shadow-xs rounded-xl overflow-hidden backdrop-blur-xs">
          <CardContent className="p-3.5 sm:p-4">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <Flame className="h-3.5 w-3.5 text-red-500" />
                  Resolution Workflow
                </h3>
                <p className="text-[10px] text-muted-foreground mt-0.5">Threat lifecycle status</p>
              </div>
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                {total} Total Alerts
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="p-2 rounded-lg bg-red-500/5 border border-red-500/20">
                <p className="text-[9px] font-bold uppercase text-red-700 dark:text-red-300">Active / New</p>
                <p className="text-lg font-extrabold text-red-600 dark:text-red-400 tabular-nums">
                  {(by_status.active || 0) + (by_status.new || 0)}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
                <p className="text-[9px] font-bold uppercase text-amber-700 dark:text-amber-300">Escalated</p>
                <p className="text-lg font-extrabold text-amber-600 dark:text-amber-400 tabular-nums">
                  {by_status.escalated || 0}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-blue-500/5 border border-blue-500/20">
                <p className="text-[9px] font-bold uppercase text-blue-700 dark:text-blue-300">Acknowledged</p>
                <p className="text-lg font-extrabold text-blue-600 dark:text-blue-400 tabular-nums">
                  {by_status.acknowledged || 0}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                <p className="text-[9px] font-bold uppercase text-emerald-700 dark:text-emerald-300">Resolved</p>
                <p className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {(by_status.resolved || 0) + (by_status.closed || 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Mid Row: Timeline & Platform */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2">
          <SectionCard title="Threat Velocity Timeline" subtitle="Frequency of threat detections in selected period">
            <CompactTrendChart data={trend} height={180} color="#ef4444" label="Alerts Count" />
          </SectionCard>
        </div>

        <div>
          <SectionCard title="Alerts by Social Network" subtitle="Platform threat distribution">
            <div className="space-y-2 pt-1">
              {Object.entries(by_platform).map(([slug, count]) => {
                const Icon = getPlatformIcon(slug);
                const sum = Object.values(by_platform).reduce((a, b) => a + b, 0);
                const pct = sum > 0 ? ((count / sum) * 100).toFixed(1) : 0;
                return (
                  <div key={slug} className="p-2 rounded-lg bg-muted/20 border border-border/40">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="flex items-center gap-1.5 font-medium text-foreground">
                        <Icon className="h-3.5 w-3.5" />
                        {getPlatformLabel(slug)}
                      </span>
                      <span className="font-bold tabular-nums text-foreground">{count} ({pct}%)</span>
                    </div>
                    <Progress value={Number(pct)} className="h-1.5" />
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </div>
      </div>

      {/* High-Risk Recent Threats Feed */}
      <SectionCard
        title="High-Priority Threat Incident Feed"
        subtitle="Critical and high severity items requiring surveillance intervention"
        badge={`${recent_threats.length} Incidents`}
        action={
          <Button asChild variant="outline" size="sm" className="h-7 text-xs font-semibold">
            <Link to="/alerts">
              View All Alerts <ExternalLink className="h-3 w-3 ml-1" />
            </Link>
          </Button>
        }
      >
        <div className="overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-muted/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border/60">
              <tr>
                <th className="p-2.5">Severity</th>
                <th className="p-2.5">Incident Title</th>
                <th className="p-2.5">Author / Handle</th>
                <th className="p-2.5 text-center">Platform</th>
                <th className="p-2.5 text-center">Score</th>
                <th className="p-2.5 text-center">Status</th>
                <th className="p-2.5 text-right">Detected At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {recent_threats.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-xs text-muted-foreground">
                    No critical or high-risk incidents recorded in this timeframe
                  </td>
                </tr>
              ) : (
                recent_threats.map((t) => {
                  const Icon = getPlatformIcon(t.platform);
                  return (
                    <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-2.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-red-500/10 text-red-600 border border-red-500/20">
                          {t.risk_level}
                        </span>
                      </td>
                      <td className="p-2.5 max-w-[320px]">
                        <p className="font-semibold text-foreground truncate">{t.title}</p>
                        {t.description && (
                          <p className="text-[10px] text-muted-foreground truncate">{t.description}</p>
                        )}
                      </td>
                      <td className="p-2.5 text-muted-foreground">
                        {t.author || t.author_handle || 'Unknown'}
                      </td>
                      <td className="p-2.5 text-center">
                        <span className="inline-flex items-center gap-1 font-medium text-foreground">
                          <Icon className="h-3 w-3" />
                          <span className="capitalize text-[11px]">{t.platform}</span>
                        </span>
                      </td>
                      <td className="p-2.5 text-center font-bold text-red-600 tabular-nums">
                        {t.risk_score}
                      </td>
                      <td className="p-2.5 text-center capitalize text-[11px] font-medium text-muted-foreground">
                        {t.status}
                      </td>
                      <td className="p-2.5 text-right text-muted-foreground text-[11px] tabular-nums">
                        {formatWhen(t.created_at)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════
   4. CITIZEN GRIEVANCES TAB
   ══════════════════════════════════════════════════════════════ */
const GrievancesTab = ({ data }) => {
  if (!data) return null;
  const {
    total = 0,
    resolved_count = 0,
    resolution_rate = 0,
    by_workflow = {},
    by_classification = {},
    reports = {},
    trend = [],
  } = data;

  return (
    <div className="space-y-3.5 animate-in fade-in-50 duration-200">
      {/* Top Grievance Status KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div className="p-3 rounded-xl border border-border/70 bg-card/90 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total Grievances</p>
          <p className="text-xl font-extrabold text-foreground tabular-nums mt-1">{total}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Detected in scope</p>
        </div>
        <div className="p-3 rounded-xl border border-border/70 bg-card/90 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Resolution Rate</p>
          <p className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums mt-1">{resolution_rate}%</p>
          <p className="text-[10px] text-emerald-600 mt-0.5">{resolved_count} resolved cases</p>
        </div>
        <div className="p-3 rounded-xl border border-border/70 bg-card/90 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">In Progress</p>
          <p className="text-xl font-extrabold text-blue-600 dark:text-blue-400 tabular-nums mt-1">
            {by_workflow['in_progress'] || by_workflow['investigating'] || 0}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Under departmental action</p>
        </div>
        <div className="p-3 rounded-xl border border-border/70 bg-card/90 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Escalated / Pending</p>
          <p className="text-xl font-extrabold text-amber-600 dark:text-amber-400 tabular-nums mt-1">
            {(by_workflow['received'] || 0) + (by_workflow['escalated'] || 0)}
          </p>
          <p className="text-[10px] text-amber-600 mt-0.5">Awaiting resolution</p>
        </div>
      </div>

      {/* Mid Row: Classification & Intake Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2">
          <SectionCard title="Citizen Grievance Inflow Timeline" subtitle="Daily rate of mentions and grievances detected">
            <CompactTrendChart data={trend} height={180} color="#f59e0b" label="Grievances" />
          </SectionCard>
        </div>

        <div>
          <SectionCard title="Grievance Classification" subtitle="Category breakdown of citizen complaints">
            <div className="space-y-2 pt-1 max-h-[220px] overflow-y-auto">
              {Object.entries(by_classification).length > 0 ? (
                Object.entries(by_classification).map(([cat, count]) => {
                  const pct = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
                  return (
                    <div key={cat} className="p-2 rounded-lg bg-muted/20 border border-border/40">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="capitalize font-medium text-foreground">{cat}</span>
                        <span className="font-bold tabular-nums text-foreground">{count} ({pct}%)</span>
                      </div>
                      <Progress value={Number(pct)} className="h-1.5" />
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-muted-foreground text-center py-6">No grievances classified yet</p>
              )}
            </div>
          </SectionCard>
        </div>
      </div>

      {/* Reports Generation Summary (G, S, C, Q reports) */}
      <SectionCard title="Official Grievance Reports Generated" subtitle="Dossiers and action reports dispatched">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-3 rounded-lg bg-muted/20 border border-border/40 text-center">
            <p className="text-[10px] font-bold uppercase text-muted-foreground">General (G) Reports</p>
            <p className="text-lg font-extrabold text-foreground tabular-nums mt-0.5">{reports.G || 0}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/20 border border-border/40 text-center">
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Social (S) Reports</p>
            <p className="text-lg font-extrabold text-foreground tabular-nums mt-0.5">{reports.S || 0}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/20 border border-border/40 text-center">
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Critical (C) Reports</p>
            <p className="text-lg font-extrabold text-foreground tabular-nums mt-0.5">{reports.C || 0}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/20 border border-border/40 text-center">
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Quick (Q) Reports</p>
            <p className="text-lg font-extrabold text-foreground tabular-nums mt-0.5">{reports.Q || 0}</p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════
   5. TARGET PROFILES INTELLIGENCE TAB
   ══════════════════════════════════════════════════════════════ */
const ProfilesTab = ({ data }) => {
  const [searchTerm, setSearchTerm] = useState('');

  if (!data) return null;
  const {
    total = 0,
    active = 0,
    paused = 0,
    total_posts_fetched = 0,
    stance_stats = {},
    sentiment_stats = {},
    profiles = [],
    trend = [],
    content_by_platform = {},
  } = data;

  const filteredProfiles = useMemo(() => {
    if (!searchTerm) return profiles;
    const s = searchTerm.toLowerCase();
    return profiles.filter((p) =>
      (p.display_name && p.display_name.toLowerCase().includes(s)) ||
      (p.handles && p.handles.some((h) => h.toLowerCase().includes(s)))
    );
  }, [profiles, searchTerm]);

  return (
    <div className="space-y-3.5 animate-in fade-in-50 duration-200">
      {/* 3-Level Stance & Sentiment across all Target Profiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StanceMatrixCard
          stats={stance_stats}
          title="Profiles Stance Index"
          subtitle="Aggregated stance across all monitored personas"
        />
        <SentimentMatrixCard
          stats={sentiment_stats}
          title="Target Persona Sentiment"
          subtitle="Emotional tone of published content"
        />
        <Card className="border-border/70 bg-card/90 shadow-xs rounded-xl overflow-hidden backdrop-blur-xs">
          <CardContent className="p-3.5 sm:p-4">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <Contact2 className="h-3.5 w-3.5 text-primary" />
                  Surveillance Scope
                </h3>
                <p className="text-[10px] text-muted-foreground mt-0.5">Tracked accounts & activity</p>
              </div>
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                {total} Personas
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                <p className="text-[9px] font-bold uppercase text-emerald-700 dark:text-emerald-300">Active Live</p>
                <p className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">{active}</p>
                <p className="text-[9px] text-muted-foreground">Accounts</p>
              </div>
              <div className="p-2 rounded-lg bg-muted/40 border border-border/40">
                <p className="text-[9px] font-bold uppercase text-muted-foreground">Paused</p>
                <p className="text-lg font-extrabold text-muted-foreground tabular-nums">{paused}</p>
                <p className="text-[9px] text-muted-foreground">Accounts</p>
              </div>
              <div className="p-2 rounded-lg bg-primary/5 border border-primary/20 col-span-2">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-bold uppercase text-primary">Total Ingested Posts</span>
                  <span className="text-sm font-extrabold text-primary tabular-nums">{total_posts_fetched}</span>
                </div>
                <p className="text-[9px] text-muted-foreground mt-0.5">Across all platform networks in timeframe</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Post Ingestion Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2">
          <SectionCard title="Target Profiles Content Velocity" subtitle="Daily timeline of posts captured">
            <CompactTrendChart data={trend} height={180} color="#8b5cf6" label="Ingested Posts" />
          </SectionCard>
        </div>

        <div>
          <SectionCard title="Captured Posts by Platform" subtitle="Volume ingested per network">
            <div className="space-y-2 pt-1">
              {Object.entries(content_by_platform).map(([slug, count]) => {
                const Icon = getPlatformIcon(slug);
                const sum = Object.values(content_by_platform).reduce((a, b) => a + b, 0);
                const pct = sum > 0 ? ((count / sum) * 100).toFixed(1) : 0;
                return (
                  <div key={slug} className="p-2 rounded-lg bg-muted/20 border border-border/40">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="flex items-center gap-1.5 font-medium text-foreground">
                        <Icon className="h-3.5 w-3.5" />
                        {getPlatformLabel(slug)}
                      </span>
                      <span className="font-bold tabular-nums text-foreground">{count} ({pct}%)</span>
                    </div>
                    <Progress value={Number(pct)} className="h-1.5" />
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </div>
      </div>

      {/* Target Profiles Complete Intelligence Table */}
      <SectionCard
        title="Target Profiles Ingestion & Threat Ranking Table"
        subtitle="Post ingestion volume, percentage share of total tracked posts, alert counts, and 3-level stance & sentiment per persona"
        badge={`${filteredProfiles.length} Profiles`}
        action={
          <div className="relative w-48 sm:w-64">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search profile or handle..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-7 pl-8 text-xs bg-background"
            />
          </div>
        }
      >
        <div className="overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-muted/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border/60">
              <tr>
                <th className="p-2.5">Persona / Handle</th>
                <th className="p-2.5 text-center">Status</th>
                <th className="p-2.5 text-center">Platforms</th>
                <th className="p-2.5 text-right">Posts Ingested</th>
                <th className="p-2.5 text-right min-w-[110px]">% of Total Posts</th>
                <th className="p-2.5 text-center">Threat Alerts</th>
                <th className="p-2.5 text-center min-w-[130px]">Stance (Fav vs Unfav)</th>
                <th className="p-2.5 text-center min-w-[120px]">Sentiment</th>
                <th className="p-2.5 text-center">Relevance Score</th>
                <th className="p-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filteredProfiles.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-6 text-center text-xs text-muted-foreground">
                    No matching target personas found
                  </td>
                </tr>
              ) : (
                filteredProfiles.map((p) => {
                  const isLive = p.monitoring === 'started';
                  const favPct = p.stance_stats?.favourable_pct || 0;
                  const unfavPct = p.stance_stats?.unfavourable_pct || 0;
                  const posPct = p.sentiment_stats?.positive_pct || 0;
                  const negPct = p.sentiment_stats?.negative_pct || 0;
                  const neuPct = p.sentiment_stats?.neutral_pct || 0;

                  return (
                    <tr key={p.profile_id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-2.5 max-w-[200px]">
                        <p className="font-semibold text-foreground truncate">{p.display_name}</p>
                        {p.handles && p.handles.length > 0 && (
                          <p className="text-[10px] text-muted-foreground truncate">
                            @{p.handles[0]} {p.handles.length > 1 ? `+${p.handles.length - 1}` : ''}
                          </p>
                        )}
                      </td>
                      <td className="p-2.5 text-center">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold',
                            isLive
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
                              : 'bg-muted text-muted-foreground border border-border'
                          )}
                        >
                          <span className={cn('h-1.5 w-1.5 rounded-full', isLive ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground')} />
                          {isLive ? 'Live' : 'Stopped'}
                        </span>
                      </td>
                      <td className="p-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {p.platforms?.map((slug) => {
                            const Icon = getPlatformIcon(slug);
                            return <Icon key={slug} className="h-3 w-3 text-muted-foreground" title={slug} />;
                          })}
                        </div>
                      </td>
                      <td className="p-2.5 text-right font-bold tabular-nums text-foreground">
                        {p.posts_fetched}
                      </td>
                      {/* Post Percentage Share of Total Tracked Posts */}
                      <td className="p-2.5 text-right">
                        <div className="space-y-1">
                          <span className="font-bold tabular-nums text-primary text-[11px] block">
                            {p.post_percentage}%
                          </span>
                          <Progress value={p.post_percentage} className="h-1.5" />
                        </div>
                      </td>
                      <td className="p-2.5 text-center">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums',
                            p.alerts_high > 0
                              ? 'bg-red-500/10 text-red-600 border border-red-500/20'
                              : p.alerts_count > 0
                                ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                                : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {p.alerts_count}
                          {p.alerts_high > 0 && <span className="text-[8px] font-extrabold text-red-600">({p.alerts_high}H)</span>}
                        </span>
                      </td>
                      <td className="p-2.5">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[9px] font-bold">
                            <span className="text-emerald-600">{favPct}% Fav</span>
                            <span className="text-rose-600">{unfavPct}% Unfav</span>
                          </div>
                          <div className="h-1.5 w-full bg-muted/60 rounded-full overflow-hidden flex">
                            <div className="bg-emerald-500 h-full" style={{ width: `${favPct}%` }} />
                            <div className="bg-slate-300 dark:bg-slate-600 h-full" style={{ width: `${100 - favPct - unfavPct}%` }} />
                            <div className="bg-rose-500 h-full" style={{ width: `${unfavPct}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="p-2.5">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[9px] text-muted-foreground">
                            <span className="text-emerald-600 font-semibold">{posPct}%</span>
                            <span className="text-slate-500">{neuPct}%</span>
                            <span className="text-rose-600 font-semibold">{negPct}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-muted/60 rounded-full overflow-hidden flex">
                            <div className="bg-emerald-500 h-full" style={{ width: `${posPct}%` }} />
                            <div className="bg-slate-400 h-full" style={{ width: `${neuPct}%` }} />
                            <div className="bg-rose-500 h-full" style={{ width: `${negPct}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="p-2.5 text-center">
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums',
                            p.relevance_score >= 65
                              ? 'bg-red-500/10 text-red-600 border border-red-500/20'
                              : p.relevance_score >= 35
                                ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                                : 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                          )}
                        >
                          {p.relevance_score} / 100
                        </span>
                      </td>
                      <td className="p-2.5 text-right">
                        <Button asChild variant="ghost" size="sm" className="h-6 text-[11px] px-2 text-primary hover:text-primary">
                          <Link to={`/social-profiles/${p.account_id}`}>
                            View <ExternalLink className="h-2.5 w-2.5 ml-1" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════
   MAIN ANALYTICS HUB COMPONENT (Edge-to-Edge Full-Screen)
   ══════════════════════════════════════════════════════════════ */
const TAB_LOADERS = {
  all: analyticsHubApi.overview,
  events: analyticsHubApi.events,
  alerts: analyticsHubApi.alerts,
  grievances: analyticsHubApi.grievances,
  profiles: analyticsHubApi.profiles,
};

const AnalyticsHub = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = TAB_LOADERS[searchParams.get('tab')] ? searchParams.get('tab') : 'all';
  const [range, setRange] = useState('30d');
  const [platform, setPlatform] = useState('all');
  const [selectedEventId, setSelectedEventId] = useState('all');
  const [refreshInterval, setRefreshInterval] = useState('0');
  const [loading, setLoading] = useState(true);
  const [dataByTab, setDataByTab] = useState({});

  const { slugs: configuredSlugs = [] } = usePagePlatforms();

  useEffect(() => {
    if (platform !== 'all' && configuredSlugs.length > 0 && !configuredSlugs.includes(platform)) {
      setPlatform('all');
    }
  }, [configuredSlugs, platform]);

  const load = useCallback(async (tab, currentRange, currentPlatform, currentEventId) => {
    setLoading(true);
    try {
      const params = { range: currentRange };
      if (currentPlatform && currentPlatform !== 'all') {
        params.platform = currentPlatform;
      }
      if (tab === 'events' && currentEventId && currentEventId !== 'all') {
        params.event_id = currentEventId;
      }
      const res = await TAB_LOADERS[tab](params);
      setDataByTab((prev) => ({ ...prev, [tab]: res.data }));
    } catch (error) {
      toast.error(error.response?.data?.error || `Failed to load ${tab} analytics`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(activeTab, range, platform, selectedEventId);
  }, [activeTab, range, platform, selectedEventId, load]);

  // Auto-refresh timer
  useEffect(() => {
    const sec = parseInt(refreshInterval, 10);
    if (!sec || sec <= 0) return;
    const timer = setInterval(() => {
      load(activeTab, range, platform, selectedEventId);
    }, sec * 1000);
    return () => clearInterval(timer);
  }, [refreshInterval, activeTab, range, platform, selectedEventId, load]);

  const setTab = useCallback((value) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', value);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const currentData = dataByTab[activeTab];

  /* Export to PDF Dossier */
  const exportToPDF = useCallback(() => {
    if (!currentData) return;
    try {
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text('Cyber Intelligence Platform — Analytics Dossier', 14, 18);
      doc.setFontSize(9);
      doc.text(`Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (IST)`, 14, 25);
      doc.text(`Scope: ${activeTab.toUpperCase()} | Timeframe: ${range.toUpperCase()} | Platform: ${platform.toUpperCase()}`, 14, 31);

      if (activeTab === 'events' && currentData.events_list) {
        autoTable(doc, {
          startY: 38,
          head: [['Event Name', 'Status', 'Media Count', 'Favourable %', 'Unfavourable %', 'Risk Level']],
          body: currentData.events_list.map((e) => [
            e.name,
            e.monitoring_status,
            e.media_count,
            `${e.stance_stats?.favourable_pct || 0}%`,
            `${e.stance_stats?.unfavourable_pct || 0}%`,
            (e.risk_stats?.high || 0) > 0 ? 'High' : 'Low',
          ]),
        });
      } else if (activeTab === 'profiles' && currentData.profiles) {
        autoTable(doc, {
          startY: 38,
          head: [['Profile Name', 'Posts', '% of Total', 'Alerts', 'Favourable %', 'Score']],
          body: currentData.profiles.map((p) => [
            p.display_name,
            p.posts_fetched,
            `${p.post_percentage}%`,
            p.alerts_count,
            `${p.stance_stats?.favourable_pct || 0}%`,
            `${p.relevance_score}/100`,
          ]),
        });
      } else {
        autoTable(doc, {
          startY: 38,
          head: [['Metric', 'Value']],
          body: [
            ['Active Scope', activeTab],
            ['Timeframe', range],
            ['Platform', platform],
            ['Favourable Stance %', `${currentData.stance_stats?.favourable_pct || 0}%`],
            ['Unfavourable Stance %', `${currentData.stance_stats?.unfavourable_pct || 0}%`],
            ['Positive Sentiment %', `${currentData.sentiment_stats?.positive_pct || 0}%`],
            ['Negative Sentiment %', `${currentData.sentiment_stats?.negative_pct || 0}%`],
          ],
        });
      }

      doc.save(`analytics-dossier-${activeTab}-${range}.pdf`);
      toast.success('Analytics Dossier exported to PDF');
    } catch (e) {
      toast.error('Failed to export PDF');
    }
  }, [currentData, activeTab, range, platform]);

  /* Export to Excel */
  const exportToExcel = useCallback(() => {
    if (!currentData) return;
    try {
      const wb = XLSX.utils.book_new();
      if (activeTab === 'events' && Array.isArray(currentData.events_list)) {
        const rows = currentData.events_list.map((e) => ({
          Event: e.name,
          Status: e.monitoring_status,
          'Media Count': e.media_count,
          '% Share': e.media_percentage,
          'Favourable %': e.stance_stats?.favourable_pct || 0,
          'Unfavourable %': e.stance_stats?.unfavourable_pct || 0,
          'Positive %': e.sentiment_stats?.positive_pct || 0,
          'Negative %': e.sentiment_stats?.negative_pct || 0,
          'Risk High': e.risk_stats?.high || 0,
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, 'Events Analytics');
      } else if (activeTab === 'profiles' && Array.isArray(currentData.profiles)) {
        const rows = currentData.profiles.map((p) => ({
          Profile: p.display_name,
          Status: p.monitoring,
          'Posts Ingested': p.posts_fetched,
          '% of Total Posts': p.post_percentage,
          'Alerts Count': p.alerts_count,
          'Favourable %': p.stance_stats?.favourable_pct || 0,
          'Unfavourable %': p.stance_stats?.unfavourable_pct || 0,
          'Positive %': p.sentiment_stats?.positive_pct || 0,
          'Negative %': p.sentiment_stats?.negative_pct || 0,
          'Relevance Score': p.relevance_score,
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, 'Profiles Analytics');
      } else {
        const rows = [
          { Metric: 'Scope', Value: activeTab },
          { Metric: 'Range', Value: range },
          { Metric: 'Platform', Value: platform },
          { Metric: 'Favourable Stance %', Value: currentData.stance_stats?.favourable_pct || 0 },
          { Metric: 'Unfavourable Stance %', Value: currentData.stance_stats?.unfavourable_pct || 0 },
          { Metric: 'Positive Sentiment %', Value: currentData.sentiment_stats?.positive_pct || 0 },
          { Metric: 'Negative Sentiment %', Value: currentData.sentiment_stats?.negative_pct || 0 },
        ];
        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, 'Analytics Overview');
      }
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      saveAs(new Blob([wbout], { type: 'application/octet-stream' }), `analytics-${activeTab}-${range}.xlsx`);
      toast.success('Excel file exported');
    } catch (e) {
      toast.error('Failed to export Excel');
    }
  }, [currentData, activeTab, range, platform]);

  const tabContent = useMemo(() => {
    switch (activeTab) {
      case 'events':
        return (
          <EventsTab
            data={currentData}
            selectedEventId={selectedEventId}
            onSelectEvent={setSelectedEventId}
            range={range}
            platform={platform}
          />
        );
      case 'alerts':
        return <AlertsTab data={currentData} />;
      case 'grievances':
        return <GrievancesTab data={currentData} />;
      case 'profiles':
        return <ProfilesTab data={currentData} />;
      default:
        return <AllTab data={currentData} onGoTab={setTab} range={range} platform={platform} />;
    }
  }, [activeTab, currentData, selectedEventId, range, platform, setTab]);

  return (
    <div className="flex min-h-full flex-col gap-2.5 w-full">
      {/* Title row — matching Profile Catalog & Events standard layout */}
      <div className="flex flex-wrap items-center justify-between gap-x-2.5 gap-y-2 shrink-0">
        <div className="min-w-0 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-heading font-bold tracking-tight leading-none text-foreground">
              Analytics Hub
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Telemetry
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 hidden sm:block">
            Public opinion, stance, sentiment & risk analytics across monitored channels
          </p>
        </div>

        {/* Global Toolbar Filters */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap ml-auto">
          {/* Platform Filter */}
          <Select value={platform} onValueChange={setPlatform}>
            <SelectTrigger className="h-8 text-xs font-medium w-[135px] bg-card border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">
                <span className="flex items-center gap-1.5 font-medium">
                  <AllPlatformsLogo className="h-3.5 w-3.5" />
                  All Platforms
                </span>
              </SelectItem>
              {configuredSlugs.map((slug) => {
                const Icon = getPlatformIcon(slug);
                return (
                  <SelectItem key={slug} value={slug} className="text-xs">
                    <span className="flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5" />
                      {getPlatformLabel(slug)}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          {/* Timeframe Range */}
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="h-8 text-xs font-semibold w-[125px] bg-card border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs font-medium">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Auto Refresh */}
          <Select value={refreshInterval} onValueChange={setRefreshInterval}>
            <SelectTrigger className="h-8 text-xs font-medium w-[138px] bg-card border-border hidden sm:flex items-center gap-1.5">
              {refreshInterval !== '0' && (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              )}
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REFRESH_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Export PDF Dossier */}
          <Button variant="outline" size="sm" onClick={exportToPDF} className="h-8 gap-1 text-xs font-medium px-2.5">
            <Download className="h-3.5 w-3.5" /> PDF
          </Button>

          {/* Export Excel */}
          <Button variant="outline" size="sm" onClick={exportToExcel} className="h-8 gap-1 text-xs font-medium px-2.5 hidden md:inline-flex">
            <Download className="h-3.5 w-3.5" /> Excel
          </Button>

          {/* Manual Refresh */}
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => load(activeTab, range, platform, selectedEventId)}
            disabled={loading}
            aria-label="Refresh telemetry"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Analytics Visual Color Guide Banner */}
      <div className="p-3 rounded-xl border border-border/70 bg-card/90 shadow-2xs backdrop-blur-xs flex flex-col md:flex-row md:items-center justify-between gap-2.5 text-xs">
        <div className="flex items-center gap-2 font-semibold text-foreground shrink-0">
          <Info className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <span>Color Guide & Metric Indicators:</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" />
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">Green = Positive / Favourable</span>
            <span className="text-[11px] text-muted-foreground">(Support, praise & safe low risk)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-sky-500 shrink-0" />
            <span className="font-semibold text-sky-700 dark:text-sky-400">Sky Blue = Neutral News</span>
            <span className="text-[11px] text-muted-foreground">(Factual reports, updates & media articles)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500 shrink-0" />
            <span className="font-semibold text-rose-700 dark:text-rose-400">Red = Negative / Threat Risk</span>
            <span className="text-[11px] text-muted-foreground">(Criticism, grievances & high risk alerts)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0" />
            <span className="font-semibold text-amber-700 dark:text-amber-400">Amber = Medium Severity</span>
            <span className="text-[11px] text-muted-foreground">(Elevated watch-list items)</span>
          </div>
        </div>
      </div>

      {/* Modern High-Density Navigation Tabs */}
      <div className="rounded-xl border border-border/70 bg-card/90 p-1 shrink-0 shadow-xs backdrop-blur-xs">
        <Tabs value={activeTab} onValueChange={setTab} className="w-full">
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
            {TABS.map((t) => {
              const Icon = t.icon;
              const isActive = activeTab === t.value;
              return (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className={cn(
                    'gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      </div>

      {/* Main Tab Content */}
      <div className="w-full min-h-[400px]">
        {loading && !currentData ? (
          <div className="flex h-64 flex-col items-center justify-center text-muted-foreground rounded-xl border border-border/70 bg-card shadow-xs">
            <Loader2 className="h-6 w-6 animate-spin text-primary mb-2" />
            <p className="text-xs font-semibold">Aggregating cross-platform intelligence metrics…</p>
          </div>
        ) : (
          tabContent
        )}
      </div>
    </div>
  );
};

export default AnalyticsHub;
