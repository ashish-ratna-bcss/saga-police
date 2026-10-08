import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ExternalLink, Image as ImageIcon, Video as VideoIcon } from 'lucide-react';
import {
    XBrandLogo,
    YoutubeBrandLogo,
    FacebookBrandLogo,
    InstagramBrandLogo,
    TelegramBrandLogo,
    RedditBrandLogo,
} from './PlatformBrandIcon';

const renderPlatformLogo = (platform) => {
    const p = String(platform || '').toLowerCase();
    if (p === 'instagram') return <InstagramBrandLogo className="h-3.5 w-3.5 text-pink-600" />;
    if (p === 'youtube') return <YoutubeBrandLogo className="h-3.5 w-3.5 text-red-600" />;
    if (p === 'facebook') return <FacebookBrandLogo className="h-3.5 w-3.5 text-blue-600" />;
    if (p === 'telegram') return <TelegramBrandLogo className="h-3.5 w-3.5 text-sky-600" />;
    if (p === 'reddit') return <RedditBrandLogo className="h-3.5 w-3.5 text-orange-600" />;
    return <XBrandLogo className="h-3.5 w-3.5" />;
};

const cleanPostText = (t) => (t || '')
    .replace(/\n*\[Image text\][\s\S]*$/i, '')
    .replace(/\*\*Intent Detected:\*\*.*?(?:\n\n|\n|$)/g, '')
    .trim();

const extractMediaItems = (alert, content) => {
    const raw = [
        ...(Array.isArray(alert?.content_details?.media) ? alert.content_details.media : []),
        ...(Array.isArray(content?.media) ? content.media : []),
        ...(Array.isArray(alert?.media) ? alert.media : []),
        ...(Array.isArray(alert?.content_details?.media_urls) ? alert.content_details.media_urls : []),
        ...(Array.isArray(content?.media_urls) ? content.media_urls : []),
    ];

    const singleUrls = [
        alert?.content_details?.image,
        alert?.content_details?.picture,
        alert?.content_details?.full_picture,
        alert?.content_details?.thumbnail,
        content?.image,
        content?.thumbnail,
        content?.picture,
        alert?.image,
    ].filter(Boolean);

    const items = [];
    const seen = new Set();

    const addUrl = (url, typeHint) => {
        if (!url || typeof url !== 'string' || seen.has(url)) return;
        seen.add(url);
        const isVideo = typeHint === 'video' || /\.(mp4|webm|mov|m3u8)(\?|$)/i.test(url) || /video/i.test(typeHint || '');
        items.push({
            url,
            type: isVideo ? 'video' : 'photo',
        });
    };

    raw.forEach(item => {
        if (!item) return;
        if (typeof item === 'string') {
            addUrl(item);
        } else if (typeof item === 'object') {
            const u = item.url || item.preview || item.src;
            addUrl(u, item.type || item.media_type);
        }
    });

    singleUrls.forEach(u => addUrl(u));
    return items;
};

// Reusable Reason Modal Component with Profile, Post Details, Media & Complete Analysis
const ReasonModal = ({ open, onClose, alert, content, analysis }) => {
    const [isPostExpanded, setIsPostExpanded] = useState(false);
    const [isContentExpanded, setIsContentExpanded] = useState(false);
    const [isImageOcrExpanded, setIsImageOcrExpanded] = useState(false);

    // --- Profile & Post Data Extraction ---
    const authorName =
        alert?.source_meta?.name ||
        alert?.author ||
        alert?.author_name ||
        content?.author ||
        content?.author_name ||
        content?.original_author_name ||
        'Unknown User';

    let rawHandle = String(
        alert?.source_meta?.handle ||
        alert?.author_handle ||
        content?.author_handle ||
        alert?.account?.handle ||
        ''
    ).trim();

    if (/^https?:\/\//i.test(rawHandle)) {
        try {
            const urlObj = new URL(rawHandle);
            const pathParts = urlObj.pathname.split('/').filter(Boolean);
            rawHandle = pathParts[pathParts.length - 1] || rawHandle;
        } catch {
            rawHandle = rawHandle.replace(/^https?:\/\/[^/]+\/?/i, '');
        }
    }
    const cleanHandle = rawHandle.replace(/^@+/, '');
    const authorHandle = cleanHandle ? `@${cleanHandle}` : '';

    const authorAvatar =
        alert?.source_meta?.profile_image_url ||
        alert?.author_avatar ||
        content?.author_avatar ||
        content?.original_author_avatar ||
        content?.author_avatar_url ||
        content?.profile_image_url ||
        alert?.account?.preview_data?.profile_image_url ||
        null;

    const isVerified = Boolean(
        alert?.source_meta?.is_verified ||
        content?.verified ||
        alert?.account?.preview_data?.is_verified
    );

    const platform = String(
        alert?.platform ||
        content?.platform ||
        alert?.account?.platforms?.slug ||
        'x'
    ).toLowerCase();

    const publishedDate = alert?.content_details?.published_at || content?.published_at || alert?.posted_at || alert?.created_at;
    const dateStr = publishedDate ? new Date(publishedDate).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }) : '';

    const contentUrl = alert?.content_url || alert?.content_details?.content_url || content?.content_url || content?.url;

    const rawPostText = alert?.content_details?.text || content?.text || alert?.raw_data?.text || '';
    const postText = cleanPostText(rawPostText);

    const mediaItems = extractMediaItems(alert, content);

    // --- Analysis Data Extraction ---
    const analysisStatus = alert?.analysis_status || content?.analysis_status || null;
    const isPendingAnalysis = analysisStatus === 'pending' || analysisStatus === 'processing';
    const isExpert = !!alert?.llm_analysis || !!alert?.analysis_result || !!content?.analysis_result || !!analysis?.llm_analysis || !!analysis?.reasoning;
    const llmIntent = alert?.llm_analysis?.intent || alert?.analysis_result?.intent || content?.analysis_result?.intent || analysis?.intent || '';

    // Extract OCR / Image Analysis data
    const imageAnalysis =
        alert?.image_analysis ||
        alert?.ocr ||
        alert?.analysis_snapshot?.image_analysis ||
        alert?.analysis_snapshot?.ocr ||
        alert?.llm_analysis?.image_analysis ||
        alert?.llm_analysis?.ocr ||
        alert?.content_details?.analysis?.image_analysis ||
        alert?.content_details?.analysis?.ocr ||
        alert?.content_details?.ocr ||
        analysis?.image_analysis ||
        analysis?.ocr ||
        content?.raw_data?.ocr ||
        content?.analysis_result?.image_analysis ||
        content?.analysis_result?.ocr ||
        null;

    const ocrText = alert?.ocr_text || content?.ocr_text || (typeof imageAnalysis === 'string'
        ? imageAnalysis
        : imageAnalysis?.full_text || imageAnalysis?.text || '');

    const detectedLangs = Array.isArray(imageAnalysis?.detected_languages)
        ? imageAnalysis.detected_languages
        : [];

    const blocksCount = Array.isArray(imageAnalysis?.blocks)
        ? imageAnalysis.blocks.length
        : 0;

    const isVideoPost =
        mediaItems.length > 0 && mediaItems.every(m => m.type === 'video');

    // A video post whose media was actually run through video analysis (not
    // just detected as video -- older rows analyzed before that feature
    // shipped fall through to isVideoPost's placeholder message instead).
    const isVideoAnalysis = imageAnalysis?.media_type === 'video';
    const videoEvents = Array.isArray(imageAnalysis?.events) ? imageAnalysis.events : [];
    const videoVisibleText = Array.isArray(imageAnalysis?.visible_text)
        ? imageAnalysis.visible_text.filter(Boolean)
        : [];

    // Expert Logic or Reasons
    const rawReasons = alert?.llm_analysis?.reasoning
        ? [alert.llm_analysis.reasoning]
        : alert?.analysis_result?.reasoning
            ? [alert.analysis_result.reasoning]
            : content?.analysis_result?.reasoning
                ? [content.analysis_result.reasoning]
                : analysis?.reasoning
                    ? [analysis.reasoning]
                    : alert?.analysis_result?.summary
                        ? [alert.analysis_result.summary]
                        : content?.analysis_result?.summary
                            ? [content.analysis_result.summary]
                            : (alert?.threat_details?.reasons || analysis?.reasons || []);

    const safeReasons = Array.isArray(rawReasons)
        ? rawReasons.filter(r => r && typeof r === 'string' && r.trim().length > 0)
        : [];

    // Auto-extract hashtags from post text if none populated in database yet
    const isEventPost = Array.isArray(content?.event_ids) && content.event_ids.length > 0;
    const textHashtags = (postText.match(/#[^\s#.,!?:;()[\]{}]+/g) || []).map(h => ({ keyword: h, type: 'hashtag' }));

    const rawKeywords = [
        ...(Array.isArray(alert?.matched_keywords_normalized) ? alert.matched_keywords_normalized : []),
        ...(Array.isArray(alert?.threat_details?.highlights) ? alert.threat_details.highlights : []),
        ...(Array.isArray(alert?.triggered_keywords) ? alert.triggered_keywords : []),
        ...(Array.isArray(alert?.analysis_result?.matched_keywords) ? alert.analysis_result.matched_keywords : []),
        ...(Array.isArray(content?.analysis_result?.matched_keywords) ? content.analysis_result.matched_keywords : []),
        ...(Array.isArray(alert?.analysis_result?.keywords) ? alert.analysis_result.keywords : []),
        ...(Array.isArray(content?.analysis_result?.keywords) ? content.analysis_result.keywords : []),
        ...(Array.isArray(content?.matched_keywords) ? content.matched_keywords : []),
        ...(Array.isArray(analysis?.triggered_keywords) ? analysis.triggered_keywords : []),
        ...(Array.isArray(alert?.highlights) ? alert.highlights : []),
        // Event posts: "Detected Keywords" are the event's own keywords only. The post's own
        // hashtags are listed separately below so they are not mistaken for event keywords.
        ...(isEventPost ? [] : textHashtags),
    ];

    const detectedKeywords = [];
    const seenKeywords = new Set();
    rawKeywords.forEach(kw => {
        const str = typeof kw === 'string' ? kw.trim() : (kw?.keyword || kw?.name || String(kw || '')).trim();
        if (str && !seenKeywords.has(str.toLowerCase())) {
            seenKeywords.add(str.toLowerCase());
            detectedKeywords.push(typeof kw === 'object' ? kw : { keyword: str });
        }
    });

    const riskScore = Math.max(
        alert?.llm_analysis?.score || 0,
        alert?.threat_details?.risk_score || 0,
        alert?.risk_score || 0,
        alert?.analysis_result?.risk_score || 0,
        content?.analysis_result?.risk_score || 0,
        content?.risk_score || 0,
        analysis?.risk_score || 0,
        analysis?.score || 0
    );

    // Policies & Laws
    const violatedPolicies =
        alert?.violated_policies ||
        alert?.analysis_result?.violated_policies ||
        alert?.analysis_result?.platform_policies_violated ||
        content?.analysis_result?.platform_policies_violated ||
        alert?.threat_details?.violated_policies ||
        (isExpert && alert?.llm_analysis?.platform_policies_violated) ||
        [];
    const legalSections =
        alert?.legal_sections ||
        alert?.analysis_result?.legal_sections ||
        alert?.analysis_result?.bns_sections_violated ||
        content?.analysis_result?.bns_sections_violated ||
        alert?.threat_details?.legal_sections ||
        (isExpert && alert?.llm_analysis?.bns_sections_violated) ||
        [];

    const riskLevel =
        alert?.risk_level ||
        alert?.analysis_result?.risk_level ||
        content?.analysis_result?.risk_level ||
        content?.risk_level ||
        analysis?.risk_level ||
        'low';
    const explanationText =
        alert?.classification_explanation ||
        alert?.llm_analysis?.reasoning ||
        alert?.analysis_result?.reasoning ||
        content?.analysis_result?.reasoning ||
        alert?.threat_details?.explanation ||
        analysis?.reasoning ||
        analysis?.explanation ||
        '';

    const resolvedCategory =
        alert?.llm_analysis?.category ||
        alert?.analysis_result?.category ||
        content?.analysis_result?.category ||
        analysis?.category ||
        alert?.category ||
        content?.category ||
        null;

    const sentiment =
        alert?.sentiment ||
        alert?.analysis_result?.sentiment ||
        content?.sentiment ||
        content?.analysis_result?.sentiment ||
        analysis?.sentiment ||
        null;

    const stance =
        alert?.stance ||
        alert?.analysis_result?.stance ||
        content?.stance ||
        content?.analysis_result?.stance ||
        analysis?.stance ||
        null;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-6">
                <DialogHeader className="border-b pb-3">
                    <DialogTitle className="text-lg font-semibold text-foreground">
                        Post & Analysis Details
                    </DialogTitle>
                </DialogHeader>

                <div className="mt-4 space-y-5">
                    {/* 1. Post Profile Details, Post Details & Media */}
                    <div className="rounded-xl border border-border/80 bg-slate-50/70 dark:bg-zinc-900/60 p-4 space-y-3.5">
                        {/* Profile Row */}
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                                {authorAvatar ? (
                                    <img
                                        src={authorAvatar}
                                        alt={authorName}
                                        className="h-10 w-10 rounded-full object-cover border border-border/80 shadow-2xs shrink-0"
                                        onError={(e) => { e.target.style.display = 'none'; }}
                                    />
                                ) : (
                                    <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                                        {authorName.charAt(0).toUpperCase()}
                                    </div>
                                )}
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-bold text-sm text-foreground truncate">{authorName}</span>
                                        {isVerified && (
                                            <span className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-sky-500 text-white text-[9px] font-bold">✓</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                                        {authorHandle && <span className="truncate">{authorHandle}</span>}
                                        {dateStr && <span>• {dateStr}</span>}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-white dark:bg-zinc-800 border border-border shadow-2xs">
                                    {renderPlatformLogo(platform)}
                                    <span className="capitalize">{platform === 'x' ? '𝕏' : platform}</span>
                                </span>

                                {contentUrl && (
                                    <Button asChild variant="outline" size="sm" className="h-7 px-2.5 text-xs gap-1.5">
                                        <a href={contentUrl} target="_blank" rel="noopener noreferrer">
                                            <ExternalLink className="h-3.5 w-3.5" />
                                            Original
                                        </a>
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* Post Text Description */}
                        {postText && (
                            <div className="pt-1">
                                <p className={`text-[13.5px] leading-relaxed text-foreground whitespace-pre-wrap select-text break-words ${isPostExpanded ? '' : 'line-clamp-4'}`}>
                                    {postText}
                                </p>
                                {(postText.length > 180 || (postText.match(/\n/g) || []).length >= 3) && (
                                    <button
                                        type="button"
                                        onClick={() => setIsPostExpanded(!isPostExpanded)}
                                        className="text-xs font-semibold text-primary hover:underline mt-1 cursor-pointer block"
                                    >
                                        {isPostExpanded ? 'Show less' : 'Read more'}
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Media Preview (if media present) */}
                        {mediaItems.length > 0 && (
                            <div className="pt-1">
                                <div className={`grid gap-2 rounded-lg overflow-hidden ${mediaItems.length === 1 ? 'grid-cols-1' : 'grid-cols-2 max-h-64'}`}>
                                    {mediaItems.slice(0, 4).map((m, idx) => (
                                        <div key={idx} className="relative rounded-lg overflow-hidden border border-border/70 bg-zinc-950 flex items-center justify-center max-h-56">
                                            {m.type === 'video' ? (
                                                <video
                                                    src={m.url}
                                                    controls
                                                    className="w-full max-h-56 object-contain"
                                                    preload="metadata"
                                                />
                                            ) : (
                                                <img
                                                    src={m.url}
                                                    alt="Post media"
                                                    className="w-full max-h-56 object-contain hover:scale-105 transition-transform duration-200 cursor-pointer"
                                                    onClick={() => window.open(m.url, '_blank')}
                                                />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 2. Analysis Details Table */}
                    <div className="border-t pt-2">
                        <table className="w-full text-sm border-collapse">
                            <tbody>
                                {/* Risk Summary */}
                                <tr className="border-b">
                                    <td className="py-3 pr-4 font-medium text-gray-600 dark:text-gray-400 w-44 align-top">Risk Summary</td>
                                    <td className="py-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-gray-500 dark:text-gray-400">Risk Level:</span>
                                            <Badge className={
                                                riskLevel.toLowerCase() === 'critical' || riskLevel.toLowerCase() === 'high' ? 'bg-red-100 text-red-700 hover:bg-red-200 border-red-200' :
                                                    riskLevel.toLowerCase() === 'medium' ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 border-amber-200' :
                                                        'bg-green-100 text-green-700 hover:bg-green-200 border-green-200'
                                            }>
                                                {riskLevel.toUpperCase()}
                                            </Badge>

                                            <span className="text-gray-400">|</span>

                                            <span className="text-gray-500 dark:text-gray-400">Risk Score:</span>
                                            <span className="font-semibold text-base text-foreground">
                                                {riskScore}%
                                            </span>

                                            {resolvedCategory && (
                                                <>
                                                    <span className="text-gray-400">|</span>
                                                    <span className="text-gray-500 dark:text-gray-400">Category:</span>
                                                    <Badge variant="outline" className="text-indigo-700 dark:text-indigo-400 border-indigo-200 bg-indigo-50 dark:bg-indigo-900/10">
                                                        {resolvedCategory}
                                                    </Badge>
                                                </>
                                            )}

                                            {llmIntent && llmIntent !== resolvedCategory && (
                                                <>
                                                    <span className="text-gray-400">|</span>
                                                    <span className="text-gray-500 dark:text-gray-400">Intent:</span>
                                                    <span className="font-medium text-gray-700 dark:text-gray-300">{llmIntent}</span>
                                                </>
                                            )}

                                            {sentiment && (
                                                <>
                                                    <span className="text-gray-400">|</span>
                                                    <span className="text-gray-500 dark:text-gray-400">Sentiment:</span>
                                                    <Badge variant="outline" className={`capitalize ${
                                                        String(sentiment).toLowerCase() === 'negative' ? 'text-rose-700 border-rose-200 bg-rose-50 dark:text-rose-300 dark:bg-rose-950/30' :
                                                        String(sentiment).toLowerCase() === 'positive' ? 'text-emerald-700 border-emerald-200 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/30' :
                                                        'text-slate-700 border-slate-200 bg-slate-50 dark:text-slate-300 dark:bg-slate-900/30'
                                                    }`}>
                                                        {sentiment}
                                                    </Badge>
                                                </>
                                            )}

                                            {stance && (
                                                <>
                                                    <span className="text-gray-400">|</span>
                                                    <span className="text-gray-500 dark:text-gray-400">Stance:</span>
                                                    <Badge variant="outline" className={`capitalize ${
                                                        String(stance).toLowerCase() === 'oppose' ? 'text-rose-700 border-rose-200 bg-rose-50 dark:text-rose-300 dark:bg-rose-950/30' :
                                                        String(stance).toLowerCase() === 'support' ? 'text-emerald-700 border-emerald-200 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/30' :
                                                        'text-amber-700 border-amber-200 bg-amber-50 dark:text-amber-300 dark:bg-amber-900/30'
                                                    }`}>
                                                        {stance}
                                                    </Badge>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>

                                {/* Detected Keywords */}
                                <tr className="border-b">
                                    <td className="py-3 pr-4 font-medium text-gray-600 dark:text-gray-400 align-top">Detected Keywords</td>
                                    <td className="py-3">
                                        {detectedKeywords.length > 0 ? (
                                            <div className="flex flex-wrap gap-1.5">
                                                {detectedKeywords.map((kw, idx) => (
                                                    <Badge key={idx} variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/10 dark:text-orange-400">
                                                        {typeof kw === 'string' ? kw : kw.keyword || String(kw)}
                                                    </Badge>
                                                ))}
                                            </div>
                                        ) : (
                                            <span className="text-gray-400 italic">None detected</span>
                                        )}
                                    </td>
                                </tr>

                                {isEventPost && textHashtags.length > 0 && (
                                    <tr className="border-b">
                                        <td className="py-3 pr-4 font-medium text-gray-600 dark:text-gray-400 align-top">Hashtags in Post</td>
                                        <td className="py-3">
                                            <div className="flex flex-wrap gap-1.5">
                                                {[...new Set(textHashtags.map((h) => h.keyword))].map((h) => (
                                                    <Badge key={h} variant="outline" className="text-xs text-gray-600 dark:text-gray-400">{h}</Badge>
                                                ))}
                                            </div>
                                        </td>
                                    </tr>
                                )}

                                 {/* Indian Laws Violated */}
                                <tr className="border-b">
                                    <td className="py-3 pr-4 font-medium text-gray-600 dark:text-gray-400 align-top">Indian Laws Violated</td>
                                    <td className="py-3">
                                        {legalSections.length > 0 ? (
                                            <div className="space-y-2">
                                                {legalSections.map((law, idx) => (
                                                    <div key={idx}>
                                                        <span className="font-semibold text-foreground">{law.act} Section {law.section}</span>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{law.description}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                                                ✓ Compliant · No legal violations
                                            </span>
                                        )}
                                    </td>
                                </tr>

                                {/* Platform Policies Violated */}
                                <tr className="border-b">
                                    <td className="py-3 pr-4 font-medium text-gray-600 dark:text-gray-400 align-top">Platform Policies Violated</td>
                                    <td className="py-3">
                                        {violatedPolicies.length > 0 ? (
                                            <div className="space-y-3">
                                                {['x', 'youtube', 'meta'].map(platformGroup => {
                                                    let policies = [];
                                                    let platformName = '';

                                                    if (platformGroup === 'x') {
                                                        policies = violatedPolicies.filter(p => (p.platform || '').toLowerCase() === 'x');
                                                        platformName = 'X (Twitter)';
                                                    } else if (platformGroup === 'youtube') {
                                                        policies = violatedPolicies.filter(p => (p.platform || '').toLowerCase() === 'youtube');
                                                        platformName = 'YouTube';
                                                    } else if (platformGroup === 'meta') {
                                                        policies = violatedPolicies.filter(p => ['facebook', 'instagram'].includes((p.platform || '').toLowerCase()));
                                                        platformName = 'Meta';

                                                        const uniqueNames = new Set();
                                                        policies = policies.filter(p => {
                                                            const name = p.name || p.policy_name || p.policy_id || String(p);
                                                            if (uniqueNames.has(name)) return false;
                                                            uniqueNames.add(name);
                                                            return true;
                                                        });
                                                    }

                                                    if (policies.length === 0) return null;

                                                    return (
                                                        <div key={platformGroup}>
                                                            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{platformName}</div>
                                                            <div className="space-y-1">
                                                                {policies.map((p, idx) => (
                                                                    <div key={idx} className="text-sm border-l-2 border-gray-200 dark:border-gray-700 pl-2">
                                                                        {p.name || p.policy_name || p.policy_id || String(p)}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                                {violatedPolicies.some(p => !['x', 'youtube', 'facebook', 'instagram'].includes((p.platform || '').toLowerCase())) && (
                                                    <div>
                                                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Other</div>
                                                        <div className="space-y-1">
                                                            {violatedPolicies.filter(p => !['x', 'youtube', 'facebook', 'instagram'].includes((p.platform || '').toLowerCase())).map((p, idx) => (
                                                                <div key={idx} className="text-sm border-l-2 border-gray-200 dark:border-gray-700 pl-2">
                                                                    {p.name || p.policy_name || p.policy_id || String(p)}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                                                ✓ Compliant · No policy violations
                                            </span>
                                        )}
                                    </td>
                                </tr>

                                {/* Expert Logic */}
                                <tr className="border-b">
                                    <td className="py-3 pr-4 font-medium text-gray-600 dark:text-gray-400 align-top">Expert Logic</td>
                                    <td className="py-3">
                                        <div className="space-y-2 text-gray-700 dark:text-gray-300">
                                            {alert?.llm_analysis?.reasoning ? (
                                                <div className="leading-relaxed">{alert.llm_analysis.reasoning}</div>
                                            ) : safeReasons.length > 0 ? (
                                                <ul className="list-disc pl-4 space-y-1">
                                                    {safeReasons.map((r, i) => (
                                                        <li key={i}>{r}</li>
                                                    ))}
                                                </ul>
                                            ) : isPendingAnalysis ? (
                                                <span className="text-amber-600 dark:text-amber-400 italic">AI intelligence analysis is currently in progress…</span>
                                            ) : (
                                                <span className="text-gray-500 dark:text-gray-400">Standard event post collected during keyword & hashtag monitoring. No high-priority threat indicators flagged.</span>
                                            )}
                                        </div>
                                    </td>
                                </tr>

                                {/* AI Analysis */}
                                <tr className="border-b">
                                    <td className="py-3 pr-4 font-medium text-gray-600 dark:text-gray-400 align-top">AI Analysis</td>
                                    <td className="py-3">
                                        <div className={`whitespace-pre-wrap leading-relaxed text-foreground ${isContentExpanded ? '' : 'line-clamp-3'}`}>
                                            {alert?.description || content?.description || alert?.analysis_result?.summary || content?.analysis_result?.summary || alert?.llm_analysis?.summary || (
                                                isPendingAnalysis
                                                    ? 'AI Intelligence analysis is currently processing for this post.'
                                                    : 'Monitored and categorized under event stream.'
                                            )}
                                        </div>
                                        {((alert?.description || content?.description || alert?.analysis_result?.summary || content?.analysis_result?.summary || '')?.length > 100) && (
                                            <button
                                                type="button"
                                                onClick={() => setIsContentExpanded(!isContentExpanded)}
                                                className="text-xs text-blue-600 dark:text-blue-400 font-medium mt-1 hover:underline cursor-pointer block"
                                            >
                                                {isContentExpanded ? 'View Less' : 'View More'}
                                            </button>
                                        )}
                                    </td>
                                </tr>

                                {/* Media Analysis (Video description, or Image OCR extraction) */}
                                <tr className="border-b">
                                    <td className="py-3 pr-4 font-medium text-gray-600 dark:text-gray-400 align-top">
                                        <div className="flex items-center gap-1.5">
                                            {isVideoAnalysis ? (
                                                <VideoIcon className="h-4 w-4 text-purple-600 dark:text-purple-400 shrink-0" />
                                            ) : (
                                                <ImageIcon className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                                            )}
                                            <span>{isVideoAnalysis ? 'Video Analysis' : 'Image Analysis'}</span>
                                        </div>
                                    </td>
                                    <td className="py-3">
                                        {isVideoAnalysis ? (
                                            imageAnalysis?.failed || imageAnalysis?.error ? (
                                                <div className="text-xs text-amber-600 dark:text-amber-400 italic">
                                                    Extraction failed: {imageAnalysis.error}
                                                </div>
                                            ) : (imageAnalysis?.description || imageAnalysis?.summary || videoVisibleText.length > 0) ? (
                                                <div className="space-y-2">
                                                    {/* Duration & scene-event count badges */}
                                                    {(imageAnalysis?.duration_seconds != null || videoEvents.length > 0) && (
                                                        <div className="flex flex-wrap items-center gap-1.5">
                                                            {imageAnalysis?.duration_seconds != null && (
                                                                <Badge
                                                                    variant="outline"
                                                                    className="text-[10px] uppercase font-semibold bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400"
                                                                >
                                                                    {Math.round(imageAnalysis.duration_seconds)}s
                                                                </Badge>
                                                            )}
                                                            {videoEvents.length > 0 && (
                                                                <span className="text-[11px] text-gray-400">
                                                                    {videoEvents.length} scene{videoEvents.length === 1 ? '' : 's'} detected
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}

                                                    {imageAnalysis?.summary && (
                                                        <div className="text-[11px] text-gray-500 dark:text-gray-400 italic">
                                                            {imageAnalysis.summary}
                                                        </div>
                                                    )}

                                                    {imageAnalysis?.description && (
                                                        <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-200/80 dark:border-gray-700/80 text-xs text-gray-800 dark:text-gray-200 leading-relaxed font-sans whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
                                                            {imageAnalysis.description}
                                                        </div>
                                                    )}

                                                    {videoVisibleText.length > 0 && (
                                                        <div>
                                                            <div className="text-[11px] text-gray-400 mb-1">On-screen text</div>
                                                            <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-200/80 dark:border-gray-700/80 text-xs text-gray-800 dark:text-gray-200 leading-relaxed font-sans whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
                                                                {videoVisibleText.join('\n\n')}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-gray-400 italic text-xs">No video content extracted</span>
                                            )
                                        ) : ocrText ? (
                                            <div className="space-y-2">
                                                {/* Language & Block count badges */}
                                                {(detectedLangs.length > 0 || blocksCount > 0) && (
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        {detectedLangs.map((lang, idx) => (
                                                            <Badge
                                                                key={idx}
                                                                variant="outline"
                                                                className="text-[10px] uppercase font-semibold bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400"
                                                            >
                                                                {lang}
                                                            </Badge>
                                                        ))}
                                                        {blocksCount > 0 && (
                                                            <span className="text-[11px] text-gray-400">
                                                                {blocksCount} text {blocksCount === 1 ? 'block' : 'blocks'} detected
                                                            </span>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Extracted text container - full text with scroll if long */}
                                                <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-200/80 dark:border-gray-700/80 text-xs text-gray-800 dark:text-gray-200 leading-relaxed font-sans whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
                                                    {ocrText}
                                                </div>
                                            </div>
                                        ) : imageAnalysis?.error ? (
                                            <div className="text-xs text-amber-600 dark:text-amber-400 italic">
                                                Extraction failed: {imageAnalysis.error}
                                            </div>
                                        ) : isVideoPost ? (
                                            <span className="text-gray-400 italic text-xs">Video content — not yet analyzed</span>
                                        ) : (
                                            <span className="text-gray-400 italic text-xs">No image text extracted or text-only post</span>
                                        )}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default ReasonModal;
