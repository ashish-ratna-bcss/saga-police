import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../lib/api';
import ReactMarkdown from 'react-markdown';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
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

/**
 * Extracts sections from the markdown text based on common section headers.
 */
function extractSectionsFromMarkdown(md = '') {
  if (!md) return {};
  const sections = {};

  const threatMatch = md.match(/### [^\n]*Threat[^\n]*\n([\s\S]*?)(?=###|$)/i);
  if (threatMatch) sections.threat = threatMatch[1].trim();

  const actionsMatch = md.match(/### [^\n]*Recommended[^\n]*\n([\s\S]*?)(?=###|$)/i);
  if (actionsMatch) sections.actions = actionsMatch[1].trim();

  const sentimentMatch = md.match(/### [^\n]*Sentiment[^\n]*\n([\s\S]*?)(?=###|$)/i);
  if (sentimentMatch) sections.sentiment = sentimentMatch[1].trim();

  const narrativesMatch = md.match(/### [^\n]*Narratives[^\n]*\n([\s\S]*?)(?=###|$)/i);
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

  const loadingSteps = useMemo(
    () => [
      'Extracting event parameters & scope',
      'Aggregating telemetry rows from database',
      'Computing sentiment & risk indicators',
      'Analyzing cross-platform signals',
      'Synthesizing event summary',
    ],
    []
  );

  const fetchSummary = useCallback(
    async (refresh = false) => {
      if (!eventId) return;
      setLoading(true);
      setError(null);
      setLoadingStep(0);

      const stepInterval = setInterval(() => {
        setLoadingStep((prev) => (prev < loadingSteps.length - 1 ? prev + 1 : prev));
      }, 1800);

      try {
        const url = `/events/${eventId}/summary-llm${refresh ? '?refresh=true' : ''}`;
        const res = await api.get(url);
        const data = res?.data?.data || res?.data;

        if (data && (data.summary || data.structuredBriefing)) {
          setSummaryData(data);
          if (refresh) {
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
        clearInterval(stepInterval);
        setLoading(false);
      }
    },
    [eventId, loadingSteps.length]
  );

  useEffect(() => {
    if (open && eventId) {
      fetchSummary(false);
    } else {
      setSummaryData(null);
      setError(null);
      setLoading(false);
    }
  }, [open, eventId, fetchSummary]);

  const displayName = summaryData?.eventName || summaryData?.event?.name || eventName || 'Event';
  const stats = summaryData?.stats || summaryData?.telemetrySummary || {};
  const totalPosts = stats.total_media_count ?? stats.totalTelemetryPosts ?? 0;
  const platforms = stats.platform_counts || stats.platforms || {};
  const sentiment = stats.sentiment_counts || stats.sentiment || {};
  const risk = stats.risk_counts || stats.risk || {};
  const generatedAt = summaryData?.generated_at || summaryData?.generatedAt;
  const extracted = useMemo(() => extractSectionsFromMarkdown(summaryData?.summary || ''), [summaryData?.summary]);

  // Compute unified platform list with accurate counts & brand icons
  const platformList = useMemo(() => {
    const raw = platforms || {};
    const twitterCount = (raw.twitter || 0) + (raw.x || 0);
    const instagramCount = (raw.instagram || 0) + (raw.insta || 0);
    const youtubeCount = (raw.youtube || 0) + (raw.yt || 0);
    const facebookCount = (raw.facebook || 0) + (raw.fb || 0);
    const telegramCount = (raw.telegram || 0) + (raw.tg || 0);
    const whatsappCount = (raw.whatsapp || 0) + (raw.wa || 0);

    const basePlatforms = [
      { key: 'twitter', label: 'Twitter / X', count: twitterCount, Icon: XBrandLogo, color: 'text-foreground' },
      { key: 'instagram', label: 'Instagram', count: instagramCount, Icon: InstagramBrandLogo, color: 'text-pink-500' },
      { key: 'youtube', label: 'YouTube', count: youtubeCount, Icon: YoutubeBrandLogo, color: 'text-red-500' },
      { key: 'facebook', label: 'Facebook', count: facebookCount, Icon: FacebookBrandLogo, color: 'text-blue-600' },
      { key: 'telegram', label: 'Telegram', count: telegramCount, Icon: TelegramBrandLogo, color: 'text-sky-500' },
      { key: 'whatsapp', label: 'WhatsApp', count: whatsappCount, Icon: WhatsAppBrandLogo, color: 'text-emerald-500' },
    ];

    const knownKeys = new Set(['twitter', 'x', 'instagram', 'insta', 'youtube', 'yt', 'facebook', 'fb', 'telegram', 'tg', 'whatsapp', 'wa', 'other']);
    const customList = [];
    Object.entries(raw).forEach(([k, v]) => {
      if (!knownKeys.has(k.toLowerCase()) && v > 0) {
        customList.push({
          key: k,
          label: k.toUpperCase(),
          count: v,
          Icon: AllPlatformsLogo,
          color: 'text-muted-foreground',
        });
      }
    });

    return [...basePlatforms, ...customList];
  }, [platforms]);

  const activeSignals = useMemo(() => {
    return platformList.filter((p) => p.count > 0);
  }, [platformList]);

  const handleCopy = () => {
    if (!summaryData?.summary) return;
    const textToCopy = `# Event Summary: ${displayName}\nGenerated: ${generatedAt || new Date().toISOString()}\n\n${summaryData.summary}`;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    toast.success('Event summary copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!summaryData?.summary) return;
    const textToDownload = `# Event Summary\nEvent: ${displayName}\nGenerated At: ${generatedAt || new Date().toISOString()}\nTotal Media Rows Analyzed: ${totalPosts}\n\n----------------------------------------\n\n${summaryData.summary}`;

    const blob = new Blob([textToDownload], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${displayName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_summary.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Event summary downloaded');
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
                    {totalPosts} posts analyzed
                  </Badge>
                )}
              </div>
              <DialogDescription className="text-xs text-muted-foreground flex items-center gap-2 mt-1 truncate">
                <span>Event: <strong className="text-foreground">{displayName}</strong></span>
                {generatedAt && (
                  <>
                    <span>•</span>
                    <span>Generated {new Date(generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
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
              disabled={loading || !summaryData?.summary}
              className="h-8 gap-1.5 text-xs text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/60 hover:bg-purple-50 dark:hover:bg-purple-950/40"
              title="Download markdown briefing"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export</span>
            </Button>
          </div>
        </DialogHeader>

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
                      <strong className="text-foreground">{item.count}</strong>
                    </span>
                  );
                })
              ) : (
                <span className="text-muted-foreground text-[11px]">No active posts</span>
              )}

              <div className="h-3.5 w-px bg-border/60 mx-1 hidden sm:block" />

              {sentiment && (
                <div className="flex items-center gap-2 text-[11px]">
                  {sentiment.negative > 0 && (
                    <span className="text-red-600 dark:text-red-400 font-medium">
                      Neg: {sentiment.negative}
                    </span>
                  )}
                  {sentiment.neutral > 0 && (
                    <span className="text-amber-600 dark:text-amber-400">
                      Neu: {sentiment.neutral}
                    </span>
                  )}
                  {sentiment.positive > 0 && (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      Pos: {sentiment.positive}
                    </span>
                  )}
                </div>
              )}
            </div>

            {risk && (
              <div className="text-[11px] flex items-center gap-2 ml-auto">
                <span className="text-muted-foreground">High/Critical Risk:</span>
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
            <div className="flex flex-col items-center justify-center p-12 min-h-[380px] text-center">
              <div className="h-12 w-12 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 flex items-center justify-center mb-4 text-purple-600 dark:text-purple-400">
                <Sparkles className="h-6 w-6 animate-pulse" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1">
                Generating Event Summary
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm mb-6">
                Analyzing database telemetry and synthesizing a clear, natural-language overview.
              </p>

              {/* Step indicator */}
              <div className="w-full max-w-md bg-muted/40 rounded-xl p-3.5 border border-border/50 text-left space-y-2.5">
                {loadingSteps.map((step, idx) => {
                  const isCurrent = idx === loadingStep;
                  const isDone = idx < loadingStep;
                  return (
                    <div
                      key={idx}
                      className={`flex items-center gap-2.5 text-xs transition-colors duration-200 ${
                        isCurrent
                          ? 'text-purple-600 dark:text-purple-300 font-semibold'
                          : isDone
                          ? 'text-muted-foreground line-through opacity-70'
                          : 'text-muted-foreground/50'
                      }`}
                    >
                      {isDone ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                      ) : isCurrent ? (
                        <div className="h-3.5 w-3.5 rounded-full border-2 border-purple-500 border-t-transparent animate-spin shrink-0" />
                      ) : (
                        <div className="h-3.5 w-3.5 rounded-full border border-border shrink-0" />
                      )}
                      <span>{step}</span>
                    </div>
                  );
                })}
              </div>
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
                </TabsList>
              </div>

              <div className="flex-1 overflow-hidden">
                <TabsContent value="briefing" className="h-full m-0 p-0">
                  <ScrollArea className="h-[calc(92vh-185px)] px-7 py-6">
                    <div className="prose dark:prose-invert max-w-none text-sm leading-relaxed space-y-4 prose-headings:font-semibold prose-headings:tracking-tight prose-h1:text-lg prose-h2:text-base prose-h3:text-sm prose-h3:font-bold prose-h3:text-purple-600 dark:prose-h3:text-purple-300 prose-h3:mt-5 prose-h3:first:mt-0 prose-p:text-muted-foreground prose-p:leading-6 prose-li:text-muted-foreground prose-strong:text-foreground">
                      <ReactMarkdown>{summaryData.summary}</ReactMarkdown>
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="advisory" className="h-full m-0 p-0">
                  <ScrollArea className="h-[calc(92vh-185px)] px-7 py-6 space-y-6">
                    {/* Threat & Order Assessment Card */}
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
                      <div className="flex items-center gap-2 mb-2 text-amber-700 dark:text-amber-400 font-semibold text-sm">
                        <AlertTriangle className="h-4 w-4" />
                        Threat, Misinformation & Public Order Risk
                      </div>
                      <div className="prose dark:prose-invert max-w-none text-xs text-muted-foreground leading-relaxed">
                        <ReactMarkdown>
                          {extracted.threat ||
                            summaryData.structuredBriefing?.threatAndRisk ||
                            'Continuous monitoring recommended. Review key influencers and escalating sentiment channels.'}
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
                          {extracted.actions ||
                            summaryData.structuredBriefing?.recommendedActions ||
                            'Deploy counter-narrative verification, monitor platform surges, and coordinate with ground response teams.'}
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
                          {extracted.sentiment ||
                            summaryData.structuredBriefing?.publicSentiment ||
                            'Ground sentiment is dynamically fluctuating across channels.'}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="telemetry" className="h-full m-0 p-0">
                  <ScrollArea className="h-[calc(92vh-185px)] px-7 py-6 space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="rounded-xl border border-border/70 p-4 bg-muted/20">
                        <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                          Posts In Database
                        </div>
                        <div className="text-2xl font-bold mt-1 text-foreground">
                          {totalPosts}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1">
                          Synthesized across active profiles
                        </div>
                      </div>

                      <div className="rounded-xl border border-border/70 p-4 bg-muted/20">
                        <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                          Negative Sentiment
                        </div>
                        <div className="text-2xl font-bold mt-1 text-red-600 dark:text-red-400">
                          {sentiment?.negative || 0}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1">
                          Potential agitation signals
                        </div>
                      </div>

                      <div className="rounded-xl border border-border/70 p-4 bg-muted/20">
                        <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                          High/Critical Risk Rows
                        </div>
                        <div className="text-2xl font-bold mt-1 text-amber-600 dark:text-amber-400">
                          {(risk?.high || 0) + (risk?.critical || 0)}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1">
                          Requires priority verification
                        </div>
                      </div>
                    </div>

                    {/* Platform Breakdown Box - Comprehensive & Dynamic */}
                    <div className="rounded-xl border border-border/70 p-5 bg-card">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                        Platform Ingestion Volumes
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                        {platformList.map((item) => {
                          const ItemIcon = item.Icon;
                          return (
                            <div
                              key={item.key}
                              className={`flex items-center gap-2.5 p-3 rounded-lg border transition-colors ${
                                item.count > 0
                                  ? 'bg-muted/40 border-border/60 shadow-2xs'
                                  : 'bg-muted/15 border-border/30 opacity-60'
                              }`}
                            >
                              <ItemIcon className={`h-4 w-4 shrink-0 ${item.color}`} />
                              <div className="min-w-0">
                                <div className="text-xs font-medium truncate">{item.label}</div>
                                <div className="text-sm font-bold text-foreground">{item.count}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

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
              </div>
            </Tabs>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
