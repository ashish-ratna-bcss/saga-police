import React, { useState, useMemo, useCallback, useRef, useEffect, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import axios from 'axios';
import {
    Search, User, Users, Monitor, ExternalLink,
    Loader2, AlertCircle, Download,
    Globe, Heart, MessageCircle, Eye, Repeat2, ArrowUpRight,
    Hash, ChevronDown, X, RefreshCw, Share2, StopCircle, ArrowLeft, History, CheckCircle2,
    Sparkles, Shield, Radio, Flame, ArrowRight, Layers, Zap, TrendingUp, Info, Check, CornerDownLeft, Activity, Compass, FileText
} from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import { Badge } from '../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import AddSocialProfileDialog from '../../components/AddSocialProfileDialog';
import { socialProfilesApi } from '../../api/socialProfiles.api';
import { usePagePlatforms } from '../../hooks/usePagePlatforms';
import { cn } from '../../lib/utils';
import {
    AllPlatformsLogo,
    XBrandLogo,
    YoutubeBrandLogo,
    FacebookBrandLogo,
    InstagramBrandLogo,
    TelegramBrandLogo,
} from '../../components/PlatformBrandIcon';

const normalizePlatformKey = (platform) => {
    const p = String(platform || '').trim().toLowerCase();
    if (p === 'twitter') return 'x';
    return p;
};

/** Presentation styles/icons only — platform list + labels come from tenant DB. */
const PLATFORM_STYLES = {
    all: { icon: AllPlatformsLogo, color: 'from-slate-600 to-slate-800', bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300' },
    x: { icon: XBrandLogo, color: 'from-gray-900 to-black', bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-900 dark:text-gray-100', border: 'border-gray-300' },
    youtube: { icon: YoutubeBrandLogo, color: 'from-red-500 to-red-700', bg: 'bg-red-50 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', border: 'border-red-200' },
    facebook: { icon: FacebookBrandLogo, color: 'from-blue-500 to-blue-700', bg: 'bg-blue-50 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200' },
    instagram: { icon: InstagramBrandLogo, color: 'from-purple-500 via-pink-500 to-orange-400', bg: 'bg-pink-50 dark:bg-pink-900/30', text: 'text-pink-700 dark:text-pink-300', border: 'border-pink-200' },
    telegram: { icon: TelegramBrandLogo, color: 'from-sky-500 to-sky-700', bg: 'bg-sky-50 dark:bg-sky-900/30', text: 'text-sky-700 dark:text-sky-300', border: 'border-sky-200' },
};

const platformStyle = (key) => PLATFORM_STYLES[normalizePlatformKey(key)] || PLATFORM_STYLES.all;

const fallbackPlatformLabel = (slug) => {
    const key = normalizePlatformKey(slug);
    if (!key || key === 'all') return 'All Platforms';
    if (key === 'x') return 'X';
    return String(key).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};


const stripHandle = (value) => String(value || '').trim().replace(/^@+/, '').toLowerCase();

const identityTokens = (platform, value) => {
    const tokens = new Set();
    const raw = String(value || '').trim();
    if (!raw) return tokens;
    const p = normalizePlatformKey(platform);

    if (p === 'telegram') {
        const fromUrl = raw.match(/(?:t\.me|telegram\.me)\/([A-Za-z0-9_]+)/i);
        if (fromUrl?.[1]) tokens.add(fromUrl[1].toLowerCase());
        const cleaned = stripHandle(raw).replace(/^https?:\/\//, '');
        if (cleaned && !cleaned.includes('/') && !cleaned.includes('.')) tokens.add(cleaned);
        if (/^-?\d+$/.test(raw)) tokens.add(raw);
        return tokens;
    }

    if (p === 'youtube') {
        const cleaned = stripHandle(raw);
        if (cleaned) tokens.add(cleaned);
        const ch = raw.match(/youtube\.com\/(?:channel\/|@)?([^\s/?#]+)/i);
        if (ch?.[1]) tokens.add(ch[1].toLowerCase());
        return tokens;
    }

    if (p === 'facebook') {
        const cleaned = stripHandle(raw);
        if (cleaned) tokens.add(cleaned);
        const page = raw.match(/facebook\.com\/([^\s/?#]+)/i);
        if (page?.[1]) tokens.add(page[1].toLowerCase());
        return tokens;
    }

    const cleaned = stripHandle(raw);
    if (cleaned) tokens.add(cleaned);
    return tokens;
};

const addIdentityKeys = (keys, platform, value) => {
    const p = normalizePlatformKey(platform);
    if (!p) return;
    for (const token of identityTokens(p, value)) {
        keys.add(`${p}:${token}`);
    }
};

const catalogIdentityKeys = (row) => {
    const keys = new Set();
    const p = row?.platform;
    addIdentityKeys(keys, p, row?.handle);
    addIdentityKeys(keys, p, row?.data?.username);
    addIdentityKeys(keys, p, row?.data?.handle);
    addIdentityKeys(keys, p, row?.data?.url);
    addIdentityKeys(keys, p, row?.data?.channel_url);
    addIdentityKeys(keys, p, row?.data?.channel_id);
    addIdentityKeys(keys, p, row?.data?.page_id);
    addIdentityKeys(keys, p, row?.data?.user_id);
    return keys;
};

const searchItemIdentityKeys = (item) => {
    const keys = new Set();
    const p = item?._platform || item?.platform;
    addIdentityKeys(keys, p, item?.screen_name);
    addIdentityKeys(keys, p, item?.username);
    addIdentityKeys(keys, p, item?.author_handle);
    addIdentityKeys(keys, p, item?.url);
    addIdentityKeys(keys, p, item?.profile_url);
    addIdentityKeys(keys, p, item?.customUrl);
    addIdentityKeys(keys, p, item?.channel_id);
    addIdentityKeys(keys, p, item?.channelId);
    addIdentityKeys(keys, p, item?.page_id);
    addIdentityKeys(keys, p, item?.id);
    return keys;
};

const isAlreadyInCatalog = (item, monitoredKeys) => {
    if (!monitoredKeys?.size) return false;
    for (const key of searchItemIdentityKeys(item)) {
        if (monitoredKeys.has(key)) return true;
    }
    return false;
};

const formatIST = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: diffDays > 365 ? 'numeric' : undefined });
};

const formatNumber = (num) => {
    const n = Number(num) || 0;
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toLocaleString();
};

const PlatformPill = ({ platformKey, label, small }) => {
    const cfg = platformStyle(platformKey);
    const Icon = cfg.icon;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-white bg-gradient-to-r ${cfg.color} ${small ? 'text-[10px]' : 'text-xs'} font-medium`}>
            <Icon className={small ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
            {!small && (label || fallbackPlatformLabel(platformKey))}
        </span>
    );
};

const TEXT_CLAMP_LENGTH = 200;
const CONTENT_RANGE_OPTIONS = ['20', '40', '60', '80', '100'];

const INVESTIGATION_VECTORS = [
    { label: 'Cyber Fraud & Scams', query: 'cyber fraud fake account', type: 'content' },
    { label: 'Official Spokesperson', query: 'Odisha Police official', type: 'profiles' },
    { label: 'Deepfake & Impersonation', query: 'deepfake viral video', type: 'content' },
    { label: 'Law & Order Intel', query: 'protest rally disturbance', type: 'content' },
    { label: 'Disinformation Alerts', query: 'rumor fake news', type: 'content' },
];

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildResultSearchText = (item) => {
    if (!item || typeof item !== 'object') return '';
    return [
        item.text,
        item.title,
        item.description,
        item.author,
        item.author_handle,
        item.channelTitle,
        item.screen_name,
        item.name,
        item.url,
        item.content_url
    ]
        .filter(Boolean)
        .map((v) => String(v).toLowerCase())
        .join(' ');
};

const doesResultMatch = (item, searchText) => {
    const normalizedSearch = String(searchText || '').trim().toLowerCase();
    if (!normalizedSearch) return true;

    const terms = normalizedSearch.split(/\s+/).filter(Boolean);
    if (!terms.length) return true;

    const haystack = buildResultSearchText(item);
    if (!haystack) return false;

    return haystack.includes(normalizedSearch) || terms.every((term) => haystack.includes(term));
};

const highlightText = (text, searchText) => {
    const raw = String(text || '');
    const normalized = String(searchText || '').trim();
    if (!raw || !normalized) return raw;

    const terms = Array.from(new Set(normalized.split(/\s+/).filter(Boolean))).slice(0, 8);
    if (!terms.length) return raw;

    const tokenSource = terms.map(escapeRegExp).join('|');
    const splitRegex = new RegExp(`(${tokenSource})`, 'ig');
    const exactRegex = new RegExp(`^(${tokenSource})$`, 'i');
    const parts = raw.split(splitRegex);

    return parts.map((part, idx) => (
        exactRegex.test(part)
            ? <mark key={`${part}-${idx}`} className="bg-amber-200/80 text-foreground px-0.5 rounded-sm">{part}</mark>
            : <React.Fragment key={`${part}-${idx}`}>{part}</React.Fragment>
    ));
};

const ContentCard = memo(({ item, index, getContentUrl, onMonitor, highlightQuery = '', isMonitored = false }) => {
    const [expanded, setExpanded] = useState(false);
    const textRef = React.useRef(null);
    const [isOverflowing, setIsOverflowing] = useState(false);
    const p = item._platform || 'x';
    const cfg = platformStyle(p);
    const contentUrl = getContentUrl(item);
    const likes = item.metrics?.likes || item.statistics?.likeCount || 0;
    const comments = item.metrics?.comments || item.statistics?.commentCount || 0;
    const views = item.metrics?.views || item.statistics?.viewCount || 0;
    const shares = item.metrics?.retweets || item.metrics?.shares || 0;
    const contentText = item.text || item.description || item.title || '';
    const thumbnail = item.thumbnails?.medium?.url || item.thumbnails?.default?.url || null;

    React.useEffect(() => {
        const el = textRef.current;
        if (el) setIsOverflowing(el.scrollHeight > el.clientHeight);
    }, [contentText]);

    return (
        <div className="group bg-card rounded-xl border border-border hover:shadow-lg hover:border-border/80 transition-all duration-200 overflow-hidden flex flex-col">
            <div className="p-4 flex flex-col flex-1">
                {/* Author row */}
                <div className="flex items-center gap-3 mb-3">
                    <Avatar className="h-9 w-9 border border-border flex-shrink-0">
                        <AvatarImage src={item.author_avatar || item.thumbnails?.default?.url} />
                        <AvatarFallback className={`${cfg.bg} ${cfg.text} text-xs font-semibold`}>
                            {(item.author || item.channelTitle || '?')[0]?.toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-foreground truncate">{highlightText(item.author || item.channelTitle || 'Unknown', highlightQuery)}</span>
                            <PlatformPill platformKey={p} small />
                        </div>
                        {(item.author_handle || item.created_at || item.publishedAt) && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                {item.author_handle && <span>@{highlightText(item.author_handle, highlightQuery)}</span>}
                                {(item.created_at || item.publishedAt) && (
                                    <span>· {formatIST(item.created_at || item.publishedAt)}</span>
                                )}
                            </div>
                        )}
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                        onClick={() => window.open(contentUrl, '_blank', 'noopener,noreferrer')}
                    >
                        <ArrowUpRight className="h-4 w-4" />
                    </Button>
                </div>

                {/* Content — fixed height when collapsed */}
                <div className="flex gap-3 flex-1">
                    <div className="flex-1 min-w-0">
                        <div
                            ref={textRef}
                            className={`text-sm text-foreground/80 leading-relaxed whitespace-pre-line break-words overflow-hidden transition-all ${expanded ? '' : 'line-clamp-4'}`}
                        >
                            {highlightText(contentText, highlightQuery)}
                        </div>
                        {isOverflowing && (
                            <button
                                type="button"
                                onClick={() => setExpanded(e => !e)}
                                className="mt-1.5 text-xs font-medium text-primary hover:text-primary/80 flex items-center gap-0.5 transition-colors"
                            >
                                {expanded ? 'Show less' : 'Read more'}
                                <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                            </button>
                        )}
                    </div>
                    {thumbnail && p === 'youtube' && (
                        <div className="flex-shrink-0 w-32 h-20 rounded-lg overflow-hidden bg-muted">
                            <img src={thumbnail} alt="" className="w-full h-full object-cover" />
                        </div>
                    )}
                </div>

                {/* Engagement metrics */}
                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/50">
                    {likes > 0 && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Heart className="h-3.5 w-3.5" />
                            {formatNumber(likes)}
                        </span>
                    )}
                    {comments > 0 && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MessageCircle className="h-3.5 w-3.5" />
                            {formatNumber(comments)}
                        </span>
                    )}
                    {shares > 0 && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Repeat2 className="h-3.5 w-3.5" />
                            {formatNumber(shares)}
                        </span>
                    )}
                    {views > 0 && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Eye className="h-3.5 w-3.5" />
                            {formatNumber(views)}
                        </span>
                    )}
                    <div className="flex-1" />
                    <Button
                        variant="outline"
                        size="sm"
                        className={`h-6 text-xs px-2 gap-1 ${isMonitored ? 'text-emerald-700 border-emerald-300 bg-emerald-50' : ''}`}
                        onClick={() => !isMonitored && onMonitor?.(item)}
                        disabled={isMonitored}
                    >
                        {isMonitored ? (
                            <>
                                <CheckCircle2 className="h-3 w-3" /> Monitored
                            </>
                        ) : (
                            <>
                                <Monitor className="h-3 w-3" /> Monitor
                            </>
                        )}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 px-2 gap-1"
                        onClick={() => window.open(contentUrl, '_blank', 'noopener,noreferrer')}
                    >
                        View <ExternalLink className="h-3 w-3" />
                    </Button>
                </div>
            </div>
        </div>
    );
});

const GlobalSearch = () => {
    const navigate = useNavigate();
    const {
        platforms: pagePlatformRows,
        slugs: configuredPlatforms,
        loading: platformsLoading,
    } = usePagePlatforms('global_search');
    const platformNames = useMemo(() => {
        const map = new Map();
        for (const row of pagePlatformRows) {
            const slug = normalizePlatformKey(row?.slug);
            if (!slug) continue;
            const name = String(row?.name || '').trim();
            if (name) map.set(slug, name);
        }
        return map;
    }, [pagePlatformRows]);
    const platformLabel = useCallback((slug) => {
        const key = normalizePlatformKey(slug);
        if (!key || key === 'all') return 'All Platforms';
        return platformNames.get(key) || fallbackPlatformLabel(key);
    }, [platformNames]);
    const [platform, setPlatform] = useState('all');
    const [searchType, setSearchType] = useState('profiles');
    const [resultLimit, setResultLimit] = useState('20');
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [resultFilter, setResultFilter] = useState('all');
    const [searched, setSearched] = useState(false);
    const [platformErrors, setPlatformErrors] = useState({});
    const [completedPlatforms, setCompletedPlatforms] = useState(new Set());
    const [viewMode, setViewMode] = useState('search');

    const [historyItems, setHistoryItems] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyDetailLoadingId, setHistoryDetailLoadingId] = useState(null);
    const [historyFilters, setHistoryFilters] = useState({
        q: '',
        searchType: 'all',
        platform: 'all',
        from: '',
        to: ''
    });
    const [historyPagination, setHistoryPagination] = useState({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 1
    });
    const [historySelectedRecord, setHistorySelectedRecord] = useState(null);
    const historyDebounceRef = useRef(null);
    const [addProfileOpen, setAddProfileOpen] = useState(false);
    const [addProfilePrefill, setAddProfilePrefill] = useState(null);
    const [monitoredKeys, setMonitoredKeys] = useState(() => new Set());
    const [recentSearches, setRecentSearches] = useState([]);

    const loadRecentSearches = useCallback(async () => {
        try {
            const res = await api.get('/search/history', { params: { page: 1, limit: 6 } });
            const items = Array.isArray(res.data?.items) ? res.data.items : [];
            setRecentSearches(items.slice(0, 5));
        } catch (_) {}
    }, []);

    useEffect(() => {
        loadRecentSearches();
    }, [loadRecentSearches, searched]);

    const loadMonitoredCatalog = useCallback(async () => {
        try {
            const res = await socialProfilesApi.list({});
            const rows = Array.isArray(res.data?.profiles) ? res.data.profiles : [];
            const next = new Set();
            rows.forEach((row) => {
                catalogIdentityKeys(row).forEach((key) => next.add(key));
            });
            setMonitoredKeys(next);
        } catch (_) {
            // Non-blocking — Monitor still works without catalog cache
        }
    }, []);

    useEffect(() => {
        loadMonitoredCatalog();
    }, [loadMonitoredCatalog]);

    // Abort controller ref
    const abortRef = useRef(null);

    const loadHistory = useCallback(async (page = 1, overrideFilters = null) => {
        setHistoryLoading(true);
        try {
            const activeFilters = overrideFilters || historyFilters;
            const params = {
                page,
                limit: historyPagination.limit
            };

            if (activeFilters.q.trim()) params.q = activeFilters.q.trim();
            if (activeFilters.searchType !== 'all') params.searchType = activeFilters.searchType;
            if (activeFilters.platform !== 'all') params.platform = activeFilters.platform;
            if (activeFilters.from) params.from = activeFilters.from;
            if (activeFilters.to) params.to = activeFilters.to;

            const response = await api.get('/search/history', { params });
            setHistoryItems(Array.isArray(response.data?.items) ? response.data.items : []);
            setHistoryPagination(response.data?.pagination || {
                page: 1,
                limit: historyPagination.limit,
                total: 0,
                totalPages: 1
            });
        } catch (error) {
            console.error('Failed to load search history:', error);
            toast.error(error?.response?.data?.error || 'Failed to load search history');
        } finally {
            setHistoryLoading(false);
        }
    }, [historyFilters, historyPagination.limit]);

    const openHistoryRecord = useCallback(async (historyId) => {
        setHistoryDetailLoadingId(historyId);
        try {
            const response = await api.get(`/search/history/${historyId}`);
            const record = response.data || {};
            const historyResults = Array.isArray(record.results) ? record.results : [];
            const normalizedResults = historyResults.map((item) => {
                const sourcePlatform = item?._platform || item?.platform || record.platform || 'all';
                return { ...item, _platform: sourcePlatform };
            });

            setHistorySelectedRecord({
                ...record,
                results: normalizedResults,
                search_type: record.search_type || 'profiles',
                platform: record.platform || 'all'
            });
            toast.success('Loaded history results');
        } catch (error) {
            console.error('Failed to open search history record:', error);
            toast.error(error?.response?.data?.error || 'Failed to open search history item');
        } finally {
            setHistoryDetailLoadingId(null);
        }
    }, []);

    useEffect(() => {
        if (viewMode !== 'history') return;

        if (historyDebounceRef.current) {
            clearTimeout(historyDebounceRef.current);
        }

        historyDebounceRef.current = setTimeout(() => {
            loadHistory(1);
        }, 260);

        return () => {
            if (historyDebounceRef.current) {
                clearTimeout(historyDebounceRef.current);
            }
        };
    }, [
        viewMode,
        historyFilters.q,
        historyFilters.searchType,
        historyFilters.platform,
        historyFilters.from,
        historyFilters.to,
        loadHistory
    ]);

    useEffect(() => {
        if (viewMode !== 'history') {
            setHistorySelectedRecord(null);
        }
    }, [viewMode]);

    const handleSearch = useCallback(async (e, overrideQuery = null, overrideType = null, overridePlatform = null) => {
        e?.preventDefault?.();
        const activeQuery = String(overrideQuery !== null ? overrideQuery : query).trim();
        const activeType = overrideType !== null ? overrideType : searchType;
        const activePlatform = overridePlatform !== null ? overridePlatform : platform;

        if (overrideQuery !== null) setQuery(overrideQuery);
        if (overrideType !== null) setSearchType(overrideType);
        if (overridePlatform !== null) setPlatform(overridePlatform);

        if (!activeQuery) return;
        if (!configuredPlatforms.length) {
            toast.error('No platforms configured. Add platforms under Settings → Platforms.');
            return;
        }
        if (activePlatform !== 'all' && !configuredPlatforms.includes(activePlatform)) {
            toast.error('Selected platform is not configured for this account.');
            return;
        }

        const isContentSearch = activeType === 'content';
        const activeLimit = isContentSearch ? Number(resultLimit) : 20;

        const startedAt = Date.now();

        // Abort any previous search
        if (abortRef.current) abortRef.current.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setResults([]);
        setSearched(true);
        setPlatformErrors({});
        setCompletedPlatforms(new Set());

        try {
            const endpoint = activeType === 'profiles' ? '/search/profiles' : '/search/content';
            const timeout = 45000;
            let combinedResults = [];
            let combinedErrors = {};
            let combinedCounts = {};

            if (activePlatform === 'all') {
                const platformKeys = configuredPlatforms;

                // Create an abort-aware wrapper that rejects immediately on abort
                const abortPromise = new Promise((_, reject) => {
                    controller.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
                });

                const fetchAll = Promise.allSettled(
                    platformKeys.map(p =>
                        api.get(endpoint, {
                            params: {
                                platform: p,
                                query: activeQuery,
                                limit: activeLimit
                            },
                            timeout,
                            signal: controller.signal
                        })
                    )
                );

                const settled = await Promise.race([fetchAll, abortPromise]);

                const combined = [];
                const errors = {};
                settled.forEach((result, idx) => {
                    const p = platformKeys[idx];
                    if (result.status === 'fulfilled') {
                        const data = Array.isArray(result.value.data) ? result.value.data : [];
                        combined.push(...data.map(item => ({ ...item, _platform: item._platform || item.platform || p })));
                        combinedCounts[p] = data.length;
                    } else {
                        if (axios.isCancel(result.reason) || result.reason?.name === 'AbortError' || result.reason?.code === 'ERR_CANCELED') return;
                        const errMsg = result.reason?.response?.data?.error || result.reason?.message || 'Failed';
                        errors[p] = errMsg.includes('timeout') ? 'Timed out' : errMsg;
                        combinedCounts[p] = 0;
                    }
                });
                setPlatformErrors(errors);
                setCompletedPlatforms(new Set(platformKeys));
                // Sort combined results by most recent first
                combined.sort((a, b) => {
                    const timeA = new Date(a.created_at || a.timestamp || a.publishedAt || 0).getTime();
                    const timeB = new Date(b.created_at || b.timestamp || b.publishedAt || 0).getTime();
                    return timeB - timeA;
                });
                setResults(combined);
                combinedResults = combined;
                combinedErrors = errors;
            } else {
                const response = await api.get(endpoint, {
                    params: {
                        platform: activePlatform,
                        query: activeQuery,
                        limit: activeLimit
                    },
                    timeout,
                    signal: controller.signal
                });
                const data = Array.isArray(response.data) ? response.data : [];
                const mapped = data.map(item => ({ ...item, _platform: item._platform || item.platform || activePlatform }));
                setResults(mapped);
                setCompletedPlatforms(new Set([activePlatform]));
                combinedResults = mapped;
                combinedErrors = {};
                combinedCounts = { [activePlatform]: mapped.length };
            }

            try {
                await api.post('/search/history', {
                    query: activeQuery,
                    searchType: activeType,
                    platform: activePlatform,
                    results: combinedResults,
                    platformCounts: combinedCounts,
                    platformErrors: combinedErrors,
                    durationMs: Date.now() - startedAt,
                    searchedAt: new Date(startedAt).toISOString()
                });
            } catch (historyError) {
                console.warn('Search history save failed:', historyError?.message || historyError);
            }
        } catch (error) {
            if (axios.isCancel(error) || error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
                toast.info('Search cancelled');
                return;
            }
            console.error('Search error:', error);
            const msg = error?.code === 'ECONNABORTED' ? 'Search timed out. Try a specific platform.' : (error?.response?.data?.error || 'Search failed. Please try again.');
            toast.error(msg);
        } finally {
            if (!controller.signal.aborted) {
                setLoading(false);
            }
        }
    }, [query, platform, searchType, resultLimit, configuredPlatforms]);

    const buildSocialProfilePrefill = useCallback((source) => {
        const sourcePlatform = String(source._platform || source.platform || platform || '')
            .trim()
            .toLowerCase()
            .replace(/^twitter$/, 'x');
        const cleanHandle = (value) => String(value || '').trim().replace(/^@/, '');
        const handle = cleanHandle(
            source.screen_name || source.username || source.author_handle || source.id || ''
        );
        const displayName = String(source.name || source.title || handle || '').trim();
        const url = String(source.url || source.profile_url || '').trim();
        const data = {};

        if (sourcePlatform === 'telegram') {
            if (handle) data.username = handle;
            if (url) data.url = url;
            else if (handle) data.url = `https://t.me/${handle}`;
            if (source.id && String(source.id) !== handle) data.channel_id = String(source.id);
        } else if (sourcePlatform === 'facebook') {
            data.url = url || (handle ? `https://www.facebook.com/${handle}` : '');
            if (source.page_id) data.page_id = String(source.page_id);
        } else if (sourcePlatform === 'youtube') {
            data.channel_url =
                url ||
                source.customUrl ||
                (handle ? `https://www.youtube.com/@${handle}` : '');
            if (source.channel_id || source.channelId) {
                data.channel_id = String(source.channel_id || source.channelId);
            }
        } else if (sourcePlatform === 'x' || sourcePlatform === 'instagram') {
            data.username = handle;
        } else {
            data.username = handle;
            if (url) data.url = url;
        }

        return {
            platform: sourcePlatform || 'telegram',
            display_name: displayName,
            data,
        };
    }, [platform]);

    const openMonitorDialog = useCallback((source) => {
        if (isAlreadyInCatalog(source, monitoredKeys)) {
            toast.message('Already in Social Profiles');
            return;
        }
        const prefill = buildSocialProfilePrefill(source);
        if (!prefill.platform) {
            toast.error('Unable to identify platform for this result');
            return;
        }
        const hasField = Object.values(prefill.data || {}).some((v) => String(v || '').trim());
        if (!hasField) {
            toast.error('Unable to identify handle for this result');
            return;
        }
        setAddProfilePrefill(prefill);
        setAddProfileOpen(true);
    }, [buildSocialProfilePrefill, monitoredKeys]);

    const openMonitorDialogFromContent = useCallback((contentItem) => {
        if (!contentItem) return;

        const sourcePlatform = contentItem._platform || contentItem.platform || platform;
        const cleanHandle = (value) => String(value || '').trim().replace(/^@/, '');

        let identifier = '';
        if (sourcePlatform === 'youtube') {
            identifier = cleanHandle(contentItem.channelId || contentItem.channel_id || contentItem.author_handle || contentItem.author || contentItem.id);
        } else if (sourcePlatform === 'x' || sourcePlatform === 'instagram' || sourcePlatform === 'telegram') {
            identifier = cleanHandle(contentItem.author_handle || contentItem.screen_name || contentItem.author || contentItem.id);
        } else if (sourcePlatform === 'facebook') {
            identifier = cleanHandle(contentItem.author_handle || contentItem.author || contentItem.page_id || contentItem.id);
        } else {
            identifier = cleanHandle(contentItem.author_handle || contentItem.author || contentItem.id);
        }

        if (!identifier) {
            toast.error('Unable to identify source handle for this result');
            return;
        }

        const displayName = String(contentItem.author || contentItem.channelTitle || identifier).trim();
        const followers = contentItem.followers_count || contentItem.statistics?.subscriberCount || 0;

        openMonitorDialog({
            _platform: sourcePlatform,
            id: identifier,
            screen_name: identifier,
            username: identifier,
            name: displayName,
            title: displayName,
            url: contentItem.url || contentItem.author_url || '',
            followers_count: followers
        });
    }, [openMonitorDialog, platform]);

    // Filtered results
    const filteredResults = useMemo(() => {
        if (resultFilter === 'all') return results;
        return results.filter(item => item._platform === resultFilter);
    }, [results, resultFilter]);

    // Platform stats
    const platformCounts = useMemo(() => {
        const counts = {};
        results.forEach(r => {
            const p = r._platform || 'unknown';
            counts[p] = (counts[p] || 0) + 1;
        });
        return counts;
    }, [results]);

    const hasActiveHistoryFilters = useMemo(() => {
        return Boolean(
            historyFilters.q.trim() ||
            historyFilters.searchType !== 'all' ||
            historyFilters.platform !== 'all' ||
            historyFilters.from ||
            historyFilters.to
        );
    }, [historyFilters]);

    const historySelectedFilteredResults = useMemo(() => {
        if (!historySelectedRecord) return [];

        if (
            historyFilters.searchType !== 'all' &&
            historySelectedRecord.search_type !== historyFilters.searchType
        ) {
            return [];
        }

        const allResults = Array.isArray(historySelectedRecord.results) ? historySelectedRecord.results : [];
        const q = historyFilters.q;
        const fromDate = historyFilters.from ? new Date(historyFilters.from) : null;
        const toDate = historyFilters.to ? new Date(historyFilters.to) : null;
        if (toDate && !Number.isNaN(toDate.getTime())) {
            toDate.setHours(23, 59, 59, 999);
        }

        return allResults.filter((item) => {
            const itemPlatform = item?._platform || item?.platform || historySelectedRecord.platform || 'all';

            if (historyFilters.platform !== 'all' && itemPlatform !== historyFilters.platform) {
                return false;
            }

            if (q?.trim() && !doesResultMatch(item, q)) {
                return false;
            }

            if (fromDate || toDate) {
                const rawDate = item?.created_at || item?.publishedAt || item?.timestamp || item?.date || null;
                const parsedDate = rawDate ? new Date(rawDate) : null;
                if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
                    return false;
                }

                if (fromDate && !Number.isNaN(fromDate.getTime()) && parsedDate < fromDate) {
                    return false;
                }

                if (toDate && !Number.isNaN(toDate.getTime()) && parsedDate > toDate) {
                    return false;
                }
            }

            return true;
        });
    }, [historySelectedRecord, historyFilters.q, historyFilters.platform, historyFilters.searchType, historyFilters.from, historyFilters.to]);

    const groupedHistoryItems = useMemo(() => {
        const groups = [];
        const map = new Map();

        historyItems.forEach((item) => {
            const dateKey = item.searched_at
                ? new Date(item.searched_at).toISOString().slice(0, 10)
                : 'unknown';
            if (!map.has(dateKey)) {
                map.set(dateKey, []);
                groups.push(dateKey);
            }
            map.get(dateKey).push(item);
        });

        return groups.map((dateKey) => ({
            dateKey,
            label: dateKey === 'unknown'
                ? 'Unknown date'
                : new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-IN', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                }),
            items: map.get(dateKey) || []
        }));
    }, [historyItems]);

    const formatISTFull = (dateStr) => {
        if (!dateStr) return 'N/A';
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return 'N/A';
        return date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
    };

    const getProfileUrl = (item) => {
        const p = item._platform;
        if (p === 'x') return `https://x.com/${item.screen_name}`;
        if (p === 'youtube') return item.customUrl || `https://youtube.com/channel/${item.id}`;
        if (p === 'facebook') return item.url || `https://facebook.com/${item.id}`;
        if (p === 'instagram') return `https://instagram.com/${item.screen_name}`;
        if (p === 'telegram') return item.url || (item.screen_name ? `https://t.me/${item.screen_name}` : '#');
        return '#';
    };

    const getContentUrl = (item) => {
        if (item.url) return item.url;
        const p = item._platform;
        if (p === 'x') return `https://x.com/i/status/${item.id}`;
        if (p === 'youtube') return `https://youtube.com/watch?v=${item.id?.videoId || item.id}`;
        if (p === 'facebook') return `https://facebook.com/${item.id}`;
        if (p === 'instagram') return `https://instagram.com/p/${item.id}`;
        if (p === 'telegram') return item.url || '#';
        return '#';
    };

    const getHandle = (item) => {
        const p = item._platform;
        if (p === 'x' || p === 'instagram' || p === 'telegram') return `@${item.screen_name || ''}`;
        if (p === 'facebook') return item.screen_name || item.id || '';
        if (p === 'youtube') return item.customUrl || '';
        return item.screen_name || '';
    };

    const getFollowerLabel = (p) => {
        if (p === 'youtube') return 'subscribers';
        return 'followers';
    };

    const getFollowerCount = (item) => {
        return item.followers_count || item.statistics?.subscriberCount || 0;
    };

    // --- Export Functions ---
    const exportToPDF = () => {
        if (filteredResults.length === 0) { toast.error('No results to export'); return; }
        const doc = new jsPDF({ orientation: 'landscape' });
        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, 297, 22, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.text('Global Search Report', 14, 14);
        doc.setFontSize(8);
        doc.text(`"${query}" | ${platformLabel(platform)} | ${searchType} | ${formatISTFull(new Date())}`, 14, 20);
        doc.setTextColor(0, 0, 0);

        const tableColumn = searchType === 'profiles'
            ? ['#', 'Platform', 'Name', 'Handle', 'Followers', 'Link']
            : ['#', 'Platform', 'Author', 'Date', 'Likes', 'Comments', 'Link'];

        const tableRows = filteredResults.map((item, i) => {
            const p = (item._platform || '').toUpperCase();
            if (searchType === 'profiles') {
                return [i + 1, p, item.name || item.title || 'N/A', getHandle(item), formatNumber(getFollowerCount(item)), getProfileUrl(item)];
            }
            return [i + 1, p, item.author || item.channelTitle || 'N/A', formatISTFull(item.created_at || item.publishedAt),
                (item.metrics?.likes || item.statistics?.likeCount || 0).toLocaleString(),
                (item.metrics?.comments || item.statistics?.commentCount || 0).toLocaleString(),
                getContentUrl(item)];
        });

        const urlColIndex = searchType === 'profiles' ? 5 : 6;
        autoTable(doc, {
            head: [tableColumn], body: tableRows, startY: 28,
            styles: { fontSize: 7, cellPadding: 2 },
            headStyles: { fillColor: [51, 65, 85], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            didDrawCell: (data) => {
                if (data.column.index === urlColIndex && data.cell.section === 'body') {
                    const url = data.cell.raw;
                    if (url && String(url).startsWith('http')) {
                        doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url });
                    }
                }
            }
        });
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(7);
            doc.setTextColor(148, 163, 184);
            doc.text(`Page ${i}/${pageCount} — SOC - EYE`, 148, 205, { align: 'center' });
        }
        doc.save(`search_${query}_${new Date().toISOString().split('T')[0]}.pdf`);
        toast.success('PDF exported');
    };

    const exportToExcel = () => {
        if (filteredResults.length === 0) { toast.error('No results to export'); return; }
        const rows = filteredResults.map(item => {
            const p = item._platform || '';
            if (searchType === 'profiles') {
                return { Platform: p.toUpperCase(), Name: item.name || item.title || '', Handle: getHandle(item), Description: item.description || '', Followers: getFollowerCount(item), URL: getProfileUrl(item) };
            }
            return { Platform: p.toUpperCase(), Author: item.author || item.channelTitle || '', Content: (item.text || item.description || item.title || '').substring(0, 300), Date: formatISTFull(item.created_at || item.publishedAt), Likes: item.metrics?.likes || item.statistics?.likeCount || 0, Comments: item.metrics?.comments || item.statistics?.commentCount || 0, Views: item.metrics?.views || item.statistics?.viewCount || 0, URL: getContentUrl(item) };
        });
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Results');
        const meta = [{ Field: 'Query', Value: query }, { Field: 'Platform', Value: platformLabel(platform) }, { Field: 'Type', Value: searchType }, { Field: 'Count', Value: filteredResults.length }, { Field: 'Date', Value: formatISTFull(new Date()) }];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(meta), 'Info');
        const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `search_${query}_${new Date().toISOString().split('T')[0]}.xlsx`);
        toast.success('Excel exported');
    };

    const exportHistoryToPDF = () => {
        if (!historySelectedRecord) return;
        if (historySelectedFilteredResults.length === 0) { toast.error('No history results to export'); return; }

        const historyQuery = historySelectedRecord.query || 'history';
        const historyType = historySelectedRecord.search_type || 'profiles';
        const historyPlatform = historyFilters.platform !== 'all'
            ? historyFilters.platform
            : (historySelectedRecord.platform || 'all');

        const doc = new jsPDF({ orientation: 'landscape' });
        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, 297, 22, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.text('Search History Report', 14, 14);
        doc.setFontSize(8);
        doc.text(`"${historyQuery}" | ${platformLabel(historyPlatform)} | ${historyType} | ${formatISTFull(new Date())}`, 14, 20);
        doc.setTextColor(0, 0, 0);

        const tableColumn = historyType === 'profiles'
            ? ['#', 'Platform', 'Name', 'Handle', 'Followers', 'Link']
            : ['#', 'Platform', 'Author', 'Date', 'Likes', 'Comments', 'Link'];

        const tableRows = historySelectedFilteredResults.map((item, i) => {
            const p = (item._platform || item.platform || '').toUpperCase();
            if (historyType === 'profiles') {
                return [i + 1, p, item.name || item.title || 'N/A', getHandle(item), formatNumber(getFollowerCount(item)), getProfileUrl(item)];
            }
            return [
                i + 1,
                p,
                item.author || item.channelTitle || 'N/A',
                formatISTFull(item.created_at || item.publishedAt || item.timestamp),
                (item.metrics?.likes || item.statistics?.likeCount || 0).toLocaleString(),
                (item.metrics?.comments || item.statistics?.commentCount || 0).toLocaleString(),
                getContentUrl(item)
            ];
        });

        const urlColIndex = historyType === 'profiles' ? 5 : 6;
        autoTable(doc, {
            head: [tableColumn], body: tableRows, startY: 28,
            styles: { fontSize: 7, cellPadding: 2 },
            headStyles: { fillColor: [51, 65, 85], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            didDrawCell: (data) => {
                if (data.column.index === urlColIndex && data.cell.section === 'body') {
                    const url = data.cell.raw;
                    if (url && String(url).startsWith('http')) {
                        doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url });
                    }
                }
            }
        });

        doc.save(`history_${historyQuery}_${new Date().toISOString().split('T')[0]}.pdf`);
        toast.success('History PDF exported');
    };

    const exportHistoryToExcel = () => {
        if (!historySelectedRecord) return;
        if (historySelectedFilteredResults.length === 0) { toast.error('No history results to export'); return; }

        const historyQuery = historySelectedRecord.query || 'history';
        const historyType = historySelectedRecord.search_type || 'profiles';
        const historyPlatform = historyFilters.platform !== 'all'
            ? historyFilters.platform
            : (historySelectedRecord.platform || 'all');

        const rows = historySelectedFilteredResults.map((item) => {
            const p = item._platform || item.platform || '';
            if (historyType === 'profiles') {
                return {
                    Platform: p.toUpperCase(),
                    Name: item.name || item.title || '',
                    Handle: getHandle(item),
                    Description: item.description || '',
                    Followers: getFollowerCount(item),
                    URL: getProfileUrl(item)
                };
            }

            return {
                Platform: p.toUpperCase(),
                Author: item.author || item.channelTitle || '',
                Content: (item.text || item.description || item.title || '').substring(0, 300),
                Date: formatISTFull(item.created_at || item.publishedAt || item.timestamp),
                Likes: item.metrics?.likes || item.statistics?.likeCount || 0,
                Comments: item.metrics?.comments || item.statistics?.commentCount || 0,
                Views: item.metrics?.views || item.statistics?.viewCount || 0,
                URL: getContentUrl(item)
            };
        });

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'History Results');

        const meta = [
            { Field: 'Query', Value: historyQuery },
            { Field: 'Platform', Value: platformLabel(historyPlatform) },
            { Field: 'Type', Value: historyType },
            { Field: 'Filtered Count', Value: historySelectedFilteredResults.length },
            { Field: 'Date', Value: formatISTFull(new Date()) }
        ];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(meta), 'Info');

        const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `history_${historyQuery}_${new Date().toISOString().split('T')[0]}.xlsx`);
        toast.success('History Excel exported');
    };

    // --- Render Helpers ---

    const renderProfileCard = (item, index, highlightQuery = '') => {
        const p = item._platform || 'x';
        const cfg = platformStyle(p);
        const profileUrl = getProfileUrl(item);
        const followers = getFollowerCount(item);
        const isMonitored = isAlreadyInCatalog(item, monitoredKeys);

        return (
            <div key={`${p}-${item.id}-${index}`} className={`group relative bg-card rounded-xl border border-border hover:shadow-lg transition-all duration-200 overflow-hidden`}>
                {/* Gradient top stripe */}
                <div className={`h-1 bg-gradient-to-r ${cfg.color}`} />

                <div className="p-4">
                    <div className="flex items-start gap-3">
                        <div className="relative flex-shrink-0">
                            <Avatar className="h-12 w-12 border-2 border-card shadow-sm">
                                <AvatarImage src={item.profile_image_url || item.thumbnails?.default?.url} />
                                <AvatarFallback className={`${cfg.bg} ${cfg.text} font-semibold`}>
                                    {(item.name || item.title || '?')[0]?.toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            {item.verified && (
                                <div className="absolute -bottom-0.5 -right-0.5 bg-blue-500 rounded-full p-0.5">
                                    <svg className="h-2.5 w-2.5 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                                </div>
                            )}
                        </div>

                        <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <h3 className="font-semibold text-sm text-foreground truncate leading-tight">
                                        {highlightText(item.name || item.title, highlightQuery)}
                                    </h3>
                                    <p className="text-xs text-muted-foreground truncate mt-0.5">{highlightText(getHandle(item), highlightQuery)}</p>
                                </div>
                                <PlatformPill platformKey={p} small />
                            </div>

                            <p className="text-xs text-muted-foreground mt-2 line-clamp-2 leading-relaxed">
                                {highlightText(item.description || 'No description available', highlightQuery)}
                            </p>
                        </div>
                    </div>

                    {/* Stats + Actions */}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                        <div className="flex items-center gap-1 text-xs">
                            <Users className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-semibold text-foreground">{formatNumber(followers)}</span>
                            <span className="text-muted-foreground">{getFollowerLabel(p)}</span>
                        </div>
                        <div className="flex gap-1.5">
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                onClick={() => window.open(profileUrl, '_blank', 'noopener,noreferrer')}
                            >
                                <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                className={`h-7 text-xs px-2.5 gap-1 font-medium ${
                                    isMonitored ? 'text-emerald-700 border-emerald-300 bg-emerald-50' : ''
                                }`}
                                onClick={() => !isMonitored && openMonitorDialog(item)}
                                disabled={isMonitored}
                            >
                                {isMonitored ? (
                                    <>
                                        <CheckCircle2 className="h-3 w-3" />
                                        Monitored
                                    </>
                                ) : (
                                    <>
                                        <Monitor className="h-3 w-3" />
                                        Monitor
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderContentCard = (item, index, highlightQuery = '') => {
        return (
            <ContentCard
                key={`${item._platform || 'x'}-${item.id}-${index}`}
                item={item}
                index={index}
                getContentUrl={getContentUrl}
                onMonitor={openMonitorDialogFromContent}
                highlightQuery={highlightQuery}
                isMonitored={isAlreadyInCatalog(item, monitoredKeys)}
            />
        );
    };

    // How many platforms are done (for loading progress)
    const totalPlatforms = platform === 'all'
        ? configuredPlatforms.length
        : 1;
    const donePlatforms = completedPlatforms.size;

    const historyPlatformList = ['all', ...configuredPlatforms];

    useEffect(() => {
        if (platform !== 'all' && configuredPlatforms.length && !configuredPlatforms.includes(platform)) {
            setPlatform('all');
        }
    }, [configuredPlatforms, platform]);

    const handleLeftNavClick = useCallback(() => {
        if (viewMode === 'history') {
            if (historySelectedRecord) {
                setHistorySelectedRecord(null);
                return;
            }
            setViewMode('search');
        }
    }, [viewMode, historySelectedRecord]);

    const showLanding = viewMode === 'search' && !loading && !searched;

    return (
        <div className="flex min-h-full flex-col gap-3 max-w-[1600px] mx-auto w-full pb-8 animate-in fade-in-50 duration-200">
            {/* Title & Actions Header Row */}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                    {viewMode === 'history' && (
                        <button
                            type="button"
                            onClick={handleLeftNavClick}
                            className="w-8 h-8 rounded-lg border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0 cursor-pointer shadow-xs"
                            aria-label="Back to search"
                            title="Back to Search"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                    )}
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-xl font-heading font-bold tracking-tight leading-none text-foreground flex items-center gap-2">
                                <Compass className="h-5 w-5 text-primary shrink-0" />
                                {viewMode === 'history'
                                    ? historySelectedRecord
                                        ? `History: “${historySelectedRecord.query}”`
                                        : 'Saved Live Searches'
                                    : 'Global Intelligence Search'}
                            </h1>
                            {viewMode === 'search' && (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    Live OSINT Probe
                                </span>
                            )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 hidden sm:block">
                            Direct multi-network interrogation & identity discovery across live social networks
                        </p>
                    </div>
                </div>

                {/* Right side stats & actions */}
                <div className="flex items-center gap-1.5 flex-wrap ml-auto">
                    {viewMode === 'search' && (
                        <>
                            <span className="inline-flex items-baseline gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground shadow-xs">
                                <span className="tabular-nums font-semibold text-foreground">{configuredPlatforms.length}</span>
                                <span>platforms live</span>
                            </span>
                            <span className="inline-flex items-baseline gap-1 rounded-md border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-800 px-2 py-1 text-[11px] text-emerald-800 dark:text-emerald-300 shadow-xs">
                                <span className="tabular-nums font-semibold">{monitoredKeys.size}</span>
                                <span>monitored</span>
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setViewMode('history')}
                                className="h-8 gap-1.5 text-xs font-medium cursor-pointer"
                            >
                                <History className="h-3.5 w-3.5" /> Saved History
                            </Button>
                        </>
                    )}

                    {viewMode === 'history' && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { setViewMode('search'); setHistorySelectedRecord(null); }}
                            className="h-8 gap-1.5 text-xs font-medium cursor-pointer"
                        >
                            <Search className="h-3.5 w-3.5" /> Back to Search
                        </Button>
                    )}

                    {viewMode === 'search' && results.length > 0 && (
                        <>
                            <Button variant="outline" size="sm" onClick={exportToPDF} className="h-8 gap-1.5 text-xs font-medium cursor-pointer">
                                <Download className="h-3.5 w-3.5" /> PDF Dossier
                            </Button>
                            <Button variant="outline" size="sm" onClick={exportToExcel} className="h-8 gap-1.5 text-xs font-medium cursor-pointer">
                                <Download className="h-3.5 w-3.5" /> Excel Sheet
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* Top 4 Metric KPI Cards (matching WebIntelligence & DashboardNew design) */}
            {viewMode === 'search' && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
                    <div className="rounded-xl border border-border bg-card p-3 shadow-xs transition-colors hover:border-border/80">
                        <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                            <span className="flex items-center gap-1.5">
                                <Activity className="h-3.5 w-3.5 text-primary" /> Live Platforms
                            </span>
                            <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
                        </div>
                        <div className="flex items-baseline justify-between mt-1.5">
                            <div className="text-xl font-bold tabular-nums text-foreground">
                                {configuredPlatforms.length} Connected
                            </div>
                        </div>
                        <div className="flex items-center gap-1 mt-1 text-[11px] text-muted-foreground truncate">
                            {configuredPlatforms.map((p) => {
                                const cfg = platformStyle(p);
                                const Icon = cfg.icon;
                                return <Icon key={p} className="h-3 w-3 inline-block shrink-0 opacity-70" />;
                            })}
                            <span className="ml-0.5 truncate">Direct endpoints active</span>
                        </div>
                    </div>

                    <div className="rounded-xl border border-border bg-card p-3 shadow-xs transition-colors hover:border-border/80">
                        <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                            <span className="flex items-center gap-1.5">
                                <Radio className="h-3.5 w-3.5 text-primary" /> Probe Scope
                            </span>
                            <Badge variant="outline" className="text-[10px] h-4 px-1 py-0 font-medium">
                                {searchType === 'profiles' ? 'Accounts' : 'Posts'}
                            </Badge>
                        </div>
                        <div className="flex items-baseline justify-between mt-1.5">
                            <div className="text-xl font-bold tabular-nums text-foreground truncate">
                                {platform === 'all' ? 'All Networks' : platformLabel(platform)}
                            </div>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground truncate">
                            {searchType === 'profiles' ? 'Identity & channel resolver' : 'Real-time post chatter feed'}
                        </p>
                    </div>

                    <div className="rounded-xl border border-border bg-card p-3 shadow-xs transition-colors hover:border-border/80">
                        <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                            <span className="flex items-center gap-1.5">
                                <Shield className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> Monitored Catalog
                            </span>
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        </div>
                        <div className="flex items-baseline justify-between mt-1.5">
                            <div className="text-xl font-bold tabular-nums text-foreground">
                                {monitoredKeys.size} Targets
                            </div>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground truncate">
                            1-click enrollment into watch catalog
                        </p>
                    </div>

                    <div className="rounded-xl border border-border bg-card p-3 shadow-xs transition-colors hover:border-border/80">
                        <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                            <span className="flex items-center gap-1.5">
                                <History className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" /> Recent Inquiries
                            </span>
                            <span className="text-[10px] text-muted-foreground font-normal">Audit Log</span>
                        </div>
                        <div className="flex items-baseline justify-between mt-1.5">
                            <div className="text-xl font-bold tabular-nums text-foreground">
                                {recentSearches.length} Live Queries
                            </div>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground truncate">
                            Direct real-time investigations
                        </p>
                    </div>
                </div>
            )}

            {/* Unified Platform Bar + Omnibar Search Dock (matching SocialProfiles.js style) */}
            {viewMode === 'search' && (
                <div className="rounded-xl border border-border bg-card overflow-hidden shrink-0 shadow-xs">
                    {/* Top Tab Strip: Platforms + Mode Switcher */}
                    <div className="flex flex-wrap items-center justify-between gap-1.5 px-3 py-2 border-b border-border bg-muted/15">
                        {/* Platform Tabs */}
                        <div className="flex items-center gap-1 flex-wrap">
                            <button
                                type="button"
                                onClick={() => { setPlatform('all'); setResultFilter('all'); }}
                                className={cn(
                                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer',
                                    platform === 'all'
                                        ? 'bg-foreground text-background shadow-xs'
                                        : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                                )}
                            >
                                <AllPlatformsLogo className="h-3.5 w-3.5" />
                                All Platforms
                                <span className="tabular-nums opacity-80 text-[11px] ml-0.5">({configuredPlatforms.length})</span>
                            </button>

                            {configuredPlatforms.map((p) => {
                                const cfg = platformStyle(p);
                                const Icon = cfg.icon;
                                const active = platform === p;
                                return (
                                    <button
                                        key={p}
                                        type="button"
                                        onClick={() => { setPlatform(p); setResultFilter('all'); }}
                                        className={cn(
                                            'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all cursor-pointer',
                                            active
                                                ? 'bg-foreground text-background shadow-xs'
                                                : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                                        )}
                                    >
                                        <Icon className="h-3.5 w-3.5" />
                                        <span>{platformLabel(p)}</span>
                                        <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', active ? 'bg-emerald-400' : 'bg-emerald-500/70')} />
                                    </button>
                                );
                            })}
                        </div>

                        {/* Search Type Mode Switcher */}
                        <div className="flex rounded-lg overflow-hidden border border-border bg-muted/50 p-0.5 shrink-0 ml-auto">
                            <button
                                type="button"
                                className={cn(
                                    'px-3 py-1 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-all cursor-pointer',
                                    searchType === 'profiles'
                                        ? 'bg-background text-foreground shadow-xs'
                                        : 'text-muted-foreground hover:text-foreground'
                                )}
                                onClick={() => setSearchType('profiles')}
                            >
                                <Users className="h-3.5 w-3.5 text-primary" /> Accounts & Channels
                            </button>
                            <button
                                type="button"
                                className={cn(
                                    'px-3 py-1 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-all cursor-pointer',
                                    searchType === 'content'
                                        ? 'bg-background text-foreground shadow-xs'
                                        : 'text-muted-foreground hover:text-foreground'
                                )}
                                onClick={() => setSearchType('content')}
                            >
                                <Radio className="h-3.5 w-3.5 text-primary" /> Live Posts & Chatter
                            </button>
                        </div>
                    </div>

                    {/* Omnibar Input Row */}
                    <form onSubmit={handleSearch} className="p-3">
                        <div className="flex flex-col sm:flex-row items-stretch gap-2">
                            {/* If Content Mode: Limit Selector */}
                            {searchType === 'content' && (
                                <div className="shrink-0 w-full sm:w-[120px]">
                                    <Select value={resultLimit} onValueChange={setResultLimit}>
                                        <SelectTrigger className="bg-background border-border text-xs font-medium rounded-lg h-10 w-full">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {CONTENT_RANGE_OPTIONS.map((value) => (
                                                <SelectItem key={value} value={value} className="text-xs">
                                                    Fetch Last {value}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}

                            {/* Search Input Box */}
                            <div className="relative flex-1 min-w-0">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder={
                                        searchType === 'profiles'
                                            ? 'Enter suspect name, handle (e.g. @odishapolice), channel ID, or organization…'
                                            : 'Enter keywords, hashtag (e.g. #CyberFraud), incident phrase, or topic…'
                                    }
                                    className="pl-10 pr-9 bg-background border-border text-xs sm:text-sm rounded-lg h-10 transition-all font-normal placeholder:text-muted-foreground/70"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                />
                                {query && (
                                    <button
                                        type="button"
                                        onClick={() => setQuery('')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted transition-colors cursor-pointer"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>

                            {/* Search Submit Button */}
                            <Button
                                type="submit"
                                disabled={loading || !query.trim() || !configuredPlatforms.length}
                                className="h-10 px-5 rounded-lg font-semibold text-xs shadow-sm gap-2 shrink-0 transition-all cursor-pointer"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        <span>Probing…</span>
                                    </>
                                ) : (
                                    <>
                                        <Search className="h-3.5 w-3.5" />
                                        <span>Search Platforms</span>
                                        <span className="hidden sm:inline-flex items-center text-[10px] font-mono opacity-70 bg-black/15 dark:bg-white/15 px-1 py-0.2 rounded">↵</span>
                                    </>
                                )}
                            </Button>
                        </div>

                        {/* Suggested Investigation Vectors Row */}
                        <div className="mt-2.5 pt-2 border-t border-border/50 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1 shrink-0 mr-1">
                                    <Sparkles className="h-3 w-3 text-amber-500" /> Suggested Vectors:
                                </span>
                                {INVESTIGATION_VECTORS.map((vec, idx) => (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={() => handleSearch(null, vec.query, vec.type, platform)}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-muted/60 text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 border border-border/60 transition-colors cursor-pointer"
                                    >
                                        <span>{vec.label}</span>
                                        <ArrowRight className="h-2.5 w-2.5 opacity-60" />
                                    </button>
                                ))}
                            </div>
                            <span className="text-[11px] text-muted-foreground hidden md:inline-block">
                                Direct API probe · No database cache lag
                            </span>
                        </div>
                    </form>

                    {/* Progress indicator when query is loading */}
                    {loading && (
                        <div className="h-1 bg-muted w-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-primary via-primary/80 to-primary transition-all duration-500 ease-out"
                                style={{ width: `${Math.max(10, (donePlatforms / Math.max(totalPlatforms, 1)) * 100)}%` }}
                            />
                        </div>
                    )}
                </div>
            )}

            {/* Platform Errors Banner */}
            {viewMode === 'search' && Object.keys(platformErrors).length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {Object.entries(platformErrors).map(([p, err]) => (
                        <div key={p} className="flex items-center gap-2 px-3 py-1.5 bg-amber-50/80 dark:bg-amber-900/20 rounded-lg text-xs text-amber-800 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/40">
                            <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                            <span className="font-medium">{platformLabel(p)}:</span> {err}
                        </div>
                    ))}
                </div>
            )}

            {/* Main Body: Landing, Loading, Results, or History */}
            <div className="flex-1 w-full min-h-0">
                {/* 1. LANDING PAGE STATE (Full-Width 2-Column Grid) */}
                {showLanding && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 pt-1">
                        {/* Left Column (7 cols): Capabilities + Operational Threat Hunting Playbook */}
                        <div className="lg:col-span-7 flex flex-col gap-3.5">
                            {/* Capabilities Matrix Card */}
                            <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-xs space-y-4">
                                <div className="flex items-center justify-between border-b border-border/70 pb-3">
                                    <div className="flex items-center gap-2">
                                        <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                                            <Shield className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-bold text-foreground">Cyber Intelligence Capabilities</h3>
                                            <p className="text-[11px] text-muted-foreground">Multi-platform direct OSINT interrogation tools</p>
                                        </div>
                                    </div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-full">
                                        Zero-Lag Queries
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="rounded-lg border border-border/80 bg-muted/20 p-3.5 space-y-1.5 hover:border-primary/40 transition-colors">
                                        <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                                            <div className="w-6 h-6 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                                                <Radio className="h-3.5 w-3.5" />
                                            </div>
                                            Direct Interrogation
                                        </div>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            Queries live platform endpoints directly. Unearths new suspect handles and breaking posts without database indexing lag.
                                        </p>
                                    </div>

                                    <div className="rounded-lg border border-border/80 bg-muted/20 p-3.5 space-y-1.5 hover:border-primary/40 transition-colors">
                                        <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                                            <div className="w-6 h-6 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                                                <Zap className="h-3.5 w-3.5" />
                                            </div>
                                            1-Click Ingestion
                                        </div>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            Immediately enroll unmonitored suspect accounts into your 24/7 automated intelligence watch catalog with a single click.
                                        </p>
                                    </div>

                                    <div className="rounded-lg border border-border/80 bg-muted/20 p-3.5 space-y-1.5 hover:border-primary/40 transition-colors">
                                        <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                                            <div className="w-6 h-6 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                                                <Layers className="h-3.5 w-3.5" />
                                            </div>
                                            Multi-Network Correlation
                                        </div>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            Simultaneously scan Facebook, YouTube, X, Telegram & Instagram to correlate linked personas and cross-network activity.
                                        </p>
                                    </div>

                                    <div className="rounded-lg border border-border/80 bg-muted/20 p-3.5 space-y-1.5 hover:border-primary/40 transition-colors">
                                        <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                                            <div className="w-6 h-6 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                                                <FileText className="h-3.5 w-3.5" />
                                            </div>
                                            Audit-Ready Dossiers
                                        </div>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            Export real-time live discoveries into comprehensive PDF forensic dossiers or structured Excel datasets for reporting.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Threat Hunting Playbook Banner */}
                            <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-xs space-y-3">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                        <Sparkles className="h-3.5 w-3.5 text-amber-500" /> Operational Threat Hunting Playbook
                                    </h3>
                                    <span className="text-[11px] text-muted-foreground">Quick Setup</span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="p-3 rounded-lg border border-border bg-muted/10 space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                                <Users className="h-3.5 w-3.5 text-primary" /> Mode 1: Account Discovery
                                            </span>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 text-[11px] px-2 text-primary"
                                                onClick={() => { setSearchType('profiles'); handleSearch(null, 'odisha police', 'profiles', 'all'); }}
                                            >
                                                Try Demo →
                                            </Button>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                                            Use when tracking down suspect profiles, activist channels, or verifying unmonitored handle ownership across platforms.
                                        </p>
                                    </div>

                                    <div className="p-3 rounded-lg border border-border bg-muted/10 space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                                <Radio className="h-3.5 w-3.5 text-primary" /> Mode 2: Keyword Chatter
                                            </span>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 text-[11px] px-2 text-primary"
                                                onClick={() => { setSearchType('content'); handleSearch(null, 'cyber crime odisha', 'content', 'all'); }}
                                            >
                                                Try Demo →
                                            </Button>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                                            Use during breaking incidents or protests to monitor live keyword mentions, hashtags, and viral rumors across all networks.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right Column (5 cols): Recent Searches + Platform Status */}
                        <div className="lg:col-span-5 flex flex-col gap-3.5">
                            {/* Recent Searches Card */}
                            <div className="rounded-xl border border-border bg-card p-4 shadow-xs space-y-3">
                                <div className="flex items-center justify-between border-b border-border/70 pb-2.5">
                                    <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                                        <History className="h-3.5 w-3.5 text-primary" /> Recent Live Inquiries
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setViewMode('history')}
                                        className="text-xs text-primary font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                                    >
                                        View All History <ArrowRight className="h-3 w-3" />
                                    </button>
                                </div>

                                {recentSearches.length === 0 ? (
                                    <div className="py-8 text-center text-xs text-muted-foreground">
                                        <Search className="h-6 w-6 mx-auto mb-1.5 opacity-40" />
                                        No recent live searches recorded yet.
                                    </div>
                                ) : (
                                    <div className="space-y-1.5">
                                        {recentSearches.map((item) => {
                                            const cfg = platformStyle(item.platform);
                                            const Icon = cfg.icon;
                                            return (
                                                <button
                                                    key={item.id}
                                                    type="button"
                                                    onClick={() => handleSearch(null, item.query, item.search_type, item.platform || 'all')}
                                                    className="w-full flex items-center justify-between gap-2 p-2.5 rounded-lg border border-border/70 bg-background hover:bg-muted/60 text-xs transition-colors cursor-pointer group text-left"
                                                >
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <Icon className="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0" />
                                                        <span className="font-semibold text-foreground truncate">{item.query}</span>
                                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal shrink-0">
                                                            {item.search_type === 'profiles' ? 'Accounts' : 'Posts'}
                                                        </Badge>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 shrink-0 text-muted-foreground">
                                                        <span className="text-[10px]">{formatIST(item.searched_at)}</span>
                                                        <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Platform Connection Readiness Card */}
                            <div className="rounded-xl border border-border bg-card p-4 shadow-xs space-y-3">
                                <div className="flex items-center justify-between border-b border-border/70 pb-2.5">
                                    <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                                        <Activity className="h-3.5 w-3.5 text-emerald-500" /> Platform API Readiness
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => navigate('/settings')}
                                        className="text-xs text-primary font-semibold hover:underline cursor-pointer"
                                    >
                                        Settings →
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    {configuredPlatforms.length === 0 ? (
                                        <p className="text-xs text-amber-600 dark:text-amber-400 py-2">
                                            No platforms currently connected. Please configure API tokens in Settings.
                                        </p>
                                    ) : (
                                        configuredPlatforms.map((p) => {
                                            const cfg = platformStyle(p);
                                            const Icon = cfg.icon;
                                            return (
                                                <div
                                                    key={p}
                                                    className="flex items-center justify-between p-2 rounded-lg border border-border/60 bg-muted/20 text-xs"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <Icon className="h-4 w-4" />
                                                        <span className="font-semibold text-foreground">{platformLabel(p)}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] text-muted-foreground">Accounts & Posts</span>
                                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                                            Ready
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 2. LOADING RADAR PROBE STATE */}
                {viewMode === 'search' && loading && results.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-border bg-card shadow-xs animate-in fade-in-50">
                        <div className="relative mb-5">
                            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary relative">
                                <Radio className="h-8 w-8 animate-pulse text-primary" />
                                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                                </span>
                            </div>
                        </div>
                        <h3 className="text-base font-bold text-foreground">
                            Interrogating {platform === 'all' ? 'Live Social Platforms' : platformLabel(platform)}…
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1 text-center max-w-md">
                            Querying real-time network APIs for “<span className="font-semibold text-foreground">{query}</span>”. Results stream into view as each platform responds.
                        </p>
                        {platform === 'all' && configuredPlatforms.length > 0 && (
                            <div className="flex flex-wrap items-center justify-center gap-2 mt-6 max-w-2xl px-4">
                                {configuredPlatforms.map((p) => {
                                    const cfg = platformStyle(p);
                                    const Icon = cfg.icon;
                                    const done = completedPlatforms.has(p);
                                    const hasError = !!platformErrors[p];
                                    return (
                                        <div
                                            key={p}
                                            className={cn(
                                                'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all shadow-xs',
                                                done
                                                    ? hasError
                                                        ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300'
                                                        : 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300'
                                                    : 'border-border bg-background text-muted-foreground animate-pulse'
                                            )}
                                        >
                                            <Icon className="h-3.5 w-3.5" />
                                            <span>{platformLabel(p)}</span>
                                            {done ? (
                                                hasError ? (
                                                    <span className="text-[10px] text-amber-600 bg-amber-100 dark:bg-amber-900/40 px-1 py-0.2 rounded">Failed</span>
                                                ) : (
                                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                                )
                                            ) : (
                                                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* 3. EMPTY RESULTS STATE */}
                {viewMode === 'search' && !loading && searched && results.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-border bg-card shadow-xs">
                        <div className="w-12 h-12 rounded-xl border border-border bg-muted/40 flex items-center justify-center mb-3">
                            <Search className="h-6 w-6 text-muted-foreground/50" />
                        </div>
                        <h3 className="text-base font-bold text-foreground mb-1">No live matches found</h3>
                        <p className="text-xs text-muted-foreground mb-4 text-center max-w-sm">
                            No active records matched on the selected platforms. Try broadening the search term, picking a single network, or switching between Accounts and Posts.
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { setQuery(''); setSearched(false); setResults([]); setPlatformErrors({}); }}
                            className="gap-1.5 text-xs font-semibold"
                        >
                            <RefreshCw className="h-3.5 w-3.5" /> Clear and try another search
                        </Button>
                    </div>
                )}

                {/* 4. SEARCH RESULTS STATE (Full-Width Grid) */}
                {viewMode === 'search' && !loading && filteredResults.length > 0 && (
                    <div className="space-y-3.5">
                        {/* Results Filter Pill Bar */}
                        <div className="flex items-center justify-between flex-wrap gap-2.5 px-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-foreground">
                                    Live Results for “{query.trim()}”
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    ({filteredResults.length} matches
                                    {resultFilter !== 'all' ? ` on ${platformLabel(resultFilter)}` : ''})
                                </span>
                            </div>

                            {platform === 'all' && Object.keys(platformCounts).length > 1 && (
                                <div className="flex gap-1.5 flex-wrap">
                                    <button
                                        type="button"
                                        onClick={() => setResultFilter('all')}
                                        className={cn(
                                            'px-2.5 py-1 rounded-md text-xs font-semibold border transition-all cursor-pointer',
                                            resultFilter === 'all'
                                                ? 'border-foreground/20 bg-foreground text-background shadow-xs'
                                                : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                                        )}
                                    >
                                        All ({results.length})
                                    </button>
                                    {configuredPlatforms.filter((p) => platformCounts[p]).map((p) => {
                                        const count = platformCounts[p];
                                        const cfg = platformStyle(p);
                                        const Icon = cfg.icon;
                                        return (
                                            <button
                                                type="button"
                                                key={p}
                                                onClick={() => setResultFilter(p)}
                                                className={cn(
                                                    'px-2.5 py-1 rounded-md text-xs font-semibold border transition-all inline-flex items-center gap-1.5 cursor-pointer',
                                                    resultFilter === p
                                                        ? 'border-foreground/20 bg-foreground text-background shadow-xs'
                                                        : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                                                )}
                                            >
                                                <Icon className="h-3 w-3" /> {platformLabel(p)} ({count})
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Results Matrix */}
                        {searchType === 'profiles' ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 gap-3.5">
                                {filteredResults.map((item, i) => renderProfileCard(item, i))}
                            </div>
                        ) : (
                            <div className="flex gap-4 w-full items-start">
                                {(() => {
                                    const colCount = typeof window !== 'undefined' && window.innerWidth < 768 ? 1 : window.innerWidth < 1280 ? 2 : 3;
                                    const cols = Array.from({ length: colCount }, () => []);
                                    filteredResults.forEach((item, i) => {
                                        cols[i % colCount].push({ item, index: i });
                                    });
                                    return cols.map((colItems, colIndex) => (
                                        <div key={colIndex} className="flex-1 min-w-0 flex flex-col gap-4">
                                            {colItems.map(({ item, index }) => renderContentCard(item, index))}
                                        </div>
                                    ));
                                })()}
                            </div>
                        )}
                    </div>
                )}

                {/* 5. SAVED LIVE SEARCHES (HISTORY VIEW) */}
                {viewMode === 'history' && (
                    <div className="space-y-4">
                        <Card className="border-border bg-card overflow-hidden rounded-xl shadow-xs">
                            <CardContent className="p-3 sm:p-4">
                                <div className="flex items-center justify-between gap-2 mb-2.5">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Filter Saved Live Searches</h3>
                                    {hasActiveHistoryFilters && (
                                        <button
                                            type="button"
                                            className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                                            onClick={() => setHistoryFilters({ q: '', searchType: 'all', platform: 'all', from: '', to: '' })}
                                            aria-label="Clear history filters"
                                            title="Clear filters"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2.6fr_1.2fr_1.2fr_1fr_1fr] gap-2">
                                    <Input
                                        placeholder="Filter by keyword or query text…"
                                        value={historyFilters.q}
                                        onChange={(e) => setHistoryFilters((prev) => ({ ...prev, q: e.target.value }))}
                                        className="h-9 text-xs sm:text-sm bg-background"
                                    />
                                    <Select value={historyFilters.searchType} onValueChange={(v) => setHistoryFilters((prev) => ({ ...prev, searchType: v }))}>
                                        <SelectTrigger className="bg-background h-9 text-xs sm:text-sm"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Types</SelectItem>
                                            <SelectItem value="profiles">Accounts</SelectItem>
                                            <SelectItem value="content">Posts</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Select value={historyFilters.platform} onValueChange={(v) => setHistoryFilters((prev) => ({ ...prev, platform: v }))}>
                                        <SelectTrigger className="bg-background h-9 text-xs sm:text-sm"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {historyPlatformList.map((key) => (
                                                <SelectItem key={key} value={key}>
                                                    {platformLabel(key)}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Input
                                        type="date"
                                        value={historyFilters.from}
                                        onChange={(e) => setHistoryFilters((prev) => ({ ...prev, from: e.target.value }))}
                                        className="h-9 text-xs sm:text-sm bg-background"
                                    />
                                    <Input
                                        type="date"
                                        value={historyFilters.to}
                                        onChange={(e) => setHistoryFilters((prev) => ({ ...prev, to: e.target.value }))}
                                        className="h-9 text-xs sm:text-sm bg-background"
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        {historyLoading ? (
                            <div className="rounded-xl border border-border bg-card py-10 flex items-center justify-center text-xs text-muted-foreground shadow-xs">
                                <Loader2 className="h-4 w-4 animate-spin mr-2 text-primary" /> Loading saved searches…
                            </div>
                        ) : historyItems.length === 0 ? (
                            <div className="rounded-xl border border-border bg-card p-8 text-center shadow-xs">
                                <History className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                                <p className="text-sm font-semibold text-foreground mb-1">No saved live searches found</p>
                                <p className="text-xs text-muted-foreground">Run a Global Search and it will be recorded here automatically.</p>
                            </div>
                        ) : historySelectedRecord ? (
                            <div className="space-y-4">
                                <div className="rounded-xl border border-border bg-card px-4 py-3.5 space-y-3 shadow-xs">
                                    <div className="min-w-0">
                                        <p className="text-base font-bold text-foreground truncate">{historySelectedRecord.query}</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">{formatISTFull(historySelectedRecord.searched_at)}</p>
                                    </div>
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 border-t border-border/60 pt-2.5">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <Badge variant="outline" className="text-[11px] font-semibold">{historySelectedRecord.search_type}</Badge>
                                            <Badge variant="outline" className="text-[11px] font-semibold">{historySelectedRecord.platform ? platformLabel(historySelectedRecord.platform) : 'Unknown'}</Badge>
                                            <span className="px-2 py-0.5 rounded-md text-[11px] border border-border bg-muted font-medium text-muted-foreground">{Number(historySelectedFilteredResults.length || 0).toLocaleString()} results</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button size="sm" variant="outline" onClick={exportHistoryToPDF} className="h-7 text-xs gap-1 font-semibold">
                                                <Download className="h-3.5 w-3.5" /> PDF Dossier
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={exportHistoryToExcel} className="h-7 text-xs gap-1 font-semibold">
                                                <Download className="h-3.5 w-3.5" /> Excel
                                            </Button>
                                        </div>
                                    </div>
                                </div>

                                {historySelectedRecord.search_type === 'profiles' ? (
                                    historySelectedFilteredResults.length > 0 ? (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                                            {historySelectedFilteredResults.map((item, i) => renderProfileCard(item, i, historyFilters.q))}
                                        </div>
                                    ) : (
                                        <div className="rounded-xl border border-border bg-card p-5 text-center text-xs text-muted-foreground shadow-xs">
                                            No profile results matched current filters.
                                        </div>
                                    )
                                ) : (
                                    historySelectedFilteredResults.length > 0 ? (
                                        <div className="flex gap-4 w-full items-start">
                                            {(() => {
                                                const detailResults = historySelectedFilteredResults;
                                                const colCount = typeof window !== 'undefined' && window.innerWidth < 768 ? 1 : window.innerWidth < 1280 ? 2 : 3;
                                                const cols = Array.from({ length: colCount }, () => []);
                                                detailResults.forEach((item, i) => {
                                                    cols[i % colCount].push({ item, index: i });
                                                });
                                                return cols.map((colItems, colIndex) => (
                                                    <div key={colIndex} className="flex-1 min-w-0 flex flex-col gap-4">
                                                        {colItems.map(({ item, index }) => renderContentCard(item, index, historyFilters.q))}
                                                    </div>
                                                ));
                                            })()}
                                        </div>
                                    ) : (
                                        <div className="rounded-xl border border-border bg-card p-5 text-center text-xs text-muted-foreground shadow-xs">
                                            No content results matched current filters.
                                        </div>
                                    )
                                )}
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="space-y-3">
                                    {groupedHistoryItems.map((group) => (
                                        <div key={group.dateKey} className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
                                            <div className="px-3 py-2 bg-muted/40 border-b border-border">
                                                <p className="text-xs font-bold text-foreground">{group.label}</p>
                                            </div>
                                            <div>
                                                {group.items.map((item) => (
                                                    <button
                                                        key={item.id}
                                                        type="button"
                                                        onClick={() => openHistoryRecord(item.id)}
                                                        disabled={historyDetailLoadingId === item.id}
                                                        className="w-full text-left px-3 py-2.5 border-b border-border last:border-b-0 hover:bg-muted/40 transition-colors disabled:opacity-70 cursor-pointer"
                                                    >
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <p className="text-xs sm:text-sm font-bold text-foreground truncate">{highlightText(item.query, historyFilters.q)}</p>
                                                                <div className="flex items-center gap-1.5 flex-wrap mt-1">
                                                                    <Badge variant="outline" className="text-[10px]">{item.search_type}</Badge>
                                                                    <Badge variant="outline" className="text-[10px]">{platformLabel(item.platform)}</Badge>
                                                                    <span className="px-1.5 py-0.2 rounded text-[10px] border border-border bg-muted text-muted-foreground">{Number(item.total_results || 0).toLocaleString()} results</span>
                                                                    {historyFilters.q?.trim() && (
                                                                        <span className="px-1.5 py-0.2 rounded text-[10px] border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
                                                                            {Number(item.matched_results_count || 0).toLocaleString()} matched
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2 shrink-0">
                                                                <span className="text-[11px] text-muted-foreground">{formatISTFull(item.searched_at)}</span>
                                                                {historyDetailLoadingId === item.id ? (
                                                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                                                ) : (
                                                                    <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                                                                )}
                                                            </div>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-1">
                                    <p className="text-xs text-muted-foreground">
                                        Page {historyPagination.page} of {historyPagination.totalPages}
                                    </p>
                                    <div className="flex gap-2">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={historyPagination.page <= 1 || historyLoading}
                                            onClick={() => loadHistory(historyPagination.page - 1)}
                                            className="h-8 text-xs font-semibold"
                                        >
                                            Previous
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={historyPagination.page >= historyPagination.totalPages || historyLoading}
                                            onClick={() => loadHistory(historyPagination.page + 1)}
                                            className="h-8 text-xs font-semibold"
                                        >
                                            Next
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <AddSocialProfileDialog
                open={addProfileOpen}
                onOpenChange={(open) => {
                    setAddProfileOpen(open);
                    if (!open) setAddProfilePrefill(null);
                }}
                prefill={addProfilePrefill}
                onSuccess={loadMonitoredCatalog}
            />
        </div>
    );
};

export default GlobalSearch;
