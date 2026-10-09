import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import api from '../../lib/api';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '../../context/auth.context';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Progress } from '../../components/ui/progress';
import { ScrollArea } from '../../components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '../../components/ui/dropdown-menu';
import {
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  Download,
  AlertTriangle,
  FileText,
  FileCheck,
  BarChart3,
  ShieldAlert,
  CheckCircle2,
  Layers,
  ExternalLink,
  Target,
  Info,
  List,
  Loader2,
  Clock,
  Calendar,
  CalendarDays,
  SlidersHorizontal,
  ChevronDown,
  ArrowRight,
  MapPin,
} from 'lucide-react';
import {
  XBrandLogo,
  YoutubeBrandLogo,
  FacebookBrandLogo,
  InstagramBrandLogo,
  TelegramBrandLogo,
  WhatsAppBrandLogo,
  AllPlatformsLogo,
} from '../../components/PlatformBrandIcon';
import { toast } from 'sonner';
import { EventBrief, RiskAlerts, riskLevelOf } from './EventSummaryBrief';

/**
 * Extracts sections from the markdown text based on common section headers.
 */
function extractSectionsFromMarkdown(md = '') {
  if (!md) return {};
  const sections = {};

  const threatMatch = md.match(/###[^\n]*(?:Threat|Public Order)[^\n]*\n([\s\S]*?)(?=###|$)/i);
  if (threatMatch) sections.threat = threatMatch[1].trim();

  const actionsMatch = md.match(/###[^\n]*(?:Recommended|Operational Actions)[^\n]*\n([\s\S]*?)(?=###|$)/i);
  if (actionsMatch) sections.actions = actionsMatch[1].trim();

  const sentimentMatch = md.match(/###[^\n]*(?:Sentiment|Commentary)[^\n]*\n([\s\S]*?)(?=###|$)/i);
  if (sentimentMatch) sections.sentiment = sentimentMatch[1].trim();

  const narrativesMatch = md.match(/###[^\n]*(?:Narratives|Public Claims)[^\n]*\n([\s\S]*?)(?=###|$)/i);
  if (narrativesMatch) sections.narratives = narrativesMatch[1].trim();

  return sections;
}

/** Strip OCR dumps and intent footnotes that were historically appended into post.text. */
function cleanPostDisplayText(t) {
  return (t || '')
    .replace(/\n*\[Image text\][\s\S]*$/i, '')
    .replace(/\*\*Intent Detected:\*\*.*?(?:\n\n|\n|$)/g, '')
    .trim();
}

export default function EventSummaryDialog({ open, onOpenChange, eventId, eventName, event, onGeneratingChange, onReady }) {
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState(null);
  const [summaryData, setSummaryData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('briefing');

  // Report Timeframe & Scope states
  const [timeframe, setTimeframe] = useState('full');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [scopeModalOpen, setScopeModalOpen] = useState(false);
  const [tempTimeframe, setTempTimeframe] = useState('full');
  const [tempFromDate, setTempFromDate] = useState('');
  const [tempToDate, setTempToDate] = useState('');

  // "All Posts" tab — full paginated list of every post analyzed for this event
  // (the narrative/evidence tab only cites a small representative sample).
  const [allPosts, setAllPosts] = useState([]);
  const [allPostsPage, setAllPostsPage] = useState(1);
  const [allPostsHasMore, setAllPostsHasMore] = useState(true);
  const [allPostsTotal, setAllPostsTotal] = useState(0);
  const [allPostsLoading, setAllPostsLoading] = useState(false);
  const [allPostsLoaded, setAllPostsLoaded] = useState(false);
  const [allPostsPlatform, setAllPostsPlatform] = useState('all');
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const loadingSteps = useMemo(
    () => [
      { label: '1. Loading event details & scope', description: 'Checking keywords, platforms & time window', threshold: 15 },
      { label: '2. Reading all social media posts', description: 'Gathering all relevant posts across platforms', threshold: 35 },
      { label: '3. Analyzing sentiment & public tone', description: 'Measuring positive, neutral and negative tone', threshold: 55 },
      { label: '4. Clustering key discussion themes', description: 'Grouping posts by shared topics & claims', threshold: 75 },
      { label: '5. AI writing executive summary', description: 'Synthesizing bottom line, key findings & recommendations', threshold: 95 },
    ],
    []
  );

  const currentActiveStep = useMemo(() => {
    for (let i = 0; i < loadingSteps.length; i++) {
      if (loadingProgress < loadingSteps[i].threshold) {
        return loadingSteps[i];
      }
    }
    return loadingSteps[loadingSteps.length - 1];
  }, [loadingProgress, loadingSteps]);

  const openRef = useRef(open);
  openRef.current = open;
  const eventIdRef = useRef(eventId);
  eventIdRef.current = eventId;
  const pollTimer = useRef(null);
  const progressTimer = useRef(null);
  const progressAnchor = useRef(null);
  const generatingRef = useRef(false);
  const cancelledRef = useRef(false);
  const refreshStartedRef = useRef(0);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const clearJobTimers = useCallback(() => {
    clearInterval(pollTimer.current);
    clearInterval(progressTimer.current);
    pollTimer.current = null;
    progressTimer.current = null;
  }, []);

  const startProgress = useCallback((startedAtIso) => {
    const anchor = startedAtIso || progressAnchor.current || new Date().toISOString();
    if (progressTimer.current && progressAnchor.current === anchor) return;
    progressAnchor.current = anchor;
    const startTime = new Date(anchor).getTime();
    clearInterval(progressTimer.current);
    progressTimer.current = setInterval(() => {
      const elapsed = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
      setElapsedSeconds(elapsed);
      const next = Math.min(96, Math.round((6 + elapsed * 1.1) * 10) / 10);
      setLoadingProgress(next);
    }, 500);
  }, []);

  const timeframeRef = useRef(timeframe);
  timeframeRef.current = timeframe;
  const fromDateRef = useRef(fromDate);
  fromDateRef.current = fromDate;
  const toDateRef = useRef(toDate);
  toDateRef.current = toDate;

  const fetchSummary = useCallback(
    (refresh = false, overrideParams = {}) => {
      const id = eventIdRef.current;
      if (!id) return;
      const tf = overrideParams.timeframe !== undefined ? overrideParams.timeframe : timeframeRef.current;
      const fDate = overrideParams.fromDate !== undefined ? overrideParams.fromDate : fromDateRef.current;
      const tDate = overrideParams.toDate !== undefined ? overrideParams.toDate : toDateRef.current;

      clearInterval(pollTimer.current);
      cancelledRef.current = false;
      generatingRef.current = true;
      if (refresh) refreshStartedRef.current = Date.now();
      setLoading(true);
      setError(null);
      if (refresh) {
        setSummaryData(null);
        setLoadingStep(0);
        setLoadingProgress(6);
        setElapsedSeconds(0);
        progressAnchor.current = null;
      }
      startProgress();

      let usePost = refresh;
      let stopped = false;
      const tick = async () => {
        if (stopped || cancelledRef.current || eventIdRef.current !== id) return;
        try {
          const res = usePost
            ? await api.post(`/events/${id}/summary-llm`, {
                timeframe: tf,
                from_date: fDate || null,
                to_date: tDate || null,
              })
            : await api.get(`/events/${id}/summary-llm`, {
                params: {
                  timeframe: tf,
                  from_date: fDate || null,
                  to_date: tDate || null,
                  _t: Date.now(),
                },
              });
          usePost = false;
          if (stopped || cancelledRef.current || eventIdRef.current !== id) return;
          const data = res?.data?.data || res?.data;

          if (data?.status === 'running') {
            setLoading(true);
            startProgress(data.started_at);
            return;
          }

          if (data?.status === 'cancelled') {
            stopped = true;
            clearInterval(pollTimer.current);
            clearInterval(progressTimer.current);
            pollTimer.current = null;
            progressTimer.current = null;
            generatingRef.current = false;
            refreshStartedRef.current = 0;
            setLoading(false);
            return;
          }

          const generatedAtMs = data?.generated_at ? new Date(data.generated_at).getTime() : 0;
          const stillOld =
            refreshStartedRef.current &&
            !data?.regenerate_error &&
            generatedAtMs &&
            generatedAtMs + 1500 < refreshStartedRef.current;
          if (stillOld) {
            if (Date.now() - refreshStartedRef.current > 12 * 60 * 1000) {
              stopped = true;
              clearInterval(pollTimer.current);
              pollTimer.current = null;
              generatingRef.current = false;
              refreshStartedRef.current = 0;
              clearInterval(progressTimer.current);
              progressTimer.current = null;
              setLoading(false);
              setError('Regenerate did not finish. Open Event Summary and try again.');
              toast.error('Regenerate did not finish');
              return;
            }
            setLoading(true);
            return;
          }

          stopped = true;
          clearInterval(pollTimer.current);
          pollTimer.current = null;
          generatingRef.current = false;
          refreshStartedRef.current = 0;

          if (data?.status === 'failed') {
            clearInterval(progressTimer.current);
            progressTimer.current = null;
            setLoading(false);
            const msg = data.message || 'Failed to generate event summary.';
            setError(msg);
            toast.error('AI Summary generation failed', { description: msg });
            return;
          }

          if (data && (data.summary || data.structuredBriefing)) {
            if (!data.cached) {
              setLoadingProgress(100);
              setLoadingStep(4);
              await new Promise((resolve) => setTimeout(resolve, 300));
            }
            clearInterval(progressTimer.current);
            progressTimer.current = null;
            setSummaryData(data);
            if (data.stats?.timeframe) {
              setTimeframe(data.stats.timeframe);
            }
            if (data.stats?.from_date) {
              setFromDate(data.stats.from_date);
            }
            if (data.stats?.to_date) {
              setToDate(data.stats.to_date);
            }
            setLoading(false);
            onReadyRef.current?.();
            if (data.regenerate_error) {
              toast.error('Regenerate failed', { description: data.regenerate_error });
            } else if (data.summary_source === 'fallback') {
              toast.warning('AI model unavailable — showing database-only summary', {
                description:
                  data.llm_error ||
                  'Check LLM_BASE_URL / LLM_API_KEY on the backend and that the model server is running.',
              });
            } else if (!openRef.current) {
              toast.success('Event summary is ready', {
                description: 'Open Event Summary to read it.',
              });
            } else if (refresh) {
              toast.success('Event summary regenerated');
            }
            return;
          }

          clearInterval(progressTimer.current);
          progressTimer.current = null;
          generatingRef.current = false;
          refreshStartedRef.current = 0;
          setLoading(false);
          setError('No summary data returned from the service.');
        } catch (err) {
          if (stopped || cancelledRef.current || eventIdRef.current !== id) return;
          stopped = true;
          clearInterval(pollTimer.current);
          clearInterval(progressTimer.current);
          pollTimer.current = null;
          progressTimer.current = null;
          generatingRef.current = false;
          refreshStartedRef.current = 0;
          console.error('Failed to fetch event summary:', err);
          const msg =
            err?.response?.data?.message ||
            err?.response?.data?.error ||
            err?.message ||
            'Failed to generate event summary.';
          setError(msg);
          setLoading(false);
          toast.error('AI Summary generation failed', { description: msg });
        }
      };

      tick();
      pollTimer.current = setInterval(tick, 4000);
    },
    [startProgress]
  );

  useEffect(() => () => clearJobTimers(), [clearJobTimers]);

  // Stops the report being generated: the server aborts the model calls and saves nothing; the earlier saved report, if any, is shown again.
  const [cancelling, setCancelling] = useState(false);
  const cancelGeneration = useCallback(async () => {
    const id = eventIdRef.current;
    if (!id) return;
    setCancelling(true);
    cancelledRef.current = true;                 // status checks already on their way are ignored
    clearInterval(pollTimer.current);
    clearInterval(progressTimer.current);
    pollTimer.current = null;
    progressTimer.current = null;
    try {
      await api.post(`/events/${id}/summary-llm/cancel`);
    } catch (err) {
      toast.error('Could not cancel', { description: err?.response?.data?.message || err?.message });
    }
    generatingRef.current = false;
    refreshStartedRef.current = 0;
    setLoading(false);
    setError(null);
    setCancelling(false);
    toast.success('Report generation cancelled', { description: 'Nothing was saved. The earlier report, if there is one, is unchanged.' });
    try {
      const res = await api.get(`/events/${id}/summary-llm`, { params: { timeframe: timeframeRef.current, from_date: fromDateRef.current || null, to_date: toDateRef.current || null, _t: Date.now() } });
      const data = res?.data?.data || res?.data;
      if (data && data.status !== 'running' && data.status !== 'cancelled' && (data.summary || data.structuredBriefing)) setSummaryData(data);
    } catch (err) { /* no earlier report to show */ }
  }, []);


  useEffect(() => {
    onGeneratingChange?.(Boolean(loading && !summaryData));
  }, [loading, summaryData, onGeneratingChange]);

  useEffect(() => {
    if (open && eventId && !summaryData && !loading && !error) {
      fetchSummary(false);
    }
  }, [open, eventId, summaryData, loading, error, fetchSummary]);

  const prevEventId = useRef(eventId);
  useEffect(() => {
    if (prevEventId.current === eventId) return;
    prevEventId.current = eventId;
    clearJobTimers();
    generatingRef.current = false;
    refreshStartedRef.current = 0;
    progressAnchor.current = null;
    setSummaryData(null);
    setError(null);
    setLoading(false);
    setLoadingProgress(0);
    setElapsedSeconds(0);
  }, [eventId, clearJobTimers]);

  const handleOpenChange = (next) => {
    if (!next && loading && !summaryData) {
      toast.message('Report is still generating', {
        description: 'You can close this. It keeps running, and Event Summary will show it when it is ready.',
      });
    }
    if (!next) {
      setAllPosts([]);
      setAllPostsPage(1);
      setAllPostsHasMore(true);
      setAllPostsTotal(0);
      setAllPostsLoaded(false);
      setAllPostsPlatform('all');
    }
    onOpenChange(next);
  };

  // A different report window (Daily, Weekly, ...) means a different set of posts: clear the list so it is loaded again for that window.
  useEffect(() => {
    setAllPosts([]);
    setAllPostsPage(1);
    setAllPostsHasMore(true);
    setAllPostsTotal(0);
    setAllPostsLoaded(false);
  }, [timeframe, fromDate, toDate, eventId]);

  const fetchAllPosts = useCallback(
    async (page = 1, platform = allPostsPlatform, append = false) => {
      if (!eventId) return;
      setAllPostsLoading(true);
      try {
        const res = await api.get(`/events/${eventId}/content`, {
          params: { page, limit: 50, platform, timeframe: timeframeRef.current || 'full', from_date: fromDateRef.current || undefined, to_date: toDateRef.current || undefined },
        });
        const data = res?.data || {};
        const items = Array.isArray(data.content) ? data.content : [];
        setAllPosts((prev) => (append ? [...prev, ...items] : items));
        setAllPostsPage(page);
        setAllPostsHasMore(Boolean(data.pagination?.hasMore ?? data.has_more));
        setAllPostsTotal(data.pagination?.total ?? items.length);
        setAllPostsLoaded(true);
      } catch (err) {
        console.error('Failed to fetch event posts:', err);
        toast.error('Failed to load all posts');
      } finally {
        setAllPostsLoading(false);
      }
    },
    [eventId, allPostsPlatform]
  );

  useEffect(() => {
    if (open && activeTab === 'posts' && !allPostsLoaded) {
      fetchAllPosts(1, allPostsPlatform, false);
    }
  }, [open, activeTab, allPostsLoaded, allPostsPlatform, fetchAllPosts]);

  const handlePostsPlatformChange = (platform) => {
    setAllPostsPlatform(platform);
    setAllPostsLoaded(false);
  };

  const displayName = summaryData?.eventName || summaryData?.event?.name || eventName || 'Event';
  const stats = summaryData?.stats || summaryData?.telemetrySummary || {};
  const totalPosts = stats.total_media_count ?? stats.total_unique_posts ?? stats.totalTelemetryPosts ?? 0;
  const totalKeywordMentions = stats.total_keyword_mentions || 0;
  const platforms = stats.platform_counts || stats.platforms || {};
  const platformPercentages = stats.platform_percentages || {};
  const sentiment = stats.sentiment_counts || stats.sentiment || {};
  const sentimentPercentages = stats.sentiment_percentages || {};
  const risk = stats.risk_counts || stats.risk || {};
  const targetClassification = stats.target_classification || {};
  const evidenceTraceability = summaryData?.evidence_traceability || [];
  const generatedAt = summaryData?.generated_at || summaryData?.generatedAt;
  const extracted = useMemo(() => extractSectionsFromMarkdown(summaryData?.summary || ''), [summaryData?.summary]);

  // Compute unified platform list with accurate counts, brand icons & percentages
  const platformList = useMemo(() => {
    const raw = platforms || {};
    const twitterCount = (raw.twitter || 0) + (raw.x || 0);
    const instagramCount = (raw.instagram || 0) + (raw.insta || 0);
    const youtubeCount = (raw.youtube || 0) + (raw.yt || 0);
    const facebookCount = (raw.facebook || 0) + (raw.fb || 0);
    const telegramCount = (raw.telegram || 0) + (raw.tg || 0);
    const whatsappCount = (raw.whatsapp || 0) + (raw.wa || 0);

    const getPct = (key, count) => {
      if (platformPercentages[key] !== undefined) return platformPercentages[key];
      if (key === 'twitter' && platformPercentages['x'] !== undefined) return platformPercentages['x'];
      if (key === 'x' && platformPercentages['twitter'] !== undefined) return platformPercentages['twitter'];
      return totalPosts > 0 ? Math.round((count / totalPosts) * 100) : 0;
    };

    const basePlatforms = [
      { key: 'twitter', label: 'Twitter / X', count: twitterCount, percentage: getPct('twitter', twitterCount), Icon: XBrandLogo, color: 'text-foreground' },
      { key: 'instagram', label: 'Instagram', count: instagramCount, percentage: getPct('instagram', instagramCount), Icon: InstagramBrandLogo, color: 'text-pink-500' },
      { key: 'youtube', label: 'YouTube', count: youtubeCount, percentage: getPct('youtube', youtubeCount), Icon: YoutubeBrandLogo, color: 'text-red-500' },
      { key: 'facebook', label: 'Facebook', count: facebookCount, percentage: getPct('facebook', facebookCount), Icon: FacebookBrandLogo, color: 'text-blue-600' },
      { key: 'telegram', label: 'Telegram', count: telegramCount, percentage: getPct('telegram', telegramCount), Icon: TelegramBrandLogo, color: 'text-sky-500' },
      { key: 'whatsapp', label: 'WhatsApp', count: whatsappCount, percentage: getPct('whatsapp', whatsappCount), Icon: WhatsAppBrandLogo, color: 'text-emerald-500' },
    ];

    const knownKeys = new Set(['twitter', 'x', 'instagram', 'insta', 'youtube', 'yt', 'facebook', 'fb', 'telegram', 'tg', 'whatsapp', 'wa', 'other']);
    const customList = [];
    Object.entries(raw).forEach(([k, v]) => {
      if (!knownKeys.has(k.toLowerCase()) && v > 0) {
        customList.push({
          key: k,
          label: k.toUpperCase(),
          count: v,
          percentage: getPct(k, v),
          Icon: AllPlatformsLogo,
          color: 'text-muted-foreground',
        });
      }
    });

    return [...basePlatforms, ...customList].filter((p) => p.count > 0);
  }, [platforms, platformPercentages, totalPosts]);

  const { user } = useAuth() || {};
  const tenantName = useMemo(() => {
    // 1. Direct tenant properties from authenticated user
    const userCandidates = [
      user?.blurasagatitle,
      user?.theme_name,
      user?.organization_name,
      user?.organization,
      user?.tenant_name,
      user?.tenantName,
      user?.agency_name,
      user?.department,
    ];
    for (const candidate of userCandidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }

    // 2. Active document title dynamically set by theme/tenant loader
    if (typeof document !== 'undefined' && document.title) {
      const docHeader = document.title.split(/[—\-|]/)[0]?.trim();
      const genericTitles = ['blura saga'];
      if (docHeader && !genericTitles.includes(docHeader.toLowerCase())) {
        return docHeader;
      }
    }

    // 3. Dynamic tenant extraction from hostname/subdomain (zero hardcoded tenant names)
    if (typeof window !== 'undefined' && window.location.hostname) {
      const host = window.location.hostname.toLowerCase();
      const parts = host.split('.');
      if (parts.length > 1) {
        const sub = parts[0];
        const ignoredSubdomains = ['localhost', '127', 'www', 'app', 'dev', 'api', 'admin', 'stage', 'staging'];
        if (sub && !ignoredSubdomains.includes(sub)) {
          const formatted = sub
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/[-_.]+/g, ' ')
            .replace(/([a-z])(police)\b/i, '$1 $2')
            .replace(/([a-z])(dept|department)\b/i, '$1 $2')
            .trim();
          if (formatted) {
            return formatted.toUpperCase();
          }
        }
      }
    }

    return 'DIGITAL INTELLIGENCE PLATFORM';
  }, [user]);

  // Clicking a [Post #n] citation opens the evidence list (Data Telemetry tab) and scrolls to that post.
  const handleCite = (n) => {
    setActiveTab('telemetry');
    setTimeout(() => {
      const el = document.getElementById(`ev-${n}`);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('ring-2', 'ring-indigo-400'); setTimeout(() => el.classList.remove('ring-2', 'ring-indigo-400'), 2200); }
    }, 250);
  };

  const handleCopy = () => {
    if (!summaryData?.summary) return;
    const textToCopy = `# Event Summary: ${displayName}\nGenerated: ${generatedAt || new Date().toISOString()}\n\n${summaryData.summary}`;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    toast.success('Event summary copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const eventMinDate = useMemo(() => {
    if (!event?.start_date) return '';
    try {
      const d = new Date(event.start_date);
      return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
    } catch (e) {
      return '';
    }
  }, [event?.start_date]);

  const eventMaxDate = useMemo(() => {
    if (!event?.end_date) return '';
    try {
      const d = new Date(event.end_date);
      return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
    } catch (e) {
      return '';
    }
  }, [event?.end_date]);

  const eventDateRangeFormatted = useMemo(() => {
    if (!event?.start_date && !event?.end_date) return null;
    const fmt = (iso) => {
      if (!iso) return '';
      const d = new Date(iso);
      return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    };
    return `${fmt(event?.start_date) || 'Beginning'} – ${fmt(event?.end_date) || 'Ongoing'}`;
  }, [event?.start_date, event?.end_date]);

  const timeframeLabel = useMemo(() => {
    if (summaryData?.stats?.timeframe_label) return summaryData.stats.timeframe_label;
    switch (timeframe) {
      case 'daily':
        return 'Daily (Today)';
      case 'weekly':
        return 'Weekly (Last 7 Days)';
      case 'monthly':
        return 'Monthly (Current Month)';
      case 'last_month':
        return 'Last Month';
      case 'custom':
        return fromDate || toDate ? `Custom (${fromDate || '...'} – ${toDate || '...'})` : 'Custom Range';
      case 'full':
      default:
        return 'Full Event Duration';
    }
  }, [summaryData?.stats?.timeframe_label, timeframe, fromDate, toDate]);

  const scopeOptions = useMemo(() => {
    const now = new Date();
    const eventStart = event?.start_date ? new Date(event.start_date) : null;
    const eventEnd = event?.end_date ? new Date(event.end_date) : null;

    // Check if a timeframe window [wStart, wEnd] intersects with [eventStart, eventEnd]
    const intersectsEvent = (wStart, wEnd) => {
      if (eventStart && wEnd && wEnd < eventStart) return false;
      if (eventEnd && wStart && wStart > eventEnd) return false;
      return true;
    };

    // 1. Daily: today
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const isDailyValid = intersectsEvent(startOfToday, endOfToday);

    // 2. Weekly: last 7 days
    const startOfWeekly = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const isWeeklyValid = intersectsEvent(startOfWeekly, now);

    // 3. Monthly: current month (1st of this month to end of this month)
    const currentMonthName = now.toLocaleString('default', { month: 'long' });
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    const endOfCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const isMonthlyValid = intersectsEvent(startOfCurrentMonth, endOfCurrentMonth);

    // 4. Last Month: previous month (1st of last month to end of last month)
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthName = lastMonthDate.toLocaleString('default', { month: 'long' });
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    const isLastMonthValid = intersectsEvent(startOfLastMonth, endOfLastMonth);

    return [
      {
        id: 'daily',
        label: 'Daily Report',
        description: isDailyValid ? 'Current date activity (today)' : 'Event was not active today',
        badge: isDailyValid ? 'Today' : 'Out of Range',
        icon: Clock,
        color: isDailyValid ? 'text-amber-500' : 'text-muted-foreground',
        available: isDailyValid,
      },
      {
        id: 'weekly',
        label: 'Weekly Report',
        description: isWeeklyValid ? 'Rolling last 7 days activity window' : 'Event ended before last 7 days',
        badge: isWeeklyValid ? 'Last 7 Days' : 'Out of Range',
        icon: CalendarDays,
        color: isWeeklyValid ? 'text-blue-500' : 'text-muted-foreground',
        available: isWeeklyValid,
      },
      {
        id: 'monthly',
        label: 'Monthly Report',
        description: isMonthlyValid ? `Current month (${currentMonthName}) activity` : `Event was not active in ${currentMonthName}`,
        badge: isMonthlyValid ? 'This Month' : 'Out of Range',
        icon: Calendar,
        color: isMonthlyValid ? 'text-purple-500' : 'text-muted-foreground',
        available: isMonthlyValid,
      },
      {
        id: 'last_month',
        label: 'Last Month Report',
        description: isLastMonthValid ? `Previous month (${lastMonthName}) activity` : `Event was not active in ${lastMonthName}`,
        badge: isLastMonthValid ? 'Previous Month' : 'Out of Range',
        icon: Calendar,
        color: isLastMonthValid ? 'text-indigo-500' : 'text-muted-foreground',
        available: isLastMonthValid,
      },
      {
        id: 'full',
        label: 'Full Event Duration',
        description: 'All historical monitored posts for this event',
        badge: 'All Dates',
        icon: Layers,
        color: 'text-emerald-500',
        available: true,
      },
      {
        id: 'custom',
        label: 'Custom Date Range',
        description: 'Select custom start and end dates',
        badge: 'Custom',
        icon: SlidersHorizontal,
        color: 'text-cyan-500',
        available: true,
      },
    ];
  }, [event?.start_date, event?.end_date]);

  /**
   * Downloads the Event Intelligence & Social Analytics report. The PDF is rendered on the
   * server (HTML → PDF) from the cached Summary AI result and keyword analytics, so charts
   * and multilingual post text render consistently.
   */
  const regionLabel = summaryData?.event?.location || 'Region';
  const handleDownload = async (withEvidence = true, regionOnly = false) => {
    if (!summaryData?.summary || !eventId) return;
    setPdfGenerating(true);
    try {
      const res = await api.get(`/events/${eventId}/summary-llm/report.pdf`, {
        params: {
          tenant: tenantName,
          timeframe: timeframe || 'full',
          from_date: fromDate || undefined,
          to_date: toDate || undefined,
          include_evidence: withEvidence ? 'true' : 'false',
          scope: regionOnly ? 'region' : undefined,
        },
        responseType: 'blob',
        timeout: 300000,
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const safe = (v) => String(v || '').replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_');
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const tfSuffix = timeframe && timeframe !== 'full' ? `_${safe(timeframe).toUpperCase()}` : '';
      link.download = `${safe(tenantName)}_${safe(displayName)}${tfSuffix}_Report_${withEvidence ? 'With_Evidence' : regionOnly ? 'Region_Executive_Summary' : 'Executive'}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Event Intelligence report (${withEvidence ? 'with evidence' : regionOnly ? `${regionLabel} executive summary` : 'executive summary'}) downloaded`);
    } catch (err) {
      console.error('Failed to generate PDF report:', err);
      toast.error('Failed to generate PDF report: ' + (err?.response?.statusText || err.message));
    } finally {
      setPdfGenerating(false);
    }
  };

  // Opens the timeframe dialog; from the header it falls back to a window that has posts, from the notice it keeps the current one.
  const openScopeModal = (useFallback) => {
    if (useFallback) {
      const isCurrentAvail = scopeOptions.find((o) => o.id === timeframe)?.available !== false;
      const fallbackTf = scopeOptions.find((o) => o.id === 'last_month')?.available ? 'last_month' : 'full';
      setTempTimeframe(isCurrentAvail ? timeframe : fallbackTf);
    } else {
      setTempTimeframe(timeframe);
    }
    setTempFromDate(fromDate);
    setTempToDate(toDate);
    setScopeModalOpen(true);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-6xl h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-background border-border shadow-2xl rounded-xl"
        onPointerDownOutside={(e) => { if (generatingRef.current) e.preventDefault(); }}
        onInteractOutside={(e) => { if (generatingRef.current) e.preventDefault(); }}
        onFocusOutside={(e) => { if (generatingRef.current) e.preventDefault(); }}
      >
        {/* Header: title, event, risk, and one toolbar */}
        <DialogHeader className="px-6 pt-4 pb-3 border-b bg-background space-y-0 text-left">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 pr-8">
            <div className="flex items-center gap-3 min-w-0 flex-1 basis-[20rem]">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-sm shrink-0">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <DialogTitle className="text-[15px] font-semibold tracking-tight text-foreground leading-6">Event Summary</DialogTitle>
                  {summaryData && !loading && (() => {
                    const rk = riskLevelOf(stats);
                    const tone = rk.level === 'High'
                      ? 'bg-rose-600 text-white'
                      : rk.level === 'Medium'
                        ? 'bg-amber-600 text-white'
                        : 'bg-emerald-600 text-white';
                    return (
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone}`} title="Public order risk: from calls to act, violence and high-risk ratings. Negative tone alone does not raise it.">
                        {rk.level} risk
                      </span>
                    );
                  })()}
                </div>
                <DialogDescription className="text-[13px] font-medium text-foreground/90 leading-5 truncate" title={displayName}>
                  {displayName}
                </DialogDescription>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap ml-auto">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openScopeModal(true)}
                disabled={loading}
                className="h-9 gap-1.5 text-xs font-medium"
                title="Select report timeframe (Daily, Weekly, Monthly, Custom Range)"
              >
                <CalendarDays className="h-3.5 w-3.5 text-indigo-500" />
                <span className="max-w-[150px] truncate">{timeframeLabel}</span>
                <ChevronDown className="h-3 w-3 opacity-60 shrink-0" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onPointerDown={(e) => e.preventDefault()}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); openScopeModal(true); }}
                disabled={loading}
                className="h-9 gap-1.5 text-xs font-medium"
                title="Change timeframe and regenerate report"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Regenerate</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                disabled={loading || !summaryData?.summary}
                className="h-9 w-9 p-0"
                title="Copy markdown text"
                aria-label="Copy summary text"
              >
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    disabled={loading || pdfGenerating || !summaryData?.summary}
                    className="h-9 gap-1.5 text-xs font-semibold"
                    title="Download the report as PDF"
                  >
                    {pdfGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    <span>{pdfGenerating ? 'Preparing…' : 'Download Report'}</span>
                    <ChevronDown className="h-3 w-3 opacity-70 ml-0.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuLabel className="text-[11px] font-semibold text-muted-foreground tracking-wide uppercase">
                    Select Report Format
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => handleDownload(false)}
                    disabled={pdfGenerating}
                    className="flex items-start gap-2.5 cursor-pointer py-2 px-2.5"
                  >
                    <FileText className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-semibold text-foreground">Executive Summary (without evidence)</span>
                      <span className="text-[11px] text-muted-foreground leading-tight">
                        The assessment, risk, places, actors and actions, without the post-by-post register
                      </span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleDownload(false, true)}
                    disabled={pdfGenerating}
                    className="flex items-start gap-2.5 cursor-pointer py-2 px-2.5"
                  >
                    <MapPin className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-semibold text-foreground">{regionLabel} Executive Summary</span>
                      <span className="text-[11px] text-muted-foreground leading-tight">
                        Only posts, places, actors and actions in {regionLabel}; nothing from elsewhere
                      </span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleDownload(true)}
                    disabled={pdfGenerating}
                    className="flex items-start gap-2.5 cursor-pointer py-2 px-2.5"
                  >
                    <FileCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-semibold text-foreground">Full Report (with evidence)</span>
                      <span className="text-[11px] text-muted-foreground leading-tight">
                        Everything above plus every post with a clickable link
                      </span>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 pl-[3.25rem] text-[11.5px] text-muted-foreground">
            {totalPosts > 0 && <span><strong className="text-foreground tabular-nums">{totalPosts}</strong> unique posts analysed</span>}
            {(stats.relevant_posts_count ?? totalPosts) > 0 && (
              <span title="Posts classified as directly related to the event"><strong className="text-foreground tabular-nums">{stats.relevant_posts_count ?? totalPosts}</strong> event-relevant</span>
            )}
            {generatedAt && <span>Generated {new Date(generatedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>}
            {summaryData?.generated_by?.name && <span>by <strong className="text-foreground">{summaryData.generated_by.name}</strong></span>}
            {summaryData?.has_pdf && (
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3 w-3" /> PDF saved</span>
            )}
          </div>
        </DialogHeader>

        {/* Notices: one slim row instead of stacked banners */}
        {!loading && summaryData && (summaryData.summary_source === 'fallback' || summaryData.is_stale || (summaryData.summary_truncated && summaryData.summary_source === 'llm')) && (
          <div className="px-6 py-2 border-b bg-muted/30 flex flex-wrap items-center gap-2">
            {summaryData.summary_source === 'fallback' && (
              <span
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-300/70 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-2.5 py-1 text-[11.5px] text-amber-900 dark:text-amber-200"
                title={`The AI model did not respond, so this report uses fixed template text plus your live post counts and five sample citations.${summaryData.llm_error ? ` (${summaryData.llm_error})` : ''}`}
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <strong>Database-only summary</strong>
                <span className="opacity-80">· AI model did not respond; counts are live, narrative is template text</span>
              </span>
            )}
            {summaryData.summary_truncated && summaryData.summary_source === 'llm' && (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-orange-300/70 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-900 px-2.5 py-1 text-[11.5px] text-orange-900 dark:text-orange-200">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <strong>Incomplete report</strong>
                <span className="opacity-80">· the model stopped before finishing; regenerate</span>
              </span>
            )}
            {summaryData.is_stale && (
              <span className="inline-flex items-center gap-2 rounded-md border border-sky-300/70 bg-sky-50 dark:bg-sky-950/30 dark:border-sky-900 pl-2.5 pr-1 py-0.5 text-[11.5px] text-sky-950 dark:text-sky-100">
                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                <strong>
                  {summaryData.new_posts_count > 0
                    ? `${summaryData.new_posts_count} new post${summaryData.new_posts_count === 1 ? '' : 's'} since this report`
                    : 'New activity since this report'}
                </strong>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); openScopeModal(false); }}
                >
                  Regenerate
                </Button>
              </span>
            )}
          </div>
        )}

        {/* Body content */}
        <div className="flex-1 min-h-0 overflow-hidden p-0 relative">
          {loading ? (
            <div className="flex flex-col items-center justify-center p-8 sm:p-12 min-h-[420px] text-center max-w-xl mx-auto">
              <div className="h-14 w-14 rounded-2xl bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800 flex items-center justify-center mb-4 text-purple-600 dark:text-purple-400 shadow-sm shadow-purple-500/10">
                <Sparkles className="h-7 w-7 animate-pulse text-purple-600 dark:text-purple-400" />
              </div>
              
              <h3 className="text-lg font-bold text-foreground mb-1 tracking-tight">
                Synthesizing Event Summary
              </h3>
              <p className="text-xs text-muted-foreground max-w-md mb-6">
                Processing all telemetry rows, clustering cross-platform signals, and generating neural OSINT narratives.
              </p>

              {/* Progress & Percentage Box */}
              <div className="w-full bg-card/80 backdrop-blur-sm rounded-2xl p-5 border border-border shadow-sm text-left space-y-4">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-purple-600"></span>
                    </span>
                    <span className="font-semibold text-foreground">Live Progress</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                      <Clock className="h-3 w-3 text-purple-500" />
                      {String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:{String(elapsedSeconds % 60).padStart(2, '0')}s
                    </span>
                    <Badge className="bg-purple-600 text-white font-bold text-xs px-2.5 py-0.5 shadow-sm shadow-purple-500/20">
                      {Math.round(loadingProgress)}%
                    </Badge>
                  </div>
                </div>

                {/* Animated Progress Bar */}
                <div className="space-y-1">
                  <Progress
                    value={loadingProgress}
                    className="h-2.5 rounded-full bg-muted overflow-hidden"
                    indicatorClassName="bg-gradient-to-r from-indigo-500 via-purple-600 to-pink-500 transition-all duration-300 ease-out"
                  />
                </div>

                {/* Active Step Highlight Banner */}
                {currentActiveStep && (
                  <div className="bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 rounded-xl px-3.5 py-2.5 flex items-start gap-2.5 text-xs text-purple-950 dark:text-purple-100">
                    <Loader2 className="h-4 w-4 text-purple-600 dark:text-purple-400 animate-spin shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{currentActiveStep.label}</div>
                      <div className="text-[11px] text-purple-700/80 dark:text-purple-300/80 mt-0.5">{currentActiveStep.description}</div>
                    </div>
                  </div>
                )}

              {/* Step indicator */}
                <div className="pt-2 border-t border-border/40 space-y-2">
                {loadingSteps.map((step, idx) => {
                    const isDone = loadingProgress >= step.threshold;
                    const isCurrent = !isDone && (idx === 0 || loadingProgress >= loadingSteps[idx - 1].threshold);

                  return (
                    <div
                      key={idx}
                        className={`flex items-center justify-between gap-2.5 text-xs transition-colors duration-200 ${
                          isCurrent
                        ? 'text-purple-600 dark:text-purple-300 font-semibold'
                        : isDone
                            ? 'text-foreground font-medium'
                          : 'text-muted-foreground/50'
                        }`}
                    >
                        <div className="flex items-center gap-2.5 min-w-0">
                      {isDone ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      ) : isCurrent ? (
                            <Loader2 className="h-4 w-4 text-purple-600 dark:text-purple-400 animate-spin shrink-0" />
                          ) : (
                            <div className="h-4 w-4 rounded-full border border-border shrink-0" />
                          )}
                          <span className="truncate">{step.label}</span>
                        </div>
                        {isDone && (
                          <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 shrink-0 font-medium">Done</span>
                        )}
                        {isCurrent && (
                          <span className="text-[10px] font-mono text-purple-600 dark:text-purple-400 shrink-0 font-semibold animate-pulse">Running</span>
                        )}
                    </div>
                  );
                })}
              </div>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={cancelGeneration}
                disabled={cancelling}
                className="mt-4 h-9 gap-2 border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40"
                title="Stop generating this report. Nothing is saved."
              >
                {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                <span>{cancelling ? 'Cancelling…' : 'Cancel generation'}</span>
              </Button>

              <p className="text-[11px] text-muted-foreground/80 mt-4 flex items-center justify-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-purple-500 shrink-0" />
                <span>All event posts are processed in prioritized batches for complete evidence coverage.</span>
              </p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center p-12 min-h-[360px] text-center">
              <div className="h-12 w-12 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center mb-3">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-semibold text-foreground mb-1">Summary Generation Issue</h3>
              <p className="text-xs text-muted-foreground max-w-md mb-4">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchSummary(true)}
                className="gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry Analysis
              </Button>
            </div>
          ) : summaryData ? (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
              <div className="px-6 border-b bg-background shrink-0">
                <TabsList className="h-11 bg-transparent p-0 gap-1 justify-start">
                  {[
                    ['briefing', FileText, 'text-purple-600', 'Event Summary'],
                    ['advisory', ShieldAlert, 'text-amber-600', 'Risk & Advisory'],
                    ['telemetry', BarChart3, 'text-blue-600', 'Data Telemetry'],
                    ['posts', List, 'text-emerald-600', 'All Posts'],
                  ].map(([value, TabIcon, iconColor, label]) => (
                    <TabsTrigger
                      key={value}
                      value={value}
                      className="relative h-11 rounded-none bg-transparent px-3 text-[13px] font-medium text-muted-foreground shadow-none data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full data-[state=active]:after:bg-purple-600"
                    >
                      <TabIcon className={`h-4 w-4 mr-1.5 ${iconColor}`} />
                      {label}
                      {value === 'posts' && totalPosts > 0 ? (
                        <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">{totalPosts}</span>
                      ) : null}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              <div className="relative flex-1 min-h-0 overflow-hidden">
                <TabsContent value="briefing" className="absolute inset-0 m-0 p-0">
                  <ScrollArea className="h-full px-7 py-6">
                    <EventBrief summaryData={summaryData} platformList={platformList} displayName={displayName} tenantName={tenantName} onCite={handleCite} />
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="advisory" className="absolute inset-0 m-0 p-0">
                  <ScrollArea className="h-full px-7 py-6">
                    <div className="max-w-3xl text-foreground">
                      <header className="mb-6">
                        <div className="text-[10px] font-semibold tracking-[0.14em] uppercase text-muted-foreground mb-1.5">
                          Risk &amp; advisory
                        </div>
                        <h2 className="text-xl font-semibold tracking-tight leading-snug">
                          {displayName || summaryData?.event?.name || 'Event'}
                        </h2>
                        <p className="mt-1.5 text-[12px] text-muted-foreground leading-5">
                          Public order, recommended actions, and sentiment context
                        </p>
                      </header>

                      <RiskAlerts summaryData={summaryData} onCite={handleCite} />

                      <section className="mb-8">
                        <div className="flex items-baseline gap-2.5 border-b border-border/80 pb-2 mb-4">
                          <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">05</span>
                          <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-foreground/90">
                            Threat &amp; public order
                          </span>
                        </div>
                        <div className="prose dark:prose-invert max-w-none text-[13.5px] leading-6 prose-p:my-1.5 prose-p:text-foreground/85">
                          <ReactMarkdown>
                            {summaryData?.stats?.structured_report?.publicOrder ||
                              extracted.threat ||
                              summaryData.structuredBriefing?.threatAndRisk ||
                              '_Not available for this summary. Regenerate to create it._'}
                          </ReactMarkdown>
                        </div>
                      </section>

                      <section className="mb-8">
                        <div className="flex items-baseline gap-2.5 border-b border-border/80 pb-2 mb-4">
                          <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">06</span>
                          <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-foreground/90">
                            Recommended actions
                          </span>
                        </div>
                        <div className="prose dark:prose-invert max-w-none text-[13.5px] leading-6 prose-p:my-1.5 prose-li:my-1 prose-ol:my-1.5 prose-p:text-foreground/85 prose-li:text-foreground/85">
                          <ReactMarkdown>
                            {(summaryData?.stats?.structured_report?.actions?.length
                              ? summaryData.stats.structured_report.actions
                                  .map((a, i) => `${i + 1}. **${a.action}:** ${a.detail}`)
                                  .join('\n')
                              : '') ||
                              extracted.actions ||
                              summaryData.structuredBriefing?.recommendedActions ||
                              '_Not available for this summary. Regenerate to create it._'}
                          </ReactMarkdown>
                        </div>
                      </section>

                      <section className="mb-8">
                        <div className="flex items-baseline gap-2.5 border-b border-border/80 pb-2 mb-4">
                          <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">07</span>
                          <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-foreground/90">
                            Public sentiment
                          </span>
                        </div>
                        <div className="prose dark:prose-invert max-w-none text-[13.5px] leading-6 prose-p:my-1.5 prose-p:text-foreground/85">
                          <ReactMarkdown>
                            {summaryData?.stats?.structured_report?.sentimentCommentary ||
                              extracted.sentiment ||
                              summaryData.structuredBriefing?.publicSentiment ||
                              '_Not available for this summary. Regenerate to create it._'}
                          </ReactMarkdown>
                        </div>
                      </section>
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="telemetry" className="absolute inset-0 m-0 p-0">
                  <ScrollArea className="h-full px-7 py-6 space-y-6">
                    {/* Top KPI Metrics: Clearly distinguish Unique Posts vs Keyword Mentions and decouple Risk from Criticism */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                      <div className="rounded-xl border border-border/70 p-4 bg-muted/20">
                        <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                          Unique Posts Analyzed
                        </div>
                        <div className="text-2xl font-bold mt-1 text-foreground">
                          {totalPosts}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1">
                          Distinct social media records
                        </div>
                      </div>

                      <div className="rounded-xl border border-border/70 p-4 bg-muted/20">
                        <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                          <span>Keyword Mentions</span>
                          <Layers className="h-3 w-3 text-indigo-500" />
                        </div>
                        <div className="text-2xl font-bold mt-1 text-indigo-600 dark:text-indigo-400">
                          {totalKeywordMentions > 0 ? totalKeywordMentions : totalPosts}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1" title="Posts frequently match multiple event keywords">
                          Summary calculation; differs from keyword-analytics matches
                        </div>
                      </div>

                      <div className="rounded-xl border border-border/70 p-4 bg-muted/20">
                        <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                          Negative tone
                        </div>
                        <div className="text-2xl font-bold mt-1 text-red-600 dark:text-red-400">
                          {sentiment?.negative || 0}
                          {sentimentPercentages?.negative !== undefined && (
                            <span className="text-xs font-normal text-muted-foreground ml-1.5">
                              ({sentimentPercentages.negative}%)
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1">
                          Policy critique (Non-threat feedback)
                        </div>
                      </div>

                      <div className="rounded-xl border border-border/70 p-4 bg-muted/20">
                        <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                          Public Order Threat
                        </div>
                        <div className="text-2xl font-bold mt-1 text-amber-600 dark:text-amber-400">
                          {(risk?.high || 0) + (risk?.critical || 0)}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1">
                          Critical & high threat vectors
                        </div>
                      </div>
                    </div>

                    {/* Explanatory Guide Banner */}
                    <div className="p-3.5 rounded-xl border bg-muted/30 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2 font-semibold text-foreground shrink-0">
                        <Info className="h-4 w-4 text-purple-600 dark:text-purple-400 shrink-0" />
                        <span>Intelligence Standard:</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
                        <span><strong className="text-foreground">Sentiment ≠ Threat:</strong> Negative sentiment represents criticism and grievances, not public order disruption.</span>
                        <span><strong className="text-foreground">Mentions vs Posts:</strong> {totalPosts} unique posts yielded {totalKeywordMentions > 0 ? totalKeywordMentions : 'multiple'} keyword occurrences due to term co-occurrence.</span>
                      </div>
                    </div>

                    {/* Platform Breakdown Box with exact percentages */}
                    {platformList.length > 0 && (
                      <div className="rounded-xl border border-border/70 p-5 bg-card">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Platform Ingestion Volumes & Share
                          </h4>
                          <span className="text-[11px] text-muted-foreground">
                            Percentages calculated over {totalPosts} analyzed posts
                          </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                          {platformList.map((item) => {
                            const ItemIcon = item.Icon;
                            return (
                              <div
                                key={item.key}
                                className="flex items-center gap-2.5 p-3 rounded-lg border bg-muted/40 border-border/60 shadow-2xs"
                              >
                                <ItemIcon className={`h-4 w-4 shrink-0 ${item.color}`} />
                                <div className="min-w-0">
                                  <div className="text-xs font-medium truncate">{item.label}</div>
                                  <div className="text-sm font-bold text-foreground">
                                    {item.count}{' '}
                                    <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">
                                      ({item.percentage}%)
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Target & Entity Classification */}
                    {targetClassification && Object.keys(targetClassification).length > 0 && (
                      <div className="rounded-xl border border-border/70 p-5 bg-card">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Target className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                              Target & Entity Sentiment Classification
                            </h4>
                          </div>
                          <div className="flex items-center gap-3 text-[11px]">
                            <span className="text-emerald-600 font-medium">Positive</span>
                            <span>•</span>
                            <span className="text-sky-600 font-medium">Neutral = News/Updates</span>
                            <span>•</span>
                            <span className="text-red-600 font-medium">Negative</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                          {Object.entries(targetClassification).map(([entity, stats]) => (
                            <div key={entity} className="p-3 rounded-lg border bg-muted/30 border-border/60 space-y-1.5">
                              <div className="text-xs font-bold text-foreground truncate" title={entity}>
                                {entity}
                              </div>
                              <div className="text-[11px] text-muted-foreground flex justify-between">
                                <span>Total Mentions:</span>
                                <strong className="text-foreground">{stats.total || 0}</strong>
                              </div>
                              <div className="pt-1 border-t space-y-0.5 text-[11px]">
                                <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                                  <span>Positive:</span>
                                  <span className="font-semibold">{stats.praise || 0}</span>
                                </div>
                                <div className="flex justify-between text-sky-600 dark:text-sky-400">
                                  <span>Neutral:</span>
                                  <span className="font-semibold">{stats.news || 0}</span>
                                </div>
                                <div className="flex justify-between text-rose-600 dark:text-rose-400">
                                  <span>Negative:</span>
                                  <span className="font-semibold">{stats.criticism || 0}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Evidence Traceability */}
                    {evidenceTraceability && evidenceTraceability.length > 0 && (
                      <div className="rounded-xl border border-border/70 p-5 bg-card">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                            Evidence Traceability ({evidenceTraceability.length} Sampled Posts)
                          </h4>
                          <span className="text-[11px] text-muted-foreground">
                            Citations linked directly to underlying posts
                          </span>
                        </div>
                        <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                          {evidenceTraceability.map((item, idx) => (
                            <div
                              key={item.id || idx}
                              id={`ev-${(String(item.citationTag || '').match(/\d+/) || [idx + 1])[0]}`}
                              className="p-2.5 rounded-lg border bg-muted/20 border-border/50 text-xs flex flex-col gap-1.5"
                            >
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-[10px] font-bold bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200">
                                    {item.citationTag || `[Post #${idx + 1}]`}
                                  </Badge>
                                  <span className="font-medium text-foreground">@{item.author}</span>
                                  <span className="text-[11px] text-muted-foreground uppercase">({item.platform})</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Badge variant="secondary" className="text-[10px]">
                                    {item.target_entity || 'Target'} ({item.target_semantic || item.sentiment})
                                  </Badge>
                                  {item.url && (
                                    <a
                                      href={item.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 ml-1"
                                      title="Open original post"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  )}
                                </div>
                              </div>
                              <p className="text-muted-foreground text-[11px] leading-relaxed line-clamp-2">
                                "{item.text}"
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Key Narratives - Rendered Markdown */}
                    {(extracted.narratives || summaryData.structuredBriefing?.keyNarratives) && (
                      <div className="rounded-xl border border-border/70 p-5 bg-card">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                          Key Narratives & Demands
                        </h4>
                        <div className="prose dark:prose-invert max-w-none text-xs text-muted-foreground leading-relaxed space-y-1.5 prose-ul:my-1 prose-li:my-0.5">
                          <ReactMarkdown>
                            {extracted.narratives || summaryData.structuredBriefing?.keyNarratives}
                          </ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="posts" className="absolute inset-0 m-0 p-0">
                  <ScrollArea className="h-full px-7 py-6">
                    <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                      <div className="text-xs text-muted-foreground">
                        Every post about this event (copies of the same post are merged and shown with a repost count).
                        {allPostsTotal > 0 && (
                          <span className="ml-1">
                            Showing <strong className="text-foreground">{allPosts.length}</strong> of{' '}
                            <strong className="text-foreground">{allPostsTotal}</strong>.
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {['all', ...((event?.platforms || []).map((x) => (String(x).toLowerCase() === 'twitter' ? 'x' : String(x).toLowerCase())).filter((x, i, a) => x && a.indexOf(x) === i))].map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => handlePostsPlatformChange(p)}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                              allPostsPlatform === p
                                ? 'bg-purple-600 text-white border-purple-600'
                                : 'bg-muted/40 text-muted-foreground border-border/60 hover:bg-muted/70'
                            }`}
                          >
                            {p === 'all' ? 'All Platforms' : p.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>

                    {allPostsLoading && allPosts.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin mb-2" />
                        <span className="text-xs">Loading posts…</span>
                      </div>
                    ) : allPosts.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-center">
                        <List className="h-8 w-8 mb-2 opacity-40" />
                        <span className="text-xs">No posts found for this filter.</span>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {allPosts.map((post) => {
                          const displayText = cleanPostDisplayText(post.text);
                          return (
                          <div
                            key={post.id}
                            className="p-3 rounded-lg border bg-muted/20 border-border/50 text-xs flex flex-col gap-1.5"
                          >
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-foreground">
                                  @{post.author_handle || post.author || 'Unknown'}
                                </span>
                                <span className="text-[11px] text-muted-foreground uppercase">
                                  ({post.platform})
                                </span>
                                {post.published_at && (
                                  <span className="text-[11px] text-muted-foreground">
                                    {new Date(post.published_at).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5">
                                {post.sentiment ? (
                                  <Badge
                                    variant="secondary"
                                    className={`text-[10px] ${
                                      post.sentiment === 'positive'
                                        ? 'text-emerald-600'
                                        : post.sentiment === 'negative'
                                          ? 'text-red-600'
                                          : 'text-sky-600'
                                    }`}
                                  >
                                    {post.sentiment}
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                    Pending analysis
                                  </Badge>
                                )}
                                {post.repost_count > 1 && (
                                  <Badge variant="outline" className="text-[10px] text-muted-foreground" title="Copies of this post were merged into one row">
                                    Reposted {post.repost_count}×
                                  </Badge>
                                )}
                                {post.risk_level && post.risk_level !== 'low' && (
                                  <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                    {post.risk_level} risk
                                  </Badge>
                                )}
                                {post.content_url && (
                                  <a
                                    href={post.content_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 ml-1"
                                    title="Open original post"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
                              </div>
                            </div>
                            {displayText && (
                              <p className="text-muted-foreground text-[11px] leading-relaxed whitespace-pre-wrap">
                                {displayText}
                              </p>
                            )}
                          </div>
                          );
                        })}
                      </div>
                    )}

                    {allPostsHasMore && allPosts.length > 0 && (
                      <div className="flex justify-center mt-4">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={allPostsLoading}
                          onClick={() => fetchAllPosts(allPostsPage + 1, allPostsPlatform, true)}
                          className="gap-1.5 text-xs"
                        >
                          {allPostsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                          Load more posts
                        </Button>
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>
              </div>
            </Tabs>
          ) : null}
        </div>
      </DialogContent>

      {/* Report Scope / Timeframe Selector Modal */}
      <Dialog open={scopeModalOpen} onOpenChange={setScopeModalOpen}>
        <DialogContent
          className="sm:max-w-xl p-0 gap-0 overflow-hidden bg-background border-border shadow-2xl rounded-2xl z-[100]"
          onPointerDownOutside={(e) => { if (loading) e.preventDefault(); }}
        >
          <DialogHeader className="px-6 py-4 border-b bg-muted/20 flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-medium shrink-0">
                <CalendarDays className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground">
                  Select Report Timeframe
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Choose analysis window for AI intelligence synthesis and PDF export.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="p-6 space-y-4">
            {eventDateRangeFormatted && (
              <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-800/50 flex items-start gap-2.5 text-xs text-indigo-950 dark:text-indigo-200">
                <Info className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">Monitored Event Activity Period</div>
                  <div className="text-[11px] text-indigo-800/90 dark:text-indigo-300/80 mt-0.5">
                    {eventDateRangeFormatted} · Report queries and custom selections are strictly bounded to this active event window.
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {scopeOptions.map((opt) => {
                const isSelected = tempTimeframe === opt.id;
                const IconComponent = opt.icon;
                const isAvail = opt.available !== false;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={!isAvail}
                    onClick={() => {
                      if (isAvail) setTempTimeframe(opt.id);
                    }}
                    className={`p-3 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                      !isAvail
                        ? 'opacity-40 cursor-not-allowed bg-muted/20 border-dashed border-border/60'
                        : isSelected
                        ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 shadow-sm ring-2 ring-indigo-600/20'
                        : 'border-border/80 bg-card hover:bg-muted/40 hover:border-border'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <IconComponent className={`h-4 w-4 shrink-0 ${opt.color}`} />
                        <span className={`text-xs font-semibold truncate ${!isAvail ? 'text-muted-foreground line-through decoration-muted-foreground/50' : 'text-foreground'}`}>
                          {opt.label}
                        </span>
                      </div>
                      <Badge
                        variant="secondary"
                        className={`text-[10px] px-1.5 py-0 shrink-0 ${
                          !isAvail
                            ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                            : isSelected
                            ? 'bg-indigo-600 text-white font-semibold'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {opt.badge}
                      </Badge>
                    </div>
                    <span className="text-[11px] text-muted-foreground leading-snug">
                      {opt.description}
                    </span>
                  </button>
                );
              })}
            </div>

            {tempTimeframe === 'custom' && (
              <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-3 animate-in fade-in-50 duration-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">Custom Date Range</span>
                  {eventMinDate && eventMaxDate && (
                    <span className="text-[10px] text-muted-foreground">
                      Allowed: {eventMinDate} to {eventMaxDate}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-muted-foreground font-medium block mb-1">
                      From Date (Start)
                    </label>
                    <input
                      type="date"
                      min={eventMinDate || undefined}
                      max={tempToDate || eventMaxDate || undefined}
                      value={tempFromDate}
                      onChange={(e) => setTempFromDate(e.target.value)}
                      className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground font-medium block mb-1">
                      To Date (End)
                    </label>
                    <input
                      type="date"
                      min={tempFromDate || eventMinDate || undefined}
                      max={eventMaxDate || undefined}
                      value={tempToDate}
                      onChange={(e) => setTempToDate(e.target.value)}
                      className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="px-6 py-3.5 border-t bg-muted/20 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setScopeModalOpen(false)}
              className="h-8 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                if (tempTimeframe === 'custom' && !tempFromDate && !tempToDate) {
                  toast.error('Please select at least a start date or end date for custom range');
                  return;
                }
                setTimeframe(tempTimeframe);
                setFromDate(tempFromDate);
                setToDate(tempToDate);
                setScopeModalOpen(false);
                fetchSummary(true, {
                  timeframe: tempTimeframe,
                  fromDate: tempFromDate,
                  toDate: tempToDate,
                });
              }}
              className="h-8 text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-sm"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Generate Report</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
