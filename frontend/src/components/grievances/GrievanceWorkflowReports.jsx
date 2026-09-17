import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import api, { BACKEND_URL } from '../../lib/api';
import { isPublicFileReachable } from '../../lib/publicAssetUrl';
import { toast } from 'sonner';
import {
    Download, Loader2, ExternalLink, RefreshCw, ChevronDown,
    Calendar, Filter, Search, FileSpreadsheet, MessageSquare,
    Eye, Printer, GripHorizontal, X, Maximize2, Minimize2,
    Share2, Copy, Check, AlertCircle, Clock, Users, Tag,
    Link2, Image, FileText, MoreHorizontal, ArrowUpDown,
    Phone, Mail, Globe, Facebook, Instagram, Twitter, MessageCircle,
    ChevronLeft, ChevronRight, Info, Shield, Lock, Reply,
    User, CircleDot, CircleCheck, ArrowRight, Send, Plus,
    CheckCircle2, ShieldAlert, Layers
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useReactToPrint } from 'react-to-print';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { ScrollArea } from '../ui/scroll-area';
import {
    TelegramBrandLogo, XBrandLogo, FacebookBrandLogo,
    InstagramBrandLogo, WhatsAppBrandLogo, YoutubeBrandLogo,
    AllPlatformsLogo, BRAND_BY_PLATFORM
} from '../PlatformBrandIcon';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '../ui/select';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator
} from '../ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Separator } from '../ui/separator';
import { cn } from '../../lib/utils';
import { PagePlatformSelectItems } from '../PagePlatformSelectItems';
import { motion, AnimatePresence } from 'framer-motion';

/* ─── Helpers ─── */
const fmtDate = (d) => {
    if (!d) return '—';
    try {
        return new Date(d).toLocaleString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch { return '—'; }
};

const fmtRelativeTime = (date) => {
    if (!date) return '';
    const now = new Date();
    const then = new Date(date);
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return fmtDate(date);
};

const isVideoUrl = (url = '') => {
    const u = String(url).toLowerCase();
    return /\.(mp4|webm|mov|m4v|avi|mkv)(\?|$)/i.test(u)
        || u.includes('video')
        || u.includes('m3u8');
};

const statusConfig = {
    PENDING: {
        label: 'Pending',
        color: 'yellow',
        icon: Clock,
        bg: 'bg-yellow-50',
        text: 'text-yellow-700',
        border: 'border-yellow-200',
        dot: 'bg-yellow-500'
    },
    ESCALATED: {
        label: 'Escalated',
        color: 'orange',
        icon: AlertCircle,
        bg: 'bg-orange-50',
        text: 'text-orange-700',
        border: 'border-orange-200',
        dot: 'bg-orange-500'
    },
    CLOSED: {
        label: 'Closed',
        color: 'green',
        icon: Check,
        bg: 'bg-green-50',
        text: 'text-green-700',
        border: 'border-green-200',
        dot: 'bg-green-500'
    },
    FIR: {
        label: 'FIR',
        color: 'red',
        icon: Shield,
        bg: 'bg-red-50',
        text: 'text-red-700',
        border: 'border-red-200',
        dot: 'bg-red-500'
    }
};

const normalizeStatus = (s = '') => String(s || '').trim().toUpperCase();

const parseFirFields = (report = {}) => {
    const rawStatus = String(report.fir_status || '').trim();
    const storedNumber = String(report.fir_number || '').trim();

    if (!rawStatus && !storedNumber) return { converted: '', firNumber: '' };

    if (/^yes\s*[-:]\s*/i.test(rawStatus)) {
        return {
            converted: 'Yes',
            firNumber: storedNumber || rawStatus.replace(/^yes\s*[-:]\s*/i, '').trim()
        };
    }

    if (rawStatus.toLowerCase() === 'yes') return { converted: 'Yes', firNumber: storedNumber };
    if (rawStatus.toLowerCase() === 'no') return { converted: 'No', firNumber: '' };

    return { converted: 'Yes', firNumber: storedNumber || rawStatus };
};

const isUnknownName = (value = '') => {
    const normalized = String(value || '').trim().toLowerCase();
    return !normalized || normalized === 'unknown user' || normalized === 'unknown' || normalized === 'n/a';
};

const resolveOperatorName = (report = {}, preferred = null) => {
    const preferredName = preferred?.name;
    if (!isUnknownName(preferredName)) return preferredName;

    const createdByName = report?.created_by?.name;
    if (!isUnknownName(createdByName)) return createdByName;

    const statusHistoryName = (report?.status_history || [])
        .map((entry) => entry?.changed_by?.name)
        .find((name) => !isUnknownName(name));
    if (!isUnknownName(statusHistoryName)) return statusHistoryName;

    const complainantOperatorName = (report?.complainant_logs || [])
        .map((entry) => entry?.operator?.name)
        .find((name) => !isUnknownName(name));
    if (!isUnknownName(complainantOperatorName)) return complainantOperatorName;

    return '';
};

const statusMatches = (filter, report) => {
    if (!filter || filter === 'all') return true;
    const s = normalizeStatus(report.status);
    if (filter === 'FIR') {
        const { converted } = parseFirFields(report);
        return converted === 'Yes';
    }
    if (filter === 'PENDING') return s === 'PENDING';
    if (filter === 'ESCALATED') return s === 'ESCALATED' || s === 'ESCALED';
    if (filter === 'CLOSED') return s === 'CLOSED';
    return s === filter;
};

const platformIcons = {
    x: XBrandLogo,
    twitter: XBrandLogo,
    facebook: FacebookBrandLogo,
    instagram: InstagramBrandLogo,
    telegram: TelegramBrandLogo,
    whatsapp: WhatsAppBrandLogo,
    youtube: YoutubeBrandLogo,
    default: AllPlatformsLogo
};

const toApiFilesUrl = (rawUrl) => {
    if (!rawUrl) return '';
    const value = String(rawUrl).trim();
    if (!value) return '';

    const rewritePath = (pathname) => (pathname.startsWith('/files/') ? `/api${pathname}` : pathname);

    if (value.startsWith('/')) {
        return value.startsWith('/files/') ? `${BACKEND_URL}${rewritePath(value)}` : value;
    }

    try {
        const parsed = new URL(value);
        parsed.pathname = rewritePath(parsed.pathname);
        return parsed.toString();
    } catch {
        return value;
    }
};

/* ─── Duration calculator ─── */
const calcDuration = (from, to) => {
    if (!from) return '—';
    const start = new Date(from);
    const end = to ? new Date(to) : new Date();
    const diffMs = Math.max(0, end - start);
    const mins = Math.floor(diffMs / 60000);
    const hrs = Math.floor(mins / 60);
    const days = Math.floor(hrs / 24);
    if (days > 0) return `${days}d ${hrs % 24}h`;
    if (hrs > 0) return `${hrs}h ${mins % 60}m`;
    return `${mins}m`;
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*   DETAIL VIEW – Single scrollable report page          */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*   DETAIL VIEW – Executive Grievance Case Inspector      */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const GrievanceReportDetailView = ({ report, onClose, onPrint, isVideoUrl: isVideo, onUpdate }) => {
    const [detailTab, setDetailTab] = useState('overview');
    const [simMsg, setSimMsg] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [pdfGenerating, setPdfGenerating] = useState(false);
    const [pdfUrl, setPdfUrl] = useState(report?.report_pdf_url || null);
    const [copiedDetailCode, setCopiedDetailCode] = useState(false);
    const [activePreview, setActivePreview] = useState(null);
    const resolvedPdfUrl = toApiFilesUrl(pdfUrl || report?.report_pdf_url);
    const pdfGeneratingRef = useRef(false);
    pdfGeneratingRef.current = pdfGenerating;
    const pdfEnsureAttemptedRef = useRef(false);
    const reportRef = useRef(report);
    reportRef.current = report;
    const onUpdateRef = useRef(onUpdate);
    onUpdateRef.current = onUpdate;

    const handleGeneratePdf = useCallback(async () => {
        const current = reportRef.current;
        setPdfGenerating(true);
        try {
            const res = await api.post(`/grievance-workflow/reports/${current?.id || current?.unique_code}/generate-pdf`);
            const url = res.data?.pdf_url;
            if (url) {
                setPdfUrl(url);
                onUpdateRef.current?.({ ...current, report_pdf_url: url });
                toast.success('PDF generated successfully');
            }
        } catch (err) {
            toast.error(err?.response?.data?.detail || err?.response?.data?.error || 'PDF generation failed');
            console.error(err);
        } finally {
            setPdfGenerating(false);
        }
    }, []);

    useEffect(() => {
        if (!report?.id || pdfGeneratingRef.current || pdfEnsureAttemptedRef.current) return;
        pdfEnsureAttemptedRef.current = true;
        let cancelled = false;
        (async () => {
            const existing = pdfUrl || report?.report_pdf_url;
            if (existing) {
                const ok = await isPublicFileReachable(existing);
                if (cancelled) return;
                if (ok) return;
                setPdfUrl(null);
                onUpdateRef.current?.({ ...reportRef.current, report_pdf_url: null });
            }
            if (!cancelled) handleGeneratePdf();
        })();
        return () => { cancelled = true; };
    }, [pdfUrl, report?.id, report?.report_pdf_url, handleGeneratePdf]);

    const r = report || {};
    const status = statusConfig[r.status] || statusConfig.PENDING;
    const StatusIcon = status.icon;
    const mediaUrls = (Array.isArray(r.media_s3_urls) && r.media_s3_urls.length > 0 ? r.media_s3_urls : r.media_urls || []);
    const closingMediaUrls = (Array.isArray(r.closing_media_s3_urls) && r.closing_media_s3_urls.length > 0 ? r.closing_media_s3_urls : r.closing_media_urls || []);
    const firInfo = parseFirFields(r);
    const platformLabel = r.platform === 'x' || r.platform === 'twitter' ? 'X (Twitter)' : r.platform === 'facebook' ? 'Facebook' : r.platform === 'instagram' ? 'Instagram' : r.platform === 'telegram' ? 'Telegram' : r.platform === 'whatsapp' ? 'WhatsApp' : r.platform || '—';
    const PlatformIcon = platformIcons[r.platform?.toLowerCase()] || platformIcons.default;

    const handleCopyCode = () => {
        if (!r.unique_code) return;
        navigator.clipboard.writeText(r.unique_code);
        setCopiedDetailCode(true);
        toast.success(`Copied ID ${r.unique_code}`);
        setTimeout(() => setCopiedDetailCode(false), 2000);
    };

    /* ─── Thread context from linked grievance ─── */
    const gCtx = r.grievance_context || {};
    const isX = (r.platform || '').toLowerCase() === 'x' || (r.platform || '').toLowerCase() === 'twitter';
    const hasCtxContent = (node) => node && (node.tweet_id || node.content?.text || node.content?.full_text || node.content?.media?.length);
    const threadParent = hasCtxContent(gCtx.thread_parent) ? gCtx.thread_parent : null;
    const inReplyTo = hasCtxContent(gCtx.in_reply_to) ? gCtx.in_reply_to : null;
    const quotedCtx = hasCtxContent(gCtx.quoted) ? gCtx.quoted : null;
    const repostedFrom = hasCtxContent(gCtx.reposted_from) ? gCtx.reposted_from : null;
    const hasThread = isX && (threadParent || inReplyTo || quotedCtx || repostedFrom);

    /* Build status timeline steps */
    const timelineSteps = useMemo(() => {
        if (!report) return [];
        const steps = [];
        const hist = report.status_history || [];

        /* PENDING */
        const createdAt = report.created_at;
        const escalatedAt = report.escalated_at || hist.find(h => h.to_status === 'ESCALATED' || h.to_status === 'ESCALED')?.timestamp;
        const closedAt = report.closed_at || hist.find(h => h.to_status === 'CLOSED')?.timestamp;
        const currentStatus = (report.status || 'PENDING').toUpperCase();

        steps.push({
            label: 'Pending',
            date: createdAt,
            active: true,
            current: currentStatus === 'PENDING',
            duration: calcDuration(createdAt, escalatedAt || closedAt || (currentStatus === 'PENDING' ? null : createdAt)),
            officer: report.created_by?.name || report.informed_to?.name || '—',
            note: 'Issue logged and marked for operator triage',
            color: 'yellow'
        });

        /* ESCALATED */
        const escalateHist = hist.find(h => h.to_status === 'ESCALATED' || h.to_status === 'ESCALED');
        const isEscalated = currentStatus === 'ESCALATED' || currentStatus === 'ESCALED' || currentStatus === 'CLOSED';

        let escalatedNote = escalateHist?.note || (report.informed_to?.name ? `Escalated to ${report.informed_to.name}` : '—');
        if (report.informed_to?.phone && escalatedNote !== '—' && !escalatedNote.includes(report.informed_to.phone)) {
            escalatedNote += ` (${report.informed_to.phone})`;
        }

        steps.push({
            label: 'Escalated',
            date: escalatedAt,
            active: isEscalated,
            current: currentStatus === 'ESCALATED' || currentStatus === 'ESCALED',
            duration: isEscalated ? calcDuration(escalatedAt, closedAt || (currentStatus === 'CLOSED' ? closedAt : null)) : '—',
            officer: escalateHist?.changed_by?.name || report.informed_to?.name || '—',
            note: escalatedNote,
            color: 'orange'
        });

        /* CLOSED */
        const closeHist = hist.find(h => h.to_status === 'CLOSED');
        const isClosed = currentStatus === 'CLOSED';
        steps.push({
            label: 'Closed',
            date: closedAt,
            active: isClosed,
            current: isClosed,
            duration: isClosed ? calcDuration(createdAt, closedAt) : '—',
            officer: closeHist?.changed_by?.name || '—',
            note: report.closing_remarks || closeHist?.note || 'Resolved',
            color: 'green',
            totalResolution: true
        });

        return steps;
    }, [report]);

    /* Chat logs merged */
    const chatLogs = useMemo(() => {
        const logs = [
            ...(r.complainant_logs || []).map(l => ({ ...l, _source: 'complainant' })),
            ...(r.officer_logs || []).map(l => ({ ...l, _source: 'officer' }))
        ];

        const escalateHist = (r.status_history || []).find(h => h.to_status === 'ESCALATED' || h.to_status === 'ESCALED');
        if (escalateHist || r.escalated_at) {
            logs.push({
                _source: 'system_escalation',
                timestamp: escalateHist?.timestamp || r.escalated_at,
                content: escalateHist?.note || r.remarks || 'Grievance Escalated',
                fullMessage: r.escalation_message || '',
                operator: escalateHist?.changed_by || r.created_by,
                informed_to: r.informed_to
            });
        }

        return logs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }, [r.complainant_logs, r.officer_logs, r.status_history, r.escalated_at, r.remarks, r.created_by, r.informed_to, r.escalation_message]);

    const colorHex = {
        yellow: { border: '#eab308', text: '#ca8a04', bg: '#facc15' },
        orange: { border: '#f97316', text: '#ea580c', bg: '#fb923c' },
        green: { border: '#22c55e', text: '#16a34a', bg: '#4ade80' }
    };

    if (!report) return null;

    const printDate = new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    return (
        <div className="space-y-4 pb-2">
            {/* ══════════════════════════════════════════════════ */}
            {/* PRINT-ONLY LETTERHEAD (hidden on screen)          */}
            {/* ══════════════════════════════════════════════════ */}
            <div className="gwr-print-letterhead hidden">
                <div className="gwr-print-letterhead-top">
                    <div>
                        <div style={{ fontSize: '13pt', fontWeight: 700, letterSpacing: '0.04em' }}>Grievance Report</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'flex-end' }}>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '18pt', fontWeight: 900, letterSpacing: '0.05em', fontFamily: 'monospace', color: '#fbbf24' }}>{r.unique_code || '—'}</div>
                            <div style={{ fontSize: '7pt', opacity: 0.7, marginTop: 2 }}>UNIQUE REPORT ID</div>
                        </div>
                        {resolvedPdfUrl && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                <div style={{ background: '#ffffff', padding: '4px', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
                                    <QRCodeSVG
                                        value={resolvedPdfUrl}
                                        size={72}
                                        level="M"
                                        includeMargin={false}
                                        bgColor="#ffffff"
                                        fgColor="#1e293b"
                                    />
                                </div>
                                <div style={{ fontSize: '6pt', opacity: 0.6, textAlign: 'center' }}>Scan to download PDF</div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ═══════ 1. MODERN EXECUTIVE HERO CARD ═══════ */}
            <div className="gwr-report-header rounded-2xl border border-border/80 bg-gradient-to-r from-card via-card to-muted/30 p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3.5">
                        <div className="h-11 w-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                            <FileText className="h-5 w-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Unique Case ID</span>
                                <Badge variant="outline" className="text-[10px] font-semibold gap-1 bg-muted/40">
                                    <PlatformIcon className="h-3 w-3" />
                                    {platformLabel}
                                </Badge>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xl font-black font-mono tracking-tight text-foreground">{r.unique_code || '—'}</span>
                                <button
                                    type="button"
                                    onClick={handleCopyCode}
                                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                    title="Copy Unique Code"
                                >
                                    {copiedDetailCode ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5 flex-wrap">
                        {/* Status Badge */}
                        <div className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold", status.bg, status.border)}>
                            <span className={cn("w-2 h-2 rounded-full shrink-0", status.dot)} />
                            <span className={status.text}>{status.label}</span>
                        </div>

                        {/* Created Badge */}
                        <span className="text-[11px] text-muted-foreground bg-muted/60 dark:bg-muted/30 px-2.5 py-1 rounded-lg border border-border/60 font-medium">
                            Created {fmtRelativeTime(r.created_at)}
                        </span>

                        {/* PDF Actions */}
                        <div className="gwr-no-print flex items-center gap-2">
                            {resolvedPdfUrl && (
                                <a
                                    href={resolvedPdfUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors"
                                >
                                    <Download className="h-3.5 w-3.5" />
                                    Download PDF
                                </a>
                            )}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleGeneratePdf}
                                disabled={pdfGenerating}
                                className="h-8 text-xs font-semibold px-2.5 rounded-lg shadow-xs"
                            >
                                {pdfGenerating ? (
                                    <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Generating…</>
                                ) : (
                                    <><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> {resolvedPdfUrl ? 'Regenerate PDF' : 'Generate PDF'}</>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══════ 2. POST DETAILS CARD ═══════ */}
            <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-sm">
                <div className="px-5 py-3 bg-muted/40 border-b border-border/60 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />
                        <span className="text-xs font-bold text-foreground uppercase tracking-wider">Post Details</span>
                    </div>
                    <Badge variant="outline" className="text-[11px] font-semibold bg-background">
                        {r.category || 'Others'}
                    </Badge>
                </div>

                <div className="p-5 space-y-4">
                    {/* Top Metadata Grid + Post QR */}
                    <div className="flex flex-col lg:flex-row gap-5 items-start">
                        {/* 2-Column Key-Value Grid */}
                        <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5 text-xs">
                            {/* Platform */}
                            <div className="flex items-start gap-2.5 pb-2 border-b border-border/40">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground w-28 shrink-0">Platform</span>
                                <div className="flex items-center gap-1.5 font-semibold text-foreground">
                                    <PlatformIcon className="h-4 w-4" />
                                    <span>{platformLabel}</span>
                                </div>
                            </div>

                            {/* Posted By */}
                            <div className="flex items-start gap-2.5 pb-2 border-b border-border/40">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground w-28 shrink-0">Posted By</span>
                                <div className="min-w-0">
                                    <span className="font-bold text-foreground block truncate">{r.posted_by?.display_name || r.profile_id || '—'}</span>
                                    {r.profile_id && (
                                        <a
                                            href={r.profile_id.startsWith('http') ? r.profile_id : `https://${r.platform === 'facebook' ? 'facebook.com' : r.platform === 'instagram' ? 'instagram.com' : 'x.com'}/${r.profile_id.replace(/^@/, '')}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[11px] text-primary hover:underline font-mono truncate block"
                                        >
                                            @{r.profile_id}
                                        </a>
                                    )}
                                </div>
                            </div>

                            {/* Posted Date & Time */}
                            <div className="flex items-start gap-2.5 pb-2 border-b border-border/40">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground w-28 shrink-0">Posted Date & Time</span>
                                <div className="font-medium text-foreground">
                                    <span>{r.post_date ? fmtDate(r.post_date) : '—'}</span>
                                    {r.post_date && (
                                        <span className="text-[10px] text-muted-foreground ml-1 font-normal">({fmtRelativeTime(r.post_date)})</span>
                                    )}
                                </div>
                            </div>

                            {/* Post Link */}
                            <div className="flex items-start gap-2.5 pb-2 border-b border-border/40">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground w-28 shrink-0">Post Link</span>
                                <div className="min-w-0 flex-1">
                                    {r.post_link ? (
                                        <a
                                            href={r.post_link}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-primary hover:underline font-mono text-[11px] truncate max-w-full"
                                            title={r.post_link}
                                        >
                                            <span className="truncate">{r.post_link}</span>
                                            <ExternalLink className="h-3 w-3 shrink-0" />
                                        </a>
                                    ) : (
                                        <span className="text-muted-foreground">—</span>
                                    )}
                                </div>
                            </div>

                            {/* Category */}
                            <div className="flex items-start gap-2.5 pb-2 border-b border-border/40">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground w-28 shrink-0">Category</span>
                                <div>
                                    <Badge variant="outline" className="text-[11px] font-semibold bg-muted/30">
                                        {r.category || 'Others'}
                                    </Badge>
                                </div>
                            </div>

                            {/* Complaint Phone */}
                            <div className="flex items-start gap-2.5 pb-2 border-b border-border/40">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground w-28 shrink-0">Complaint Phone</span>
                                <div className="font-mono font-medium text-foreground">
                                    {r.complaint_phone ? (
                                        <a href={`tel:${r.complaint_phone}`} className="hover:underline text-primary">
                                            {r.complaint_phone}
                                        </a>
                                    ) : '—'}
                                </div>
                            </div>

                            {/* Informed To */}
                            <div className="flex items-start gap-2.5 pb-2 border-b border-border/40 sm:col-span-2">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground w-28 shrink-0">Informed To</span>
                                <div className="font-medium text-foreground flex items-center gap-2 flex-wrap">
                                    {r.informed_to?.name ? (
                                        <>
                                            <span className="font-bold">{r.informed_to.name}</span>
                                            {r.informed_to.phone && (
                                                <span className="font-mono text-muted-foreground text-[11px]">({r.informed_to.phone})</span>
                                            )}
                                            {r.informed_to.department && (
                                                <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">• {r.informed_to.department}</span>
                                            )}
                                        </>
                                    ) : (
                                        <span className="text-muted-foreground italic">Not assigned</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Right: Post QR Code */}
                        {r.post_link && (
                            <div className="gwr-post-qr-block shrink-0 flex flex-col items-center gap-1.5 p-3 rounded-xl border border-border/70 bg-muted/20 text-center self-center lg:self-start">
                                <div className="p-1.5 bg-white rounded-lg border border-border/80 shadow-xs">
                                    <QRCodeSVG
                                        value={r.post_link}
                                        size={96}
                                        level="M"
                                        includeMargin={false}
                                        bgColor="#ffffff"
                                        fgColor="#0f172a"
                                    />
                                </div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Post QR</span>
                                <span className="text-[9px] text-muted-foreground/80">Scan to view original</span>
                            </div>
                        )}
                    </div>

                    {/* Full Tweet Thread (if X) */}
                    {hasThread && (
                        <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-xs">
                            <div className="px-4 py-2.5 bg-muted/40 border-b border-border/60 flex items-center gap-2">
                                <Reply className="h-3.5 w-3.5 text-primary" />
                                <span className="text-[11px] font-bold text-foreground uppercase tracking-wider">Full Tweet Thread</span>
                            </div>
                            <div className="p-4 space-y-0">
                                {(() => {
                                    const renderThreadTweet = (node, label, isLast = false) => {
                                        if (!node) return null;
                                        const user = node.posted_by || {};
                                        const handle = (user.handle || '').replace('@', '');
                                        const text = node.content?.full_text || node.content?.text || '';
                                        const media = node.content?.media || [];
                                        return (
                                            <div key={label} className="relative">
                                                {!isLast && <div className="absolute left-[19px] top-[40px] bottom-0 w-0.5 bg-border" />}
                                                <div className="flex gap-3">
                                                    <div className="flex-1 min-w-0 pb-4">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="text-sm font-bold text-foreground truncate">{user.display_name || handle || 'Unknown'}</span>
                                                            {handle && <span className="text-xs text-muted-foreground truncate">@{handle}</span>}
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">{label}</span>
                                                        </div>
                                                        {text && <p className="text-sm text-foreground/90 mt-1.5 whitespace-pre-wrap break-words leading-relaxed">{text}</p>}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    };

                                    const threadNodes = [
                                        threadParent && { node: threadParent, label: 'Thread Start' },
                                        repostedFrom && { node: repostedFrom, label: 'Reposted From' },
                                        inReplyTo && (!threadParent || threadParent?.tweet_id !== inReplyTo?.tweet_id) && { node: inReplyTo, label: 'Original Post' },
                                    ].filter(Boolean);

                                    return (
                                        <>
                                            {threadNodes.map((item) => renderThreadTweet(item.node, item.label, false))}
                                            {renderThreadTweet(
                                                { posted_by: r.posted_by || r.grievance_posted_by, content: r.grievance_content || { text: r.post_description }, post_date: r.post_date, tweet_url: r.post_link },
                                                threadNodes.length > 0 ? 'Reply' : 'Post',
                                                !quotedCtx
                                            )}
                                            {quotedCtx && renderThreadTweet(quotedCtx, 'Quoted', true)}
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    )}

                    {/* Post Description Box */}
                    {!hasThread && (
                        <div className="rounded-xl border border-border/80 bg-muted/20 p-4">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Post Description</span>
                            <div className="text-sm text-foreground/95 whitespace-pre-wrap leading-relaxed font-normal">
                                {r.post_description || r.content?.full_text || r.content?.text || 'No description provided'}
                            </div>
                        </div>
                    )}

                    {/* Post Media Gallery */}
                    {mediaUrls.length > 0 && (
                        <div>
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-2.5 flex items-center gap-1.5">
                                <Image className="h-3.5 w-3.5" />
                                Attached Media ({mediaUrls.length})
                            </span>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                {mediaUrls.map((url, i) => (
                                    <div
                                        key={i}
                                        className="group relative aspect-video rounded-xl border border-border overflow-hidden hover:border-primary/60 transition-colors cursor-pointer bg-muted/40 shadow-xs"
                                        onClick={() => setActivePreview(url)}
                                    >
                                        {isVideo(url) ? (
                                            <div className="h-full w-full bg-slate-900 flex items-center justify-center relative">
                                                <video src={url} className="h-full w-full object-cover opacity-80" preload="metadata" />
                                                <div className="absolute h-9 w-9 rounded-full bg-black/50 text-white flex items-center justify-center backdrop-blur-xs">
                                                    <div className="w-0 h-0 border-t-[6px] border-t-transparent border-l-[10px] border-l-white border-b-[6px] border-b-transparent ml-0.5" />
                                                </div>
                                            </div>
                                        ) : (
                                            <img src={url} alt={`Media ${i + 1}`} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" referrerPolicy="no-referrer" onError={e => e.currentTarget.src = ''} />
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ═══════ 3. STATUS TIMELINE CARD ═══════ */}
            <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-sm">
                <div className="px-5 py-3 bg-muted/40 border-b border-border/60 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    <span className="text-xs font-bold text-foreground uppercase tracking-wider">Status Timeline</span>
                    <span className="text-[10px] text-muted-foreground ml-2">Tracking lifecycle & escalation milestones</span>
                </div>
                <div className="p-6">
                    <div className="flex flex-col space-y-0">
                        {timelineSteps.map((step, idx) => {
                            const isLast = idx === timelineSteps.length - 1;
                            const isActive = step.active;

                            return (
                                <div key={idx} className={cn("flex group", !isActive && "opacity-40")}>
                                    <div className="w-28 md:w-36 pt-1 pr-4 text-right shrink-0">
                                        {step.date ? (
                                            <>
                                                <div className="text-[11px] font-bold text-foreground leading-tight">
                                                    {new Date(step.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                </div>
                                                <div className="text-[10px] text-muted-foreground font-medium">
                                                    {new Date(step.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                                </div>
                                            </>
                                        ) : (
                                            <div className="text-[10px] text-muted-foreground/60 italic">Not reached</div>
                                        )}
                                    </div>

                                    <div className="relative flex flex-col items-center shrink-0 w-10">
                                        <div
                                            className={cn(
                                                "z-10 h-8 w-8 rounded-full flex items-center justify-center border-2 transition-all duration-300",
                                                isActive ? "bg-background shadow-md" : "bg-muted/40 border-border"
                                            )}
                                            style={isActive ? { borderColor: colorHex[step.color]?.border || '#eab308' } : undefined}
                                        >
                                            {step.label === 'Pending' && <Plus className="h-4 w-4" style={{ color: isActive ? (colorHex[step.color]?.text || '#ca8a04') : '#94a3b8' }} />}
                                            {step.label === 'Escalated' && <AlertCircle className="h-4 w-4" style={{ color: isActive ? (colorHex[step.color]?.text || '#ea580c') : '#94a3b8' }} />}
                                            {step.label === 'Closed' && <Check className="h-4 w-4" style={{ color: isActive ? (colorHex[step.color]?.text || '#16a34a') : '#94a3b8' }} />}
                                        </div>
                                        {!isLast && (
                                            <div
                                                className="w-0.5 grow my-1 rounded-full transition-colors duration-500"
                                                style={{ backgroundColor: timelineSteps[idx + 1]?.active ? (colorHex[step.color]?.bg || '#facc15') : '#e2e8f0' }}
                                            />
                                        )}
                                    </div>

                                    <div className={cn("flex-1 ml-4 pb-6", isLast && "pb-0")}>
                                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                            <h4 className={cn("text-sm font-bold tracking-tight uppercase", isActive ? "text-foreground" : "text-muted-foreground")}>
                                                {step.label}
                                            </h4>
                                            {isActive && step.duration && step.duration !== '—' && (
                                                <Badge variant="outline" className="h-5 px-2 text-[10px] font-bold border-border bg-muted/40 text-muted-foreground">
                                                    <Clock className="h-3 w-3 mr-1" />
                                                    {step.duration}
                                                </Badge>
                                            )}
                                        </div>

                                        <div className={cn("p-3 rounded-xl border", isActive ? "bg-card border-border/80 shadow-xs" : "bg-muted/20 border-border/40")}>
                                            <div className="flex items-center gap-1.5 mb-1">
                                                <User className="h-3 w-3 text-muted-foreground" />
                                                <span className="text-[11px] font-semibold text-foreground">{step.officer}</span>
                                            </div>
                                            {step.note && step.note !== '—' && (
                                                <p className="text-xs text-muted-foreground leading-relaxed">
                                                    {step.note}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* ═══════ 4. COMMUNICATION & INTERACTION LOG ═══════ */}
            <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-sm">
                <div className="px-5 py-3 bg-muted/40 border-b border-border/60 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-primary" />
                        <span className="text-xs font-bold text-foreground uppercase tracking-wider">Communication Log</span>
                        <Badge variant="outline" className="text-[10px] font-semibold bg-background">{chatLogs.length} messages</Badge>
                    </div>
                </div>

                <div className="p-4 divide-y divide-border/40 max-h-[360px] overflow-y-auto space-y-3">
                    {chatLogs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-[140px] text-center">
                            <MessageSquare className="h-8 w-8 text-muted-foreground/40 mb-1.5" />
                            <p className="text-xs font-semibold text-muted-foreground">No communication recorded for this case yet</p>
                        </div>
                    ) : chatLogs.map((log, idx) => {
                        const isEscalation = log._source === 'system_escalation' || (log._source === 'officer' && log.is_escalation);
                        const isOfficerMsg = log._source === 'officer' && !isEscalation;
                        const isOperatorRemark = log._source === 'complainant' && log.type === 'OperatorRemark';
                        const isUserMsg = log._source === 'complainant' && log.type === 'User';

                        const complainantName = r.posted_by?.display_name || r.profile_id || 'Post Author';
                        const operatorName = resolveOperatorName(r, log.operator?.name || log.operator);
                        const officerName = log.recipient?.name || r.informed_to?.name || 'Officer';

                        let tagBg, roleTitle;
                        if (isUserMsg) {
                            tagBg = 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30';
                            roleTitle = `Complainant (${complainantName})`;
                        } else if (isOperatorRemark) {
                            tagBg = 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30';
                            roleTitle = `Internal Operator Note (${operatorName})`;
                        } else if (isEscalation) {
                            tagBg = 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30';
                            roleTitle = `Escalated → Officer (${officerName})`;
                        } else if (isOfficerMsg) {
                            tagBg = 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30';
                            roleTitle = `Officer (${officerName})`;
                        } else {
                            tagBg = 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30';
                            roleTitle = `Operator → Complainant`;
                        }

                        return (
                            <div key={idx} className="pt-2.5 first:pt-0">
                                <div className="flex items-center justify-between gap-2 mb-1">
                                    <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded border', tagBg)}>
                                        {roleTitle}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">{fmtRelativeTime(log.timestamp)}</span>
                                </div>
                                <div className="bg-muted/20 p-2.5 rounded-lg border border-border/40">
                                    <p className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed">
                                        {log.fullMessage || log.content}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Internal Operator Note Composer */}
                <div className="p-3.5 bg-muted/20 border-t border-border/60">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold text-foreground">Add Internal Operator Note</span>
                        <span className="text-[9px] text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded font-semibold border border-amber-500/20">Staff Only</span>
                    </div>
                    <div className="flex items-end gap-2">
                        <textarea
                            value={simMsg}
                            onChange={e => setSimMsg(e.target.value)}
                            placeholder="Type an internal note regarding this grievance..."
                            className="flex-1 min-h-[46px] max-h-24 bg-background rounded-lg border border-border/80 text-xs p-2.5 resize-none outline-none focus:ring-1 focus:ring-primary"
                        />
                        <Button
                            size="sm"
                            disabled={submitting || !simMsg.trim()}
                            onClick={async () => {
                                if (!simMsg.trim() || submitting) return;
                                setSubmitting(true);
                                try {
                                    const res = await api.put(`/grievance-workflow/reports/${r.id}`, {
                                        complainant_logs: [...(r.complainant_logs || []), {
                                            mode: 'INTERNAL', type: 'OperatorRemark', content: simMsg.trim(), timestamp: new Date()
                                        }]
                                    });
                                    if (res.data) { onUpdate?.(res.data); setSimMsg(''); toast.success('Note added'); }
                                } catch { toast.error('Failed to add note'); }
                                finally { setSubmitting(false); }
                            }}
                            className="h-9 px-3.5 text-xs font-semibold"
                        >
                            <Send className="h-3.5 w-3.5 mr-1" />
                            Add Note
                        </Button>
                    </div>
                </div>
            </div>

            {/* ═══════ 5. RESOLUTION & POLICE FIR / GD DETAILS ═══════ */}
            <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-sm">
                <div className="px-5 py-3 bg-muted/40 border-b border-border/60 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <ShieldAlert className="h-4 w-4 text-primary" />
                        <span className="text-xs font-bold text-foreground uppercase tracking-wider">Resolution & Police FIR / GD Details</span>
                    </div>
                    {r.status === 'CLOSED' && (
                        <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 text-[10px] font-bold">
                            Case Resolved
                        </Badge>
                    )}
                </div>

                <div className="p-5 space-y-4">
                    {/* Closing Remarks */}
                    {r.closing_remarks ? (
                        <div className="p-3.5 bg-muted/30 rounded-lg border border-border/50">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Closing Remarks</span>
                            <p className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed">{r.closing_remarks}</p>
                        </div>
                    ) : (
                        <div className="p-3 bg-muted/20 rounded-lg border border-border/40 text-xs text-muted-foreground italic">
                            No closure remarks added yet.
                        </div>
                    )}

                    {r.final_reply_to_user && (
                        <div className="p-3.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                            <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block mb-1">Final Reply to Complainant</span>
                            <p className="text-xs text-emerald-900 dark:text-emerald-200 whitespace-pre-wrap leading-relaxed">{r.final_reply_to_user}</p>
                        </div>
                    )}

                    {/* FIR / Police Info */}
                    {(firInfo.converted === 'Yes' || firInfo.firNumber) && (
                        <div className="p-4 bg-rose-500/5 rounded-xl border border-rose-500/20 space-y-2.5">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider">Police FIR / GD Record</span>
                                <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-400 font-mono text-[10px]">
                                    FIR #{firInfo.firNumber || 'Registered'}
                                </Badge>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                {firInfo.policeStation && (
                                    <div className="text-muted-foreground">
                                        <span className="font-semibold text-foreground">Police Station: </span>{firInfo.policeStation}
                                    </div>
                                )}
                                {firInfo.officerInCharge && (
                                    <div className="text-muted-foreground">
                                        <span className="font-semibold text-foreground">Officer Incharge: </span>{firInfo.officerInCharge}
                                    </div>
                                )}
                                {firInfo.sections && (
                                    <div className="text-muted-foreground sm:col-span-2">
                                        <span className="font-semibold text-foreground">IPC/IT Sections: </span>{firInfo.sections}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Closing Proof Attachments */}
                    {closingMediaUrls.length > 0 && (
                        <div>
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-2">Resolution Proof Attachments</span>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {closingMediaUrls.map((url, i) => (
                                    <div key={i} className="aspect-video rounded-lg overflow-hidden border border-border bg-muted/40 cursor-pointer hover:opacity-90" onClick={() => setActivePreview(url)}>
                                        {isVideo(url) ? (
                                            <video src={url} className="h-full w-full object-cover bg-black" controls />
                                        ) : (
                                            <img src={url} alt={`Proof ${i + 1}`} className="h-full w-full object-cover" />
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Lightbox */}
            {activePreview && (
                <div className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 gwr-lightbox" onClick={() => setActivePreview(null)}>
                    <button
                        type="button"
                        onClick={() => setActivePreview(null)}
                        className="absolute top-4 right-4 h-9 w-9 rounded-full bg-white/20 text-white hover:bg-white/30 flex items-center justify-center z-10"
                    >
                        <X className="h-5 w-5" />
                    </button>
                    <div className="w-full max-w-4xl max-h-[85vh] rounded-2xl overflow-hidden border border-white/20 bg-black shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        {isVideo(activePreview) ? (
                            <video src={activePreview} controls autoPlay playsInline className="w-full max-h-[85vh] object-contain bg-black" />
                        ) : (
                            <img src={activePreview} alt="Preview" className="w-full max-h-[85vh] object-contain bg-black" referrerPolicy="no-referrer" />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*            GRIEVANCE WORKFLOW REPORTS TABLE                      */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
export const GrievanceWorkflowReports = ({ externalStatusFilter = 'all', onStatsUpdate, openReportCode = '', onReportCodeHandled }) => {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [platform, setPlatform] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [quickRange, setQuickRange] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({ total: 0, pages: 1 });
    const [stats, setStats] = useState({ total: 0, pending: 0, escalated: 0, closed: 0, fir: 0 });
    const [selectedReport, setSelectedReport] = useState(null);
    const [waPhone, setWaPhone] = useState('');
    const [copied, setCopied] = useState(false);
    const [copiedCodeId, setCopiedCodeId] = useState(null);
    const detailPopupRef = useRef(null);
    const printComponentRef = useRef(null);
    const onStatsUpdateRef = useRef(onStatsUpdate);
    onStatsUpdateRef.current = onStatsUpdate;
    const [detailPos, setDetailPos] = useState({
        x: Math.max(24, window.innerWidth / 2 - 480),
        y: 40
    });
    const [draggingDetail, setDraggingDetail] = useState(false);
    const [detailDragOffset, setDetailDragOffset] = useState({ x: 0, y: 0 });
    const [fullscreen, setFullscreen] = useState(false);
    const [sortConfig, setSortConfig] = useState({ key: 'post_date', direction: 'desc' });
    const [activeTab, setActiveTab] = useState('details');
    const [previewMedia, setPreviewMedia] = useState(null);

    useEffect(() => {
        if (!externalStatusFilter) return;
        const normalized = String(externalStatusFilter).trim().toUpperCase();
        const allowed = new Set(['ALL', 'PENDING', 'ESCALATED', 'CLOSED', 'FIR']);
        const next = allowed.has(normalized) ? normalized : 'ALL';
        const nextValue = next.toLowerCase() === 'all' ? 'all' : next;

        // Only update if different and not just a mount-time default reset
        setStatusFilter((prev) => {
            if (prev === nextValue) return prev;
            return nextValue;
        });
        setPage(1);
    }, [externalStatusFilter]);

    useEffect(() => {
        if (quickRange === 'all') {
            setFromDate('');
            setToDate('');
            return;
        }
        if (quickRange === 'custom') return;

        const end = new Date();
        const start = new Date();

        if (quickRange === '24h') {
            start.setDate(start.getDate() - 1);
        } else if (quickRange === '7d') {
            start.setDate(start.getDate() - 7);
        } else if (quickRange === '30d') {
            start.setDate(start.getDate() - 30);
        } else if (quickRange === 'last_month') {
            start.setMonth(start.getMonth() - 1);
            start.setDate(1);
            end.setDate(0); // Last day of previous month
        }

        const fmt = (d) => {
            const yr = d.getFullYear();
            const mo = String(d.getMonth() + 1).padStart(2, '0');
            const da = String(d.getDate()).padStart(2, '0');
            return `${yr}-${mo}-${da}`;
        };

        setFromDate(fmt(start));
        setToDate(fmt(end));
        setPage(1);
    }, [quickRange]);

    const fetchReports = useCallback(async () => {
        setLoading(true);
        try {
            const params = {
                page,
                limit: 50,
                sort: sortConfig.key,
                order: sortConfig.direction
            };
            if (platform !== 'all') params.platform = platform;
            if (statusFilter !== 'all') params.status = statusFilter;
            if (categoryFilter !== 'all') params.category = categoryFilter;
            if (fromDate) params.from = fromDate;
            if (toDate) params.to = toDate;
            if (searchTerm) params.search = searchTerm;

            console.log('[fetchReports] Sending params:', params);

            const res = await api.get('/grievance-workflow/reports', { params });
            setReports(res.data?.reports || []);
            setPagination(res.data?.pagination || { total: 0, pages: 1 });
            const nextStats = res.data?.stats || { total: 0, pending: 0, escalated: 0, closed: 0, fir: 0 };
            setStats(nextStats);
            onStatsUpdateRef.current?.(nextStats);
        } catch {
            toast.error('Failed to load grievance reports', {
                description: 'Please check your connection and try again',
                action: { label: 'Retry', onClick: fetchReports }
            });
        }
        finally { setLoading(false); }
    }, [page, platform, statusFilter, categoryFilter, fromDate, toDate, searchTerm, sortConfig]);

    useEffect(() => { fetchReports(); }, [fetchReports]);

    useEffect(() => {
        const code = String(openReportCode || '').trim();
        if (!code) return;
        setPlatform('all');
        setStatusFilter('all');
        setPage(1);
        setSearchTerm(code);
    }, [openReportCode]);

    useEffect(() => {
        const code = String(openReportCode || '').trim().toUpperCase();
        if (!code || loading) return;
        const match = reports.find((item) => String(item.unique_code || '').trim().toUpperCase() === code);
        if (!match) return;
        setSelectedReport(match);
        setWaPhone(match.informed_to?.phone || match.complaint_phone || '');
        onReportCodeHandled?.(match.unique_code || code);
    }, [openReportCode, reports, loading, onReportCodeHandled]);

    const handleExport = async () => {
        setExporting(true);
        try {
            const params = {};
            if (platform !== 'all') params.platform = platform;
            if (statusFilter !== 'all') params.status = statusFilter;
            if (categoryFilter !== 'all') params.category = categoryFilter;
            if (fromDate) params.from = fromDate;
            if (toDate) params.to = toDate;
            if (searchTerm) params.search = searchTerm;

            const res = await api.get('/grievance-workflow/reports/export', {
                params,
                responseType: 'blob'
            });

            const blob = new Blob([res.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `grievance_workflow_${new Date().toISOString().slice(0, 10)}.xlsx`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

            toast.success('Excel report downloaded successfully', {
                description: `${pagination.total} reports exported`
            });
        } catch {
            toast.error('Failed to export reports');
        }
        finally { setExporting(false); }
    };

    const buildShareMessage = useCallback((r) => {
        if (!r) return '';
        return [
            `📋 *GRIEVANCE REPORT: ${r.unique_code || ''}*`,
            ``,
            `📊 *Status:* ${r.status || 'PENDING'}`,
            `📅 *Post Date:* ${fmtDate(r.post_date)}`,
            `👤 *Profile:* ${r.profile_id || r.posted_by?.handle || 'N/A'}`,
            `📞 *Complaint Phone:* ${r.complaint_phone || 'N/A'}`,
            `🏷️ *Category:* ${r.category || 'Others'}`,
            `🔗 *Post Link:* ${r.post_link || 'N/A'}`,
            ``,
            `📝 *Description:*`,
            `${r.post_description || ''}`,
            ``,
            ` *Final Communication:*`,
            `${r.final_communication || ''}`,
            ``,
            `_Shared via Grievance Management System_`
        ].join('\n');
    }, []);

    const handleShareViaWhatsApp = () => {
        if (!selectedReport) return;
        const phone = String(waPhone || '').replace(/[^0-9]/g, '');
        if (!phone) {
            toast.error('Please enter a WhatsApp number');
            return;
        }
        const message = buildShareMessage(selectedReport);
        const phoneWithCountry = phone.startsWith('91') ? phone : `91${phone}`;

        navigator.clipboard.writeText(message);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);

        toast.success('Details copied to clipboard', {
            description: 'Opening WhatsApp...'
        });

        window.open(`https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(message)}`, '_blank');
    };

    const handleCopyToClipboard = () => {
        if (!selectedReport) return;
        const message = buildShareMessage(selectedReport);
        navigator.clipboard.writeText(message);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast.success('Copied to clipboard');
    };

    const handlePrintPdf = useReactToPrint({
        contentRef: printComponentRef,
        documentTitle: `Grievance Report - ${selectedReport?.unique_code || 'Detail'}`,
        pageStyle: `
            @page {
                size: A4;
                margin: 14mm 16mm 18mm 16mm;
            }
            @media print {
                * {
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                    color-adjust: exact !important;
                    box-shadow: none !important;
                    text-shadow: none !important;
                }
                body {
                    font-family: 'Segoe UI', Arial, sans-serif;
                    font-size: 10.5pt;
                    color: #111;
                    background: #fff !important;
                    line-height: 1.5;
                    margin: 0;
                    padding: 0;
                }

                /* ── Show the real report header (matches screen preview) ── */
                .gwr-report-header {
                    display: flex !important;
                    background: #1e293b !important;
                    color: #fff !important;
                    padding: 14px 18px !important;
                    border-radius: 10px !important;
                    margin-bottom: 14px !important;
                    page-break-inside: avoid;
                }
                .gwr-report-header .text-amber-400 { color: #fbbf24 !important; }
                .gwr-report-header .text-slate-400 { color: #94a3b8 !important; }
                .gwr-report-header .bg-amber-500\/20 { background: rgba(245,158,11,0.2) !important; }
                .gwr-report-header .border-amber-400\/30 { border-color: rgba(251,191,35,0.3) !important; }
                .gwr-report-header .bg-white { background: #fff !important; }
                .gwr-report-header svg { display: block !important; }
                .gwr-no-print { display: none !important; }

                /* ── Hide the old print-only letterhead ── */
                .gwr-print-letterhead { display: none !important; }

                /* ── Hide screen-only decorative bits (icons, badges) ── */
                .gwr-screen-only { display: none !important; }

                /* ── Section cards ── */
                .gwr-section-card {
                    border: 1.5px solid #e2e8f0 !important;
                    border-radius: 10px !important;
                    margin-bottom: 12px !important;
                    page-break-inside: avoid;
                    overflow: visible !important;
                }

                /* ── Section headers ── */
                .gwr-section-header {
                    background: #f8fafc !important;
                    color: #1e293b !important;
                    border-bottom: 1.5px solid #e2e8f0 !important;
                    padding: 8px 14px !important;
                    font-size: 9.5pt;
                    font-weight: 700;
                }

                /* ── Detail table ── */
                .gwr-detail-table td {
                    padding: 5px 10px 5px 0;
                    font-size: 10pt;
                    border-bottom: 0.5px solid #e2e8f0;
                    vertical-align: top;
                }
                .gwr-detail-table td:first-child {
                    color: #475569;
                    font-weight: 600;
                    white-space: nowrap;
                    min-width: 130px;
                }

                /* ── Post QR ── */
                .gwr-post-qr-block {
                    width: 106px !important;
                    flex: 0 0 106px !important;
                    display: flex !important;
                    flex-direction: column;
                    align-items: center;
                    gap: 4px;
                }
                .gwr-post-qr-box {
                    width: 100px !important;
                    height: 100px !important;
                    padding: 4px !important;
                    border: 1px solid #cbd5e1 !important;
                    border-radius: 6px !important;
                }
                .gwr-post-qr-box svg {
                    width: 88px !important;
                    height: 88px !important;
                }

                /* ── Chat / Communication Log ── */
                .gwr-chat-print {
                    background: #fff !important;
                    max-height: none !important;
                    overflow: visible !important;
                    border: none !important;
                }

                /* ── Status badge colors ── */
                .bg-yellow-50 { background-color: #fefce8 !important; }
                .bg-orange-50 { background-color: #fff7ed !important; }
                .bg-green-50 { background-color: #f0fdf4 !important; }
                .bg-red-50 { background-color: #fef2f2 !important; }
                .border-yellow-200 { border-color: #fde68a !important; }
                .border-orange-200 { border-color: #fed7aa !important; }
                .border-green-200 { border-color: #bbf7d0 !important; }
                .border-red-200 { border-color: #fecaca !important; }
                .text-yellow-700 { color: #a16207 !important; }
                .text-orange-700 { color: #c2410c !important; }
                .text-green-700 { color: #15803d !important; }
                .text-red-700 { color: #b91c1c !important; }
                .text-green-800 { color: #166534 !important; }
                .text-green-600 { color: #16a34a !important; }
                .bg-white\/10 { background: rgba(255,255,255,0.1) !important; }
                .text-white\/70 { color: rgba(255,255,255,0.7) !important; }
                .border-white\/20 { border-color: rgba(255,255,255,0.2) !important; }

                /* ── Communication log colored strips ── */
                .bg-orange-500 { background-color: #f97316 !important; }
                .bg-amber-500 { background-color: #f59e0b !important; }
                .bg-red-600 { background-color: #dc2626 !important; }
                .bg-blue-600 { background-color: #2563eb !important; }
                .bg-emerald-600 { background-color: #059669 !important; }

                /* ── Section backgrounds (closing, FIR etc.) ── */
                .bg-slate-50 { background-color: #f8fafc !important; }
                .bg-slate-50\/80 { background-color: rgba(248,250,252,0.8) !important; }
                .bg-emerald-50 { background-color: #ecfdf5 !important; }
                .bg-amber-50 { background-color: #fffbeb !important; }
                .bg-blue-100\/50 { background-color: rgba(219,234,254,0.5) !important; }

                /* ── Timeline ── */
                .gwr-section-card .flex.group { page-break-inside: avoid; }

                /* ── Tweet thread ── */
                .gwr-tweet-thread {
                    border: 1.5px solid #e2e8f0 !important;
                    border-radius: 10px !important;
                    margin-top: 12px !important;
                    page-break-inside: avoid;
                    overflow: visible !important;
                }
                .gwr-tweet-thread img {
                    max-width: 80px !important;
                    max-height: 80px !important;
                    border-radius: 50% !important;
                }
                .gwr-tweet-thread .aspect-video {
                    display: none !important;
                }

                /* ── Media grid ── */
                .aspect-video {
                    aspect-ratio: auto !important;
                    height: auto !important;
                }
                .aspect-video img {
                    max-height: 200px !important;
                    width: 100% !important;
                    object-fit: contain !important;
                }

                /* ── Links ── */
                a { color: #2563eb !important; }

                /* ── Print footer ── */
                .gwr-print-footer {
                    display: flex !important;
                    border-top: 1.5px solid #1e293b;
                    margin-top: 24px;
                    padding-top: 8px;
                    font-size: 8pt;
                    color: #475569;
                    justify-content: space-between;
                }

                /* ── Hide lightbox overlay ── */
                .gwr-lightbox { display: none !important; }

                /* ── Keep nice border-radius in print ── */
                .rounded-xl { border-radius: 10px !important; }
                .rounded-lg { border-radius: 8px !important; }
                .rounded-full { border-radius: 9999px !important; }

                /* ── Page break handling ── */
                .space-y-6 > * { page-break-inside: avoid; }
                .space-y-3 > * { page-break-inside: avoid; }
            }
        `
    });

    const handleSort = (key) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
        }));
    };

    useEffect(() => {
        if (!selectedReport) return;
        setDetailPos({
            x: Math.max(24, window.innerWidth / 2 - 480),
            y: 40
        });
    }, [selectedReport]);

    useEffect(() => {
        if (!selectedReport) {
            setPreviewMedia(null);
        }
    }, [selectedReport]);

    useEffect(() => {
        if (!draggingDetail || fullscreen) return;
        const onMove = (e) => {
            setDetailPos({
                x: Math.max(12, Math.min(e.clientX - detailDragOffset.x, window.innerWidth - 860)),
                y: Math.max(12, Math.min(e.clientY - detailDragOffset.y, window.innerHeight - 120))
            });
        };
        const onUp = () => setDraggingDetail(false);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [draggingDetail, detailDragOffset, fullscreen]);

    const SortIcon = ({ column }) => (
        <ArrowUpDown className={cn(
            "h-3.5 w-3.5 ml-1 transition-opacity",
            sortConfig.key === column ? "opacity-100" : "opacity-30"
        )} />
    );

    const getPlatformIcon = (platform) => {
        const Icon = platformIcons[platform?.toLowerCase()] || platformIcons.default;
        return Icon;
    };

    const handleCopyReportCode = (code, e) => {
        if (e) e.stopPropagation();
        if (!code) return;
        navigator.clipboard.writeText(code);
        setCopiedCodeId(code);
        toast.success(`Copied ID ${code} to clipboard`);
        setTimeout(() => setCopiedCodeId(null), 2000);
    };

    const hasActiveFilters = platform !== 'all' || statusFilter !== 'all' || categoryFilter !== 'all' || fromDate || toDate || searchTerm || quickRange !== 'all';

    const handleClearAllFilters = () => {
        setPlatform('all');
        setStatusFilter('all');
        setCategoryFilter('all');
        setQuickRange('all');
        setFromDate('');
        setToDate('');
        setSearchTerm('');
        setPage(1);
    };

    return (
        <TooltipProvider>
            <div className="flex flex-col w-full bg-card">
                {/* ─── Executive KPI Stat Ribbon ─── */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 p-3.5 bg-gradient-to-b from-muted/40 via-muted/20 to-transparent border-b border-border/80">
                    {[
                        {
                            id: 'all',
                            label: 'Total Cases',
                            value: pagination.total || stats.total,
                            icon: Layers,
                            color: 'text-foreground',
                            accent: 'from-slate-500/20 to-slate-500/0',
                            borderColor: 'border-border',
                            activeClass: 'ring-2 ring-primary border-primary shadow-md shadow-primary/10 bg-primary/[0.04]',
                            badge: 'All Logs'
                        },
                        {
                            id: 'PENDING',
                            label: 'Pending Action',
                            value: stats.pending,
                            icon: Clock,
                            color: 'text-amber-600 dark:text-amber-400',
                            accent: 'from-amber-500/20 to-amber-500/0',
                            borderColor: 'border-amber-500/30',
                            activeClass: 'ring-2 ring-amber-500 border-amber-500 shadow-md shadow-amber-500/10 bg-amber-500/[0.08]',
                            badge: 'Needs Review',
                            dot: 'bg-amber-500 animate-pulse'
                        },
                        {
                            id: 'ESCALATED',
                            label: 'Escalated to Officer',
                            value: stats.escalated,
                            icon: AlertCircle,
                            color: 'text-orange-600 dark:text-orange-400',
                            accent: 'from-orange-500/20 to-orange-500/0',
                            borderColor: 'border-orange-500/30',
                            activeClass: 'ring-2 ring-orange-500 border-orange-500 shadow-md shadow-orange-500/10 bg-orange-500/[0.08]',
                            badge: 'In Progress'
                        },
                        {
                            id: 'CLOSED',
                            label: 'Closed / Resolved',
                            value: stats.closed,
                            icon: CheckCircle2,
                            color: 'text-emerald-600 dark:text-emerald-400',
                            accent: 'from-emerald-500/20 to-emerald-500/0',
                            borderColor: 'border-emerald-500/30',
                            activeClass: 'ring-2 ring-emerald-500 border-emerald-500 shadow-md shadow-emerald-500/10 bg-emerald-500/[0.08]',
                            badge: 'Completed'
                        },
                        {
                            id: 'FIR',
                            label: 'Converted to FIR',
                            value: stats.fir,
                            icon: ShieldAlert,
                            color: 'text-rose-600 dark:text-rose-400',
                            accent: 'from-rose-500/20 to-rose-500/0',
                            borderColor: 'border-rose-500/30',
                            activeClass: 'ring-2 ring-rose-500 border-rose-500 shadow-md shadow-rose-500/10 bg-rose-500/[0.08]',
                            badge: 'Police Action'
                        }
                    ].map((card) => {
                        const isSelected = statusFilter === card.id || (card.id === 'all' && statusFilter === 'all');
                        const Icon = card.icon;
                        return (
                            <button
                                key={card.id}
                                type="button"
                                onClick={() => {
                                    setStatusFilter(card.id);
                                    setPage(1);
                                }}
                                className={cn(
                                    'flex flex-col p-3.5 rounded-xl border text-left transition-all duration-200 cursor-pointer select-none relative group overflow-hidden bg-card shadow-sm hover:shadow-md hover:-translate-y-0.5',
                                    card.borderColor,
                                    isSelected ? card.activeClass : 'hover:border-border/90'
                                )}
                            >
                                <div className={cn('absolute inset-x-0 top-0 h-1 bg-gradient-to-r', card.accent)} />
                                <div className="flex items-center justify-between gap-1.5 mb-1.5">
                                    <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-1.5 truncate">
                                        {card.dot && <span className={cn('w-2 h-2 rounded-full shrink-0', card.dot)} />}
                                        {card.label}
                                    </span>
                                    <div className={cn('p-1 rounded-md bg-muted/50 transition-colors group-hover:bg-muted', card.color)}>
                                        <Icon className="h-3.5 w-3.5 shrink-0" />
                                    </div>
                                </div>
                                <div className="flex items-baseline justify-between gap-2 mt-auto">
                                    <span className={cn('text-2xl font-black font-mono tracking-tight tabular-nums', card.color)}>
                                        {Number(card.value || 0).toLocaleString()}
                                    </span>
                                    <span className="text-[9px] font-semibold text-muted-foreground bg-muted/60 dark:bg-muted/30 rounded-full px-2 py-0.5 border border-border/60">
                                        {card.badge}
                                    </span>
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* ─── Modern Unified Filter Bar ─── */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2.5 border-b border-border bg-card/80 backdrop-blur-sm">
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Quick Date Range */}
                        <div className="flex items-center gap-1.5">
                            <Select value={quickRange} onValueChange={(v) => { setQuickRange(v); setPage(1); }}>
                                <SelectTrigger className="h-8 w-[125px] text-xs bg-background font-medium rounded-lg shadow-xs border-border/80 hover:border-primary/50 transition-colors">
                                    <Calendar className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                                    <SelectValue placeholder="Date Range" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Time</SelectItem>
                                    <SelectItem value="24h">Last 24 Hours</SelectItem>
                                    <SelectItem value="7d">Last 7 Days</SelectItem>
                                    <SelectItem value="30d">Last 30 Days</SelectItem>
                                    <SelectItem value="last_month">Last Month</SelectItem>
                                    <SelectItem value="custom">Custom Range</SelectItem>
                                </SelectContent>
                            </Select>

                            {quickRange === 'custom' && (
                                <div className="flex items-center gap-1.5 bg-background px-2 py-0.5 rounded-lg border border-border/80 shadow-xs animate-in fade-in">
                                    <input
                                        type="date"
                                        value={fromDate}
                                        onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
                                        className="h-7 px-1 text-xs bg-transparent border-0 focus:outline-none font-medium"
                                    />
                                    <span className="text-xs text-muted-foreground font-semibold">to</span>
                                    <input
                                        type="date"
                                        value={toDate}
                                        onChange={(e) => { setToDate(e.target.value); setPage(1); }}
                                        className="h-7 px-1 text-xs bg-transparent border-0 focus:outline-none font-medium"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Category Filter */}
                        <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}>
                            <SelectTrigger className="h-8 w-[138px] text-xs bg-background font-medium rounded-lg shadow-xs border-border/80 hover:border-primary/50 transition-colors">
                                <Tag className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                                <SelectValue placeholder="All Categories" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Categories</SelectItem>
                                <SelectItem value="Cyber crimes">Cyber crimes</SelectItem>
                                <SelectItem value="E-Challan">E-Challan</SelectItem>
                                <SelectItem value="L&O">L&O</SelectItem>
                                <SelectItem value="Others">Others</SelectItem>
                                <SelectItem value="Query">Query</SelectItem>
                                <SelectItem value="She Team">She Team</SelectItem>
                                <SelectItem value="Task force">Task force</SelectItem>
                                <SelectItem value="Traffic">Traffic</SelectItem>
                            </SelectContent>
                        </Select>

                        {/* Platform Filter */}
                        <Select value={platform} onValueChange={(v) => { setPlatform(v); setPage(1); }}>
                            <SelectTrigger className="h-8 w-[130px] text-xs bg-background font-medium rounded-lg shadow-xs border-border/80 hover:border-primary/50 transition-colors">
                                <Globe className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                                <SelectValue placeholder="All Platforms" />
                            </SelectTrigger>
                            <SelectContent>
                                <PagePlatformSelectItems page="grievances" />
                            </SelectContent>
                        </Select>

                        {hasActiveFilters && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleClearAllFilters}
                                className="h-8 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 px-2.5 rounded-lg"
                            >
                                <X className="h-3.5 w-3.5 mr-1" />
                                Clear Filters
                            </Button>
                        )}
                    </div>

                    <div className="flex items-center gap-2 ml-auto w-full sm:w-auto">
                        {/* Search Input */}
                        <div className="relative flex-1 sm:w-72">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                                placeholder="Search by unique ID, citizen, phone..."
                                value={searchTerm}
                                onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                                className="pl-8 pr-7 h-8 text-xs bg-background rounded-lg border-border/80 shadow-xs focus-visible:ring-1"
                            />
                            {searchTerm && (
                                <button
                                    type="button"
                                    onClick={() => { setSearchTerm(''); setPage(1); }}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>

                        {/* Refresh Button */}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={fetchReports}
                            className="h-8 w-8 p-0 shrink-0 rounded-lg bg-background shadow-xs hover:border-primary/40"
                            title="Refresh Reports"
                        >
                            <RefreshCw className={cn('h-3.5 w-3.5 text-muted-foreground', loading && 'animate-spin')} />
                        </Button>

                        {/* Export Button */}
                        <Button
                            size="sm"
                            onClick={handleExport}
                            disabled={exporting || reports.length === 0}
                            className="h-8 gap-1.5 text-xs font-bold px-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-lg shadow-sm shadow-emerald-600/25 transition-all"
                        >
                            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                            <span>Export XLSX</span>
                        </Button>
                    </div>
                </div>

                {/* ─── Table Flush View ─── */}
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <Loader2 className="h-7 w-7 animate-spin text-primary mb-3" />
                            <p className="text-sm font-medium text-muted-foreground">Loading grievance records…</p>
                        </div>
                    ) : reports.length === 0 ? (
                        <div className="text-center py-16 px-4">
                            <div className="w-12 h-12 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-3 border border-border/60">
                                <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <p className="text-sm font-bold text-foreground">No Grievance Reports Found</p>
                            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                                {hasActiveFilters
                                    ? 'Try adjusting your filters or date range to see matching reports.'
                                    : 'Create new grievance reports from post cards in the main feed.'}
                            </p>
                            {hasActiveFilters && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleClearAllFilters}
                                    className="mt-3.5 text-xs font-semibold rounded-lg"
                                >
                                    Reset All Filters
                                </Button>
                            )}
                        </div>
                    ) : (
                        <>
                            <div className="w-full overflow-x-auto overflow-y-auto max-h-[68vh]">
                                <table className="min-w-full text-sm border-collapse text-left">
                                    <thead className="bg-muted/50 dark:bg-muted/30 backdrop-blur sticky top-0 z-20 border-b border-border">
                                        <tr>
                                            {[
                                                { key: 'si_no', label: 'Sl.No', className: 'w-12 text-center' },
                                                { key: 'status', label: 'Status', sortable: true, className: 'w-28' },
                                                { key: 'unique_id', label: 'Unique ID', className: 'w-44' },
                                                { key: 'post_date', label: 'Post Date', sortable: true, className: 'w-36' },
                                                { key: 'phone', label: 'Phone', className: 'w-32' },
                                                { key: 'profile', label: 'Citizen Profile', className: 'w-44' },
                                                { key: 'post_link', label: 'Link', className: 'w-12 text-center' },
                                                { key: 'description', label: 'Grievance Description', className: 'min-w-[220px] max-w-sm' },
                                                { key: 'category', label: 'Category', sortable: true, className: 'w-28' },
                                                { key: 'chat_history', label: 'Communication Log', className: 'min-w-[180px] max-w-xs' },
                                                { key: 'operator_remarks', label: 'Operator Remarks', className: 'min-w-[150px]' },
                                                { key: 'informed_to', label: 'Informed Officer', className: 'w-36' },
                                                { key: 'escalated_remarks', label: 'Escalation Remarks', className: 'min-w-[150px]' },
                                                { key: 'escalated_to_officer_time', label: 'Escalation Time', className: 'w-36' },
                                                { key: 'closing_remarks', label: 'Resolution Remarks', className: 'min-w-[160px]' },
                                                { key: 'fir_number', label: 'FIR Number', className: 'w-28' },
                                                { key: 'view', label: 'Actions', className: 'w-16 text-center' },
                                            ].map((col) => (
                                                <th
                                                    key={col.key}
                                                    className={cn(
                                                        "py-2.5 px-3 font-bold text-muted-foreground text-[10px] uppercase tracking-wider whitespace-nowrap select-none",
                                                        col.className,
                                                        col.sortable && "cursor-pointer hover:text-foreground transition-colors"
                                                    )}
                                                    onClick={() => col.sortable && handleSort(col.key)}
                                                >
                                                    <div className={cn("flex items-center gap-1", col.className?.includes('text-center') && "justify-center")}>
                                                        <span>{col.label}</span>
                                                        {col.sortable && <SortIcon column={col.key} />}
                                                    </div>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/60">
                                        {reports.map((r, idx) => {
                                            const status = statusConfig[r.status] || statusConfig.PENDING;
                                            const firInfo = parseFirFields(r);
                                            const escalationLogs = (r.officer_logs || []).filter((l) => l.is_escalation === true);
                                            const firstEscalation = escalationLogs[0];
                                            const operatorRemarks = (r.complainant_logs || []).filter((l) => l.type === 'OperatorRemark');
                                            const firstOfficerLog = (r.officer_logs || []).find((l) => !l.is_escalation);
                                            const isCopied = copiedCodeId === r.unique_code;
                                            const RowPlatformIcon = platformIcons[r.platform?.toLowerCase()] || platformIcons.default;

                                            return (
                                                <tr
                                                    key={r.id}
                                                    className="hover:bg-muted/40 transition-colors group"
                                                >
                                                    {/* Sl No */}
                                                    <td className="py-2.5 px-3 align-top whitespace-nowrap text-center">
                                                        <span className="text-muted-foreground/70 font-mono text-[11px] font-medium">
                                                            {(page - 1) * 50 + idx + 1}
                                                        </span>
                                                    </td>

                                                    {/* Status Badge */}
                                                    <td className="py-2.5 px-3 align-top whitespace-nowrap">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className={cn('w-2 h-2 rounded-full shrink-0 shadow-xs', status.dot)} />
                                                            <Badge variant="outline" className={cn('text-[10px] font-bold px-2 py-0.5 rounded-md', status.bg, status.text, status.border)}>
                                                                {status.label}
                                                            </Badge>
                                                        </div>
                                                    </td>

                                                    {/* Unique ID chip with 1-click copy */}
                                                    <td className="py-2.5 px-3 align-top whitespace-nowrap">
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                type="button"
                                                                className="group/code inline-flex items-center gap-1.5 text-[11px] font-mono font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 rounded-md px-2 py-0.5 hover:bg-amber-500/20 transition-all cursor-pointer"
                                                                onClick={() => {
                                                                    setSelectedReport(r);
                                                                    setWaPhone(r.informed_to?.phone || r.complaint_phone || '');
                                                                    setActiveTab('details');
                                                                }}
                                                                title="Click to view full case file"
                                                            >
                                                                <span>{r.unique_code}</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => handleCopyReportCode(r.unique_code, e)}
                                                                className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                                                title="Copy code"
                                                            >
                                                                {isCopied ? (
                                                                    <Check className="h-3 w-3 text-emerald-600 animate-in zoom-in" />
                                                                ) : (
                                                                    <Copy className="h-3 w-3 opacity-60 group-hover:opacity-100" />
                                                                )}
                                                            </button>
                                                        </div>
                                                    </td>

                                                    {/* Post Date */}
                                                    <td className="py-2.5 px-3 align-top whitespace-nowrap">
                                                        <div className="flex flex-col">
                                                            <span className="text-foreground font-semibold text-[11px]">{fmtDate(r.post_date)}</span>
                                                            <span className="text-[10px] text-muted-foreground font-medium">{fmtRelativeTime(r.post_date)}</span>
                                                        </div>
                                                    </td>

                                                    {/* Phone */}
                                                    <td className="py-2.5 px-3 align-top whitespace-nowrap">
                                                        {r.complaint_phone ? (
                                                            <span className="text-[11px] font-mono font-semibold text-foreground">{r.complaint_phone}</span>
                                                        ) : <span className="text-muted-foreground/50 text-xs">—</span>}
                                                    </td>

                                                    {/* Profile */}
                                                    <td className="py-2.5 px-3 align-top max-w-[180px]">
                                                        <div className="flex items-center gap-1.5">
                                                            <RowPlatformIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                                            <div className="truncate">
                                                                <p className="font-semibold text-foreground truncate text-[11px] leading-tight">{r.posted_by?.display_name || '—'}</p>
                                                                {r.profile_id && (
                                                                    <p className="text-[10px] text-muted-foreground truncate font-mono">@{r.profile_id}</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* Post Link */}
                                                    <td className="py-2.5 px-3 align-top whitespace-nowrap text-center">
                                                        {r.post_link ? (
                                                            <a href={r.post_link} target="_blank" rel="noopener noreferrer"
                                                                className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-colors"
                                                                title="Open post in new tab"
                                                            >
                                                                <ExternalLink className="h-3 w-3" />
                                                            </a>
                                                        ) : <span className="text-muted-foreground/40 text-xs">—</span>}
                                                    </td>

                                                    {/* Description */}
                                                    <td className="py-2.5 px-3 align-top max-w-sm">
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <p className="text-foreground/90 line-clamp-2 text-[11px] cursor-help leading-relaxed">{r.post_description || '—'}</p>
                                                            </TooltipTrigger>
                                                            {r.post_description && (
                                                                <TooltipContent side="bottom" className="max-w-md p-3"><p className="text-xs whitespace-pre-wrap">{r.post_description}</p></TooltipContent>
                                                            )}
                                                        </Tooltip>
                                                    </td>

                                                    {/* Category */}
                                                    <td className="py-2.5 px-3 align-top whitespace-nowrap">
                                                        <Badge variant="outline" className="text-[10px] font-semibold px-2 py-0.5 bg-muted/40 border-border/80 text-foreground">
                                                            {r.category || '—'}
                                                        </Badge>
                                                    </td>

                                                    {/* Communication */}
                                                    <td className="py-2.5 px-3 align-top max-w-xs">
                                                        {(() => {
                                                            const logs = [
                                                                ...(r.complainant_logs || []).filter((l) => l.type !== 'OperatorRemark').map((l) => ({ ...l, _source: 'User' })),
                                                                ...(r.officer_logs || []).map((l) => ({ ...l, _source: 'Officer' })),
                                                            ].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                                                            if (logs.length === 0) return <span className="text-muted-foreground/40 text-[10px]">—</span>;
                                                            const latest = logs[logs.length - 1];
                                                            return (
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <button
                                                                            type="button"
                                                                            className="w-full max-w-[200px] rounded-lg border border-border/80 bg-muted/40 p-1.5 text-left hover:bg-muted/70 transition-colors shadow-xs"
                                                                            onClick={() => {
                                                                                setSelectedReport(r);
                                                                                setActiveTab('details');
                                                                            }}
                                                                        >
                                                                            <div className="flex items-center justify-between gap-1.5 mb-0.5">
                                                                                <span className={cn(
                                                                                    'text-[9px] font-bold uppercase tracking-wider',
                                                                                    latest._source === 'User' ? 'text-orange-600 dark:text-orange-400' : 'text-blue-600 dark:text-blue-400'
                                                                                )}>
                                                                                    {latest._source}
                                                                                </span>
                                                                                <span className="text-[9px] font-mono text-muted-foreground font-semibold">{logs.length} msg{logs.length > 1 ? 's' : ''}</span>
                                                                            </div>
                                                                            <p className="line-clamp-2 text-[10px] text-foreground/80 leading-snug">{latest.content}</p>
                                                                        </button>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent side="left" className="max-w-md p-3">
                                                                        <div className="space-y-2 max-h-56 overflow-y-auto">
                                                                            <p className="text-[11px] font-bold border-b pb-1 text-foreground">Communication Log ({logs.length})</p>
                                                                            {logs.map((l, i) => (
                                                                                <div key={i} className="text-[10px] border-l-2 pl-2 border-primary/40">
                                                                                    <span className="font-bold">{l._source}</span>
                                                                                    <span className="text-muted-foreground"> · {fmtRelativeTime(l.timestamp)}</span>
                                                                                    <p className="mt-0.5 text-foreground/90">{l.content}</p>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                            );
                                                        })()}
                                                    </td>

                                                    {/* Operator Remarks */}
                                                    <td className="py-2.5 px-3 align-top min-w-[140px]">
                                                        {operatorRemarks.length > 0 ? (
                                                            <div className="space-y-1">
                                                                {operatorRemarks.slice(0, 2).map((l, i) => (
                                                                    <p key={i} className="line-clamp-2 text-[10px] text-amber-900 dark:text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-md px-2 py-1 leading-snug">
                                                                        {l.content}
                                                                    </p>
                                                                ))}
                                                            </div>
                                                        ) : <span className="text-muted-foreground/40 text-xs">—</span>}
                                                    </td>

                                                    {/* Informed to Officer */}
                                                    <td className="py-2.5 px-3 align-top whitespace-nowrap">
                                                        {r.informed_to?.name ? (
                                                            <div>
                                                                <p className="font-semibold text-foreground text-[11px] truncate">{r.informed_to.name}</p>
                                                                {r.informed_to.phone && (
                                                                    <p className="text-[10px] text-muted-foreground font-mono tabular-nums whitespace-nowrap">{r.informed_to.phone}</p>
                                                                )}
                                                                {firstOfficerLog?.timestamp && (
                                                                    <p className="text-[9px] text-muted-foreground/70">{fmtDate(firstOfficerLog.timestamp)}</p>
                                                                )}
                                                            </div>
                                                        ) : <span className="text-muted-foreground/40 text-xs">—</span>}
                                                    </td>

                                                    {/* Escalated Remarks */}
                                                    <td className="py-2.5 px-3 align-top min-w-[140px]">
                                                        {firstEscalation ? (
                                                            <div>
                                                                <p className="text-rose-700 dark:text-rose-300 line-clamp-2 text-[10px] bg-rose-500/10 px-2 py-1 rounded-md border border-rose-500/20 leading-snug">
                                                                    {firstEscalation.content}
                                                                </p>
                                                                <p className="text-[9px] text-muted-foreground mt-0.5">{fmtDate(firstEscalation.timestamp)}</p>
                                                            </div>
                                                        ) : <span className="text-muted-foreground/40 text-xs">—</span>}
                                                    </td>

                                                    {/* Escalated timestamp */}
                                                    <td className="py-2.5 px-3 align-top whitespace-nowrap">
                                                        {firstEscalation?.timestamp ? (
                                                            <div className="flex flex-col">
                                                                <span className="text-foreground font-semibold text-[11px]">{fmtDate(firstEscalation.timestamp)}</span>
                                                                <span className="text-[10px] text-muted-foreground font-medium">{fmtRelativeTime(firstEscalation.timestamp)}</span>
                                                                {firstEscalation.recipient?.name && (
                                                                    <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium mt-0.5">{firstEscalation.recipient.name}</span>
                                                                )}
                                                            </div>
                                                        ) : <span className="text-muted-foreground/40 text-xs">—</span>}
                                                    </td>

                                                    {/* Closing Remarks */}
                                                    <td className="py-2.5 px-3 align-top min-w-[150px]">
                                                        {r.closing_remarks ? (
                                                            <div>
                                                                <p className="text-foreground line-clamp-2 text-[10px] leading-snug">{r.closing_remarks}</p>
                                                                {r.action_taken_at && r.status === 'CLOSED' && (
                                                                    <p className="text-[9px] text-muted-foreground mt-0.5">{fmtDate(r.action_taken_at)}</p>
                                                                )}
                                                            </div>
                                                        ) : <span className="text-muted-foreground/40 text-xs">—</span>}
                                                    </td>

                                                    {/* FIR Number */}
                                                    <td className="py-2.5 px-3 align-top whitespace-nowrap">
                                                        {firInfo.converted === 'Yes' && firInfo.firNumber ? (
                                                            <Badge variant="outline" className="text-[10px] font-mono font-bold bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20 px-2 py-0.5">
                                                                {firInfo.firNumber}
                                                            </Badge>
                                                        ) : <span className="text-muted-foreground/40 text-xs">—</span>}
                                                    </td>

                                                    {/* Actions */}
                                                    <td className="py-2.5 px-3 align-top whitespace-nowrap text-center">
                                                        <div className="flex items-center justify-center gap-1">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-7 w-7 p-0 rounded-lg text-primary hover:bg-primary/10 transition-colors"
                                                                title="View full case detail"
                                                                onClick={() => {
                                                                    setSelectedReport(r);
                                                                    setWaPhone(r.informed_to?.phone || r.complaint_phone || '');
                                                                    setActiveTab('details');
                                                                }}
                                                            >
                                                                <Eye className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Modern Pagination Footer */}
                            {pagination.pages > 1 && (
                                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-border bg-card/90">
                                    <p className="text-xs text-muted-foreground tabular-nums">
                                        Showing <span className="font-bold text-foreground">{(page - 1) * 50 + 1}</span>–<span className="font-bold text-foreground">{Math.min(page * 50, pagination.total)}</span> of <span className="font-bold text-foreground">{pagination.total}</span> records
                                    </p>
                                    <div className="flex items-center gap-1.5">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={page <= 1}
                                            onClick={() => setPage(p => p - 1)}
                                            className="text-xs h-8 px-3 rounded-lg font-semibold shadow-xs"
                                        >
                                            <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                                            Previous
                                        </Button>

                                        <div className="flex items-center gap-1">
                                            {Array.from({ length: Math.min(5, pagination.pages) }, (_, i) => {
                                                let pageNum;
                                                if (pagination.pages <= 5) {
                                                    pageNum = i + 1;
                                                } else if (page <= 3) {
                                                    pageNum = i + 1;
                                                } else if (page >= pagination.pages - 2) {
                                                    pageNum = pagination.pages - 4 + i;
                                                } else {
                                                    pageNum = page - 2 + i;
                                                }

                                                return (
                                                    <Button
                                                        key={i}
                                                        variant={pageNum === page ? "default" : "outline"}
                                                        size="sm"
                                                        onClick={() => setPage(pageNum)}
                                                        className={cn(
                                                            "text-xs h-8 w-8 rounded-lg font-mono tabular-nums font-bold",
                                                            pageNum === page && "bg-primary text-primary-foreground shadow-sm"
                                                        )}
                                                    >
                                                        {pageNum}
                                                    </Button>
                                                );
                                            })}
                                        </div>

                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={page >= pagination.pages}
                                            onClick={() => setPage(p => p + 1)}
                                            className="text-xs h-8 px-3 rounded-lg font-semibold shadow-xs"
                                        >
                                            Next
                                            <ChevronRight className="h-3.5 w-3.5 ml-1" />
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </CardContent>

                {/* Detail Modal */}
                <AnimatePresence>
                    {selectedReport && (
                        <>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-[9998] bg-slate-900/60 backdrop-blur-sm"
                                onClick={() => setSelectedReport(null)}
                            />

                            <motion.div
                                ref={detailPopupRef}
                                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                                transition={{ type: "spring", duration: 0.3 }}
                                className={cn(
                                    "fixed z-[9999] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden",
                                    fullscreen ? "inset-4" : ""
                                )}
                                style={!fullscreen ? {
                                    left: detailPos.x,
                                    top: detailPos.y,
                                    width: Math.min(960, window.innerWidth - 48),
                                    height: 'calc(100vh - 80px)'
                                } : {}}
                            >
                                {/* Modal Header */}
                                <div
                                    className={cn(
                                        "px-5 py-3 border-b flex items-center justify-between shrink-0",
                                        !fullscreen && "cursor-move bg-white"
                                    )}
                                    onMouseDown={!fullscreen ? (e) => {
                                        setDraggingDetail(true);
                                        setDetailDragOffset({ x: e.clientX - detailPos.x, y: e.clientY - detailPos.y });
                                    } : undefined}
                                >
                                    <div className="flex items-center gap-3">
                                        {!fullscreen && <GripHorizontal className="h-4 w-4 text-slate-300" />}
                                        <span className="text-sm font-semibold text-slate-900">Grievance Report</span>
                                        <Badge className="bg-amber-50 text-amber-700 border-amber-200 font-mono text-[10px]">
                                            {selectedReport.unique_code}
                                        </Badge>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full hover:bg-slate-100" onClick={handlePrintPdf}>
                                            <Printer className="h-4 w-4 text-slate-600" />
                                        </Button>
                                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full hover:bg-slate-100" onClick={() => setFullscreen(!fullscreen)}>
                                            {fullscreen ? <Minimize2 className="h-4 w-4 text-slate-600" /> : <Maximize2 className="h-4 w-4 text-slate-600" />}
                                        </Button>
                                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full hover:bg-slate-100" onClick={() => setSelectedReport(null)}>
                                            <X className="h-4 w-4 text-slate-600" />
                                        </Button>
                                    </div>
                                </div>

                                {/* Scrollable Content */}
                                <div className="flex-1 overflow-y-auto p-5">
                                    <div ref={printComponentRef}>
                                        <GrievanceReportDetailView
                                            report={selectedReport}
                                            onClose={() => setSelectedReport(null)}
                                            onPrint={handlePrintPdf}
                                            isVideoUrl={isVideoUrl}
                                            onUpdate={(updated) => {
                                                setSelectedReport(updated);
                                                setReports(prev => prev.map(r => r.id === updated.id ? updated : r));
                                            }}
                                        />
                                    </div>
                                </div>
                            </motion.div>

                            {previewMedia && (
                                <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                                    <button
                                        type="button"
                                        onClick={() => setPreviewMedia(null)}
                                        className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/15 text-white hover:bg-white/25 flex items-center justify-center"
                                    >
                                        <X className="h-5 w-5" />
                                    </button>

                                    <div className="w-full max-w-5xl max-h-[85vh] rounded-xl overflow-hidden border border-white/20 bg-black/40 shadow-2xl">
                                        {isVideoUrl(previewMedia) ? (
                                            <video
                                                src={previewMedia}
                                                controls
                                                autoPlay
                                                playsInline
                                                className="w-full max-h-[85vh] object-contain bg-black"
                                            >
                                                Your browser does not support the video tag.
                                            </video>
                                        ) : (
                                            <img
                                                src={previewMedia}
                                                alt="Media Preview"
                                                className="w-full max-h-[85vh] object-contain bg-black"
                                                referrerPolicy="no-referrer"
                                            />
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </AnimatePresence>
            </div>
        </TooltipProvider>
    );
};

export default GrievanceWorkflowReports;
