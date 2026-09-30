import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../../lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../../components/ui/table';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Legend,
  CartesianGrid,
  LabelList,
} from 'recharts';
import {
  TrendingUp,
  BarChart3,
  PieChart as PieIcon,
  Activity,
  Search,
  RefreshCw,
  X,
  ExternalLink,
  Heart,
  Repeat2,
  MessageSquare,
  Eye,
  ShieldAlert,
  Sparkles,
  Flame,
  Users,
  Calendar,
  Layers,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  Info,
} from 'lucide-react';
import {
  XBrandLogo,
  YoutubeBrandLogo,
  FacebookBrandLogo,
  TelegramBrandLogo,
  AllPlatformsLogo,
} from '../../components/PlatformBrandIcon';
import { toast } from 'sonner';

const CHART_COLORS = [
  '#6366f1', // indigo
  '#0ea5e9', // sky
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ec4899', // pink
  '#8b5cf6', // violet
  '#14b8a6', // teal
  '#f97316', // orange
  '#64748b', // slate
];

const SENTIMENT_COLORS = {
  positive: '#10b981',
  neutral: '#0ea5e9',
  negative: '#f43f5e',
};

const RISK_COLORS = {
  low: '#10b981',
  medium: '#f59e0b',
  high: '#f97316',
  critical: '#ef4444',
};

const PlatformIcon = ({ platform, className = 'h-3.5 w-3.5' }) => {
  const p = String(platform || '').toLowerCase();
  if (p === 'x' || p === 'twitter') return <XBrandLogo className={className} />;
  if (p === 'youtube') return <YoutubeBrandLogo className={className} />;
  if (p === 'facebook') return <FacebookBrandLogo className={className} />;
  if (p === 'telegram') return <TelegramBrandLogo className={className} />;
  return <AllPlatformsLogo className={className} />;
};

const TRANSLATION_MAP = {
  // Odia
  'ଓଡ଼ିଶା ପୋଲିସ': 'Odisha Police (Odia)',
  'ଓଡ଼ିଶା ମୁଖ୍ୟମନ୍ତ୍ରୀ': 'Odisha CM (Odia)',
  'ଓଡ଼ିଶା ଖବର': 'Odisha News (Odia)',
  'ଓଡ଼ିଶା ରାଜନୀତି': 'Odisha Politics (Odia)',
  'ଓଡ଼ିଶା': 'Odisha (Odia)',
  'ଭୁବନେଶ୍ୱର': 'Bhubaneswar (Odia)',
  'ଭୁବନେଶ୍ୱର ଖବର': 'Bhubaneswar News (Odia)',
  'କଟକ': 'Cuttack (Odia)',
  'ପୁରୀ': 'Puri (Odia)',
  // Hindi
  'ओडिशा पुलिस': 'Odisha Police (Hindi)',
  'ओडिशा मुख्यमंत्री': 'Odisha CM (Hindi)',
  'ओडिशा समाचार': 'Odisha News (Hindi)',
  'ओडिशा खबर': 'Odisha News (Hindi)',
  'ओडिशा': 'Odisha (Hindi)',
  'भुवनेश्वर': 'Bhubaneswar (Hindi)',
  'भुवनेश्वर समाचार': 'Bhubaneswar News (Hindi)',
  'कटक': 'Cuttack (Hindi)',
  'पुरी': 'Puri (Hindi)',
  // Telugu
  'ఒడిశా పోలీస్': 'Odisha Police (Telugu)',
  'ఒడిశా ముఖ్యమంత్రి': 'Odisha CM (Telugu)',
  'ఒడిశా ప్రభుత్వం': 'Odisha Govt (Telugu)',
  'ఒడిశా వార్తలు': 'Odisha News (Telugu)',
  'ఒడిశా': 'Odisha (Telugu)',
  'భువనేశ్వర్': 'Bhubaneswar (Telugu)',
  'కటక్': 'Cuttack (Telugu)',
  'పూరీ': 'Puri (Telugu)',
};

const getChartAxisLabel = (raw) => {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  if (TRANSLATION_MAP[trimmed]) {
    return TRANSLATION_MAP[trimmed];
  }
  return trimmed;
};


export default function KeywordAnalysisDialog({ open, onOpenChange, eventId, eventName }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedKeyword, setSelectedKeyword] = useState(null);
  const [postSearch, setPostSearch] = useState('');
  const [postSentimentFilter, setPostSentimentFilter] = useState('all');
  const [postPlatformFilter, setPostPlatformFilter] = useState('all');

  const fetchAnalytics = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const res = await api.get(`/events/${eventId}/keyword-analytics`);
      setData(res.data);
      if (res.data?.keywords?.length && !selectedKeyword) {
        setSelectedKeyword(res.data.keywords[0].keyword);
      }
    } catch (err) {
      console.error('Failed to load keyword analytics', err);
      toast.error('Failed to load keyword analytics');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    if (open && eventId) {
      fetchAnalytics();
    }
  }, [open, eventId, fetchAnalytics]);

  // Keep selected keyword valid if data changes
  useEffect(() => {
    if (data?.keywords?.length) {
      if (!selectedKeyword || !data.keywords.find((k) => k.keyword === selectedKeyword)) {
        setSelectedKeyword(data.keywords[0].keyword);
      }
    }
  }, [data, selectedKeyword]);

  const currentKeywordData = useMemo(() => {
    if (!data?.keywords || !selectedKeyword) return null;
    return data.keywords.find((k) => k.keyword === selectedKeyword) || data.keywords[0];
  }, [data, selectedKeyword]);

  // Filtered posts for selected keyword
  const filteredPosts = useMemo(() => {
    if (!currentKeywordData?.sample_posts) return [];
    return currentKeywordData.sample_posts.filter((p) => {
      if (
        postSentimentFilter !== 'all' &&
        String(p.sentiment || '').trim().toLowerCase() !== postSentimentFilter.toLowerCase()
      ) {
        return false;
      }
      if (
        postPlatformFilter !== 'all' &&
        String(p.platform || '').trim().toLowerCase() !== postPlatformFilter.toLowerCase()
      ) {
        return false;
      }
      if (postSearch.trim()) {
        const q = postSearch.toLowerCase();
        const inText = (p.text || '').toLowerCase().includes(q);
        const inAuthor = (p.author || '').toLowerCase().includes(q);
        if (!inText && !inAuthor) return false;
      }
      return true;
    });
  }, [currentKeywordData, postSentimentFilter, postPlatformFilter, postSearch]);

  // Pie chart data for share of voice
  const shareOfVoiceData = useMemo(() => {
    if (!data?.keywords) return [];
    return data.keywords.slice(0, 8).map((k) => ({
      name: k.keyword,
      value: k.total_posts,
    }));
  }, [data]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[94vw] lg:max-w-7xl max-h-[94vh] flex flex-col p-0 gap-0 overflow-hidden bg-background border-border/90 shadow-2xl rounded-xl">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b bg-muted/20 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle className="text-lg font-bold tracking-tight">
                  Keyword Intelligence & Analytics
                </DialogTitle>
                <Badge variant="outline" className="text-xs bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/50 dark:border-indigo-800 dark:text-indigo-300">
                  {data?.summary?.total_keywords ?? data?.keywords?.length ?? data?.event?.total_keywords ?? 0} Keywords Monitored
                </Badge>
              </div>
              <DialogDescription className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5 flex-wrap">
                <span>Event: <strong className="text-foreground">{eventName || data?.event?.name || 'Monitoring Event'}</strong></span>
                <span>•</span>
                <span>{data?.summary?.total_posts || 0} Unique Posts Ingested</span>
                <span>•</span>
                <span>{data?.summary?.total_matched_posts || 0} Matched Posts</span>
                {data?.summary?.total_keyword_mentions > 0 && (
                  <>
                    <span>•</span>
                    <span className="font-medium text-foreground" title="Aggregate keyword occurrences across all posts">
                      {data.summary.total_keyword_mentions} Total Keyword Mentions
                    </span>
                  </>
                )}
              </DialogDescription>
            </div>
          </div>

          <div className="flex items-center gap-2 pr-10">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchAnalytics}
              disabled={loading}
              className="h-8 gap-1.5 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-primary' : ''}`} />
              Refresh
            </Button>
          </div>
        </DialogHeader>

        {/* Content Body */}
        {loading && !data ? (
          <div className="flex flex-col items-center justify-center p-16 gap-3 flex-1 min-h-[400px]">
            <RefreshCw className="h-8 w-8 text-primary animate-spin" />
            <p className="text-sm font-medium text-muted-foreground">Analyzing keyword performance & sentiments…</p>
          </div>
        ) : !data || !data.keywords?.length ? (
          <div className="flex flex-col items-center justify-center p-16 gap-3 flex-1 min-h-[400px]">
            <div className="h-12 w-12 rounded-full bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center text-amber-600">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <p className="text-base font-semibold">No keyword data available</p>
            <p className="text-xs text-muted-foreground text-center max-w-md">
              No matching posts found yet for the defined keywords. Try running “Fetch Now” to scan across platforms.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Top KPI Metrics Banner: Clear distinction between unique posts and keyword mentions */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {/* Card 1 */}
              <div className="p-3.5 rounded-xl border bg-card/60 backdrop-blur-sm shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                  <span>Monitored Keywords</span>
                  <Layers className="h-3.5 w-3.5 text-indigo-500" />
                </div>
                <div className="mt-2">
                  <div className="text-2xl font-bold tracking-tight text-foreground">
                    {data?.summary?.total_keywords ?? data?.keywords?.length ?? data?.event?.total_keywords ?? 0}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Across configured platforms
                  </p>
                </div>
              </div>

              {/* Card 2 */}
              <div className="p-3.5 rounded-xl border bg-card/60 backdrop-blur-sm shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                  <span>Unique Matched Posts</span>
                  <Activity className="h-3.5 w-3.5 text-sky-500" />
                </div>
                <div className="mt-2">
                  <div className="text-2xl font-bold tracking-tight text-foreground">
                    {data.summary.total_matched_posts}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {data.summary.total_posts > 0
                      ? `${Math.round((data.summary.total_matched_posts / data.summary.total_posts) * 100)}% of ${data.summary.total_posts} unique posts`
                      : '0% matches'}
                  </p>
                </div>
              </div>

              {/* Card 3 */}
              <div className="p-3.5 rounded-xl border bg-card/60 backdrop-blur-sm shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                  <span>Total Keyword Mentions</span>
                  <Flame className="h-3.5 w-3.5 text-amber-500" />
                </div>
                <div className="mt-2">
                  <div className="text-2xl font-bold tracking-tight text-indigo-600 dark:text-indigo-400">
                    {data.summary.total_keyword_mentions || data.summary.top_keyword_posts}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5" title="A single post can match multiple keywords">
                    Top term: {data.summary.top_keyword || '—'} ({data.summary.top_keyword_posts})
                  </p>
                </div>
              </div>

              {/* Card 4 */}
              <div className="p-3.5 rounded-xl border bg-card/60 backdrop-blur-sm shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                  <span>Sentiment Breakdown</span>
                  <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
                </div>
                <div className="mt-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                      {data.summary.sentiment.positive_pct}%
                    </span>
                    <span className="text-xs text-rose-500 font-semibold">
                      {data.summary.sentiment.negative_pct}% Criticism
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {data.summary.sentiment.positive} Praise · {data.summary.sentiment.neutral} News · {data.summary.sentiment.negative} Criticism
                  </p>
                </div>
              </div>

              {/* Card 5 */}
              <div className="p-3.5 rounded-xl border bg-card/60 backdrop-blur-sm shadow-xs flex flex-col justify-between col-span-2 md:col-span-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                  <span>Total Engagement</span>
                  <Heart className="h-3.5 w-3.5 text-rose-500" />
                </div>
                <div className="mt-2">
                  <div className="text-2xl font-bold tracking-tight text-foreground">
                    {Number(data.summary.engagement.total || 0).toLocaleString()}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {Number(data.summary.engagement.likes || 0).toLocaleString()} likes · {Number(data.summary.engagement.shares || 0).toLocaleString()} shares
                  </p>
                </div>
              </div>
            </div>

            {/* Color Meaning & Visual Guide Banner: Clearly decouple Risk from Criticism and clarify mentions vs posts */}
            <div className="p-3.5 rounded-xl border bg-muted/40 backdrop-blur-sm flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs shadow-2xs">
              <div className="flex items-center gap-2 font-semibold text-foreground shrink-0">
                <Info className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span>Standard Guide:</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
                <div className="flex items-center gap-1.5" title="Positive audience sentiment">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-xs shrink-0" />
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">Green = Praise (Positive)</span>
                  <span className="text-[11px] text-muted-foreground">(Commendations & approval)</span>
                </div>
                <div className="flex items-center gap-1.5" title="Neutral audience sentiment">
                  <span className="h-2.5 w-2.5 rounded-full bg-sky-500 shadow-xs shrink-0" />
                  <span className="font-semibold text-sky-700 dark:text-sky-400">Sky Blue = News/Updates (Neutral)</span>
                  <span className="text-[11px] text-muted-foreground">(Factual reports & announcements)</span>
                </div>
                <div className="flex items-center gap-1.5" title="Criticism is distinct from threats">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500 shadow-xs shrink-0" />
                  <span className="font-semibold text-rose-700 dark:text-rose-400">Red = Criticism (Negative)</span>
                  <span className="text-[11px] text-muted-foreground">(Critique & feedback — Non-threat)</span>
                </div>
                <div className="flex items-center gap-1.5" title="Keyword mentions aggregate across all terms">
                  <span className="h-2.5 w-2.5 rounded-full bg-indigo-500 shadow-xs shrink-0" />
                  <span className="font-semibold text-indigo-700 dark:text-indigo-400">Indigo = Total Mentions</span>
                  <span className="text-[11px] text-muted-foreground">({data.summary.total_posts} unique posts = {data.summary.total_keyword_mentions || data.summary.total_matched_posts} mentions)</span>
                </div>
              </div>
            </div>

            {/* Main Tabs: Overview vs Deep Dive */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
              <div className="border-b pb-3">
                <TabsList className="bg-muted/70 p-1">
                  <TabsTrigger value="overview" className="text-xs gap-1.5">
                    <BarChart3 className="h-3.5 w-3.5" />
                    All Keywords Overview
                  </TabsTrigger>
                  <TabsTrigger value="drilldown" className="text-xs gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5" />
                    Individual Keyword Deep Dive
                    {selectedKeyword && (
                      <Badge variant="secondary" className="ml-1 px-1.5 py-0 h-4 text-[10px]">
                        {selectedKeyword}
                      </Badge>
                    )}
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* ── TAB 1: ALL KEYWORDS OVERVIEW ── */}
              <TabsContent value="overview" className="space-y-6 mt-0">
                {/* Graphs Row 1: Volume & Share of Voice */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  {/* Graph 1: Keyword Mentions Volume */}
                  <div className="lg:col-span-2 p-5 rounded-xl border bg-card/50 shadow-xs">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h4 className="text-sm font-semibold tracking-tight">Mentions Volume by Keyword</h4>
                        <p className="text-xs text-muted-foreground">
                          Bar length indicates Total Mentions (posts count). Click any bar to inspect.
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[11px]">
                        Top {Math.min(10, data.comparisons.length)} Keywords
                      </Badge>
                    </div>
                    <div className="h-80 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={data.comparisons.slice(0, 10)}
                          layout="vertical"
                          margin={{ top: 10, right: 90, left: 10, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" opacity={0.2} horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 11 }} />
                          <YAxis
                            dataKey="keyword"
                            type="category"
                            tick={{ fontSize: 11 }}
                            width={210}
                            tickFormatter={(v) => getChartAxisLabel(v)}
                          />
                          <RechartsTooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const row = payload[0].payload;
                                return (
                                  <div className="rounded-lg border bg-popover p-3 shadow-lg text-xs space-y-2 min-w-[240px]">
                                    <div>
                                      <p className="font-bold text-foreground text-sm">{row.keyword}</p>
                                      {TRANSLATION_MAP[row.keyword] && (
                                        <p className="text-[11px] text-muted-foreground font-medium">
                                          Meaning: {TRANSLATION_MAP[row.keyword]}
                                        </p>
                                      )}
                                    </div>
                                    <div className="pt-1.5 border-t space-y-1">
                                      <p className="flex justify-between font-bold text-indigo-600 dark:text-indigo-400">
                                        <span>Total Mentions:</span>
                                        <span>{row.posts} posts</span>
                                      </p>
                                      <p className="flex justify-between text-emerald-600 dark:text-emerald-400 font-medium">
                                        <span>🟢 Positive (Praise):</span>
                                        <span>{row.positive} ({row.posts > 0 ? Math.round((row.positive / row.posts) * 100) : 0}%)</span>
                                      </p>
                                      <p className="flex justify-between text-sky-600 dark:text-sky-400 font-medium">
                                        <span>🔵 Neutral (News/Updates):</span>
                                        <span>{row.neutral} ({row.posts > 0 ? Math.round((row.neutral / row.posts) * 100) : 0}%)</span>
                                      </p>
                                      <p className="flex justify-between text-rose-600 dark:text-rose-400 font-medium">
                                        <span>🔴 Negative (Criticism):</span>
                                        <span>{row.negative} ({row.posts > 0 ? Math.round((row.negative / row.posts) * 100) : 0}%)</span>
                                      </p>
                                      <p className="flex justify-between text-muted-foreground pt-1 border-t">
                                        <span>Total Engagement:</span>
                                        <span className="font-semibold text-foreground">{row.engagement.toLocaleString()}</span>
                                      </p>
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar
                            dataKey="posts"
                            name="Total Mentions"
                            fill="#6366f1"
                            radius={[0, 6, 6, 0]}
                            cursor="pointer"
                            onClick={(entry) => {
                              if (entry?.keyword) {
                                setSelectedKeyword(entry.keyword);
                                setActiveTab('drilldown');
                              }
                            }}
                          >
                            <LabelList
                              dataKey="posts"
                              position="right"
                              offset={8}
                              className="text-xs font-semibold fill-foreground"
                              formatter={(val) => `${val} posts`}
                            />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Graph 2: Share of Voice Donut */}
                  <div className="p-5 rounded-xl border bg-card/50 shadow-xs flex flex-col">
                    <div className="mb-2">
                      <h4 className="text-sm font-semibold tracking-tight">Share of Voice</h4>
                      <p className="text-xs text-muted-foreground">Proportion of keyword mentions</p>
                    </div>
                    <div className="h-56 w-full flex-1 relative">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={shareOfVoiceData}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={80}
                            paddingAngle={3}
                            dataKey="value"
                            cursor="pointer"
                            onClick={(entry) => {
                              if (entry?.name) {
                                setSelectedKeyword(entry.name);
                                setActiveTab('drilldown');
                              }
                            }}
                          >
                            {shareOfVoiceData.map((entry, index) => (
                              <Cell key={`sov-cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <RechartsTooltip
                            formatter={(value, name) => [`${value} posts`, name]}
                            contentStyle={{ fontSize: 12, borderRadius: 8 }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-lg font-bold">{data.summary.total_matched_posts}</span>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Matches</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 justify-center mt-2 max-h-16 overflow-y-auto">
                      {shareOfVoiceData.map((entry, idx) => (
                        <div
                          key={entry.name}
                          onClick={() => {
                            setSelectedKeyword(entry.name);
                            setActiveTab('drilldown');
                          }}
                          className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted/40 cursor-pointer hover:bg-muted"
                        >
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
                          <span className="truncate max-w-[80px]">{entry.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Graphs Row 2: Sentiment Breakdown & Activity Timeline */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Graph 3: Sentiment Breakdown Stacked */}
                  <div className="p-5 rounded-xl border bg-card/50 shadow-xs">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h4 className="text-sm font-semibold tracking-tight">Sentiment Breakdown by Keyword</h4>
                        <p className="text-xs text-muted-foreground">Sentiment distribution for each keyword</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-[11px]">
                        <span className="flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
                          <span className="h-2 w-2 rounded-full bg-emerald-500" /> Positive
                        </span>
                        <span className="flex items-center gap-1 font-medium text-sky-700 dark:text-sky-400" title="Sky Blue indicates neutral news reports & informational updates">
                          <span className="h-2 w-2 rounded-full bg-sky-500" /> Sky Blue = Neutral (News)
                        </span>
                        <span className="flex items-center gap-1 font-medium text-rose-700 dark:text-rose-400">
                          <span className="h-2 w-2 rounded-full bg-rose-500" /> Negative
                        </span>
                      </div>
                    </div>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={data.comparisons.slice(0, 8)}
                          margin={{ top: 10, right: 10, left: -10, bottom: 35 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                          <XAxis
                            dataKey="keyword"
                            tick={{ fontSize: 10 }}
                            interval={0}
                            angle={-25}
                            textAnchor="end"
                            height={55}
                            tickFormatter={(v) => getChartAxisLabel(v)}
                          />
                          <YAxis tick={{ fontSize: 11 }} />
                          <RechartsTooltip
                            content={({ active, payload, label }) => {
                              if (active && payload && payload.length) {
                                const positiveVal = payload.find(p => p.dataKey === 'positive')?.value || 0;
                                const neutralVal = payload.find(p => p.dataKey === 'neutral')?.value || 0;
                                const negativeVal = payload.find(p => p.dataKey === 'negative')?.value || 0;
                                const total = positiveVal + neutralVal + negativeVal;
                                return (
                                  <div className="rounded-lg border bg-popover p-3 shadow-lg text-xs space-y-2 min-w-[220px]">
                                    <div>
                                      <p className="font-bold text-foreground text-sm">{label}</p>
                                      {TRANSLATION_MAP[label] && (
                                        <p className="text-[11px] text-muted-foreground font-medium">
                                          Meaning: {TRANSLATION_MAP[label]}
                                        </p>
                                      )}
                                    </div>
                                    <div className="pt-1.5 border-t space-y-1">
                                      <p className="flex justify-between text-emerald-600 font-medium">
                                        <span>🟢 Positive (Praise):</span>
                                        <span className="font-bold">{positiveVal} ({total > 0 ? Math.round((positiveVal / total) * 100) : 0}%)</span>
                                      </p>
                                      <p className="flex justify-between text-sky-600 font-medium">
                                        <span>🔵 Sky Blue = Neutral (News):</span>
                                        <span className="font-bold">{neutralVal} ({total > 0 ? Math.round((neutralVal / total) * 100) : 0}%)</span>
                                      </p>
                                      <p className="flex justify-between text-rose-600 font-medium">
                                        <span>🔴 Negative (Criticism):</span>
                                        <span className="font-bold">{negativeVal} ({total > 0 ? Math.round((negativeVal / total) * 100) : 0}%)</span>
                                      </p>
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar dataKey="positive" name="Positive" stackId="a" fill={SENTIMENT_COLORS.positive} />
                          <Bar dataKey="neutral" name="Neutral" stackId="a" fill={SENTIMENT_COLORS.neutral} />
                          <Bar dataKey="negative" name="Negative" stackId="a" fill={SENTIMENT_COLORS.negative} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Graph 4: Activity Trend Timeline */}
                  <div className="p-5 rounded-xl border bg-card/50 shadow-xs">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h4 className="text-sm font-semibold tracking-tight">Mentions Timeline Trend</h4>
                        <p className="text-xs text-muted-foreground">Daily volume trajectory across all event keywords</p>
                      </div>
                      <Badge variant="outline" className="text-[11px] gap-1">
                        <Calendar className="h-3 w-3" />
                        {data.timeline_overall?.length || 0} Days Tracked
                      </Badge>
                    </div>
                    <div className="h-64 w-full">
                      {data.timeline_overall?.length ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart
                            data={data.timeline_overall}
                            margin={{ top: 10, right: 10, left: -10, bottom: 5 }}
                          >
                            <defs>
                              <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                            <XAxis
                              dataKey="date"
                              tick={{ fontSize: 11 }}
                              tickFormatter={(str) => {
                                try {
                                  const parts = str.split('-');
                                  return `${parts[2]}/${parts[1]}`;
                                } catch {
                                  return str;
                                }
                              }}
                            />
                            <YAxis tick={{ fontSize: 11 }} />
                            <RechartsTooltip
                              content={({ active, payload, label }) => {
                                if (active && payload && payload.length) {
                                  const item = payload[0].payload;
                                  return (
                                    <div className="rounded-lg border bg-popover p-2.5 shadow-md text-xs space-y-1">
                                      <p className="font-semibold">{label}</p>
                                      <p className="text-indigo-600 font-bold">Total Mentions: {item.count}</p>
                                      <p className="text-emerald-600">Positive: {item.positive}</p>
                                      <p className="text-rose-600">Negative: {item.negative}</p>
                                      <p className="text-muted-foreground">Engagements: {item.engagement}</p>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Area
                              type="monotone"
                              dataKey="count"
                              name="Posts"
                              stroke="#6366f1"
                              strokeWidth={2}
                              fillOpacity={1}
                              fill="url(#colorCount)"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                          No timeline data available
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Keyword Performance Matrix Table */}
                <div className="rounded-xl border bg-card/50 overflow-hidden shadow-xs">
                  <div className="px-5 py-3.5 border-b bg-muted/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-semibold tracking-tight">Keyword Performance Matrix</h4>
                      <p className="text-xs text-muted-foreground">
                        Sentiment indicators: <span className="text-emerald-600 font-semibold">🟢 Positive (favorable)</span> · <span className="text-sky-600 font-semibold">🔵 Sky Blue = Neutral (news & reports)</span> · <span className="text-rose-600 font-semibold">🔴 Negative (criticism)</span>
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {data.keywords.length} keywords
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-muted/30">
                        <TableRow>
                          <TableHead className="w-12 text-center text-xs">#</TableHead>
                          <TableHead className="text-xs font-semibold min-w-[200px]">Keyword & Meaning</TableHead>
                          <TableHead className="text-xs font-semibold text-right">Posts</TableHead>
                          <TableHead className="text-xs font-semibold text-right">Share</TableHead>
                          <TableHead className="text-xs font-semibold min-w-[220px]">Sentiment Breakdown (Pos · Neu · Neg)</TableHead>
                          <TableHead className="text-xs font-semibold">Dominant Platform</TableHead>
                          <TableHead className="text-xs font-semibold text-right">Engagement</TableHead>
                          <TableHead className="text-xs font-semibold text-center">Risk Alerts</TableHead>
                          <TableHead className="text-xs font-semibold text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.keywords.map((k, idx) => {
                          const sharePct = data.summary.total_matched_posts > 0
                            ? Math.round((k.total_posts / data.summary.total_matched_posts) * 100)
                            : 0;
                          return (
                            <TableRow key={k.keyword} className="hover:bg-muted/40 transition-colors">
                              <TableCell className="text-center font-mono text-xs text-muted-foreground">
                                {idx + 1}
                              </TableCell>
                              <TableCell>
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-xs text-foreground">{k.keyword}</span>
                                    {k.language && k.language !== 'all' && (
                                      <Badge variant="secondary" className="uppercase text-[9px] px-1 py-0 h-4">
                                        {k.language}
                                      </Badge>
                                    )}
                                  </div>
                                  {TRANSLATION_MAP[k.keyword] && (
                                    <p className="text-[11px] text-muted-foreground font-medium">
                                      Meaning: {TRANSLATION_MAP[k.keyword]}
                                    </p>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-medium tabular-nums text-xs">
                                <span className="font-semibold text-foreground">{k.total_posts}</span>
                              </TableCell>
                              <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                                {sharePct}%
                              </TableCell>
                              <TableCell>
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-2 text-[11px]">
                                    <span className="text-emerald-600 font-semibold" title="Positive sentiment">
                                      +{k.sentiment.positive} Pos
                                    </span>
                                    <span className="text-sky-600 font-semibold" title="Sky Blue indicates neutral news reports and updates">
                                      {k.sentiment.neutral} Neutral
                                    </span>
                                    <span className="text-rose-600 font-semibold" title="Negative sentiment">
                                      -{k.sentiment.negative} Neg
                                    </span>
                                  </div>
                                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden flex" title={`🟢 Positive: ${k.sentiment.positive} | 🔵 Neutral (News): ${k.sentiment.neutral} | 🔴 Negative: ${k.sentiment.negative}`}>
                                    <div
                                      className="bg-emerald-500 h-full"
                                      style={{ width: `${k.sentiment.positive_pct}%` }}
                                    />
                                    <div
                                      className="bg-sky-400 h-full"
                                      style={{ width: `${k.sentiment.neutral_pct}%` }}
                                    />
                                    <div
                                      className="bg-rose-500 h-full"
                                      style={{ width: `${k.sentiment.negative_pct}%` }}
                                    />
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1.5 text-xs capitalize">
                                  <PlatformIcon platform={k.dominant_platform} className="h-3.5 w-3.5" />
                                  <span>{k.dominant_platform}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-medium tabular-nums text-xs">
                                {Number(k.engagement.total || 0).toLocaleString()}
                              </TableCell>
                              <TableCell className="text-center">
                                {k.high_risk_total > 0 ? (
                                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                                    {k.high_risk_total} High
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedKeyword(k.keyword);
                                    setActiveTab('drilldown');
                                  }}
                                  className="h-7 px-2 text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 gap-1 font-medium"
                                >
                                  Deep Dive
                                  <ArrowUpRight className="h-3 w-3" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </TabsContent>

              {/* ── TAB 2: INDIVIDUAL KEYWORD DEEP DIVE ── */}
              <TabsContent value="drilldown" className="space-y-6 mt-0">
                {/* Keyword Pill Selector Carousel */}
                <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
                  {data.keywords.map((k) => {
                    const isSelected = k.keyword === selectedKeyword;
                    return (
                      <button
                        key={k.keyword}
                        type="button"
                        onClick={() => setSelectedKeyword(k.keyword)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap transition-all ${
                          isSelected
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-600/30 font-semibold'
                            : 'bg-card hover:bg-muted/60 text-muted-foreground hover:text-foreground border-border/80'
                        }`}
                      >
                        <span>{getChartAxisLabel(k.keyword)}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-full tabular-nums ${
                            isSelected ? 'bg-white/20 text-white font-bold' : 'bg-muted text-foreground'
                          }`}
                        >
                          {k.total_posts}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {currentKeywordData && (
                  <div className="space-y-6">
                    {/* Keyword Banner & Stats */}
                    <div className="p-5 rounded-xl border bg-gradient-to-r from-indigo-50/70 via-purple-50/40 to-background dark:from-indigo-950/30 dark:via-purple-950/20 dark:to-background">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-xl font-bold tracking-tight text-foreground flex items-baseline gap-2">
                              <span>{currentKeywordData.keyword}</span>
                              {TRANSLATION_MAP[currentKeywordData.keyword] && (
                                <span className="text-xs font-normal text-muted-foreground">
                                  ({TRANSLATION_MAP[currentKeywordData.keyword]})
                                </span>
                              )}
                            </h3>
                            {currentKeywordData.language && currentKeywordData.language !== 'all' && (
                              <Badge variant="outline" className="uppercase text-xs bg-background">
                                {currentKeywordData.language}
                              </Badge>
                            )}
                            <Badge className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-200 text-xs border-indigo-200 dark:border-indigo-800">
                              Dominant: {currentKeywordData.dominant_platform.toUpperCase()}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Analyzed across {Object.keys(currentKeywordData.platforms).length} platforms • {currentKeywordData.sample_posts?.length || 0} sample posts reviewed
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setActiveTab('overview');
                            }}
                            className="h-8 text-xs gap-1"
                          >
                            ← Back to Overview
                          </Button>
                        </div>
                      </div>

                      {/* 4 Metric Cards for Selected Keyword */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="p-3 bg-background/80 rounded-lg border shadow-2xs">
                          <p className="text-xs text-muted-foreground font-medium">Mentions Volume</p>
                          <p className="text-xl font-bold text-foreground mt-1">
                            {currentKeywordData.total_posts}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {data.summary.total_matched_posts > 0
                              ? `${((currentKeywordData.total_posts / data.summary.total_matched_posts) * 100).toFixed(1)}% share of voice`
                              : '0% share'}
                          </p>
                        </div>

                        <div className="p-3 bg-background/80 rounded-lg border shadow-2xs">
                          <p className="text-xs text-muted-foreground font-medium">Net Sentiment Score</p>
                          <p className="text-xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">
                            {currentKeywordData.sentiment.net_score > 0 ? `+${currentKeywordData.sentiment.net_score}` : currentKeywordData.sentiment.net_score}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {currentKeywordData.sentiment.positive_pct}% Pos · {currentKeywordData.sentiment.negative_pct}% Neg
                          </p>
                        </div>

                        <div className="p-3 bg-background/80 rounded-lg border shadow-2xs">
                          <p className="text-xs text-muted-foreground font-medium">Total Engagement</p>
                          <p className="text-xl font-bold text-foreground mt-1">
                            {Number(currentKeywordData.engagement.total || 0).toLocaleString()}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            ~{currentKeywordData.engagement.avg_per_post} per post
                          </p>
                        </div>

                        <div className="p-3 bg-background/80 rounded-lg border shadow-2xs">
                          <p className="text-xs text-muted-foreground font-medium">Risk Status</p>
                          <p className="text-xl font-bold mt-1">
                            {currentKeywordData.high_risk_total > 0 ? (
                              <span className="text-rose-600">{currentKeywordData.high_risk_total} High Risk</span>
                            ) : (
                              <span className="text-emerald-600">Clean / Safe</span>
                            )}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {(currentKeywordData.risk_levels?.critical ?? 0)} critical · {(currentKeywordData.risk_levels?.high ?? 0)} high
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Charts Grid for Selected Keyword */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                      {/* Donut Chart: Sentiment */}
                      <div className="p-4 rounded-xl border bg-card/50 shadow-xs flex flex-col">
                        <div className="mb-2">
                          <h4 className="text-xs font-semibold tracking-tight uppercase text-muted-foreground">Sentiment Breakdown</h4>
                          <p className="text-sm font-bold text-foreground mt-0.5">Audience Perception</p>
                        </div>
                        <div className="h-48 w-full relative">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={[
                                  { name: 'Positive', value: currentKeywordData.sentiment.positive, color: SENTIMENT_COLORS.positive },
                                  { name: 'Neutral', value: currentKeywordData.sentiment.neutral, color: SENTIMENT_COLORS.neutral },
                                  { name: 'Negative', value: currentKeywordData.sentiment.negative, color: SENTIMENT_COLORS.negative },
                                ]}
                                cx="50%"
                                cy="50%"
                                innerRadius={42}
                                outerRadius={68}
                                paddingAngle={3}
                                dataKey="value"
                              >
                                <Cell fill={SENTIMENT_COLORS.positive} />
                                <Cell fill={SENTIMENT_COLORS.neutral} />
                                <Cell fill={SENTIMENT_COLORS.negative} />
                              </Pie>
                              <RechartsTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-base font-bold text-emerald-600">
                              {currentKeywordData.sentiment.positive_pct}%
                            </span>
                            <span className="text-[9px] text-muted-foreground uppercase">Positive</span>
                          </div>
                        </div>
                        <div className="flex justify-around text-xs mt-2 border-t pt-2">
                          <div className="text-center">
                            <p className="text-emerald-600 font-bold">{currentKeywordData.sentiment.positive}</p>
                            <p className="text-[10px] text-muted-foreground">Positive</p>
                          </div>
                          <div className="text-center">
                            <p className="text-sky-600 font-bold">{currentKeywordData.sentiment.neutral}</p>
                            <p className="text-[10px] text-muted-foreground">Neutral</p>
                          </div>
                          <div className="text-center">
                            <p className="text-rose-600 font-bold">{currentKeywordData.sentiment.negative}</p>
                            <p className="text-[10px] text-muted-foreground">Negative</p>
                          </div>
                        </div>
                      </div>

                      {/* Area Chart: Activity Over Time */}
                      <div className="p-4 rounded-xl border bg-card/50 shadow-xs flex flex-col">
                        <div className="mb-2">
                          <h4 className="text-xs font-semibold tracking-tight uppercase text-muted-foreground">Timeline Trend</h4>
                          <p className="text-sm font-bold text-foreground mt-0.5">Mentions Trajectory</p>
                        </div>
                        <div className="h-48 w-full">
                          {currentKeywordData.timeline?.length ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart
                                data={currentKeywordData.timeline}
                                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                              >
                                <defs>
                                  <linearGradient id="colorKw" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                                <XAxis
                                  dataKey="date"
                                  tick={{ fontSize: 10 }}
                                  tickFormatter={(d) => {
                                    try {
                                      const p = d.split('-');
                                      return `${p[2]}/${p[1]}`;
                                    } catch {
                                      return d;
                                    }
                                  }}
                                />
                                <YAxis tick={{ fontSize: 10 }} />
                                <RechartsTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                                <Area
                                  type="monotone"
                                  dataKey="count"
                                  name="Mentions"
                                  stroke="#8b5cf6"
                                  strokeWidth={2}
                                  fill="url(#colorKw)"
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          ) : (
                            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                              No daily distribution data
                            </div>
                          )}
                        </div>
                        <p className="text-[11px] text-center text-muted-foreground mt-2 border-t pt-2">
                          Tracked across active monitoring period
                        </p>
                      </div>

                      {/* Bar Chart: Platforms Distribution */}
                      <div className="p-4 rounded-xl border bg-card/50 shadow-xs flex flex-col">
                        <div className="mb-2">
                          <h4 className="text-xs font-semibold tracking-tight uppercase text-muted-foreground">Platforms Distribution</h4>
                          <p className="text-sm font-bold text-foreground mt-0.5">Source Channels</p>
                        </div>
                        <div className="h-48 w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={Object.entries(currentKeywordData.platforms).map(([p, count]) => ({
                                platform: p,
                                count,
                              }))}
                              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                              <XAxis dataKey="platform" tick={{ fontSize: 11 }} tickFormatter={(s) => s.toUpperCase()} />
                              <YAxis tick={{ fontSize: 10 }} />
                              <RechartsTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                              <Bar dataKey="count" name="Posts" fill="#0ea5e9" radius={[4, 4, 0, 0]}>
                                {Object.entries(currentKeywordData.platforms).map((_, idx) => (
                                  <Cell key={`pcell-${idx}`} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="flex items-center justify-center gap-3 text-xs mt-2 border-t pt-2">
                          {Object.entries(currentKeywordData.platforms).map(([p, count]) => (
                            <span key={p} className="flex items-center gap-1 text-[11px]">
                              <PlatformIcon platform={p} className="h-3 w-3" />
                              <span className="font-semibold">{count}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Top Voices / Influencers Section */}
                    {currentKeywordData.top_authors?.length > 0 && (
                      <div className="p-4 rounded-xl border bg-card/50 shadow-xs">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-primary" />
                            <h4 className="text-sm font-semibold tracking-tight">Top Accounts Discussing this Keyword</h4>
                          </div>
                          <span className="text-xs text-muted-foreground">Most active contributors</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                          {currentKeywordData.top_authors.slice(0, 4).map((author, aIdx) => (
                            <div key={`${author.name}-${aIdx}`} className="p-3 rounded-lg border bg-background flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                                {author.name ? author.name.slice(0, 2).toUpperCase() : 'U'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold truncate">{author.name}</p>
                                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                                  <PlatformIcon platform={author.platform} className="h-2.5 w-2.5" />
                                  <span>{author.count} posts</span>
                                  <span>•</span>
                                  <span>{author.engagement.toLocaleString()} engage</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Matched Posts Stream / Feed */}
                    <div className="rounded-xl border bg-card/50 overflow-hidden shadow-xs space-y-3 p-5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-semibold tracking-tight">
                            Matched Posts Stream ({filteredPosts.length})
                          </h4>
                          <p className="text-xs text-muted-foreground">
                            Recent social media discussions matching &quot;{currentKeywordData.keyword}&quot;
                          </p>
                        </div>

                        {/* Filters */}
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Sentiment Filter */}
                          <div className="flex items-center rounded-lg border bg-background p-0.5 text-xs">
                            <button
                              type="button"
                              onClick={() => setPostSentimentFilter('all')}
                              className={`px-2 py-1 rounded-md transition-colors ${
                                postSentimentFilter === 'all' ? 'bg-muted font-bold text-foreground' : 'text-muted-foreground'
                              }`}
                            >
                              All
                            </button>
                            <button
                              type="button"
                              onClick={() => setPostSentimentFilter('positive')}
                              className={`px-2 py-1 rounded-md transition-colors ${
                                postSentimentFilter === 'positive' ? 'bg-emerald-100 text-emerald-800 font-bold dark:bg-emerald-950 dark:text-emerald-300' : 'text-muted-foreground'
                              }`}
                            >
                              Positive
                            </button>
                            <button
                              type="button"
                              onClick={() => setPostSentimentFilter('neutral')}
                              className={`px-2 py-1 rounded-md transition-colors ${
                                postSentimentFilter === 'neutral' ? 'bg-sky-100 text-sky-800 font-bold dark:bg-sky-950 dark:text-sky-300' : 'text-muted-foreground'
                              }`}
                            >
                              Neutral
                            </button>
                            <button
                              type="button"
                              onClick={() => setPostSentimentFilter('negative')}
                              className={`px-2 py-1 rounded-md transition-colors ${
                                postSentimentFilter === 'negative' ? 'bg-rose-100 text-rose-800 font-bold dark:bg-rose-950 dark:text-rose-300' : 'text-muted-foreground'
                              }`}
                            >
                              Negative
                            </button>
                          </div>

                          {/* Post Search */}
                          <div className="relative w-44">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                              placeholder="Search in posts…"
                              value={postSearch}
                              onChange={(e) => setPostSearch(e.target.value)}
                              className="pl-8 h-8 text-xs bg-background"
                            />
                            {postSearch && (
                              <button
                                type="button"
                                onClick={() => setPostSearch('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Posts Cards Grid */}
                      <div className="space-y-3 max-h-[450px] overflow-y-auto pr-1">
                        {filteredPosts.length === 0 ? (
                          <div className="p-8 text-center text-xs text-muted-foreground border rounded-lg bg-background">
                            No posts match the selected filter criteria.
                          </div>
                        ) : (
                          filteredPosts.map((post) => {
                            const sentimentStyle =
                              post.sentiment === 'positive'
                                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
                                : post.sentiment === 'negative'
                                  ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20'
                                  : 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20';

                            return (
                              <div
                                key={post.id}
                                className="p-3.5 rounded-xl border bg-background hover:border-indigo-300 dark:hover:border-indigo-800 transition-colors space-y-2"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <PlatformIcon platform={post.platform} className="h-4 w-4" />
                                    <span className="font-semibold text-xs text-foreground">
                                      {post.author}
                                    </span>
                                    {post.author_handle && (
                                      <span className="text-[11px] text-muted-foreground">
                                        @{post.author_handle}
                                      </span>
                                    )}
                                    <span className="text-[10px] text-muted-foreground">
                                      {post.posted_at ? new Date(post.posted_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1.5">
                                    <Badge variant="outline" className={`text-[10px] uppercase font-semibold px-2 py-0.5 ${sentimentStyle}`}>
                                      {post.sentiment}
                                    </Badge>
                                    {post.risk_level && post.risk_level !== 'low' && (
                                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0.5">
                                        {post.risk_level} Risk
                                      </Badge>
                                    )}
                                    {post.url && (
                                      <a
                                        href={post.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-muted-foreground hover:text-foreground p-1"
                                        title="Open original post"
                                      >
                                        <ExternalLink className="h-3.5 w-3.5" />
                                      </a>
                                    )}
                                  </div>
                                </div>

                                <p className="text-xs text-foreground/90 leading-relaxed break-words whitespace-pre-wrap">
                                  {post.text}
                                </p>

                                <div className="flex items-center gap-4 text-[11px] text-muted-foreground pt-1 border-t">
                                  <span className="flex items-center gap-1">
                                    <Heart className="h-3 w-3 text-rose-500/70" />
                                    <span>{post.engagement?.likes || 0}</span>
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Repeat2 className="h-3 w-3 text-sky-500/70" />
                                    <span>{post.engagement?.shares || 0}</span>
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <MessageSquare className="h-3 w-3 text-indigo-500/70" />
                                    <span>{post.engagement?.comments || 0}</span>
                                  </span>
                                  {post.engagement?.views > 0 && (
                                    <span className="flex items-center gap-1">
                                      <Eye className="h-3 w-3 text-slate-500/70" />
                                      <span>{post.engagement.views.toLocaleString()}</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
