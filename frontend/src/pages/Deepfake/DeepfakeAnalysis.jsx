import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Upload, FileVideo, FileImage,
    Loader2, ChevronRight, BarChart2,
    CheckCircle2, Scan,
    Zap, Eye, Cpu, Layers,
    TrendingUp, RefreshCw, Fingerprint,
    LayoutGrid, ChevronLeft, Play, Link2
} from 'lucide-react';
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import { toast } from "sonner";
import api from '../../lib/api';
import './DeepfakeAnalysis.css';

const STEPS = [
    { id: 0, label: 'Extracting Frames (slices)', icon: Layers },
    { id: 1, label: 'Localizing Faces', icon: Eye },
    { id: 2, label: 'Neural Inference', icon: Cpu },
    { id: 3, label: 'Scoring & Verdict', icon: Zap },
];

/* ── Confidence Ring (SVG) ── */
const ConfRing = ({ value = 0, color = '#1e6b5a', size = 160 }) => {
    const r = 60, circ = 2 * Math.PI * r;
    const pct = Math.min(Math.max(value, 0), 100);
    const offset = circ - (pct / 100) * circ;
    return (
        <div className="relative" style={{ width: size, height: size }}>
            <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
                <circle cx="70" cy="70" r={r} className="dfk-ring-track" strokeWidth="10" />
                <motion.circle cx="70" cy="70" r={r} className="dfk-ring-fill"
                    stroke={color} strokeWidth="10" strokeDasharray={circ}
                    initial={{ strokeDashoffset: circ }}
                    animate={{ strokeDashoffset: offset }}
                    transition={{ duration: 1, ease: 'easeOut', delay: 0.15 }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Confidence Score</span>
                <span className="text-3xl font-bold mt-0.5" style={{ color }}>{pct.toFixed(0)}%</span>
            </div>
        </div>
    );
};

/* ═════════════════════════════════════════════════════════════ */
const DeepfakeAnalysis = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [file, setFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [result, setResult] = useState(null);
    const [fileType, setFileType] = useState(null);
    const [showAllFrames, setShowAllFrames] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);
    const [step, setStep] = useState(0);
    const [progress, setProgress] = useState(0);
    const [showReport, setShowReport] = useState(false);
    const [linkUrl, setLinkUrl] = useState('');
    const [linkAnalyzing, setLinkAnalyzing] = useState(false);
    const fileInputRef = useRef(null);
    const timerRef = useRef(null);

    /* ── initial results from navigation ── */
    useEffect(() => {
        if (location.state?.initialResults) {
            const initial = Array.isArray(location.state.initialResults)
                ? location.state.initialResults[0] : location.state.initialResults;
            if (initial) {
                setResult(initial);
                setFileType(initial.type || (initial.url?.includes('.mp4') ? 'video' : 'image'));
                if (initial.previewUrl || initial.url) setPreviewUrl(initial.previewUrl || initial.url);
                setShowReport(true);
            }
        }
    }, [location.state]);

    /* ── progress simulation ── */
    useEffect(() => {
        if (analyzing) {
            setStep(0); setProgress(0);
            let p = 0, s = 0;
            timerRef.current = setInterval(() => {
                p = Math.min(p + 1, 95); setProgress(p);
                const ns = p < 15 ? 0 : p < 40 ? 1 : p < 75 ? 2 : 3;
                if (ns !== s) { s = ns; setStep(s); }
            }, 280);
        } else {
            clearInterval(timerRef.current);
            if (result) { setProgress(100); setStep(4); }
        }
        return () => clearInterval(timerRef.current);
    }, [analyzing, result]);

    const onDragOver = useCallback(e => { e.preventDefault(); setIsDragOver(true); }, []);
    const onDragLeave = useCallback(() => setIsDragOver(false), []);
    const onDrop = useCallback(e => {
        e.preventDefault(); setIsDragOver(false);
        if (e.dataTransfer.files[0]) ingestFile(e.dataTransfer.files[0]);
    }, []);

    const ingestFile = (f) => {
        if (f.size > 25 * 1024 * 1024) { toast.warning("File is over the 25 MB limit. Please upload a smaller file."); return; }
        const isImg = f.type.startsWith('image/');
        const isVid = f.type.startsWith('video/');
        if (!isImg && !isVid) { toast.error("Unsupported format"); return; }
        setFile(f); setFileType(isImg ? 'image' : 'video');
        setPreviewUrl(URL.createObjectURL(f)); setResult(null); setShowReport(false);
    };
    const handleFileChange = e => { if (e.target.files[0]) ingestFile(e.target.files[0]); };

    const runAnalysis = async () => {
        if (!file) return;
        setAnalyzing(true); setResult(null); setShowReport(false);
        const fd = new FormData(); fd.append('file', file);
        const ep = fileType === 'image' ? '/deepfake/image' : '/deepfake/video';
        try {
            const res = await api.post(ep, fd, { timeout: 300000 });
            setResult(res.data); toast.success("Analysis complete");
        } catch (err) {
            console.error(err);
            toast.error(err.response?.data?.message || "Analysis failed");
        } finally { setAnalyzing(false); }
    };

    const analyzeLink = async () => {
        const raw = (linkUrl || '').trim();
        if (!raw) {
            toast.error('Please paste a URL');
            return;
        }

        let parsed;
        try {
            parsed = new URL(raw);
            if (!['http:', 'https:'].includes(parsed.protocol)) {
                toast.error('Only http/https links are supported');
                return;
            }
        } catch {
            toast.error('Please provide a valid URL');
            return;
        }

        setLinkAnalyzing(true);
        setAnalyzing(true);
        setResult(null);
        setShowReport(false);
        setFile(null);
        setPreviewUrl(null);
        setFileType(null);

        try {
            const res = await api.post('/deepfake/link', { url: parsed.href }, { timeout: 300000 });
            const results = Array.isArray(res.data?.results) ? res.data.results : [];
            if (!results.length) {
                toast.error('No analyzable media found in that link');
                return;
            }

            // Show the highest-confidence result in the detailed report panel.
            const ranked = [...results].sort((a, b) => (Number(b?.confidence) || 0) - (Number(a?.confidence) || 0));
            const best = ranked[0];

            setResult(best);
            setFileType(best.type || (best.url?.match(/\.(png|jpg|jpeg|webp|gif)(\?|#|$)/i) ? 'image' : 'video'));
            setPreviewUrl(best.previewUrl || best.url || null);
            // Don't auto-show report - let user stay on analysis page first to see video/image
            // User can click "View Full Report" button when ready

            const count = Number(res.data?.analyzedCount) || results.length;
            toast.success(`Analyzed ${count} media item${count === 1 ? '' : 's'} from the link`);
        } catch (err) {
            console.error(err);
            toast.error(err.response?.data?.message || 'Link analysis failed');
        } finally {
            setAnalyzing(false);
            setLinkAnalyzing(false);
        }
    };

    const reset = () => {
        setFile(null); setPreviewUrl(null); setResult(null);
        setFileType(null); setShowAllFrames(false); setShowReport(false);
        setLinkUrl('');
        setLinkAnalyzing(false);
        setStep(0); setProgress(0);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    /* ── derived ── */
    const isInconclusive = result && (result.status === 'INCONCLUSIVE' || result.label === 'SUSPICIOUS' || result.label === 'NEEDS_REVIEW');
    const isFake = result && (result.label === 'FAKE' || result.label?.includes('MANIPULATED'));
    const vColor = !result ? 'slate' : isInconclusive ? 'amber' : isFake ? 'red' : 'emerald';
    const vHex = { red: '#dc2626', amber: '#d97706', emerald: '#059669', slate: '#94a3b8' }[vColor];

    const confValue = useMemo(() => {
        if (!result) return 0;
        return isInconclusive ? 35 : Math.min((result.confidence || 0) * 100, 95);
    }, [result, isInconclusive]);

    const confLabel = useMemo(() => {
        if (!result) return '';
        if (result.confidence_level) return result.confidence_level;
        if (isInconclusive) return 'Low';
        return `${(result.confidence * 100).toFixed(1)}%`;
    }, [result, isInconclusive]);

    const suspiciousCount = result?.top_suspicious_frames?.filter(f => f.score > .5).length || 0;
    const hasFrames = result?.top_suspicious_frames?.length > 0;
    const hasTimeline = result?.full_forensic_timeline?.length > 0;

    const pageTitle = !file && !result
        ? 'Deepfake Analysis'
        : showReport
            ? 'Analysis Report'
            : analyzing
                ? `${fileType === 'video' ? 'VIDEO' : 'IMAGE'} SCAN`
                : result
                    ? 'SCAN COMPLETION'
                    : `${fileType === 'video' ? 'VIDEO' : 'IMAGE'} SCAN`;

    const statusText = analyzing
        ? `ANALYZING`
        : result
            ? `ASSESSMENT, ${result.label}`
            : 'READY';

    /* ═══ RENDER ═══ */
    return (
        <div className="space-y-6">

            {/* ═══ HEADER BAR ═══ */}
            <header className="dfk-in flex items-center justify-between">
                <div className="flex items-center gap-3">
                    {location.state?.fromTools && !showReport && (
                        <button onClick={() => navigate('/analysis-tools')}
                            className="w-8 h-8 rounded-lg border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors">
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                    )}
                    {showReport && (
                        <button onClick={() => setShowReport(false)}
                            className="w-8 h-8 rounded-lg border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors">
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                    )}
                    <h1 className="dfk-section-header text-lg">{pageTitle}</h1>
                </div>
                <div className="flex items-center gap-2">
                    {result && showReport && (
                        <span className={`text-xs font-bold px-3 py-1.5 rounded border uppercase tracking-wider ${isFake ? 'bg-red-100 text-red-700 border-red-300' :
                            isInconclusive ? 'bg-amber-100 text-amber-700 border-amber-300' :
                                'bg-emerald-100 text-emerald-700 border-emerald-300'}`}>
                            ASSESSMENT, {result.label}
                        </span>
                    )}
                    {!showReport && (
                        <span className="text-xs text-muted-foreground uppercase tracking-wider">{statusText}</span>
                    )}
                    {(file || result) && !analyzing && (
                        <Button onClick={reset} variant="outline" size="sm" className="h-8 gap-2">
                            <RefreshCw className="w-3.5 h-3.5" /> Try New One
                        </Button>
                    )}
                </div>
            </header>

            {/* ═══════════════ DASHBOARD / UPLOAD PHASE ═══════════════ */}
            {!file && !result && (
                <div className="dfk-in grid grid-cols-1 lg:grid-cols-3 gap-6" style={{ '--d': '.04s' }}>

                    {/* Left: Upload Zone */}
                    <div className="lg:col-span-2">
                        <Card>
                            <div className="dfk-card-hdr">
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Media Upload Zone</span>
                            </div>
                            <div className="p-8 sm:p-10 flex flex-col items-center">
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
                                    className={`dfk-dropzone w-full max-w-sm p-10 flex flex-col items-center text-center cursor-pointer ${isDragOver ? 'active' : ''}`}
                                >
                                    <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} accept="image/*,video/*" />
                                    <Upload className="w-8 h-8 text-muted-foreground mb-4" />
                                    <p className="text-sm font-semibold text-foreground">
                                        {isDragOver ? 'Release to Upload' : 'Drag & Drop'}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
                                    <Button className="mt-5" size="sm">BROWSE</Button>
                                    <p className="text-[10px] text-muted-foreground mt-1">Max upload size: 25 MB</p>
                                </div>

                                <div className="w-full max-w-xl mt-4 border border-border rounded-lg p-3 bg-muted/20">
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">Paste Link To Scan Media</p>
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <Link2 className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                                            <input
                                                type="url"
                                                value={linkUrl}
                                                onChange={(e) => setLinkUrl(e.target.value)}
                                                placeholder="https://example.com/post"
                                                className="w-full h-9 rounded-md border border-border bg-background pl-8 pr-2 text-xs text-foreground placeholder:text-muted-foreground"
                                            />
                                        </div>
                                        <Button onClick={analyzeLink} disabled={linkAnalyzing || analyzing} size="sm" className="h-9">
                                            {linkAnalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Analyse Link'}
                                        </Button>
                                    </div>
                                    {/* Supported platforms */}
                                    <div className="mt-2.5 pt-2.5 border-t border-border/60 flex flex-wrap items-center gap-2">
                                        <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold">Supports:</span>
                                        {[
                                            { label: 'YouTube', color: '#FF0000', path: 'M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.7 15.5V8.5l6.3 3.5-6.3 3.5z' },
                                            { label: 'Instagram', color: '#E1306C', path: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z' },
                                            { label: 'X / Twitter', color: '#000000', path: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.733-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z' },
                                            { label: 'Web Image Links', color: '#0ea5e9', path: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm7.93 9h-3.36a15.5 15.5 0 0 0-1.06-5A8.03 8.03 0 0 1 19.93 11zM12 4.07c.85 1.2 1.54 3.03 1.78 4.93h-3.56c.24-1.9.93-3.73 1.78-4.93zM8.49 6a15.5 15.5 0 0 0-1.06 5H4.07A8.03 8.03 0 0 1 8.49 6zM4.07 13h3.36a15.5 15.5 0 0 0 1.06 5A8.03 8.03 0 0 1 4.07 13zM12 19.93c-.85-1.2-1.54-3.03-1.78-4.93h3.56c-.24 1.9-.93 3.73-1.78 4.93zM15.51 18a15.5 15.5 0 0 0 1.06-5h3.36A8.03 8.03 0 0 1 15.51 18z' },
                                        ].map(p => (
                                            <div key={p.label} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted border border-border" title={p.label}>
                                                <svg viewBox="0 0 24 24" className="w-3 h-3" fill={p.color}><path d={p.path} /></svg>
                                                <span className="text-[9px] text-muted-foreground font-medium">{p.label}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-muted-foreground mt-2">
                                        Note: Posts with multiple images/videos are not supported for combined analysis.
                                    </p>
                                </div>

                                <p className="text-[10px] text-muted-foreground mt-5 mb-3 uppercase tracking-wider font-semibold">Supported Formats</p>
                                <div className="flex flex-wrap justify-center gap-3">
                                    {[
                                        { label: 'MP4', Icon: FileVideo },
                                        { label: 'MKV', Icon: FileVideo },
                                        { label: 'JPG', Icon: FileImage },
                                        { label: 'PNG', Icon: FileImage },
                                        { label: 'WEBP', Icon: FileImage },
                                    ].map(f => (
                                        <div key={f.label} className="flex flex-col items-center gap-1 w-12">
                                            <div className="w-10 h-10 rounded-lg bg-muted border border-border flex items-center justify-center">
                                                <f.Icon className="w-4 h-4 text-muted-foreground" />
                                            </div>
                                            <span className="text-[9px] text-muted-foreground font-semibold">{f.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </Card>
                    </div>

                    {/* Right: How It Works + Tips */}
                    <div>
                        <Card>
                            <div className="dfk-card-hdr">
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">How It Works</span>
                            </div>
                            <div className="p-4 space-y-3">
                                {[
                                    { step: '1', title: 'Choose Input', desc: 'Upload an image/video file or paste a supported public media link.' },
                                    { step: '2', title: 'Check File Size', desc: 'Maximum upload size is 25 MB per file.' },
                                    { step: '3', title: 'Run Analysis', desc: 'Click Analyse and wait for the report to finish loading.' },
                                    { step: '4', title: 'Review Carefully', desc: 'Use the confidence score and visual evidence before making decisions.' },
                                ].map(item => (
                                    <div key={item.step} className="flex gap-2.5">
                                        <div className="w-5 h-5 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                                            <span className="text-[9px] font-bold text-primary">{item.step}</span>
                                        </div>
                                        <div>
                                            <p className="text-[11px] font-semibold text-foreground">{item.title}</p>
                                            <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{item.desc}</p>
                                        </div>
                                    </div>
                                ))}
                                <div className="pt-2 border-t border-border">
                                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Note</p>
                                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                                        The system is built for reliable detection, but it may make mistakes sometimes, so please review results carefully before final decisions.
                                    </p>
                                </div>
                            </div>
                        </Card>
                    </div>
                </div>
            )}

            {/* ═══════════════ SCAN PHASE ═══════════════ */}
            {(file || result) && !showReport && (
                <div className="dfk-in space-y-5" style={{ '--d': '.04s' }}>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 dfk-main-grid">

                        {/* ═ LEFT: Media Preview + Face Pipeline ═ */}
                        <div className="lg:col-span-2 space-y-4">

                            {/* Media viewport card */}
                            <Card className="overflow-hidden">
                                <div className="relative bg-muted aspect-video flex items-center justify-center overflow-hidden">
                                    {previewUrl ? (
                                        fileType === 'image'
                                            ? <img 
                                                src={previewUrl} 
                                                alt="" 
                                                className="max-h-full max-w-full object-contain" 
                                                onError={(e) => {
                                                    console.error('Image load error:', e);
                                                    toast.error('Image failed to load');
                                                }} 
                                              />
                                            : <div className="w-full h-full bg-black flex items-center justify-center">
                                                <video 
                                                    key={previewUrl}
                                                    controls 
                                                    autoPlay={false}
                                                    crossOrigin="anonymous"
                                                    className="max-h-full w-full"
                                                    onLoadStart={() => console.log('[Video] Loading from:', previewUrl)}
                                                    onCanPlayThrough={() => console.log('[Video] Ready to play')}
                                                    onError={(e) => {
                                                        const errorCode = e.target?.error?.code;
                                                        const errorMsg = {
                                                            1: 'MEDIA_ERR_ABORTED - Request was aborted',
                                                            2: 'MEDIA_ERR_NETWORK - Network error',
                                                            3: 'MEDIA_ERR_DECODE - Unable to decode video',
                                                            4: 'MEDIA_ERR_SRC_NOT_SUPPORTED - Format not supported'
                                                        }[errorCode] || 'Unknown error or URL unreachable';
                                                        console.error('[Video] Failed to load:', { code: errorCode, msg: errorMsg, url: previewUrl });
                                                        
                                                        // Try direct URL as fallback
                                                        if (result?.url && previewUrl.includes('/api/deepfake/source')) {
                                                            console.log('[Video] Proxy failed, trying direct URL...');
                                                            e.target.src = result.url;
                                                        } else {
                                                            toast.error(`Video failed to load: ${errorMsg}`);
                                                        }
                                                    }}
                                                  >
                                                    <source src={previewUrl} type="video/mp4" />
                                                    <p className="text-xs text-muted-foreground">Your browser doesn't support HTML5 video.</p>
                                                </video>
                                              </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                            <FileVideo className="w-10 h-10" />
                                            <span className="text-sm font-medium">Media File</span>
                                        </div>
                                    )}
                                    {/* Scan overlay */}
                                    <AnimatePresence>
                                        {analyzing && (
                                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                                transition={{ duration: .25 }}
                                                className="absolute inset-0 dfk-overlay z-20 flex flex-col items-center justify-center gap-3">
                                                <div className="dfk-scanline" />
                                                <div className="dfk-scan-grid" />
                                                <div className="dfk-bracket tl" />
                                                <div className="dfk-bracket tr" />
                                                <div className="dfk-bracket bl" />
                                                <div className="dfk-bracket br" />
                                                <div className="relative z-30 flex flex-col items-center gap-3">
                                                    <div className="relative w-12 h-12">
                                                        <Fingerprint className="w-5 h-5 text-primary absolute inset-0 m-auto" />
                                                        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary dfk-spin" />
                                                    </div>
                                                    <p className="text-foreground text-xs font-semibold uppercase tracking-wider">{STEPS[step]?.label || 'Processing'}</p>
                                                    <div className="w-44">
                                                        <div className="flex items-center gap-1 mb-1">
                                                            {STEPS.map((s, i) => (
                                                                <div key={s.id} className={`flex-1 h-1 rounded-full transition-colors duration-300 ${i < step ? 'bg-emerald-500' : i === step ? 'bg-primary' : 'bg-border'}`} />
                                                            ))}
                                                        </div>
                                                        <div className="flex justify-between text-[9px] text-muted-foreground">
                                                            <span>PROGRESS</span><span>{progress}%</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                {/* Bottom bar with file info and controls */}
                                <div className="bg-card border-t border-border px-4 py-2.5 flex items-center justify-between">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        {fileType === 'video' ? <Play className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <FileImage className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                                        <span className="text-xs text-foreground truncate max-w-[200px]">{file?.name || 'Media'}</span>
                                        <span className="text-[10px] text-muted-foreground">{file ? `${(file.size / 1048576).toFixed(1)} MB` : ''}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {analyzing && (
                                            <span className="text-[10px] text-primary dfk-pulse font-medium flex items-center gap-1">
                                                <Loader2 className="w-3 h-3 animate-spin" /> Scanning...
                                            </span>
                                        )}
                                        {result && !analyzing && (
                                            <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                                                <CheckCircle2 className="w-3 h-3" /> Complete
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </Card>

                            {/* Face Tracking Pipeline */}
                            {(hasFrames || analyzing) && (
                                <Card className="dfk-in" style={{ '--d': '.08s' }}>
                                    <div className="dfk-card-hdr">
                                        <span className="dfk-section-header text-xs">Face Tracking Pipeline</span>
                                        {hasFrames && <span className="text-[10px] text-muted-foreground">{result.top_suspicious_frames?.length} frames detected</span>}
                                    </div>
                                    <div className="p-4">
                                        {hasFrames ? (
                                            <div className="flex gap-2.5 overflow-x-auto dfk-scroll pb-2">
                                                {result.top_suspicious_frames.map((frame, idx) => {
                                                    const bad = frame.score > .5;
                                                    return (
                                                        <div key={idx} className="shrink-0 w-[60px]">
                                                            <div className={`w-[60px] h-[60px] rounded-lg overflow-hidden border-2 ${bad ? 'border-red-400' : 'border-emerald-400'}`}>
                                                                {frame.imageUrl
                                                                    ? <img 
                                                                        src={frame.imageUrl} 
                                                                        alt="" 
                                                                        className="w-full h-full object-cover" 
                                                                        onError={(e) => {
                                                                            console.error(`[Frame ${idx}] Failed to load:`, frame.imageUrl);
                                                                            e.target.style.display = 'none';
                                                                        }}
                                                                        onLoad={() => console.log(`[Frame ${idx}] Loaded:`, frame.imageUrl)}
                                                                      />
                                                                    : <div className="w-full h-full bg-muted flex items-center justify-center"><Fingerprint className="w-4 h-4 text-muted-foreground" /></div>}
                                                            </div>
                                                            <p className={`text-[9px] text-center mt-1 font-semibold ${bad ? 'text-red-600' : 'text-emerald-600'}`}>
                                                                {(frame.score * 100).toFixed(0)}%
                                                            </p>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-3 py-2">
                                                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                                <div>
                                                    <p className="text-xs font-semibold text-foreground">Face Detection & Clustering</p>
                                                    <p className="text-[10px] text-muted-foreground mt-0.5">Scanning {fileType} — {progress}%</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </Card>
                            )}

                            {/* Analysis Status + Preliminary Findings (after scan complete) */}
                            {result && !analyzing && (
                                <div className="dfk-in grid grid-cols-1 sm:grid-cols-2 gap-4" style={{ '--d': '.1s' }}>
                                    <Card>
                                        <div className="dfk-card-hdr">
                                            <span className="dfk-section-header text-[11px]">Analysis Status</span>
                                        </div>
                                        <div className="p-4 space-y-2">
                                            <p className="text-xs text-muted-foreground">
                                                Scanning {fileType === 'video' ? 'Video' : 'Image'} — <span className="text-emerald-600 font-medium">100%</span>
                                            </p>
                                            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                                                <div className="h-full rounded-full bg-primary dfk-bar" style={{ width: '100%' }} />
                                            </div>
                                            <p className="text-[10px] text-muted-foreground pt-1">
                                                Analysis Status: <span className="text-foreground font-medium">Complete</span>
                                            </p>
                                            <p className="text-[10px] text-muted-foreground">
                                                Testing Suite: <span className="text-foreground font-medium">Detection & Clustering</span>
                                            </p>
                                        </div>
                                    </Card>
                                    <Card>
                                        <div className="dfk-card-hdr">
                                            <span className="dfk-section-header text-[11px]">Preliminary Findings</span>
                                        </div>
                                        <div className="p-4 space-y-2.5">
                                            <div className="flex justify-between">
                                                <span className="text-[11px] text-muted-foreground">Frames Found</span>
                                                <span className="text-[11px] text-foreground font-semibold">{result.top_suspicious_frames?.length || 0}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-[11px] text-muted-foreground">Score Ratio</span>
                                                <span className="text-[11px] text-foreground font-semibold">{confLabel}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-[11px] text-muted-foreground">Flagged Count</span>
                                                <span className={`text-[11px] font-semibold ${suspiciousCount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{suspiciousCount}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-[11px] text-muted-foreground">Status</span>
                                                <span className={`text-[11px] font-semibold ${isFake ? 'text-red-600' : isInconclusive ? 'text-amber-600' : 'text-emerald-600'}`}>{result.label}</span>
                                            </div>
                                        </div>
                                    </Card>
                                </div>
                            )}
                        </div>

                        {/* ═ RIGHT: Scan Progress Panel ═ */}
                        <div className="space-y-4">

                            {/* Confidence Score (only after scan) */}
                            {result && !analyzing && (
                                <Card className="dfk-in" style={{ '--d': '.06s' }}>
                                    <div className="dfk-card-hdr">
                                        <span className="dfk-section-header text-[11px]">Confidence Score</span>
                                    </div>
                                    <div className="p-5 flex flex-col items-center gap-3">
                                        <ConfRing value={confValue} color={vHex} size={140} />
                                        <div className="w-full space-y-2 mt-1">
                                            <div className="flex justify-between text-[11px]">
                                                <span className="text-muted-foreground">Synthetic Artifacts ({confLabel})</span>
                                                <span className="text-foreground font-semibold">{confLabel}</span>
                                            </div>
                                            <div className="flex justify-between text-[11px]">
                                                <span className="text-muted-foreground">Flagged Frames ({suspiciousCount})</span>
                                                <span className={`font-semibold ${suspiciousCount > 0 ? 'text-red-600' : 'text-foreground'}`}>{suspiciousCount}</span>
                                            </div>
                                            <div className="flex justify-between text-[11px]">
                                                <span className="text-muted-foreground">Overall Suspicion</span>
                                                <span className={`font-semibold ${isFake ? 'text-red-600' : isInconclusive ? 'text-amber-600' : 'text-emerald-600'}`}>{isFake ? 'HIGH' : isInconclusive ? 'MEDIUM' : 'LOW'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </Card>
                            )}

                            {/* Scan Progress Steps */}
                            <Card>
                                <div className="dfk-card-hdr">
                                    <span className="dfk-section-header text-[11px]">Scan Progress</span>
                                </div>
                                <div className="p-4 space-y-2.5">
                                    {STEPS.map((s, i) => {
                                        const active = analyzing && i === step;
                                        const done = i < step || (result && !analyzing);
                                        return (
                                            <div key={s.id} className={`dfk-step ${active ? 'active' : done ? 'done' : ''}`}>
                                                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold border
                                                    ${done ? 'bg-emerald-50 text-emerald-600 border-emerald-300' :
                                                        active ? 'bg-primary/10 text-primary border-primary/30' :
                                                            'bg-muted text-muted-foreground border-border'}`}>
                                                    {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span>{i + 1}</span>}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-xs font-semibold ${done ? 'text-emerald-600' : active ? 'text-primary' : 'text-foreground'}`}>
                                                        {s.label}
                                                    </p>
                                                </div>
                                                <div className="shrink-0">
                                                    {done
                                                        ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                                        : active
                                                            ? <Loader2 className="w-4 h-4 text-primary animate-spin" />
                                                            : <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                                    }
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {/* Progress bar during analysis */}
                                    {analyzing && (
                                        <div className="pt-3 mt-1 border-t border-border">
                                            <div className="flex justify-between text-[10px] text-muted-foreground mb-1.5">
                                                <span>Overall</span><span className="text-foreground font-medium">{progress}%</span>
                                            </div>
                                            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                                                <div className="h-full rounded-full bg-primary dfk-bar" style={{ width: `${progress}%` }} />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </Card>

                            {/* Action buttons */}
                            {!analyzing && (
                                <div className="space-y-2.5">
                                    {!result && (
                                        <Button onClick={runAnalysis} className="w-full gap-2">
                                            <Scan className="w-4 h-4" /> Analyse
                                        </Button>
                                    )}
                                    {result && (
                                        <>
                                            <Button onClick={() => setShowReport(true)} className="w-full gap-2">
                                                <BarChart2 className="w-4 h-4" /> View Full Report
                                            </Button>
                                        </>
                                    )}
                                    {!result && (
                                        <button onClick={reset}
                                            className="w-full py-2 rounded-md text-muted-foreground text-xs font-medium hover:text-foreground transition-colors flex items-center justify-center gap-1.5">
                                            <RefreshCw className="w-3 h-3" /> Replace Media
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════ REPORT PHASE ═══════════════ */}
            {result && showReport && (
                <div className="dfk-in space-y-5" style={{ '--d': '.04s' }}>

                    {/* Confidence + Metrics row */}
                    <div className="dfk-in grid grid-cols-1 lg:grid-cols-2 gap-5" style={{ '--d': '.06s' }}>

                        {/* Confidence Score */}
                        <Card>
                            <div className="dfk-card-hdr">
                                <span className="dfk-section-header text-xs">Confidence Score</span>
                            </div>
                            <div className="p-6 flex flex-col items-center gap-4">
                                <ConfRing value={confValue} color={vHex} size={180} />
                            </div>
                        </Card>

                        {/* Metrics table */}
                        <Card>
                            <div className="dfk-card-hdr">
                                <span className="dfk-section-header text-xs">Analysis Metrics</span>
                            </div>
                            <div>
                                <div className="dfk-metric-row">
                                    <span className="text-sm text-muted-foreground">Synthetic Artifacts ({confLabel})</span>
                                    <span className="text-sm text-foreground font-semibold">{confLabel}</span>
                                </div>
                                <div className="dfk-metric-row">
                                    <span className="text-sm text-muted-foreground">
                                        Flagged Frames {suspiciousCount > 0 && <span className="text-red-600">({suspiciousCount})</span>}
                                    </span>
                                    <span className={`text-sm font-semibold ${suspiciousCount > 0 ? 'text-red-600' : 'text-foreground'}`}>{suspiciousCount}</span>
                                </div>
                                {result.clips_analyzed != null && (
                                    <div className="dfk-metric-row">
                                        <span className="text-sm text-muted-foreground">Clips Analyzed</span>
                                        <span className="text-sm text-foreground font-semibold">{result.clips_analyzed}</span>
                                    </div>
                                )}
                                <div className="dfk-metric-row">
                                    <span className="text-sm text-muted-foreground">Overall Suspicion</span>
                                    <span className={`text-sm font-bold ${isFake ? 'text-red-600' : isInconclusive ? 'text-amber-600' : 'text-emerald-600'}`}>
                                        {isFake ? 'HIGH' : isInconclusive ? 'MEDIUM' : 'LOW'}
                                        {result.type && ` (${result.type === 'image' ? 'Image' : 'Video'})`}
                                    </span>
                                </div>
                            </div>
                        </Card>
                    </div>

                    {/* Key Findings */}
                    <Card className="dfk-in" style={{ '--d': '.1s' }}>
                        <div className="dfk-card-hdr">
                            <span className="dfk-section-header text-xs">Key Findings</span>
                        </div>
                        <div className="p-5">
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                {result.message || (result.type === 'image'
                                    ? `The uploaded image was analysed using multi-model neural inference. ${isFake
                                        ? 'Significant synthetic artifacts and manipulation patterns were detected across the facial region, indicating a high probability of deepfake generation. Compression inconsistencies and frequency-domain anomalies support this assessment.'
                                        : isInconclusive
                                            ? 'Some anomalies were detected but did not meet the threshold for definitive classification. Additional analysis with higher-resolution source material is recommended.'
                                            : 'No significant manipulation artifacts were detected. The image characteristics are consistent with natural optical capture. Frequency analysis and compression patterns appear authentic.'}`
                                    : isFake
                                        ? `The uploaded video was processed through the forensic pipeline across ${result.clips_analyzed || 'multiple'} clips and ${result.top_suspicious_frames?.length || 'several'} frames were extracted. Temporal inconsistencies, synthetic artifacts, and face-swap indicators were detected across multiple frames. The scoring engine classified this content with high confidence as artificially manipulated.`
                                        : isInconclusive
                                            ? 'Video analysis showed mixed signals across extracted frames. Some temporal patterns suggest possible manipulation but confidence remains below the classification threshold. Manual review is recommended.'
                                            : `The video was processed through frame extraction, face detection, and neural inference stages. No significant deepfake indicators were found. Temporal consistency and compression patterns are consistent with authentic video capture.`
                                )}
                            </p>
                        </div>
                    </Card>

                    {/* Detailed Frame Analysis */}
                    {hasFrames && (
                        <Card className="dfk-in" style={{ '--d': '.14s' }}>
                            <div className="dfk-card-hdr">
                                <span className="dfk-section-header text-xs flex items-center gap-2">
                                    Detailed Frame Analysis
                                </span>
                                <div className="flex items-center gap-2">
                                    {hasTimeline && (
                                        <span className="text-[10px] text-muted-foreground">
                                            {result.full_forensic_timeline.length} Segments Analyzed
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="p-5">
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

                                    {/* Frames area */}
                                    <div className="lg:col-span-2">
                                        <Tabs defaultValue="timeline" className="w-full">
                                            <TabsList className="h-8 mb-4">
                                                <TabsTrigger value="timeline" className="text-[10px] gap-1 h-6 px-3">
                                                    <TrendingUp className="w-3 h-3" /> Timeline
                                                </TabsTrigger>
                                                <TabsTrigger value="grid" className="text-[10px] gap-1 h-6 px-3">
                                                    <LayoutGrid className="w-3 h-3" /> Grid
                                                </TabsTrigger>
                                            </TabsList>

                                            {/* Timeline */}
                                            <TabsContent value="timeline">
                                                <div className="space-y-1 max-h-[420px] overflow-y-auto dfk-scroll pr-1">
                                                    {result.full_forensic_timeline.map((frame, idx) => {
                                                        const bad = frame.score > .5;
                                                        return (
                                                            <div key={idx} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted transition-colors">
                                                                {frame.imageUrl && (
                                                                    <div className={`w-9 h-9 rounded-md overflow-hidden shrink-0 border-2 ${bad ? 'border-red-400' : 'border-emerald-400'}`}>
                                                                        <img 
                                                                          src={frame.imageUrl} 
                                                                          className="w-full h-full object-cover" 
                                                                          alt="" 
                                                                          onError={(e) => {
                                                                              console.error(`[Timeline Frame ${idx}] Failed to load:`, frame.imageUrl);
                                                                              e.target.parentElement.style.display = 'none';
                                                                          }}
                                                                        />
                                                                    </div>
                                                                )}
                                                                <span className="text-[10px] font-mono text-muted-foreground w-8 shrink-0">{frame.timestamp}s</span>
                                                                <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${bad ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                                    {bad ? 'SUSPICIOUS' : 'AUTHENTIC'}
                                                                </span>
                                                                <div className="flex-1 dfk-sbar-bg">
                                                                    <div className={`dfk-sbar ${bad ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${frame.score * 100}%` }} />
                                                                </div>
                                                                <span className={`text-[10px] font-bold w-8 text-right ${bad ? 'text-red-600' : 'text-emerald-600'}`}>
                                                                    {(frame.score * 100).toFixed(0)}%
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </TabsContent>

                                            {/* Grid */}
                                            <TabsContent value="grid">
                                                <div className="grid gap-2.5 dfk-fgrid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 max-h-[420px] overflow-y-auto dfk-scroll pr-1">
                                                    {result.top_suspicious_frames.map((frame, idx) => {
                                                        const bad = frame.score > .5;
                                                        return (
                                                            <div key={idx} className="rounded-lg border border-border bg-card overflow-hidden hover:shadow-md transition-shadow">
                                                                <div className="aspect-square bg-muted relative overflow-hidden">
                                                                    {frame.imageUrl 
                                                                      ? <img 
                                                                          src={frame.imageUrl} 
                                                                          alt="" 
                                                                          className="w-full h-full object-cover" 
                                                                          onError={(e) => {
                                                                              console.error(`[Grid Frame ${idx}] Failed to load:`, frame.imageUrl);
                                                                              e.target.style.display = 'none';
                                                                          }}
                                                                        />
                                                                      : <div className="w-full h-full flex items-center justify-center"><Fingerprint className="w-4 h-4 text-muted-foreground" /></div>}
                                                                    <div className="absolute top-1 left-1 px-1 py-px bg-black/60 text-[8px] text-white rounded font-mono">{frame.timestamp}s</div>
                                                                    <div className={`absolute top-1 right-1 w-2 h-2 rounded-full ${bad ? 'bg-red-500' : 'bg-emerald-500'}`} />
                                                                </div>
                                                                <div className="px-2 py-1.5 flex items-center justify-between">
                                                                    <span className={`text-[9px] font-bold ${bad ? 'text-red-600' : 'text-emerald-600'}`}>
                                                                        {bad ? 'SUS' : 'AUTH'}
                                                                    </span>
                                                                    <span className={`text-[9px] font-bold ${bad ? 'text-red-600' : 'text-emerald-600'}`}>
                                                                        {(frame.score * 100).toFixed(0)}%
                                                                    </span>
                                                                </div>
                                                                <div className="px-2 pb-1.5">
                                                                    <div className="dfk-sbar-bg">
                                                                        <div className={`dfk-sbar ${bad ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${frame.score * 100}%` }} />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </TabsContent>
                                        </Tabs>
                                    </div>

                                    {/* Scan Summary (right side) */}
                                    <div>
                                        <h3 className="dfk-section-header text-[11px] mb-3">Scan Summary</h3>
                                        <div className="space-y-2.5">
                                            <div className="bg-muted rounded-lg p-3 border border-border">
                                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Frame Count</p>
                                                <p className="text-lg font-bold text-foreground mt-0.5">{result.top_suspicious_frames?.length || 0}</p>
                                            </div>
                                            <div className="bg-muted rounded-lg p-3 border border-border">
                                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Flagged Frames</p>
                                                <p className={`text-lg font-bold mt-0.5 ${suspiciousCount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{suspiciousCount}</p>
                                            </div>
                                            <div className="bg-muted rounded-lg p-3 border border-border">
                                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Score</p>
                                                <p className="text-lg font-bold text-foreground mt-0.5">
                                                    {result.top_suspicious_frames?.length > 0
                                                        ? `${(result.top_suspicious_frames.reduce((a, f) => a + f.score, 0) / result.top_suspicious_frames.length * 100).toFixed(0)}%`
                                                        : '—'}
                                                </p>
                                            </div>
                                            <div className="bg-muted rounded-lg p-3 border border-border">
                                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Verdict</p>
                                                <p className={`text-lg font-bold mt-0.5 ${isFake ? 'text-red-600' : isInconclusive ? 'text-amber-600' : 'text-emerald-600'}`}>{result.label}</p>
                                            </div>
                                        </div>

                                        {/* Noomines/Notes section */}
                                        <div className="mt-4 p-3 bg-muted rounded-lg border border-border">
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Notes</p>
                                            <p className="text-xs text-muted-foreground leading-relaxed">
                                                The forensic detection pipeline leveraged multi-model neural analysis for robust deepfake evaluation.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </Card>
                    )}

                </div>
            )}

        </div>
    );
};

export default DeepfakeAnalysis;
