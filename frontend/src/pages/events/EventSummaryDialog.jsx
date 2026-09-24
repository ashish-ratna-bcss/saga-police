import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  Download,
  AlertTriangle,
  FileText,
  BarChart3,
  ShieldAlert,
  TrendingUp,
  CheckCircle2,
  Layers,
  ExternalLink,
  Target,
  Info,
  List,
  Loader2,
  Clock,
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
import { EventBrief, RiskAlerts } from './EventSummaryBrief';

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

export default function EventSummaryDialog({ open, onOpenChange, eventId, eventName }) {
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState(null);
  const [summaryData, setSummaryData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('briefing');

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
      { label: '3. Analyzing sentiment & public tone', description: 'Measuring praise, neutral updates & criticism', threshold: 55 },
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

  const fetchSummary = useCallback(
    async (refresh = false) => {
      if (!eventId) return;
      setLoading(true);
      setError(null);
      setLoadingStep(0);
      setLoadingProgress(6);
      setElapsedSeconds(0);

      const startTime = Date.now();
      const progressInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setElapsedSeconds(elapsed);

        setLoadingProgress((prev) => {
          let next = prev;
          if (prev < 25) next = prev + 4;
          else if (prev < 50) next = prev + 2.5;
          else if (prev < 75) next = prev + 1.8;
          else if (prev < 92) next = prev + 0.8;
          else if (prev < 96) next = prev + 0.2;
          return Math.min(96, Math.round(next * 10) / 10);
        });
      }, 500);

      try {
        const res = refresh
          ? await api.post(`/events/${eventId}/summary-llm`)
          : await api.get(`/events/${eventId}/summary-llm`, { params: { _t: Date.now() } });
        const data = res?.data?.data || res?.data;

        if (data && (data.summary || data.structuredBriefing)) {
          if (!data.cached) {
            setLoadingProgress(100);
            setLoadingStep(4);
            await new Promise((resolve) => setTimeout(resolve, 300));
          }
          setSummaryData(data);
          if (data.summary_source === 'fallback') {
            toast.warning('AI model unavailable — showing database-only summary', {
              description:
                data.llm_error ||
                'Check LLM_BASE_URL / LLM_API_KEY on the backend and that the model server is running.',
            });
          } else if (refresh) {
            toast.success('Event summary regenerated');
          }
        } else {
          setError('No summary data returned from the service.');
        }
      } catch (err) {
        console.error('Failed to fetch event summary:', err);
        const msg =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          err?.message ||
          'Failed to generate event summary.';
        setError(msg);
        toast.error('AI Summary generation failed', { description: msg });
      } finally {
        clearInterval(progressInterval);
        setLoading(false);
      }
    },
    [eventId]
  );

  useEffect(() => {
    if (open && eventId) {
      fetchSummary(false);
    } else {
      setSummaryData(null);
      setError(null);
      setLoading(false);
      setAllPosts([]);
      setAllPostsPage(1);
      setAllPostsHasMore(true);
      setAllPostsTotal(0);
      setAllPostsLoaded(false);
      setAllPostsPlatform('all');
    }
  }, [open, eventId, fetchSummary]);

  const fetchAllPosts = useCallback(
    async (page = 1, platform = allPostsPlatform, append = false) => {
      if (!eventId) return;
      setAllPostsLoading(true);
      try {
        const res = await api.get(`/events/${eventId}/content`, {
          params: { page, limit: 50, platform },
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

  const activeSignals = useMemo(() => {
    return platformList.filter((p) => p.count > 0);
  }, [platformList]);

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

  /**
   * Downloads the Event Intelligence & Social Analytics report. The PDF is rendered on the
   * server (HTML → PDF) from the cached Summary AI result and keyword analytics, so charts
   * and multilingual post text render consistently.
   */
  const handleDownload = async () => {
    if (!summaryData?.summary || !eventId) return;
    setPdfGenerating(true);
    try {
      const res = await api.get(`/events/${eventId}/summary-llm/report.pdf`, {
        params: { tenant: tenantName },
        responseType: 'blob',
        timeout: 300000,
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const safe = (v) => String(v || '').replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_');
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${safe(tenantName)}_${safe(displayName)}_Summary_Report.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Event Intelligence report exported successfully');
    } catch (err) {
      console.error('Failed to generate PDF report:', err);
      toast.error('Failed to generate PDF report: ' + (err?.response?.statusText || err.message));
    } finally {
      setPdfGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden bg-background border-border shadow-2xl rounded-xl">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b bg-muted/20 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-purple-500/20 shrink-0">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-lg font-bold tracking-tight text-foreground truncate">
                  Event Summary
                </DialogTitle>
                {totalPosts > 0 && (
                  <Badge
                    variant="secondary"
                    className="text-[11px] px-2 py-0.5 font-normal shrink-0"
                  >
                    {totalPosts} unique posts analyzed
                  </Badge>
                )}
              </div>
              <DialogDescription className="text-xs text-muted-foreground flex items-center gap-2 mt-1 truncate">
                <span>Event: <strong className="text-foreground">{displayName}</strong></span>
                {(stats.relevant_posts_count ?? totalPosts) > 0 && (
                  <>
                    <span>•</span>
                    <span title="Posts classified as directly related to the event">{stats.relevant_posts_count ?? totalPosts} event-relevant posts</span>
                  </>
                )}
                {generatedAt && (
                  <>
                    <span>•</span>
                    <span>Generated {new Date(generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </>
                )}
                {summaryData?.generated_by?.name && (
                  <>
                    <span>•</span>
                    <span>by <strong className="text-foreground">{summaryData.generated_by.name}</strong></span>
                  </>
                )}
                {summaryData?.has_pdf && (
                  <>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" /> PDF saved
                    </span>
                  </>
                )}
              </DialogDescription>
            </div>
          </div>

          <div className="flex items-center gap-2 pr-6 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchSummary(true)}
              disabled={loading}
              className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              title="Force re-analyze with latest DB posts"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Regenerate</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              disabled={loading || !summaryData?.summary}
              className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              title="Copy markdown text"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              disabled={loading || pdfGenerating || !summaryData?.summary}
              className="h-8 gap-1.5 text-xs text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/60 hover:bg-purple-50 dark:hover:bg-purple-950/40 font-medium"
              title="Download executive PDF report (includes every analyzed post as an appendix)"
            >
              {pdfGenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              <span>{pdfGenerating ? 'Preparing…' : 'Download Report'}</span>
            </Button>
          </div>
        </DialogHeader>

        {summaryData?.summary_source === 'fallback' && !loading && (
          <div className="px-6 py-2.5 border-b border-amber-500/30 bg-amber-500/10 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              <strong>Database-only summary.</strong> The AI model did not respond, so this report uses fixed template text plus your live
              post counts and five sample citations — not a full narrative analysis.
              {summaryData.llm_error ? ` (${summaryData.llm_error})` : ''}
            </span>
          </div>
        )}

        {summaryData?.cached && !summaryData?.is_stale && !loading && (
          <div className="px-6 py-2 border-b border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span>
              This AI summary was already generated
              {summaryData.generated_by?.name ? (
                <>
                  {' '}by <strong>{summaryData.generated_by.name}</strong>
                </>
              ) : null}
              {generatedAt ? (
                <> on {new Date(generatedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</>
              ) : null}
              . Use <strong>Regenerate</strong> to refresh it.
            </span>
          </div>
        )}

        {summaryData?.is_stale && !loading && (
          <div className="px-6 py-2.5 border-b border-sky-500/30 bg-sky-500/10 text-xs text-sky-950 dark:text-sky-100 flex items-center justify-between gap-3 flex-wrap">
            <span className="inline-flex items-start gap-2">
              <Sparkles className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                <strong>
                  {summaryData.new_posts_count > 0
                    ? `${summaryData.new_posts_count} new post${summaryData.new_posts_count === 1 ? '' : 's'} since this report was generated.`
                    : 'New activity detected since this report was generated.'}
                </strong>{' '}
                Regenerate to include the latest data.
              </span>
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs shrink-0"
              onClick={() => fetchSummary(true)}
            >
              Regenerate
            </Button>
          </div>
        )}

        {summaryData?.summary_truncated && summaryData?.summary_source === 'llm' && !loading && (
          <div className="px-6 py-2.5 border-b border-orange-500/30 bg-orange-500/10 text-xs text-orange-950 dark:text-orange-100 flex items-center justify-between gap-3 flex-wrap">
            <span className="inline-flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                <strong>Incomplete report.</strong> The model stopped before finishing all sections. Use <strong>Regenerate</strong> after the
                server update, or ask your admin to raise <code className="text-[10px]">LLM_SUMMARY_MAX_TOKENS</code>.
              </span>
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs shrink-0"
              onClick={() => fetchSummary(true)}
            >
              Regenerate
            </Button>
          </div>
        )}

        {/* Telemetry quick stats ribbon */}
        {summaryData && !loading && (
          <div className="px-6 py-2.5 border-b border-border/60 bg-muted/10 flex items-center justify-between gap-2 flex-wrap text-xs text-muted-foreground">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-foreground text-[11px] uppercase tracking-wider">Signals:</span>
              {activeSignals.length > 0 ? (
                activeSignals.map((item) => {
                  const ItemIcon = item.Icon;
                  return (
                    <span
                      key={item.key}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-muted/80 text-[11px] font-medium"
                    >
                      <ItemIcon className={`h-3 w-3 ${item.color}`} />
                      <span>{item.label}:</span>
                      <strong className="text-foreground">
                        {item.count}
                        {item.percentage !== undefined && (
                          <span className="ml-1 text-[10px] font-normal text-muted-foreground">({item.percentage}%)</span>
                        )}
                      </strong>
                    </span>
                  );
                })
              ) : (
                <span className="text-muted-foreground text-[11px]">No active posts</span>
              )}

              <div className="h-3.5 w-px bg-border/60 mx-1 hidden sm:block" />

              {sentiment && (
                <div className="flex items-center gap-2.5 text-[11px]">
                  {sentiment.positive > 0 && (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                      Praise: {sentiment.positive}{sentimentPercentages.positive !== undefined ? ` (${sentimentPercentages.positive}%)` : ''}
                    </span>
                  )}
                  {sentiment.neutral > 0 && (
                    <span className="text-sky-600 dark:text-sky-400 font-medium">
                      News: {sentiment.neutral}{sentimentPercentages.neutral !== undefined ? ` (${sentimentPercentages.neutral}%)` : ''}
                    </span>
                  )}
                  {sentiment.negative > 0 && (
                    <span className="text-red-600 dark:text-red-400 font-medium">
                      Criticism: {sentiment.negative}{sentimentPercentages.negative !== undefined ? ` (${sentimentPercentages.negative}%)` : ''}
                    </span>
                  )}
                </div>
              )}
            </div>

            {risk && (
              <div className="text-[11px] flex items-center gap-2 ml-auto">
                <span className="text-muted-foreground">Public Order Threat:</span>
                <Badge
                  variant="outline"
                  className="text-[11px] px-1.5 py-0 border-amber-300 text-amber-700 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                >
                  {(risk.critical || 0) + (risk.high || 0)}
                </Badge>
              </div>
            )}
          </div>
        )}

        {/* Body content */}
        <div className="flex-1 overflow-hidden p-0 relative">
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
              <div className="px-6 border-b border-border/50 bg-muted/20">
                <TabsList className="h-9 bg-transparent p-0 gap-4">
                  <TabsTrigger
                    value="briefing"
                    className="data-[state=active]:border-b-2 data-[state=active]:border-purple-600 rounded-none bg-transparent px-2 text-xs font-medium"
                  >
                    <FileText className="h-3.5 w-3.5 mr-1.5 text-purple-600" />
                    Event Summary
                  </TabsTrigger>
                  <TabsTrigger
                    value="advisory"
                    className="data-[state=active]:border-b-2 data-[state=active]:border-purple-600 rounded-none bg-transparent px-2 text-xs font-medium"
                  >
                    <ShieldAlert className="h-3.5 w-3.5 mr-1.5 text-amber-600" />
                    Risk & Advisory
                  </TabsTrigger>
                  <TabsTrigger
                    value="telemetry"
                    className="data-[state=active]:border-b-2 data-[state=active]:border-purple-600 rounded-none bg-transparent px-2 text-xs font-medium"
                  >
                    <BarChart3 className="h-3.5 w-3.5 mr-1.5 text-blue-600" />
                    Data Telemetry
                  </TabsTrigger>
                  <TabsTrigger
                    value="posts"
                    className="data-[state=active]:border-b-2 data-[state=active]:border-purple-600 rounded-none bg-transparent px-2 text-xs font-medium"
                  >
                    <List className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />
                    All Posts{totalPosts > 0 ? ` (${totalPosts})` : ''}
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 overflow-hidden">
                <TabsContent value="briefing" className="h-full m-0 p-0">
                  <ScrollArea className="h-[calc(92vh-185px)] px-7 py-6">
                    <EventBrief summaryData={summaryData} platformList={platformList} displayName={displayName} onCite={handleCite} />
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="advisory" className="h-full m-0 p-0">
                  <ScrollArea className="h-[calc(92vh-185px)] px-7 py-6 space-y-6">
                    <RiskAlerts summaryData={summaryData} onCite={handleCite} />
                    {/* Threat & Order Assessment Card */}
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
                      <div className="flex items-center gap-2 mb-2 text-amber-700 dark:text-amber-400 font-semibold text-sm">
                        <AlertTriangle className="h-4 w-4" />
                        Threat, Misinformation & Public Order Risk
                      </div>
                      <div className="prose dark:prose-invert max-w-none text-xs text-muted-foreground leading-relaxed">
                        <ReactMarkdown>
                          {summaryData?.stats?.structured_report?.publicOrder ||
                            extracted.threat ||
                            summaryData.structuredBriefing?.threatAndRisk ||
                            '_Not available for this summary. Regenerate to create it._'}
                        </ReactMarkdown>
                      </div>
                    </div>

                    {/* Recommended Actions Card */}
                    <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-5">
                      <div className="flex items-center gap-2 mb-2 text-purple-700 dark:text-purple-300 font-semibold text-sm">
                        <ShieldAlert className="h-4 w-4" />
                        Recommended Law Enforcement & Administrative Advisory
                      </div>
                      <div className="prose dark:prose-invert max-w-none text-xs text-muted-foreground leading-relaxed">
                        <ReactMarkdown>
                          {(summaryData?.stats?.structured_report?.actions?.length
                            ? summaryData.stats.structured_report.actions.map((a, i) => `${i + 1}. **${a.action}:** ${a.detail}`).join('\n')
                            : '') ||
                            extracted.actions ||
                            summaryData.structuredBriefing?.recommendedActions ||
                            '_Not available for this summary. Regenerate to create it._'}
                        </ReactMarkdown>
                      </div>
                    </div>

                    {/* Public Sentiment & Ground Atmosphere */}
                    <div className="rounded-xl border border-border/80 bg-muted/20 p-5">
                      <div className="flex items-center gap-2 mb-2 text-foreground font-semibold text-sm">
                        <TrendingUp className="h-4 w-4 text-indigo-500" />
                        Public Sentiment & Ground Atmosphere
                      </div>
                      <div className="prose dark:prose-invert max-w-none text-xs text-muted-foreground leading-relaxed">
                        <ReactMarkdown>
                          {summaryData?.stats?.structured_report?.sentimentCommentary ||
                            extracted.sentiment ||
                            summaryData.structuredBriefing?.publicSentiment ||
                            '_Not available for this summary. Regenerate to create it._'}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="telemetry" className="h-full m-0 p-0">
                  <ScrollArea className="h-[calc(92vh-185px)] px-7 py-6 space-y-6">
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
                          Criticism (Negative)
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
                            <span className="text-emerald-600 font-medium">Positive = Praise</span>
                            <span>•</span>
                            <span className="text-sky-600 font-medium">Neutral = News/Updates</span>
                            <span>•</span>
                            <span className="text-red-600 font-medium">Negative = Criticism</span>
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
                                  <span>Praise:</span>
                                  <span className="font-semibold">{stats.praise || 0}</span>
                                </div>
                                <div className="flex justify-between text-sky-600 dark:text-sky-400">
                                  <span>News:</span>
                                  <span className="font-semibold">{stats.news || 0}</span>
                                </div>
                                <div className="flex justify-between text-rose-600 dark:text-rose-400">
                                  <span>Criticism:</span>
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

                <TabsContent value="posts" className="h-full m-0 p-0">
                  <ScrollArea className="h-[calc(92vh-185px)] px-7 py-6">
                    <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                      <div className="text-xs text-muted-foreground">
                        Every post ingested for this event — not just the sampled citations used in the narrative.
                        {allPostsTotal > 0 && (
                          <span className="ml-1">
                            Showing <strong className="text-foreground">{allPosts.length}</strong> of{' '}
                            <strong className="text-foreground">{allPostsTotal}</strong>.
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {['all', 'x', 'youtube', 'facebook', 'instagram', 'telegram', 'whatsapp'].map((p) => (
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
                        {allPosts.map((post) => (
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
                            {post.text && (
                              <p className="text-muted-foreground text-[11px] leading-relaxed whitespace-pre-wrap">
                                {post.text}
                              </p>
                            )}
                          </div>
                        ))}
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
    </Dialog>
  );
}
