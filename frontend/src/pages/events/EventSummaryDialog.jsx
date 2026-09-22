import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../lib/api';
import ReactMarkdown from 'react-markdown';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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
        const res = await api.get(`/events/${eventId}/summary-llm`, {
          params: { ...(refresh ? { refresh: true } : {}), _t: Date.now() },
        });
        const data = res?.data?.data || res?.data;

        if (data && (data.summary || data.structuredBriefing)) {
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
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 14;
      const usableW = pageW - margin * 2;

      // Helper: Clean markdown, strip emojis and non-ASCII chars so standard jsPDF fonts never print garbage
      const cleanMdText = (txt) => {
        if (!txt) return '';
        return txt
          .replace(/```[\s\S]*?```/g, '')
          .replace(/`([^`]+)`/g, '$1')
          .replace(/\*\*([^*]+)\*\*/g, '$1')
          .replace(/\*([^*]+)\*/g, '$1')
          .replace(/__([^_]+)__/g, '$1')
          .replace(/_([^_]+)_/g, '$1')
          .replace(/^>\s*/gm, '')
          .replace(/^#{1,6}\s*/gm, '')
          .replace(/^\s*[-*_]{3,}\s*$/gm, '')
          .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
          .replace(/[\u2600-\u27BF\uE000-\uF8FF\u200D\uFE0F]/g, '')
          .replace(/[^\x00-\x7F]/g, (char) => {
            const map = {
              '‘': "'", '’': "'", '“': '"', '”': '"',
              '•': '-', '–': '-', '—': '-', '…': '...',
            };
            return map[char] || '';
          })
          .trim();
      };

      // Helper: Draw watermark on page canvas BEFORE content is placed (background layer)
      const drawWatermark = (targetPage) => {
        doc.setPage(targetPage);
        if (typeof doc.saveGraphicsState === 'function') {
          doc.saveGraphicsState();
        }
        if (typeof doc.GState === 'function' && typeof doc.setGState === 'function') {
          try {
            doc.setGState(new doc.GState({ opacity: 0.3 }));
          } catch (_) {}
        }
        doc.setTextColor(218, 224, 235);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(36);
        doc.text(cleanMdText(tenantName).toUpperCase(), pageW / 2, pageH / 2, {
          align: 'center',
          angle: -35,
        });
        if (typeof doc.restoreGraphicsState === 'function') {
          doc.restoreGraphicsState();
        }
      };

      const pdfPageHooks = {
        willDrawPage: (hook) => drawWatermark(hook.pageNumber),
      };

      drawWatermark(1);

      const negCount = sentiment?.negative || 0;
      const neuCount = sentiment?.neutral || 0;
      const posCount = sentiment?.positive || 0;
      const riskCount = (risk?.critical || 0) + (risk?.high || 0);
      const relevantPosts = stats.relevant_posts_count ?? totalPosts;
      const dominantPlatform =
        platformList.length > 0
          ? [...platformList].sort((a, b) => b.count - a.count)[0]?.label || 'X'
          : 'X';
      const eventLocation = summaryData?.event?.location || '';
      const narrativeSource =
        summaryData?.summary_source === 'llm'
          ? 'AI narrative (LLM)'
          : summaryData?.summary_source === 'fallback'
            ? 'Database template (LLM unavailable)'
            : 'Automated synthesis';

      // 1. Header banner (matches Keyword Analytics PDF)
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageW, 28, 'F');
      doc.setFillColor(79, 70, 229);
      doc.rect(0, 28, pageW, 1.8, 'F');
      doc.setFillColor(14, 165, 233);
      doc.rect(0, 29.8, pageW, 0.6, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(255, 255, 255);
      doc.text(cleanMdText(tenantName).toUpperCase(), margin, 12);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(199, 210, 254);
      doc.text('EVENT INTELLIGENCE & EXECUTIVE SUMMARY AUDIT REPORT', margin, 18);

      const generatedDate = new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(`Generated: ${generatedDate}`, pageW - margin, 12, { align: 'right' });
      doc.text('Security Level: RESTRICTED / LAW ENFORCEMENT ONLY', pageW - margin, 18, { align: 'right' });

      let yPos = 36;

      // 2. Target event context card
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(margin, yPos, usableW, 18, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(`Target Event: ${cleanMdText(displayName)}`, margin + 4, yPos + 6);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      const scopeParts = [
        eventLocation ? `Region: ${cleanMdText(eventLocation)}` : null,
        `Unique Posts: ${totalPosts}`,
        `Event-Relevant Posts: ${relevantPosts}`,
        `Keyword Mentions: ${totalKeywordMentions || totalPosts}`,
        `Dominant Channel: ${cleanMdText(dominantPlatform).toUpperCase()}`,
      ].filter(Boolean);
      doc.text(scopeParts.join('   |   '), margin + 4, yPos + 12);

      yPos += 24;

      // 3. Executive telemetry table
      const platformShareText =
        platformList.length > 0
          ? platformList.map((p) => `${cleanMdText(p.label)}: ${p.count} (${p.percentage}%)`).join(' · ')
          : 'No platform breakdown available';

      autoTable(doc, {
        startY: yPos,
        margin: { left: margin, right: margin },
        head: [['Telemetry Metric', 'Observed Volume & Share', 'Operational Intelligence Assessment']],
        body: [
          [
            'Total Unique Media Ingested',
            `${Number(totalPosts).toLocaleString()} posts`,
            'Distinct social media records analyzed for this monitoring event',
          ],
          [
            'Event-Relevant Commentary',
            `${Number(relevantPosts).toLocaleString()} posts`,
            'Posts classified as directly related to the target event scope',
          ],
          [
            'Aggregate Keyword Mentions',
            `${Number(totalKeywordMentions || totalPosts).toLocaleString()} mentions`,
            'Term occurrences across tracked keywords (multi-keyword overlap included)',
          ],
          [
            'Praise / Positive Sentiment',
            `${posCount} (${sentimentPercentages?.positive ?? 0}%)`,
            'Commendations, endorsements, and favorable public reception',
          ],
          [
            'News / Neutral Broadcasts',
            `${neuCount} (${sentimentPercentages?.neutral ?? 0}%)`,
            'Factual reporting, announcements, and routine information updates',
          ],
          [
            'Criticism / Dissent',
            `${negCount} (${sentimentPercentages?.negative ?? 0}%)`,
            'Policy critique and grievance feedback (decoupled from physical threat)',
          ],
          [
            'Threat & Disruption Signals',
            `${riskCount} flags`,
            riskCount > 0
              ? 'Potential public disorder or mobilization indicators detected in sample'
              : 'Zero physical unrest, agitation, or mobilization triggers detected in dataset',
          ],
          [
            'Platform Ingestion Mix',
            platformShareText.length > 90 ? `${platformList[0]?.count || 0} posts on top channel` : platformShareText,
            platformShareText.length > 90 ? platformShareText : 'Share of ingested volume by monitored social channel',
          ],
          [
            'Executive Narrative Source',
            narrativeSource,
            summaryData?.llm_error
              ? String(summaryData.llm_error).slice(0, 120)
              : 'Structured briefing synthesized from telemetry and sampled post evidence',
          ],
        ],
        theme: 'grid',
        ...pdfPageHooks,
        headStyles: {
          fillColor: [30, 41, 59],
          textColor: 255,
          fontSize: 8,
          fontStyle: 'bold',
        },
        styles: {
          fontSize: 7.5,
          cellPadding: 2.2,
          lineColor: [226, 232, 240],
        },
        columnStyles: {
          0: { cellWidth: 54, fontStyle: 'bold', textColor: [15, 23, 42] },
          1: { cellWidth: 38, halign: 'center', fontStyle: 'bold', textColor: [79, 70, 229] },
          2: { fontStyle: 'normal', textColor: [71, 85, 105] },
        },
      });

      yPos = (doc.lastAutoTable?.finalY ?? yPos + 18) + 8;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text('Executive Narrative & Situation Assessment', margin, yPos);
      yPos += 5;

      const checkPageBreak = (neededHeight) => {
        if (yPos + neededHeight > pageH - 22) {
          doc.addPage();
          drawWatermark(doc.internal.getNumberOfPages());
          yPos = 36;
          return true;
        }
        return false;
      };

      const rawSummary = summaryData.summary || '';
      // Split by markdown headers
      const rawSections = rawSummary.split(/(?=(?:^|\n)#{1,4}\s+)/g).filter(Boolean);

      for (const sec of rawSections) {
        const lines = sec.trim().split('\n');
        const headerRaw = lines[0] || '';
        const headerLine = cleanMdText(headerRaw.replace(/^#{1,4}\s*/, '')).replace(/^[-–—:\s]+/, '').trim();
        const bodyContent = cleanMdText(lines.slice(1).join('\n')).trim();

        // Skip redundant document-level title or empty sections
        if (/^event summary\b/i.test(headerLine) && (!bodyContent || bodyContent === '---')) {
          continue;
        }
        if (!headerLine && !bodyContent) continue;

        checkPageBreak(16);

        if (headerLine) {
          checkPageBreak(10);
          doc.setFillColor(15, 23, 42);
          doc.rect(margin, yPos, usableW, 7, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(255, 255, 255);
          doc.text(headerLine.toUpperCase(), margin + 3, yPos + 4.8);
          yPos += 9;
        }

        // Section Body Content
        if (bodyContent) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(51, 65, 85);

          const bodyParagraphs = bodyContent.split('\n\n');
          for (const para of bodyParagraphs) {
            const trimmed = para.trim();
            if (!trimmed || trimmed === '---') continue;

            const splitLines = doc.splitTextToSize(trimmed, usableW - 4);
            checkPageBreak(splitLines.length * 4 + 3);

            doc.text(splitLines, margin + 2, yPos);
            yPos += splitLines.length * 4 + 2;
          }
        }
        yPos += 3;
      }

      // Apply bottom footer across all pages (watermarks already stamped in background layer)
      const totalPages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);

        // Bottom Footer
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.3);
        doc.line(margin, pageH - 12, pageW - margin, pageH - 12);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text('Developed by Bluecloud softech solutions Hyderabad', margin, pageH - 7);
        doc.text(`Page ${i} of ${totalPages}`, pageW - margin, pageH - 7, { align: 'right' });
      }

      const cleanFileName = `${cleanMdText(tenantName).replace(/[^a-z0-9]/gi, '_')}_${cleanMdText(displayName).replace(/[^a-z0-9]/gi, '_')}_Summary_Report.pdf`;
      doc.save(cleanFileName);
      toast.success('Executive PDF report downloaded');
    } catch (err) {
      console.error('Failed to generate PDF report:', err);
      toast.error('Failed to generate PDF report: ' + err.message);
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
                {totalKeywordMentions > 0 && (
                  <>
                    <span>•</span>
                    <span title="Aggregate keyword occurrences across all tracked terms">{totalKeywordMentions} keyword mentions</span>
                  </>
                )}
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
              className="h-8 gap-1.5 text-xs text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/60 hover:bg-purple-50 dark:hover:bg-purple-950/40 font-medium"
              title="Download executive PDF report"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download Report</span>
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
                      className={`flex items-center gap-2.5 text-xs transition-colors duration-200 ${isCurrent
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
                          Across all tracked keywords
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
              </div>
            </Tabs>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
