import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import api, { BACKEND_URL } from '../../lib/api';
import { toApiFilesUrl } from '../../utils/fileUrl';
import { isPublicFileReachable, resolvePublicAssetUrl } from '../../lib/publicAssetUrl';
import { toast } from 'sonner';
import {
    Download, Loader2, ExternalLink, RefreshCw, ChevronDown, ChevronUp,
    Calendar, Filter, Search, FileSpreadsheet, MessageSquare,
    Eye, Printer, GripHorizontal, X, Share2, Copy, Check,
    AlertCircle, Clock, Users, Tag, Link2, Image as ImageIcon, FileText,
    MoreHorizontal, ArrowUpDown, Maximize2, Minimize2,
    ChevronLeft, ChevronRight, Phone, Plus, User, Sparkles, CheckCircle2,
    ShieldAlert, Send, ThumbsUp, MessageCircle, Repeat, BarChart3
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';
import { ScrollArea } from '../ui/scroll-area';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '../ui/select';
import {
    TelegramBrandLogo, XBrandLogo, FacebookBrandLogo,
    InstagramBrandLogo, WhatsAppBrandLogo, YoutubeBrandLogo,
    AllPlatformsLogo
} from '../PlatformBrandIcon';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
    TooltipProvider
} from '../ui/tooltip';
import { cn } from '../../lib/utils';
import { PagePlatformSelectItems } from '../PagePlatformSelectItems';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';

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

const fmtNum = (n) => {
    if (!n || n === 0) return '0';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
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

const ExpandableText = ({ text, limit = 150, className }) => {
    const [expanded, setExpanded] = useState(false);
    if (!text) return <span className="text-muted-foreground/60 font-normal italic">No details</span>;
    if (text.length <= limit) return <p className={className}>{text}</p>;

    return (
        <div className="group">
            <p className={className}>
                {expanded ? text : text.slice(0, limit).trim() + '...'}
            </p>
            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:text-rose-700 hover:underline mt-1 focus:outline-none"
            >
                {expanded ? <>Show Less <ChevronUp className="h-3 w-3" /></> : <>Read More <ChevronDown className="h-3 w-3" /></>}
            </button>
        </div>
    );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*   DETAIL VIEW – Executive Criticism Case Dossier       */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
export const CriticismReportDetailView = ({ report, onUpdate, onClose, onPrint }) => {
    const [pdfGenerating, setPdfGenerating] = useState(false);
    const [pdfUrl, setPdfUrl] = useState(report?.report_pdf_url || null);
    const [copiedCode, setCopiedCode] = useState(false);
    const [activePreview, setActivePreview] = useState(null);
    const [waPhone, setWaPhone] = useState(report?.informed_to?.phone || '');
    const resolvedPdfUrl = toApiFilesUrl(pdfUrl || report?.report_pdf_url) || '';
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
            const res = await api.post(`/criticism/reports/${current?.id || current?.unique_code}/generate-pdf`);
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
    const mediaUrls = (Array.isArray(r.media_s3_urls) && r.media_s3_urls.length > 0 ? r.media_s3_urls : r.media_urls || []);
    const isVideo = (url) => typeof url === 'string' && !!url.match(/\.(mp4|webm|ogg|mov)$/i);

    const isClosed = String(r.status || '').toUpperCase() === 'CLOSED' || Boolean(r.action_taken_at);

    const handleCopyCode = () => {
        if (!r.unique_code) return;
        navigator.clipboard.writeText(r.unique_code);
        setCopiedCode(true);
        toast.success(`Copied ${r.unique_code}`);
        setTimeout(() => setCopiedCode(false), 2000);
    };

    const handleWhatsAppDirect = () => {
        const phone = String(waPhone || '').replace(/[^0-9]/g, '');
        if (!phone) {
            toast.error('Please enter an official contact phone number');
            return;
        }
        const phoneWithCountry = phone.startsWith('91') ? phone : `91${phone}`;
        const msg = [
            `🚨 *CRITICISM REPORT: ${r.unique_code || 'N/A'}*`,
            ``,
            `📅 *Post Date:* ${fmtDate(r.post_date)}`,
            `👤 *Citizen:* ${r.posted_by?.display_name || r.profile_id || 'Public'} (${r.posted_by?.handle ? `@${r.posted_by.handle}` : '—'})`,
            `🏷️ *Category:* ${r.category || 'General Criticism'}`,
            `🔗 *Post Link:* ${r.post_link || 'N/A'}`,
            ``,
            `📝 *Criticism Details:*`,
            `${r.post_description || 'No description recorded'}`,
            ``,
            `💬 *Officer Action / Remarks:*`,
            `${r.remarks || 'No remarks added'}`,
            ``,
            `👥 *Informed Officer:* ${r.informed_to?.name || 'Department Officer'} ${r.informed_to?.phone ? `(${r.informed_to.phone})` : ''}`,
            `⚡ *Status:* ${isClosed ? 'ACTION TAKEN / CLOSED' : 'PENDING REVIEW'}`,
            ``,
            `_Shared via Telangana Police Grievance & Criticism Monitoring Portal_`
        ].join('\n');

        window.open(`https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(msg)}`, '_blank');
    };

    if (!report) return null;

    const PlatformLogoComponent = platformIcons[r.platform?.toLowerCase()] || platformIcons.default;

    const engagementMetrics = [
        { label: 'Views', value: fmtNum(r.engagement?.views || 0), icon: BarChart3 },
        { label: 'Likes', value: fmtNum(r.engagement?.likes || 0), icon: ThumbsUp },
        { label: 'Reposts', value: fmtNum(r.engagement?.reposts ?? r.engagement?.retweets ?? 0), icon: Repeat },
        { label: 'Replies', value: fmtNum(r.engagement?.replies || 0), icon: MessageCircle }
    ];

    return (
        <div className="space-y-5 pb-6">
            {/* 1. EXECUTIVE HERO DOSSIER CARD */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-rose-950 to-slate-900 border border-rose-800/40 p-5 text-white shadow-xl">
                <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-rose-500/10 blur-3xl pointer-events-none" />
                <div className="absolute right-20 bottom-0 h-32 w-32 rounded-full bg-amber-500/10 blur-2xl pointer-events-none" />

                <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-rose-500/25 to-red-600/35 border border-rose-400/40 flex items-center justify-center shadow-lg shadow-rose-950/50 backdrop-blur-sm">
                            <ShieldAlert className="h-7 w-7 text-rose-300" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-rose-300/80">
                                    Criticism Monitoring Dossier
                                </span>
                                <Badge className={cn(
                                    'text-[9px] font-bold px-2 py-0.5 uppercase tracking-wider',
                                    isClosed
                                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                                        : 'bg-rose-500/20 text-rose-300 border-rose-400/40'
                                )}>
                                    {isClosed ? '✓ Action Taken' : '● Pending Action'}
                                </Badge>
                            </div>

                            <div className="flex items-center gap-2.5 mt-1">
                                <h2 className="text-2xl font-black font-mono tracking-tight text-white flex items-center gap-2">
                                    {r.unique_code || '—'}
                                </h2>
                                <button
                                    type="button"
                                    onClick={handleCopyCode}
                                    className="p-1 rounded-md bg-white/10 hover:bg-white/20 text-rose-200 transition-colors"
                                    title="Copy Unique ID"
                                >
                                    {copiedCode ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                                </button>
                            </div>

                            <p className="text-xs text-slate-300/80 mt-0.5 flex items-center gap-2">
                                <span>Logged: {fmtDate(r.created_at || r.post_date)}</span>
                                <span>•</span>
                                <span className="text-rose-300 font-medium">{fmtRelativeTime(r.post_date)}</span>
                            </p>
                        </div>
                    </div>

                    {/* QR Code & PDF Quick Action */}
                    <div className="flex items-center gap-3 ml-auto">
                        {resolvedPdfUrl ? (
                            <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md rounded-xl p-2 border border-white/15">
                                <div className="bg-white p-1 rounded-lg">
                                    <QRCodeSVG
                                        value={resolvedPdfUrl}
                                        size={52}
                                        level="M"
                                        includeMargin={false}
                                        bgColor="#ffffff"
                                        fgColor="#0f172a"
                                    />
                                </div>
                                <div className="flex flex-col pr-1">
                                    <span className="text-[10px] font-bold text-rose-200 uppercase tracking-wider">Official PDF</span>
                                    <a
                                        href={resolvedPdfUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="mt-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors shadow-sm"
                                    >
                                        <Download className="h-3 w-3" />
                                        Download
                                    </a>
                                </div>
                            </div>
                        ) : (
                            <Button
                                onClick={handleGeneratePdf}
                                disabled={pdfGenerating}
                                size="sm"
                                className="h-9 gap-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-md"
                            >
                                {pdfGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                                Generate PDF
                            </Button>
                        )}

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onPrint || (() => window.print())}
                            className="h-9 gap-1.5 bg-white/10 hover:bg-white/20 border-white/20 text-white font-semibold text-xs rounded-xl"
                        >
                            <Printer className="h-3.5 w-3.5" />
                            Print
                        </Button>
                    </div>
                </div>
            </div>

            {/* 2. CASE PARTICULARS MATRIX & ORIGINAL POST QR */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Left 2 Cols: Details Matrix */}
                <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-5 shadow-xs space-y-4">
                    <div className="flex items-center justify-between border-b border-border/80 pb-3">
                        <div className="flex items-center gap-2 font-bold text-sm text-foreground">
                            <Sparkles className="h-4 w-4 text-rose-500" />
                            <span>Criticism Particulars</span>
                        </div>
                        <Badge variant="outline" className="text-xs font-bold border-rose-500/30 text-rose-600 dark:text-rose-400 bg-rose-500/10">
                            {r.category || 'General Criticism'}
                        </Badge>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                        {/* Citizen Profile */}
                        <div className="p-3 rounded-xl bg-muted/40 border border-border/60 space-y-1.5">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Citizen / Handle</span>
                            <div className="flex items-center gap-2.5">
                                <div className="h-8 w-8 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0">
                                    <PlatformLogoComponent className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                    <p className="font-bold text-foreground truncate">{r.posted_by?.display_name || r.profile_id || 'Public Citizen'}</p>
                                    {r.posted_by?.handle ? (
                                        <a
                                            href={r.posted_by?.url || r.post_link || '#'}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-rose-600 dark:text-rose-400 hover:underline font-mono text-[11px] truncate block"
                                        >
                                            @{r.posted_by.handle.replace('@', '')}
                                        </a>
                                    ) : (
                                        <span className="text-muted-foreground text-[10px]">Platform User</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Post Date & Time */}
                        <div className="p-3 rounded-xl bg-muted/40 border border-border/60 space-y-1.5">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Post Date & Time</span>
                            <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                                <div>
                                    <p className="font-bold text-foreground">{fmtDate(r.post_date)}</p>
                                    <p className="text-[10px] text-muted-foreground">{fmtRelativeTime(r.post_date)}</p>
                                </div>
                            </div>
                        </div>

                        {/* Informed Officer */}
                        <div className="p-3 rounded-xl bg-muted/40 border border-border/60 space-y-1.5">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Informed Officer / Unit</span>
                            <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                                <div className="min-w-0">
                                    <p className="font-bold text-foreground truncate">{r.informed_to?.name || 'Department Officer'}</p>
                                    <p className="text-[10px] text-muted-foreground font-mono">
                                        {r.informed_to?.phone || 'No phone recorded'} {r.informed_to?.department ? `• ${r.informed_to.department}` : ''}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Direct Link */}
                        <div className="p-3 rounded-xl bg-muted/40 border border-border/60 space-y-1.5">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Live Post URL</span>
                            <div className="flex items-center gap-2">
                                <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
                                <div className="min-w-0 flex-1">
                                    {r.post_link ? (
                                        <a
                                            href={r.post_link}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="font-medium text-rose-600 dark:text-rose-400 hover:underline truncate block text-[11px] flex items-center gap-1"
                                        >
                                            <span className="truncate">{r.post_link}</span>
                                            <ExternalLink className="h-3 w-3 shrink-0" />
                                        </a>
                                    ) : (
                                        <span className="text-muted-foreground italic">No external link</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Engagement Metrics Ribbon */}
                    <div className="pt-2 border-t border-border/60">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-2">
                            Engagement Metrics
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                            {engagementMetrics.map((item) => {
                                const Icon = item.icon;
                                return (
                                    <div key={item.label} className="p-2 rounded-xl bg-muted/30 border border-border/50 flex items-center gap-2">
                                        <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
                                            <Icon className="h-3.5 w-3.5" />
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-muted-foreground block">{item.label}</span>
                                            <span className="text-xs font-mono font-black text-foreground">{item.value}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Right 1 Col: Live QR Code Card */}
                <div className="rounded-2xl border border-border bg-card p-5 shadow-xs flex flex-col items-center justify-center text-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">
                        Original Post QR
                    </span>
                    {r.post_link ? (
                        <div className="p-3 bg-white rounded-2xl border border-border/80 shadow-inner">
                            <QRCodeSVG
                                value={r.post_link}
                                size={128}
                                level="M"
                                includeMargin={false}
                                bgColor="#ffffff"
                                fgColor="#0f172a"
                            />
                        </div>
                    ) : (
                        <div className="h-32 w-32 rounded-2xl border border-dashed border-border/80 flex items-center justify-center bg-muted/20">
                            <span className="text-[11px] text-muted-foreground p-2">No URL to generate QR</span>
                        </div>
                    )}
                    <p className="text-[11px] font-medium text-muted-foreground mt-3 max-w-[180px]">
                        Scan via smartphone camera to inspect live social media post
                    </p>
                </div>
            </div>

            {/* 3. CRITICISM DESCRIPTION & REMARKS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-2">
                    <div className="flex items-center gap-2 font-bold text-xs text-foreground uppercase tracking-wider">
                        <FileText className="h-4 w-4 text-rose-500" />
                        <span>Criticism Content</span>
                    </div>
                    <div className="p-3.5 rounded-xl bg-muted/30 border border-border/50 text-xs leading-relaxed text-foreground whitespace-pre-wrap">
                        {r.post_description || 'No criticism content recorded.'}
                    </div>
                </div>

                <div className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-2">
                    <div className="flex items-center gap-2 font-bold text-xs text-foreground uppercase tracking-wider">
                        <MessageSquare className="h-4 w-4 text-emerald-500" />
                        <span>Action Plan & Officer Remarks</span>
                    </div>
                    <div className="p-3.5 rounded-xl bg-muted/30 border border-border/50 text-xs leading-relaxed text-foreground whitespace-pre-wrap">
                        {r.remarks || 'No internal remarks or corrective action details provided.'}
                    </div>
                </div>
            </div>

            {/* 4. ATTACHED MEDIA GALLERY */}
            {mediaUrls.length > 0 && (
                <div className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-bold text-xs text-foreground uppercase tracking-wider">
                            <ImageIcon className="h-4 w-4 text-rose-500" />
                            <span>Attached Media ({mediaUrls.length})</span>
                        </div>
                        <span className="text-[11px] text-muted-foreground">Click thumbnail to expand</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {mediaUrls.map((url, i) => (
                            <button
                                key={i}
                                type="button"
                                onClick={() => setActivePreview(url)}
                                className="group relative aspect-video rounded-xl border border-border overflow-hidden hover:border-rose-500 transition-all bg-muted/40 cursor-pointer text-left"
                            >
                                {isVideo(url) ? (
                                    <div className="h-full w-full bg-slate-900 flex items-center justify-center">
                                        <div className="h-9 w-9 rounded-full bg-white/25 flex items-center justify-center backdrop-blur-sm group-hover:scale-110 transition-transform">
                                            <div className="w-0 h-0 border-t-[6px] border-t-transparent border-l-[10px] border-l-white border-b-[6px] border-b-transparent ml-1" />
                                        </div>
                                    </div>
                                ) : (
                                    <img
                                        src={url}
                                        alt={`Media ${i + 1}`}
                                        className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                                        loading="lazy"
                                        referrerPolicy="no-referrer"
                                    />
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* 5. WHATSAPP FAST-SHARE STRIP */}
            <div className="rounded-2xl border border-border bg-card p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                        <WhatsAppBrandLogo className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-foreground">Share Criticism via WhatsApp</p>
                        <p className="text-[10px] text-muted-foreground">Send complete case particulars directly to officer or complainant</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Input
                        placeholder="Officer phone (e.g. 9876543210)"
                        value={waPhone}
                        onChange={(e) => setWaPhone(e.target.value)}
                        className="h-8 text-xs w-full sm:w-56 bg-background rounded-lg"
                    />
                    <Button
                        size="sm"
                        onClick={handleWhatsAppDirect}
                        className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg shrink-0 shadow-sm"
                    >
                        <Send className="h-3.5 w-3.5" />
                        Send
                    </Button>
                </div>
            </div>

            {/* Media Lightbox */}
            <AnimatePresence>
                {activePreview && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
                        onClick={() => setActivePreview(null)}
                    >
                        <div className="relative max-w-4xl max-h-[85vh] overflow-hidden rounded-2xl bg-black border border-white/10" onClick={(e) => e.stopPropagation()}>
                            <button
                                type="button"
                                onClick={() => setActivePreview(null)}
                                className="absolute top-3 right-3 z-10 h-8 w-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/90 transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                            {isVideo(activePreview) ? (
                                <video src={activePreview} controls autoPlay className="max-h-[80vh] w-auto rounded-2xl" />
                            ) : (
                                <img src={activePreview} alt="Preview" className="max-h-[80vh] w-auto object-contain rounded-2xl" />
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*                  CRITICISM REPORTS COMPONENT                  */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
export const CriticismReports = ({ openReportCode = '', onReportCodeHandled, suppressTable = false, onDetailClose }) => {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [platform, setPlatform] = useState('all');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [quickRange, setQuickRange] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({ total: 0, pages: 1 });
    const [selectedReport, setSelectedReport] = useState(null);
    const [fullscreen, setFullscreen] = useState(false);
    const detailPopupRef = useRef(null);
    const [detailPos, setDetailPos] = useState({
        x: Math.max(24, window.innerWidth / 2 - 440),
        y: 40
    });
    const [draggingDetail, setDraggingDetail] = useState(false);
    const [detailDragOffset, setDetailDragOffset] = useState({ x: 0, y: 0 });
    const [sortConfig, setSortConfig] = useState({ key: 'post_date', direction: 'desc' });

    // Quick date range preset handler
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
            end.setDate(0);
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

    // Fetch reports
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
            if (categoryFilter !== 'all') params.category = categoryFilter;
            if (statusFilter !== 'all') params.status = statusFilter;
            if (fromDate) params.from = fromDate;
            if (toDate) params.to = toDate;
            if (searchTerm.trim()) params.search = searchTerm.trim();

            const res = await api.get('/criticism/reports', { params });
            setReports(res.data?.reports || []);
            setPagination(res.data?.pagination || { total: 0, pages: 1 });
        } catch {
            toast.error('Failed to load criticism reports', {
                description: 'Please check your connection and try again',
                action: { label: 'Retry', onClick: fetchReports }
            });
        } finally {
            setLoading(false);
        }
    }, [page, platform, categoryFilter, statusFilter, fromDate, toDate, searchTerm, sortConfig]);

    useEffect(() => {
        fetchReports();
    }, [fetchReports]);

    // Deep link open
    useEffect(() => {
        const code = String(openReportCode || '').trim();
        if (!code) return;
        setPlatform('all');
        setCategoryFilter('all');
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
        onReportCodeHandled?.(match.unique_code || code);
    }, [openReportCode, reports, loading, onReportCodeHandled]);

    const prevSelectedRef = useRef(null);
    useEffect(() => {
        if (!suppressTable) {
            prevSelectedRef.current = selectedReport;
            return;
        }
        if (prevSelectedRef.current && !selectedReport) {
            onDetailClose?.();
        }
        prevSelectedRef.current = selectedReport;
    }, [selectedReport, suppressTable, onDetailClose]);

    // Stats calculations
    const stats = useMemo(() => {
        const total = pagination.total || reports.length;
        const closed = reports.filter(r => String(r.status || '').toUpperCase() === 'CLOSED' || Boolean(r.action_taken_at)).length;
        const pending = Math.max(0, total - closed);
        return { total, closed, pending };
    }, [pagination.total, reports]);

    // Export to Excel
    const handleExport = async () => {
        setExporting(true);
        try {
            const params = {};
            if (platform !== 'all') params.platform = platform;
            if (categoryFilter !== 'all') params.category = categoryFilter;
            if (statusFilter !== 'all') params.status = statusFilter;
            if (fromDate) params.from = fromDate;
            if (toDate) params.to = toDate;
            if (searchTerm.trim()) params.search = searchTerm.trim();

            const res = await api.get('/criticism/reports/export', {
                params,
                responseType: 'blob'
            });

            const blob = new Blob([res.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `criticism_reports_${new Date().toISOString().slice(0, 10)}.xlsx`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

            toast.success('Excel report downloaded successfully');
        } catch {
            toast.error('Failed to export reports');
        } finally {
            setExporting(false);
        }
    };

    const handleSort = (key) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
        }));
    };

    const hasActiveFilters = Boolean(
        platform !== 'all' ||
        categoryFilter !== 'all' ||
        statusFilter !== 'all' ||
        quickRange !== 'all' ||
        fromDate ||
        toDate ||
        searchTerm.trim()
    );

    const handleClearAllFilters = () => {
        setPlatform('all');
        setCategoryFilter('all');
        setStatusFilter('all');
        setQuickRange('all');
        setFromDate('');
        setToDate('');
        setSearchTerm('');
        setPage(1);
    };

    const SortIcon = ({ column }) => (
        <ArrowUpDown className={cn(
            "h-3 w-3 ml-1 transition-opacity",
            sortConfig.key === column ? "opacity-100 text-rose-600" : "opacity-30"
        )} />
    );

    return (
        <TooltipProvider>
            {!suppressTable && (
            <div className="space-y-4">
                {/* ─── Executive KPI Ribbon ─── */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                        {
                            id: 'all',
                            label: 'Total Criticisms',
                            value: stats.total,
                            icon: ShieldAlert,
                            color: 'text-rose-600 dark:text-rose-400',
                            accent: 'from-rose-500/20 to-rose-500/0',
                            borderColor: 'border-rose-500/30',
                            activeClass: 'ring-2 ring-rose-500 border-rose-500 shadow-md shadow-rose-500/10 bg-rose-500/[0.08]',
                            badge: 'All Logs',
                            dot: 'bg-rose-500'
                        },
                        {
                            id: 'CLOSED',
                            label: 'Action Taken / Closed',
                            value: stats.closed,
                            icon: CheckCircle2,
                            color: 'text-emerald-600 dark:text-emerald-400',
                            accent: 'from-emerald-500/20 to-emerald-500/0',
                            borderColor: 'border-emerald-500/30',
                            activeClass: 'ring-2 ring-emerald-500 border-emerald-500 shadow-md shadow-emerald-500/10 bg-emerald-500/[0.08]',
                            badge: 'Processed',
                            dot: 'bg-emerald-500'
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
                            badge: 'Requires Action',
                            dot: 'bg-amber-500'
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
                                    'flex flex-col p-3.5 rounded-xl border text-left transition-all duration-200 cursor-pointer select-none relative group overflow-hidden bg-card shadow-xs hover:shadow-md hover:-translate-y-0.5',
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

                {/* ─── Unified Filter Toolbar ─── */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2.5 border-b border-border bg-card/80 backdrop-blur-sm rounded-t-xl">
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Quick Date Range */}
                        <div className="flex items-center gap-1.5">
                            <Select value={quickRange} onValueChange={(v) => { setQuickRange(v); setPage(1); }}>
                                <SelectTrigger className="h-8 w-[125px] text-xs bg-background font-medium rounded-lg shadow-xs border-border/80 hover:border-rose-500/50 transition-colors">
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
                            <SelectTrigger className="h-8 w-[138px] text-xs bg-background font-medium rounded-lg shadow-xs border-border/80 hover:border-rose-500/50 transition-colors">
                                <Tag className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                                <SelectValue placeholder="All Categories" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Categories</SelectItem>
                                <SelectItem value="hate_speech">Hate Speech</SelectItem>
                                <SelectItem value="misinformation">Misinformation</SelectItem>
                                <SelectItem value="harassment">Harassment</SelectItem>
                                <SelectItem value="spam">Spam</SelectItem>
                                <SelectItem value="violence">Violence</SelectItem>
                                <SelectItem value="others">Others</SelectItem>
                            </SelectContent>
                        </Select>

                        {/* Platform Filter */}
                        <Select value={platform} onValueChange={(v) => { setPlatform(v); setPage(1); }}>
                            <SelectTrigger className="h-8 w-[130px] text-xs bg-background font-medium rounded-lg shadow-xs border-border/80 hover:border-rose-500/50 transition-colors">
                                <AllPlatformsLogo className="h-3.5 w-3.5 mr-1.5" />
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
                                placeholder="Search by unique ID, citizen, description..."
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
                            className="h-8 w-8 p-0 shrink-0 rounded-lg bg-background shadow-xs hover:border-rose-500/40"
                            title="Refresh Reports"
                        >
                            <RefreshCw className={cn('h-3.5 w-3.5 text-muted-foreground', loading && 'animate-spin')} />
                        </Button>

                        {/* Export Button */}
                        <Button
                            size="sm"
                            onClick={handleExport}
                            disabled={exporting || reports.length === 0}
                            className="h-8 gap-1.5 text-xs font-bold px-3.5 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white rounded-lg shadow-sm shadow-rose-600/25 transition-all"
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
                            <Loader2 className="h-7 w-7 animate-spin text-rose-600 mb-3" />
                            <p className="text-sm font-medium text-muted-foreground">Loading criticism reports…</p>
                        </div>
                    ) : reports.length === 0 ? (
                        <div className="text-center py-16 px-4">
                            <div className="w-12 h-12 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-3 border border-border/60">
                                <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <p className="text-sm font-bold text-foreground">No Criticism Reports Found</p>
                            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                                {hasActiveFilters
                                    ? 'Try adjusting your filters or date range to see matching criticisms.'
                                    : 'Create new criticism reports from post cards in the grievance feed.'}
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
                                                { key: 'unique_code', label: 'Unique ID', sortable: true, className: 'w-44' },
                                                { key: 'post_date', label: 'Post Date', sortable: true, className: 'w-36' },
                                                { key: 'profile', label: 'Citizen Profile', className: 'w-44' },
                                                { key: 'post_link', label: 'Link', className: 'w-12 text-center' },
                                                { key: 'description', label: 'Criticism Description', className: 'min-w-[220px] max-w-sm' },
                                                { key: 'category', label: 'Category', sortable: true, className: 'w-28' },
                                                { key: 'remarks', label: 'Officer Remarks', className: 'min-w-[160px]' },
                                                { key: 'informed_to', label: 'Informed Officer', className: 'w-36' },
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
                                            const PlatformLogo = platformIcons[r.platform?.toLowerCase()] || platformIcons.default;
                                            const isDone = String(r.status || '').toUpperCase() === 'CLOSED' || Boolean(r.action_taken_at);

                                            return (
                                                <tr
                                                    key={r.id}
                                                    onClick={() => setSelectedReport(r)}
                                                    className="hover:bg-muted/40 transition-colors group cursor-pointer"
                                                >
                                                    {/* Sl.No */}
                                                    <td className="py-2.5 px-3 text-center align-top">
                                                        <span className="text-[11px] font-mono text-muted-foreground font-semibold">
                                                            {(page - 1) * 50 + idx + 1}
                                                        </span>
                                                    </td>

                                                    {/* Status Badge */}
                                                    <td className="py-2.5 px-3 align-top whitespace-nowrap">
                                                        <Badge
                                                            variant="outline"
                                                            className={cn(
                                                                'text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider flex items-center gap-1 w-fit',
                                                                isDone
                                                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                                                                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
                                                            )}
                                                        >
                                                            <span className={cn('w-1.5 h-1.5 rounded-full', isDone ? 'bg-emerald-500' : 'bg-rose-500')} />
                                                            {isDone ? 'Closed' : 'Pending'}
                                                        </Badge>
                                                    </td>

                                                    {/* Unique Code */}
                                                    <td className="py-2.5 px-3 align-top whitespace-nowrap">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="font-mono font-bold text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 px-2 py-0.5 rounded-md border border-rose-200 dark:border-rose-800">
                                                                {r.unique_code}
                                                            </span>
                                                        </div>
                                                    </td>

                                                    {/* Post Date */}
                                                    <td className="py-2.5 px-3 align-top whitespace-nowrap">
                                                        <div className="text-xs">
                                                            <p className="font-semibold text-foreground">{fmtDate(r.post_date).split(',')[0]}</p>
                                                            <p className="text-[10px] text-muted-foreground">{fmtDate(r.post_date).split(',')[1] || ''}</p>
                                                        </div>
                                                    </td>

                                                    {/* Citizen Profile */}
                                                    <td className="py-2.5 px-3 align-top">
                                                        <div className="flex items-start gap-2 max-w-[160px]">
                                                            <div className="h-6 w-6 rounded-md bg-muted/80 border border-border flex items-center justify-center shrink-0 mt-0.5">
                                                                <PlatformLogo className="h-3.5 w-3.5" />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="font-bold text-xs text-foreground truncate" title={r.posted_by?.display_name || r.profile_id}>
                                                                    {r.posted_by?.display_name || r.profile_id || 'Public Citizen'}
                                                                </p>
                                                                {r.posted_by?.handle && (
                                                                    <span className="text-[10px] text-rose-600 dark:text-rose-400 font-mono truncate block">
                                                                        @{r.posted_by.handle.replace('@', '')}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* Link */}
                                                    <td className="py-2.5 px-3 align-top text-center" onClick={(e) => e.stopPropagation()}>
                                                        {r.post_link ? (
                                                            <a
                                                                href={r.post_link}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="h-7 w-7 inline-flex items-center justify-center rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 hover:text-rose-700 transition-colors"
                                                                title="View Original Post"
                                                            >
                                                                <ExternalLink className="h-3.5 w-3.5" />
                                                            </a>
                                                        ) : (
                                                            <span className="text-muted-foreground/40 text-xs">—</span>
                                                        )}
                                                    </td>

                                                    {/* Description */}
                                                    <td className="py-2.5 px-3 align-top">
                                                        <div className="min-w-[200px] max-w-sm">
                                                            <ExpandableText
                                                                text={r.post_description}
                                                                limit={140}
                                                                className="text-xs text-foreground/90 leading-snug whitespace-pre-wrap"
                                                            />
                                                        </div>
                                                    </td>

                                                    {/* Category */}
                                                    <td className="py-2.5 px-3 align-top whitespace-nowrap">
                                                        <Badge variant="outline" className="text-[10px] font-bold border-rose-500/30 text-rose-600 dark:text-rose-400 bg-rose-500/10">
                                                            {r.category || 'Others'}
                                                        </Badge>
                                                    </td>

                                                    {/* Remarks */}
                                                    <td className="py-2.5 px-3 align-top">
                                                        <div className="min-w-[150px] max-w-xs">
                                                            <ExpandableText
                                                                text={r.remarks}
                                                                limit={100}
                                                                className="text-xs text-muted-foreground leading-snug whitespace-pre-wrap"
                                                            />
                                                        </div>
                                                    </td>

                                                    {/* Informed Officer */}
                                                    <td className="py-2.5 px-3 align-top whitespace-nowrap">
                                                        {r.informed_to?.name ? (
                                                            <div className="text-xs">
                                                                <p className="font-semibold text-foreground truncate max-w-[130px]" title={r.informed_to.name}>
                                                                    {r.informed_to.name}
                                                                </p>
                                                                {r.informed_to.phone && (
                                                                    <p className="text-[10px] text-muted-foreground font-mono">
                                                                        {r.informed_to.phone}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span className="text-muted-foreground/40 text-xs">—</span>
                                                        )}
                                                    </td>

                                                    {/* Actions */}
                                                    <td className="py-2.5 px-3 align-top text-center" onClick={(e) => e.stopPropagation()}>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => setSelectedReport(r)}
                                                                    className="h-7 w-7 p-0 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-950/50 text-rose-600 dark:text-rose-400"
                                                                >
                                                                    <Eye className="h-4 w-4" />
                                                                </Button>
                                                            </TooltipTrigger>
                                                            <TooltipContent side="left"><p className="text-xs">Open Criticism Dossier</p></TooltipContent>
                                                        </Tooltip>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            {pagination.pages > 1 && (
                                <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-card">
                                    <p className="text-xs text-muted-foreground font-medium">
                                        Showing {(page - 1) * 50 + 1}–{Math.min(page * 50, pagination.total)} of {pagination.total} records
                                    </p>
                                    <div className="flex items-center gap-1.5">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={page <= 1}
                                            onClick={() => setPage(p => p - 1)}
                                            className="text-xs h-7 px-2.5 rounded-lg"
                                        >
                                            <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                                            Prev
                                        </Button>
                                        <div className="text-xs font-semibold px-2">
                                            Page {page} of {pagination.pages}
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={page >= pagination.pages}
                                            onClick={() => setPage(p => p + 1)}
                                            className="text-xs h-7 px-2.5 rounded-lg"
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
            </div>
            )}

                {/* ─── Detail Modal Dialog ─── */}
                <AnimatePresence>
                    {selectedReport && (
                        <>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-xs"
                                onClick={() => setSelectedReport(null)}
                            />

                            <motion.div
                                ref={detailPopupRef}
                                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                                transition={{ type: "spring", duration: 0.25 }}
                                className={cn(
                                    "fixed z-[9999] bg-background rounded-2xl shadow-2xl border border-border flex flex-col overflow-hidden",
                                    fullscreen ? "inset-4" : ""
                                )}
                                style={!fullscreen ? {
                                    left: detailPos.x,
                                    top: detailPos.y,
                                    width: Math.min(920, window.innerWidth - 32),
                                    height: 'calc(100vh - 60px)'
                                } : {}}
                            >
                                {/* Modal Draggable Title Header */}
                                <div
                                    className="px-4 py-3 bg-card border-b border-border flex items-center justify-between cursor-move select-none"
                                    onMouseDown={!fullscreen ? (e) => {
                                        setDraggingDetail(true);
                                        setDetailDragOffset({ x: e.clientX - detailPos.x, y: e.clientY - detailPos.y });
                                    } : undefined}
                                >
                                    <div className="flex items-center gap-2">
                                        {!fullscreen && <GripHorizontal className="h-4 w-4 text-muted-foreground/60" />}
                                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                            Criticism Case Inspector
                                        </span>
                                        <Badge variant="outline" className="text-[10px] font-mono font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/30">
                                            {selectedReport.unique_code}
                                        </Badge>
                                    </div>

                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-foreground"
                                            onClick={() => setFullscreen(!fullscreen)}
                                            title={fullscreen ? "Minimize" : "Maximize"}
                                        >
                                            {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                            onClick={() => setSelectedReport(null)}
                                            title="Close"
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>

                                {/* Modal Body */}
                                <ScrollArea className="flex-1 bg-muted/20">
                                    <div className="p-4 sm:p-6 max-w-5xl mx-auto w-full">
                                        <CriticismReportDetailView
                                            report={selectedReport}
                                            onUpdate={(updatedReport) => {
                                                setSelectedReport(updatedReport);
                                                setReports(prev => prev.map(d => d.id === updatedReport.id ? updatedReport : d));
                                            }}
                                            onClose={() => setSelectedReport(null)}
                                            onPrint={() => window.print()}
                                        />
                                    </div>
                                </ScrollArea>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>
        </TooltipProvider>
    );
};

export default CriticismReports;