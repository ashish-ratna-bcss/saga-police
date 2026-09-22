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
  BrainCircuit,
  Calendar,
  CheckCircle2,
  FileText,
  BarChart3,
  Cpu,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import {
  XBrandLogo,
  YoutubeBrandLogo,
  FacebookBrandLogo,
  TelegramBrandLogo,
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
      'Extracting event scope and metadata...',
      'Aggregating telemetry rows from database...',
      'Analyzing cross-platform sentiment & threat indicators...',
      'Querying on-premise Qwen-14B LLM inference engine...',
      'Synthesizing executive intelligence briefing...',
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
      }, 1600);

      try {
        const url = `/events/${eventId}/summary-llm${refresh ? '?refresh=true' : ''}`;
        const res = await api.get(url);
        const data = res?.data?.data || res?.data;

        if (data && (data.summary || data.structuredBriefing)) {
          setSummaryData(data);
          if (refresh) {
            toast.success('Event intelligence briefing regenerated successfully');
          }
        } else {
          setError('No briefing data returned from the LLM service.');
        }
      } catch (err) {
        console.error('Failed to fetch event LLM summary:', err);
        const msg =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          err?.message ||
          'Failed to generate intelligence briefing from LLM.';
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
  const modelName = summaryData?.model || 'qwen3-14b';
  const extracted = useMemo(() => extractSectionsFromMarkdown(summaryData?.summary || ''), [summaryData?.summary]);

  const handleCopy = () => {
    if (!summaryData?.summary) return;
    const textToCopy = `# AI Intelligence Executive Briefing: ${displayName}\nGenerated: ${generatedAt || new Date().toISOString()}\nModel: ${modelName}\n\n${summaryData.summary}`;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    toast.success('Executive briefing copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!summaryData?.summary) return;
    const textToDownload = `# Executive Intelligence Briefing\nEvent: ${displayName}\nGenerated At: ${generatedAt || new Date().toISOString()}\nModel Engine: ${modelName}\nTotal Media Rows Analyzed: ${totalPosts}\n\n----------------------------------------\n\n${summaryData.summary}`;

    const blob = new Blob([textToDownload], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${displayName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_executive_summary.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Executive summary downloaded');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden border-border/80 shadow-2xl bg-card text-card-foreground">
        {/* Header with subtle gradient */}
        <div className="relative px-6 py-5 border-b border-border/60 bg-gradient-to-r from-purple-950/20 via-indigo-950/10 to-background">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-purple-600 via-indigo-600 to-blue-600 text-white shadow-md shadow-purple-500/20 shrink-0">
                <BrainCircuit className="h-5 w-5" />
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500" />
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <DialogTitle className="text-lg font-bold tracking-tight text-foreground truncate">
                    Executive Intelligence Summary
                  </DialogTitle>
                  <Badge
                    variant="outline"
                    className="border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-800/60 dark:bg-purple-950/50 dark:text-purple-300 text-[11px] font-medium gap-1 py-0.5"
                  >
                    <Cpu className="h-3 w-3" />
                    {modelName}
                  </Badge>
                  {totalPosts > 0 && (
                    <Badge
                      variant="outline"
                      className="border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800/60 dark:bg-blue-950/50 dark:text-blue-300 text-[11px] font-medium py-0.5"
                    >
                      {totalPosts} posts analyzed
                    </Badge>
                  )}
                </div>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5 truncate">
                  AI-driven synthesis for <span className="font-semibold text-foreground">{displayName}</span>
                </DialogDescription>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchSummary(true)}
                disabled={loading}
                className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                title="Force re-analyze with latest DB posts"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Regenerate</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                disabled={loading || !summaryData?.summary}
                className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                title="Copy markdown text"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                disabled={loading || !summaryData?.summary}
                className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                title="Download markdown briefing"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Export</span>
              </Button>
            </div>
          </div>

          {/* Telemetry quick stats ribbon */}
          {summaryData && !loading && (
            <div className="mt-3.5 pt-3 border-t border-border/40 flex items-center justify-between gap-2 flex-wrap text-xs text-muted-foreground">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-foreground text-[11px] uppercase tracking-wider">Signals:</span>
                {platforms?.twitter > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/60 text-[11px]">
                    <XBrandLogo className="h-2.5 w-2.5" /> {platforms.twitter}
                  </span>
                )}
                {platforms?.youtube > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/60 text-[11px]">
                    <YoutubeBrandLogo className="h-2.5 w-2.5 text-red-500" /> {platforms.youtube}
                  </span>
                )}
                {platforms?.facebook > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/60 text-[11px]">
                    <FacebookBrandLogo className="h-2.5 w-2.5 text-blue-600" /> {platforms.facebook}
                  </span>
                )}
                {platforms?.telegram > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/60 text-[11px]">
                    <TelegramBrandLogo className="h-2.5 w-2.5 text-sky-500" /> {platforms.telegram}
                  </span>
                )}
                {platforms?.other > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/60 text-[11px]">
                    Other: {platforms.other}
                  </span>
                )}

                <div className="h-3.5 w-px bg-border/60 mx-1 hidden sm:block" />

                {sentiment && (
                  <div className="flex items-center gap-1.5 text-[11px]">
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

              {generatedAt && (
                <div className="text-[11px] text-muted-foreground flex items-center gap-1 ml-auto">
                  <Calendar className="h-3 w-3" />
                  {new Date(generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Body content */}
        <div className="flex-1 overflow-hidden p-0 relative">
          {loading ? (
            <div className="flex flex-col items-center justify-center p-12 min-h-[380px] text-center">
              <div className="relative mb-6">
                <div className="h-16 w-16 rounded-2xl bg-gradient-to-tr from-purple-500/20 to-indigo-500/20 border border-purple-500/30 flex items-center justify-center animate-pulse">
                  <BrainCircuit className="h-8 w-8 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="absolute -inset-1 rounded-2xl bg-purple-500/20 blur-md -z-10 animate-pulse" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1">
                Synthesizing Event Intelligence
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm mb-6">
                Processing stored telemetry, sentiment vectors, and claims with on-premise LLM engine.
              </p>

              {/* Step indicator */}
              <div className="w-full max-w-md bg-muted/40 rounded-xl p-3.5 border border-border/50 text-left space-y-2">
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
              <h3 className="text-sm font-semibold text-foreground mb-1">Intelligence Generation Issue</h3>
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
                    Full Executive Briefing
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
                      <div className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
                        {extracted.threat ||
                          summaryData.structuredBriefing?.threatAndRisk ||
                          'Continuous monitoring recommended. Review key influencers and escalating sentiment channels.'}
                      </div>
                    </div>

                    {/* Recommended Actions Card */}
                    <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-5">
                      <div className="flex items-center gap-2 mb-2 text-purple-700 dark:text-purple-300 font-semibold text-sm">
                        <ShieldAlert className="h-4 w-4" />
                        Recommended Law Enforcement & Administrative Advisory
                      </div>
                      <div className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
                        {extracted.actions ||
                          summaryData.structuredBriefing?.recommendedActions ||
                          'Deploy counter-narrative verification, monitor platform surges, and coordinate with ground response teams.'}
                      </div>
                    </div>

                    {/* Public Sentiment & Ground Atmosphere */}
                    <div className="rounded-xl border border-border/80 bg-muted/20 p-5">
                      <div className="flex items-center gap-2 mb-2 text-foreground font-semibold text-sm">
                        <TrendingUp className="h-4 w-4 text-indigo-500" />
                        Public Sentiment & Ground Atmosphere
                      </div>
                      <div className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
                        {extracted.sentiment ||
                          summaryData.structuredBriefing?.publicSentiment ||
                          'Ground sentiment is dynamically fluctuating across channels.'}
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

                    {/* Platform Breakdown Box */}
                    <div className="rounded-xl border border-border/70 p-5 bg-card">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                        Platform Ingestion Volumes
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="flex items-center gap-2.5 p-3 rounded-lg bg-muted/30 border border-border/40">
                          <XBrandLogo className="h-4 w-4" />
                          <div>
                            <div className="text-xs font-medium">Twitter / X</div>
                            <div className="text-sm font-bold">{platforms?.twitter || 0}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5 p-3 rounded-lg bg-muted/30 border border-border/40">
                          <YoutubeBrandLogo className="h-4 w-4 text-red-500" />
                          <div>
                            <div className="text-xs font-medium">YouTube</div>
                            <div className="text-sm font-bold">{platforms?.youtube || 0}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5 p-3 rounded-lg bg-muted/30 border border-border/40">
                          <FacebookBrandLogo className="h-4 w-4 text-blue-600" />
                          <div>
                            <div className="text-xs font-medium">Facebook</div>
                            <div className="text-sm font-bold">{platforms?.facebook || 0}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5 p-3 rounded-lg bg-muted/30 border border-border/40">
                          <TelegramBrandLogo className="h-4 w-4 text-sky-500" />
                          <div>
                            <div className="text-xs font-medium">Telegram</div>
                            <div className="text-sm font-bold">{platforms?.telegram || 0}</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Key Narratives */}
                    {(extracted.narratives || summaryData.structuredBriefing?.keyNarratives) && (
                      <div className="rounded-xl border border-border/70 p-5 bg-card">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                          Key Narratives & Demands
                        </h4>
                        <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
                          {extracted.narratives || summaryData.structuredBriefing?.keyNarratives}
                        </p>
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
