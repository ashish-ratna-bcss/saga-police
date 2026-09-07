import React, { useState, useEffect, lazy, Suspense, useRef, useCallback } from 'react';
import ReactPlayer from 'react-player';
import { Link, useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import {
  Shield, AlertTriangle, Send,
  Users, ChevronDown, Loader2, Info, Clock, FileText,
  ArrowRight, RefreshCw, Sparkles, X, Video, Pencil, Play, ExternalLink, Settings,
  UserSearch, CalendarDays
} from 'lucide-react';
import { Card } from '../components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import WorkflowKpiCard from '../components/dashboard/WorkflowKpiCard';
import api from '../lib/api';
import { AlertService } from '../features/alerts/api/alertService';
import { GrievanceService } from '../features/grievances/api/grievanceService';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';

// Dashboard data is loaded locally (Postgres catalog APIs) — no context stub.

// Lazy load heavy components
const TodaysEventsWidget = lazy(() => import('../components/dashboard/TodaysEventsWidget'));

// Platform configurations
const PLATFORMS = [
  { id: 'all', label: 'All sources' },
  { id: 'twitter', label: 'X (Twitter)' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'whatsapp', label: 'WhatsApp' }
];

// Dashboard requirement: Profiles dropdown should not offer WhatsApp.
const PROFILE_PLATFORMS = PLATFORMS.filter((platform) => platform.id !== 'whatsapp');
// Dashboard requirement: Alert and Report dropdowns should not offer WhatsApp.
const ALERT_REPORT_PLATFORMS = PLATFORMS.filter((platform) => platform.id !== 'whatsapp');

const PLATFORM_COLORS = {
  twitter: '#1DA1F2',
  youtube: '#FF0000',
  facebook: '#1877F2',
  instagram: '#E4405F',
  whatsapp: '#25D366',
};

const STATUS_COLORS = {
  pending: '#f59e0b',
  resolved: '#10b981',
  escalated: '#ef4444',
  closed: '#6366f1',
  sent_to_intermediary: '#3b82f6',
  active: '#ef4444',
  acknowledged: '#8b5cf6',
  false_positive: '#6b7280',
};

// Map frontend platform IDs to backend grievance keys (backend uses 'x' not 'twitter')
const toAlertPlatformKey = (id) => id === 'twitter' ? 'x' : id;
const toGrievancePlatformKey = (id) => id === 'twitter' ? 'x' : id;
const toProfilePlatformKey = (id) => id === 'twitter' ? 'x' : id;

/**
 * Ensure every non-zero slice gets at least `minPct`% of the pie visually.
 * Adds a `displayValue` key used only for arc sizing; original `value` stays for labels/tooltips.
 */
const ensureMinSlice = (slices, minPct = 4) => {
  if (!slices.length) return slices;
  const total = slices.reduce((s, e) => s + e.value, 0);
  if (total === 0) return slices;
  const minVal = (minPct / 100) * total;
  return slices.map(s => ({
    ...s,
    displayValue: s.value > 0 ? Math.max(s.value, minVal) : 0,
  }));
};

const formatCompactNumber = (num) => {
  if (num == null) return '';
  if (num >= 1000000) return `${(num / 1000000).toFixed(num % 1000000 === 0 ? 0 : 1)}M`;
  if (num >= 10000) return `${(num / 1000).toFixed(num % 1000 === 0 ? 0 : 1)}K`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return String(num);
};

const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, payload }) => {
  if (percent < 0.03) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  const label = formatCompactNumber(payload?.value);
  const fontSize = label.length > 4 ? 9 : label.length > 3 ? 10 : 11;
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={fontSize} fontWeight={700}>
      {label}
    </text>
  );
};

// Center label showing total count inside the donut
const renderCenterTotal = (total, label, color) => (
  <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central">
    <tspan x="50%" dy="-6" fontSize={18} fontWeight={800} fill={color}>{total}</tspan>
    <tspan x="50%" dy="16" fontSize={8} fill="hsl(var(--muted-foreground))" fontWeight={600} textTransform="uppercase" letterSpacing="0.05em">{label}</tspan>
  </text>
);

// Custom tooltip for pie charts
const CustomPieTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const { name, value, color } = payload[0].payload;
  return (
    <div className="bg-popover/95 backdrop-blur-sm border border-border shadow-xl rounded-lg px-3 py-2 flex items-center gap-2">
      <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: color }} />
      <span className="text-xs font-semibold text-foreground">{name}</span>
      <span className="text-xs font-bold text-foreground ml-1">{value}</span>
    </div>
  );
};

const LoadingSpinner = () => (
  <div className="flex items-center justify-center p-4">
    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
  </div>
);

// ─── Drone View Live Monitoring Strip ───────────────────────────────────────
const DRONE_API_KEY_STORAGE = 'blura_yt_api_key';
// Fallback levels: 0=ReactPlayer, 1=nocookie iframe, 2=standard embed, 3=thumbnail card
const FALLBACK_LABELS = ['Player (auto)', 'Embed (privacy)', 'Embed (standard)', 'Info card'];

const DroneViewStrip = () => {
  const [title, setTitle] = useState('Drone View');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('Drone View');
  const [linkInput, setLinkInput] = useState('');
  const [savedLink, setSavedLink] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState('');
  const [playerState, setPlayerState] = useState('idle'); // idle|loading|playing|error
  const [playerKey, setPlayerKey] = useState(0);
  const [fallbackLevel, setFallbackLevel] = useState(0); // 0-3

  // API key settings
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(() => localStorage.getItem(DRONE_API_KEY_STORAGE) || '');
  const [savedApiKey, setSavedApiKey] = useState(() => localStorage.getItem(DRONE_API_KEY_STORAGE) || '');
  const [apiKeySaved, setApiKeySaved] = useState(false);

  // Stream metadata from YouTube Data API
  const [streamMeta, setStreamMeta] = useState(null); // {title, thumbnail, viewers, isLive}
  const [metaLoading, setMetaLoading] = useState(false);

  const extractYouTubeId = (url) => {
    if (!url) return null;
    const patterns = [
      /[?&]v=([a-zA-Z0-9_-]{11})/,
      /youtu\.be\/([a-zA-Z0-9_-]{11})/,
      /\/(?:live|embed)\/([a-zA-Z0-9_-]{11})/,
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m) return m[1];
    }
    return null;
  };

  const fetchStreamMeta = async (url, apiKey) => {
    const videoId = extractYouTubeId(url);
    if (!videoId || !apiKey) return null;
    try {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails,statistics&id=${videoId}&key=${apiKey}`
      );
      const data = await res.json();
      if (data.error) return { error: data.error.message };
      const item = data.items?.[0];
      if (!item) return { error: 'Video not found — check the URL.' };
      const thumbs = item.snippet?.thumbnails;
      return {
        videoTitle: item.snippet?.title || '',
        thumbnail: thumbs?.maxres?.url || thumbs?.high?.url || thumbs?.medium?.url || thumbs?.default?.url || '',
        isLive: item.snippet?.liveBroadcastContent === 'live',
        isUpcoming: item.snippet?.liveBroadcastContent === 'upcoming',
        viewers: item.liveStreamingDetails?.concurrentViewers
          ? Number(item.liveStreamingDetails.concurrentViewers).toLocaleString()
          : null,
        channelTitle: item.snippet?.channelTitle || '',
      };
    } catch {
      return null; // silently ignore — still show player
    }
  };

  const handleSaveApiKey = () => {
    localStorage.setItem(DRONE_API_KEY_STORAGE, apiKeyInput.trim());
    setSavedApiKey(apiKeyInput.trim());
    setApiKeySaved(true);
    setTimeout(() => setApiKeySaved(false), 2000);
  };

  const isValidUrl = (url) => {
    try { new URL(url); return true; } catch { return false; }
  };

  const handleOpenModal = async () => {
    const url = linkInput.trim();
    if (!url) { setError('Please paste a stream URL'); return; }
    if (!isValidUrl(url)) { setError('Invalid URL — paste a full link starting with https://'); return; }
    setError('');
    setStreamMeta(null);
    setPlayerState('loading');
    setFallbackLevel(0);
    setPlayerKey(k => k + 1);
    setSavedLink(url);
    setShowModal(true);
    if (savedApiKey) {
      setMetaLoading(true);
      const meta = await fetchStreamMeta(url, savedApiKey);
      setStreamMeta(meta);
      setMetaLoading(false);
    }
  };

  const handleCloseModal = () => {
    setPlayerState('idle');
    setTimeout(() => { setShowModal(false); setStreamMeta(null); }, 50);
  };

  const handleTitleSave = () => {
    setTitle(titleInput.trim() || 'Drone View');
    setIsEditingTitle(false);
  };

  const handlePlayerReady = () => setPlayerState('playing');

  const handlePlayerError = () => {
    setFallbackLevel(prev => {
      const next = prev + 1;
      if (next >= 3) { setPlayerState('error'); }
      else { setPlayerKey(k => k + 1); setPlayerState('loading'); }
      return next;
    });
  };

  const videoId = extractYouTubeId(savedLink);
  const nocookieUrl = videoId ? `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1` : '';
  const standardEmbedUrl = videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1` : '';

  return (
    <>
      {/* Strip */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 rounded-xl border border-sky-500/30 bg-gradient-to-r from-sky-500/10 via-sky-500/5 to-transparent shadow-sm">
        {/* Pulsing dot */}
        <div className="relative flex-shrink-0">
          <div className="h-2 w-2 rounded-full bg-sky-500" />
          <div className="absolute inset-0 h-2 w-2 rounded-full bg-sky-500 animate-ping opacity-75" />
        </div>

        <Video className="h-4 w-4 text-sky-500 flex-shrink-0" />

        {/* Editable title */}
        {isEditingTitle ? (
          <input
            value={titleInput}
            autoFocus
            onChange={(e) => setTitleInput(e.target.value)}
            onBlur={handleTitleSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTitleSave();
              if (e.key === 'Escape') { setTitleInput(title); setIsEditingTitle(false); }
            }}
            className="text-sm font-semibold bg-transparent border-b border-sky-500/60 focus:outline-none focus:border-sky-500 w-32 text-sky-700 dark:text-sky-300"
          />
        ) : (
          <button onClick={() => { setTitleInput(title); setIsEditingTitle(true); }} className="flex items-center gap-1.5 group">
            <span className="text-sm font-semibold text-sky-700 dark:text-sky-300">{title}</span>
            <Pencil className="h-3 w-3 text-sky-400/50 group-hover:text-sky-500 transition-colors" />
          </button>
        )}

        <div className="h-4 w-px bg-border flex-shrink-0" />

        {/* URL input */}
        <div className="flex flex-1 min-w-0 items-center gap-2">
          <input
            value={linkInput}
            onChange={(e) => { setLinkInput(e.target.value); setError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleOpenModal()}
            placeholder="Paste live stream URL — YouTube, HLS (.m3u8), direct video..."
            className="flex-1 min-w-0 text-xs bg-background/60 border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-sky-500/40 focus:border-sky-500/50 placeholder:text-muted-foreground/50"
          />
          {error && <span className="text-[10px] text-rose-500 whitespace-nowrap hidden sm:inline">{error}</span>}
        </div>

        {/* Watch Live button */}
        <button
          onClick={handleOpenModal}
          disabled={!linkInput.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0 shadow-sm"
        >
          <Play className="h-3 w-3 fill-current" />
          Watch Live
        </button>

        {/* Settings gear */}
        <button
          onClick={() => setShowSettings(s => !s)}
          className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${
            showSettings ? 'bg-sky-500/20 text-sky-600' : 'text-muted-foreground hover:text-sky-600 hover:bg-sky-500/10'
          }`}
          title="YouTube API Key settings"
        >
          <Settings className="h-4 w-4" />
        </button>

        {error && <span className="text-[10px] text-rose-500 sm:hidden w-full text-center">{error}</span>}

        {/* API Key settings panel */}
        {showSettings && (
          <div className="w-full flex items-center gap-2 pt-1 pb-0.5 border-t border-sky-500/20 mt-0.5">
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">YouTube Data API v3 Key:</span>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveApiKey()}
              placeholder="Paste your Google Console API key..."
              className="flex-1 text-xs bg-background/60 border border-border rounded-lg px-3 py-1 focus:outline-none focus:ring-1 focus:ring-sky-500/40 focus:border-sky-500/50 placeholder:text-muted-foreground/40"
            />
            <button
              onClick={handleSaveApiKey}
              className="text-xs px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white transition-colors whitespace-nowrap"
            >
              {apiKeySaved ? '✓ Saved' : 'Save Key'}
            </button>
            {savedApiKey && (
              <span className="text-[10px] text-emerald-600 whitespace-nowrap">✓ API key active</span>
            )}
          </div>
        )}
      </div>

      {/* Live Viewer Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={handleCloseModal}>
          <div className="relative w-full max-w-4xl bg-card rounded-2xl shadow-2xl overflow-hidden border border-border/60" onClick={(e) => e.stopPropagation()}>

            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-sky-500/15 to-transparent border-b border-border">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {/* Thumbnail */}
                {streamMeta?.thumbnail && (
                  <img src={streamMeta.thumbnail} alt="" className="h-10 w-16 rounded object-cover flex-shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {streamMeta?.isLive && (
                      <span className="flex items-center gap-1">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600"></span>
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-red-500">Live</span>
                      </span>
                    )}
                    {streamMeta?.isUpcoming && (
                      <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500">Upcoming</span>
                    )}
                    {streamMeta?.viewers && (
                      <span className="text-[10px] text-white/60">{streamMeta.viewers} watching</span>
                    )}
                    {playerState === 'loading' && !streamMeta && (
                      <Loader2 className="h-3.5 w-3.5 text-sky-400 animate-spin" />
                    )}
                  </div>
                  <p className="text-sm font-semibold text-foreground truncate">
                    {metaLoading
                      ? title
                      : (streamMeta?.videoTitle || title)}
                  </p>
                  {streamMeta?.channelTitle && (
                    <p className="text-[10px] text-muted-foreground truncate">{streamMeta.channelTitle}</p>
                  )}
                </div>
              </div>
              <button onClick={handleCloseModal} className="p-1.5 rounded-lg hover:bg-muted transition-colors flex-shrink-0 ml-2">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            {/* API error notice (e.g. bad key) */}
            {streamMeta?.error && (
              <div className="px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-[10px] text-amber-600">
                API: {streamMeta.error}
              </div>
            )}

            {/* Player — 16:9 */}
            <div className="relative w-full bg-black" style={{ paddingBottom: '56.25%' }}>
              <div className="absolute inset-0">

                {/* ── Level 0: ReactPlayer (uses nocookie URL for YouTube — recommended) ── */}
                {fallbackLevel === 0 && playerState !== 'error' && (
                  <ReactPlayer key={`rp-${playerKey}`}
                    url={nocookieUrl || savedLink}
                    playing={playerState === 'loading' || playerState === 'playing'}
                    controls width="100%" height="100%"
                    onReady={handlePlayerReady}
                    onError={handlePlayerError}
                    config={{
                      youtube: { playerVars: { autoplay: 1, rel: 0, modestbranding: 1, origin: window.location.origin } },
                      file: { forceHLS: savedLink.includes('.m3u8'), attributes: { autoPlay: true, controls: true } },
                    }}
                  />
                )}

                {/* ── Level 1: youtube-nocookie iframe ── */}
                {fallbackLevel === 1 && playerState !== 'error' && nocookieUrl && (
                  <iframe key={`nc-${playerKey}`}
                    src={nocookieUrl} title={title}
                    className="absolute inset-0 w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    onLoad={() => setPlayerState('playing')}
                    onError={handlePlayerError}
                  />
                )}

                {/* ── Level 2: standard YouTube embed iframe ── */}
                {fallbackLevel === 2 && playerState !== 'error' && standardEmbedUrl && (
                  <iframe key={`yt-${playerKey}`}
                    src={standardEmbedUrl} title={title}
                    className="absolute inset-0 w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    onLoad={() => setPlayerState('playing')}
                    onError={handlePlayerError}
                  />
                )}

                {/* ── Level 3 / final error: info card ── */}
                {(fallbackLevel >= 3 || playerState === 'error') && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-black to-slate-900 gap-4 px-8 text-center">
                    {streamMeta?.thumbnail ? (
                      <div className="relative w-full max-w-sm">
                        <img src={streamMeta.thumbnail} alt="" className="w-full rounded-lg opacity-40" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="p-4 rounded-full bg-black/60 backdrop-blur-sm border border-white/10">
                            <Video className="h-10 w-10 text-white/60" />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-5 rounded-full bg-slate-800 border border-white/10">
                        <Video className="h-12 w-12 text-white/30" />
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <p className="text-base font-bold text-white">{streamMeta?.videoTitle || title}</p>
                      {streamMeta?.channelTitle && <p className="text-xs text-white/50">{streamMeta.channelTitle}</p>}
                      {streamMeta?.isLive && streamMeta?.viewers && (
                        <p className="text-xs text-red-400 font-medium">🔴 Live · {streamMeta.viewers} watching</p>
                      )}
                      <p className="text-[11px] text-white/30 mt-2 leading-relaxed">
                        Stream could not be embedded in-app.<br />
                        All 3 playback methods were attempted.
                      </p>
                    </div>
                    <button onClick={() => { setFallbackLevel(0); setPlayerState('loading'); setPlayerKey(k => k + 1); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      <Play className="h-3 w-3 fill-current" /> Retry All
                    </button>
                  </div>
                )}

                {/* Loading overlay (levels 0–2) */}
                {playerState === 'loading' && fallbackLevel < 3 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 pointer-events-none gap-3">
                    <Loader2 className="h-10 w-10 text-sky-400 animate-spin" />
                    <span className="text-xs text-white/50">Trying method {fallbackLevel + 1} of 3…</span>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-2.5 bg-muted/30 border-t border-border flex items-center gap-3">
              <p className="text-[11px] text-muted-foreground truncate flex-1">{savedLink}</p>
              {fallbackLevel < 3 && playerState !== 'error' && (
                <div className="hidden sm:flex gap-1">
                  {[0,1,2].map(i => (
                    <button key={i}
                      onClick={() => { setFallbackLevel(i); setPlayerState('loading'); setPlayerKey(k => k + 1); }}
                      className={`text-[9px] px-1.5 py-0.5 rounded font-medium transition-colors ${fallbackLevel === i ? 'bg-sky-600 text-white' : 'bg-muted text-muted-foreground hover:bg-sky-500/10'}`}
                    >{['Auto','NoCookie','Embed'][i]}</button>
                  ))}
                </div>
              )}
              <button onClick={handleCloseModal} className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors flex-shrink-0">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);

  const [alertType, setAlertType] = useState('active');
  const [alertPlatform, setAlertPlatform] = useState('all');
  const [reportPlatform, setReportPlatform] = useState('all');
  const [reportStatus, setReportStatus] = useState('all');
  const [grievancePlatform, setGrievancePlatform] = useState('all');
  const [grievanceStatus, setGrievanceStatus] = useState('all');
  const [profilePlatform, setProfilePlatform] = useState('all');

  const alertData = dashboardData?.alertData || {};
  const reportData = dashboardData?.reportData || {};
  const grievanceData = dashboardData?.grievanceData || {};
  const alertPendingReportData = dashboardData?.alertPendingReportData || {};
  const profileData = dashboardData?.profileData || {};
  const eventData = dashboardData?.eventData || {};

  const loadDashboard = useCallback(async () => {
    const platformIds = PLATFORMS.map((p) => p.id);
    const toApiPlatform = (id) => {
      if (!id || id === 'all') return undefined;
      if (id === 'twitter') return 'x';
      return id;
    };

    const emptyAlertBucket = () =>
      Object.fromEntries(platformIds.map((id) => [id, 0]));

    const alertDataNext = {
      active: emptyAlertBucket(),
      acknowledged: emptyAlertBucket(),
      false_positive: emptyAlertBucket(),
      escalated: emptyAlertBucket(),
      severity: Object.fromEntries(
        platformIds.map((id) => [id, { high: 0, medium: 0, low: 0 }])
      ),
    };
    const pendingReports = emptyAlertBucket();

    await Promise.all(
      platformIds.map(async (id) => {
        try {
          const platform = toApiPlatform(id);
          const res = await AlertService.getStats(platform ? { platform } : {});
          const s = res.data || {};
          alertDataNext.active[id] = s.active || 0;
          alertDataNext.acknowledged[id] = s.acknowledged || 0;
          alertDataNext.false_positive[id] = s.false_positive || 0;
          alertDataNext.escalated[id] = s.escalated || 0;
          pendingReports[id] = s.escalated_pending_report || 0;
        } catch {
          /* keep zeros */
        }
      })
    );

    const emptyReport = () => ({
      total: 0,
      sent_to_intermediary: 0,
      awaiting_reply: 0,
      closed: 0,
    });
    const reportDataNext = Object.fromEntries(
      platformIds.map((id) => [id, emptyReport()])
    );
    try {
      const reportsRes = await api.get('/grievances/report-stats');
      const byPlatform = reportsRes.data || {};
      platformIds.forEach((id) => {
        const key = id === 'twitter' ? 'x' : id;
        const src = byPlatform[id] || byPlatform[key] || emptyReport();
        reportDataNext[id] = {
          total: src.total || 0,
          sent_to_intermediary: src.sent_to_intermediary || 0,
          awaiting_reply: src.awaiting_reply || 0,
          closed: src.closed || 0,
        };
      });
    } catch {
      /* ignore */
    }

    const gPlatforms = platformIds.filter((p) => p !== 'youtube');
    const grievanceDataNext = {};
    await Promise.all(
      gPlatforms.map(async (id) => {
        try {
          const platform = toApiPlatform(id);
          const res = await GrievanceService.getStats(platform ? { platform } : {});
          const s = res.data || {};
          grievanceDataNext[id === 'twitter' ? 'x' : id] = {
            total: s.total || 0,
            pending: s.pending || 0,
            escalated: s.escalated || 0,
            closed: s.closed || 0,
          };
          if (id === 'all') {
            grievanceDataNext.all = {
              total: s.total || 0,
              pending: s.pending || 0,
              escalated: s.escalated || 0,
              closed: s.closed || 0,
            };
          }
        } catch {
          grievanceDataNext[id === 'twitter' ? 'x' : id] = {
            total: 0,
            pending: 0,
            escalated: 0,
            closed: 0,
          };
        }
      })
    );

    const profileDataNext = Object.fromEntries(
      platformIds.map((id) => [
        id === 'twitter' ? 'x' : id,
        { total: 0, active: 0, inactive: 0, week_added: 0 },
      ])
    );
    profileDataNext.all = { total: 0, active: 0, inactive: 0, week_added: 0 };
    try {
      const platRes = await api.get('/social-profiles', { params: { limit: 1 } });
      const byPlatform = platRes.data?.stats?.byPlatform || {};
      const stats = platRes.data?.stats || {};
      let total = 0;
      Object.entries(byPlatform).forEach(([slugRaw, count]) => {
        const slug = slugRaw === 'twitter' ? 'x' : slugRaw;
        if (profileDataNext[slug]) {
          profileDataNext[slug].total = count || 0;
          profileDataNext[slug].active = count || 0;
        }
        total += count || 0;
      });
      profileDataNext.all = {
        total: stats.total ?? total,
        active: stats.active ?? total,
        inactive: stats.paused ?? 0,
        week_added: 0,
      };
    } catch {
      /* ignore */
    }

    let eventList = [];
    try {
      const eventsRes = await api.get('/events');
      eventList = Array.isArray(eventsRes.data)
        ? eventsRes.data
        : eventsRes.data?.events || [];
    } catch {
      eventList = [];
    }
    const started = eventList.filter(
      (e) =>
        e.monitoring_status === 'started' ||
        String(e.status || '').toLowerCase() === 'active'
    );

    setDashboardData({
      alertData: alertDataNext,
      alertPendingReportData: pendingReports,
      reportData: reportDataNext,
      grievanceData: grievanceDataNext,
      profileData: profileDataNext,
      eventData: {
        list: started.map((e) => ({
          ...e,
          status: 'active',
          name: e.name || e.programme_name || 'Event',
        })),
        all: { active: started.length },
      },
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await loadDashboard();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadDashboard]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadDashboard();
    } finally {
      setIsRefreshing(false);
    }
  };

  if (loading && !dashboardData) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const ALERT_TYPES = [
    { id: 'active', label: 'Active Alerts' },
    { id: 'acknowledged', label: 'Acknowledged Alerts' },
    { id: 'false_positive', label: 'False Positive Alerts' },
    { id: 'escalated', label: 'Escalated Alerts' },
  ];

  const getAlertCount = () => {
    const typeData = alertData?.[alertType] || alertData?.active || {};
    return typeData[alertPlatform] ?? typeData.all ?? 0;
  };

  const getEscalatedPendingCount = () => alertPendingReportData?.[alertPlatform] ?? alertPendingReportData?.all ?? 0;
  const getEscalatedGeneratedCount = () => {
    const total = alertData?.escalated?.[alertPlatform] ?? alertData?.escalated?.all ?? 0;
    return Math.max(0, total - getEscalatedPendingCount());
  };

  const getGrievanceCount = () => {
    const gKey = toGrievancePlatformKey(grievancePlatform);
    const data = grievanceData?.[gKey] || grievanceData?.all || {};
    return data.total || ((data.pending || 0) + (data.escalated || 0) + (data.closed || 0));
  };

  const getReportCount = () => {
    const data = reportData?.[reportPlatform] || reportData?.all || {};
    if (reportStatus === 'sent_to_intermediary') return data.sent_to_intermediary || 0;
    if (reportStatus === 'closed') return data.closed || 0;
    return data.total || 0;
  };

  const getProfileCount = () => {
    const key = toProfilePlatformKey(profilePlatform);
    const data = profileData?.[key] || profileData?.all || {};
    return data.total || 0;
  };

  const getProfileWeekAddedCount = () => {
    const key = toProfilePlatformKey(profilePlatform);
    const data = profileData?.[key] || profileData?.all || {};
    return data.week_added ?? data.today_added ?? 0;
  };

  const activeEvents = (Array.isArray(eventData?.list) ? eventData.list : []).filter(
    (event) => String(event?.status || '').toLowerCase() === 'active'
  );

  const getEventCount = () => activeEvents.length || eventData?.all?.active || 0;

  const buildRouteWithParams = (basePath, params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '' || value === 'all') return;
      query.set(key, String(value));
    });

    const queryString = query.toString();
    return queryString ? `${basePath}?${queryString}` : basePath;
  };

  const navigateFromPieEntry = (entry) => {
    if (!entry?.target?.path) return;
    const destination = buildRouteWithParams(entry.target.path, entry.target.params);
    navigate(destination);
  };

  const alertPlatformKey = toAlertPlatformKey(alertPlatform);
  const reportPlatformKey = toAlertPlatformKey(reportPlatform);
  const grievancePlatformKey = toGrievancePlatformKey(grievancePlatform);
  const profilePlatformKey = toProfilePlatformKey(profilePlatform);

  const severity = alertData?.severity?.[alertPlatform] || {};
  const alertPieData = [
    {
      label: 'Ack',
      name: 'Acknowledged',
      value: alertData?.acknowledged?.[alertPlatform] ?? 0,
      color: '#8b5cf6',
      target: { path: '/alerts', params: { status: 'acknowledged', platform: alertPlatformKey } },
    },
    {
      label: 'False +',
      name: 'False Positive',
      value: alertData?.false_positive?.[alertPlatform] ?? 0,
      color: '#94a3b8',
      target: { path: '/alerts', params: { status: 'false_positive', platform: alertPlatformKey } },
    },
    {
      label: 'High',
      name: 'High',
      value: severity.high || 0,
      color: '#ef4444',
      target: { path: '/alerts', params: { status: 'active', category: 'high', platform: alertPlatformKey } },
    },
    {
      label: 'Medium',
      name: 'Medium',
      value: severity.medium || 0,
      color: '#f59e0b',
      target: { path: '/alerts', params: { status: 'active', category: 'medium', platform: alertPlatformKey } },
    },
    {
      label: 'Low',
      name: 'Low',
      value: severity.low || 0,
      color: '#22c55e',
      target: { path: '/alerts', params: { status: 'active', category: 'low', platform: alertPlatformKey } },
    },
  ];
  const reportSliceBase = reportData?.[reportPlatform] || reportData?.all || {};
  const reportPieData = [
    {
      label: 'Pending',
      name: 'Pending',
      value: reportSliceBase.sent_to_intermediary || 0,
      color: '#3b82f6',
      target: {
        path: '/alerts',
        params: { status: 'reports', reportStatus: 'sent_to_intermediary', platform: reportPlatformKey },
      },
    },
    {
      label: 'Closed',
      name: 'Closed',
      value: reportSliceBase.closed || 0,
      color: '#6366f1',
      target: {
        path: '/alerts',
        params: { status: 'reports', reportStatus: 'closed', platform: reportPlatformKey },
      },
    },
  ];
  const reportPieSlices = ensureMinSlice(reportPieData.filter((entry) => entry.value > 0));

  const grievanceSliceBase = grievanceData?.[grievancePlatformKey] || grievanceData?.all || {};
  const grievancePieData = [
    {
      label: 'Pending',
      name: 'Pending',
      value: grievanceSliceBase.pending || 0,
      color: '#f59e0b',
      target: { path: '/grievances', params: { tab: 'pending', platform: grievancePlatformKey } },
    },
    {
      label: 'Escalated',
      name: 'Escalated',
      value: grievanceSliceBase.escalated || 0,
      color: '#f97316',
      target: { path: '/grievances', params: { tab: 'escalated', platform: grievancePlatformKey } },
    },
    {
      label: 'Closed',
      name: 'Closed',
      value: grievanceSliceBase.closed || 0,
      color: '#10b981',
      target: { path: '/grievances', params: { tab: 'closed', platform: grievancePlatformKey } },
    },
  ];
  const grievancePieSlices = ensureMinSlice(grievancePieData.filter((entry) => entry.value > 0));

  const profileSliceBase = profileData?.[profilePlatformKey] || profileData?.all || {};
  const profilePieData = [
    {
      label: 'Active',
      name: 'Active',
      value: profileSliceBase.active || 0,
      color: '#8b5cf6',
      target: { path: '/social-profiles', params: { status: 'active', platform: profilePlatformKey } },
    },
    {
      label: 'Inactive',
      name: 'Inactive',
      value: profileSliceBase.inactive || 0,
      color: '#a1a1aa',
      target: { path: '/social-profiles', params: { status: 'inactive', platform: profilePlatformKey } },
    },
  ];
  const profilePieSlices = ensureMinSlice(profilePieData.filter((entry) => entry.value > 0));

  return (
    <div className="w-full space-y-3 animate-in fade-in duration-300" data-testid="dashboard">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 shrink-0">
          <h1 className="text-xl font-heading font-bold tracking-tight leading-none">Dashboard</h1>
          <p className="text-[11px] text-muted-foreground mt-0.5 hidden sm:block">
            Live overview — events, alerts, grievances, and profiles
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap ml-auto">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={handleRefresh}
            disabled={isRefreshing || loading}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
            {isRefreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {/* Main Content - Left */}
        <div className="flex-1 min-w-0 lg:min-w-[58%] space-y-3">
      <Suspense fallback={<LoadingSpinner />}>

        {/* ═══ Events Card ═══ */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border bg-muted/20">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                <CalendarDays className="h-4 w-4 text-amber-600" />
              </div>
              <div className="min-w-0">
                <span className="text-sm font-semibold leading-none">Events</span>
                <p className="text-[10px] text-muted-foreground mt-0.5">Monitoring started</p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                <p className="text-lg font-bold tabular-nums leading-none">{getEventCount()}</p>
                <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Live</p>
              </div>
              <Link to="/events" className="text-[11px] font-medium text-primary hover:underline inline-flex items-center gap-1">
                View <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>

            <div className="p-3 space-y-1.5 max-h-[148px] overflow-y-auto">
              {activeEvents.length > 0 ? (
                activeEvents.map((event, i) => (
                  <div key={event.id || i} className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-border bg-background hover:bg-muted/30 transition-colors">
                    <div className="w-1.5 h-1.5 rounded-full shrink-0 bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-medium truncate flex-1">
                      {event.name || `Event #${i + 1}`}
                    </span>
                    <span className="text-[9px] font-semibold text-emerald-600 uppercase tracking-wide">Live</span>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <CalendarDays className="h-7 w-7 mb-2 opacity-30" />
                  <p className="text-[11px]">No events currently monitoring</p>
                </div>
              )}
            </div>
        </div>

        <div className="min-h-[560px] h-[560px] min-h-0 overflow-hidden">
          <TodaysEventsWidget className="h-full" />
        </div>

      </Suspense>

      {/* ═══ Alert Workflow KPI — under Periscope, polls every 15s ═══ */}
      {/* Rendered OUTSIDE the Periscope Suspense so any TodaysEventsWidget   */}
      {/* loading state can't hide this card.                                 */}
      <WorkflowKpiCard />
    </div>

        {/* Stats Sidebar - Right */}
        <div className="w-full lg:w-[22rem] xl:w-[26rem] flex-shrink-0 space-y-3">
          <TooltipProvider>
            {/* ═══ 1. Active Alerts Card ═══ */}
            <Card className="rounded-xl border border-border bg-card overflow-hidden shadow-none">
              <div className="p-4 pt-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                    </div>
                    <span className="text-sm font-bold tracking-tight">Alerts Summary</span>
                  </div>
                  <Link to="/alerts" className="text-[11px] font-medium text-primary hover:underline inline-flex items-center gap-1">
                    View <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex-1 space-y-1.5">
                    <p className="text-3xl font-bold tabular-nums text-foreground leading-none">{alertData?.active?.[alertPlatform] ?? alertData?.active?.all ?? 0}</p>
                    <p className="text-[10px] text-muted-foreground font-medium">
                      {PLATFORMS.find(p => p.id === alertPlatform)?.label || 'All sources'}
                    </p>
                    <div className="relative">
                      <select
                        value={alertPlatform}
                        onChange={(e) => setAlertPlatform(e.target.value)}
                        className="appearance-none bg-muted/40 text-[10px] font-semibold text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring w-28 pr-5 px-2.5 py-1.5 rounded-md border border-border"
                      >
                        {ALERT_REPORT_PLATFORMS.map((p) => (
                          <option key={p.id} value={p.id}>{p.label}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-2.5 w-2.5 text-rose-400 pointer-events-none" />
                    </div>
                  </div>
                  <div className="w-[160px] flex-shrink-0 flex flex-col justify-center gap-2">
                    {(() => {
                      const maxAlertValue = Math.max(1, ...alertPieData.map(d => d.value || 0));
                      return alertPieData.map((item, idx) => {
                        const value = item.value || 0;
                        // Width scales with value; 0-count rows still show an
                        // 8% colored pill so the category color stays visible.
                        const pct = Math.max(8, Math.round((value / maxAlertValue) * 100));
                        const display = value >= 1000
                          ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K`
                          : value;
                        return (
                          <Tooltip key={idx}>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={() => navigateFromPieEntry(item)}
                                className="flex items-center gap-2 group cursor-pointer"
                              >
                                <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all duration-500 group-hover:brightness-110"
                                    style={{ width: `${pct}%`, backgroundColor: item.color }}
                                  />
                                </div>
                                <span className="text-[10px] font-bold text-foreground w-8 text-right tabular-nums">
                                  {display}
                                </span>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="text-xs font-bold">
                              {item.name}: {value.toLocaleString()}
                            </TooltipContent>
                          </Tooltip>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>

              <div className="px-4 py-2.5 border-t border-border bg-muted/20 grid grid-cols-5 gap-1">
                {alertPieData.map((item, i) => (
                  <Tooltip key={i}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => navigateFromPieEntry(item)}
                        className="text-center group cursor-pointer"
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <div className="w-2 h-2 rounded-full shadow-sm transition-transform group-hover:scale-125" style={{ backgroundColor: item.color }}></div>
                          <span className="text-[8px] text-muted-foreground leading-tight block font-semibold uppercase tracking-wider">{item.label}</span>
                        </div>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs font-bold">
                      {item.name}: {item.value?.toLocaleString()}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </Card>

            {/* ═══ 2. Escalated to SM Intermediaries Card ═══ */}
            <Card className="rounded-xl border border-border bg-card overflow-hidden shadow-none">
              <div className="p-4 pt-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-lg bg-sky-500/10 flex items-center justify-center">
                      <Send className="h-4 w-4 text-sky-600" />
                    </div>
                    <span className="text-xs font-bold leading-tight tracking-tight">Escalated to SM Intermediaries</span>
                  </div>
                  <Link
                    to={buildRouteWithParams('/alerts', { status: 'reports', reportStatus: 'sent_to_intermediary', platform: reportPlatformKey })}
                    className="text-[11px] font-medium text-primary hover:underline inline-flex items-center gap-1 shrink-0"
                  >
                    View <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex-1 space-y-1.5">
                    <p className="text-3xl font-bold tabular-nums text-foreground leading-none">{getReportCount()}</p>
                    <p className="text-[10px] text-muted-foreground font-medium">
                      {PLATFORMS.find(p => p.id === reportPlatform)?.label || 'All sources'}
                    </p>
                    <div className="relative">
                      <select
                        value={reportPlatform}
                        onChange={(e) => setReportPlatform(e.target.value)}
                        className="appearance-none bg-muted/40 text-[10px] font-semibold text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring w-28 pr-5 px-2.5 py-1.5 rounded-md border border-border"
                      >
                        {ALERT_REPORT_PLATFORMS.map((p) => (
                          <option key={p.id} value={p.id}>{p.label}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-2.5 w-2.5 text-blue-400 pointer-events-none" />
                    </div>
                  </div>
                  <div className="w-[150px] h-[150px] relative">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                      <PieChart>
                        <Pie
                          data={reportPieSlices}
                          cx="50%" cy="50%" innerRadius={32} outerRadius={62}
                          dataKey="displayValue" strokeWidth={2} stroke="hsl(var(--card))"
                          labelLine={false} label={renderCustomLabel}
                          animationBegin={0} animationDuration={800} animationEasing="ease-out"
                        >
                          {reportPieSlices.map((entry, idx) => (
                            <Cell
                              key={idx}
                              fill={entry.color}
                              className="drop-shadow-sm cursor-pointer"
                              onClick={() => navigateFromPieEntry(entry)}
                            />
                          ))}
                        </Pie>
                        <RechartsTooltip content={<CustomPieTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="px-4 py-2.5 border-t border-border bg-muted/20 flex gap-4">
                {reportPieData.map((item, i) => (
                  <Tooltip key={i}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => navigateFromPieEntry(item)}
                        className="flex-1 text-center group cursor-pointer"
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <div className="w-2 h-2 rounded-full shadow-sm transition-transform group-hover:scale-125" style={{ backgroundColor: item.color }}></div>
                          <span className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">{item.label}</span>
                        </div>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs font-bold">
                      {item.name}: {item.value?.toLocaleString()}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </Card>

            {/* ═══ 4. Grievances Card ═══ */}
            <Card className="rounded-xl border border-border bg-card overflow-hidden shadow-none">
              <div className="p-4 pt-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                      <Users className="h-4 w-4 text-emerald-600" />
                    </div>
                    <span className="text-sm font-bold tracking-tight">Grievances</span>
                  </div>
                  <Link to="/grievances" className="text-[11px] font-medium text-primary hover:underline inline-flex items-center gap-1">
                    View <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex-1 space-y-1.5">
                    <p className="text-3xl font-bold tabular-nums text-foreground leading-none">{getGrievanceCount()}</p>
                    <p className="text-[10px] text-muted-foreground font-medium">
                      {PLATFORMS.find(p => p.id === grievancePlatform)?.label || 'All sources'}
                    </p>
                    <div className="relative">
                      <select
                        value={grievancePlatform}
                        onChange={(e) => setGrievancePlatform(e.target.value)}
                        className="appearance-none bg-muted/40 text-[10px] font-semibold text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring w-28 pr-5 px-2.5 py-1.5 rounded-md border border-border"
                      >
                        {PLATFORMS.filter(p => p.id !== 'youtube').map((p) => (
                          <option key={p.id} value={p.id}>{p.label}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-2.5 w-2.5 text-emerald-400 pointer-events-none" />
                    </div>
                  </div>
                  <div className="w-[150px] h-[150px] relative">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                      <PieChart>
                        <Pie
                          data={grievancePieSlices}
                          cx="50%" cy="50%" innerRadius={32} outerRadius={62}
                          dataKey="displayValue" strokeWidth={2} stroke="hsl(var(--card))"
                          labelLine={false} label={renderCustomLabel}
                          animationBegin={0} animationDuration={800} animationEasing="ease-out"
                        >
                          {grievancePieSlices.map((entry, idx) => (
                            <Cell
                              key={idx}
                              fill={entry.color}
                              className="drop-shadow-sm cursor-pointer"
                              onClick={() => navigateFromPieEntry(entry)}
                            />
                          ))}
                        </Pie>
                        <RechartsTooltip content={<CustomPieTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="px-4 py-2.5 border-t border-border bg-muted/20 flex gap-4">
                {grievancePieData.map((item, i) => (
                  <Tooltip key={i}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => navigateFromPieEntry(item)}
                        className="flex-1 text-center group cursor-pointer"
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <div className="w-2 h-2 rounded-full shadow-sm transition-transform group-hover:scale-125" style={{ backgroundColor: item.color }}></div>
                          <span className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">{item.label}</span>
                        </div>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs font-bold">
                      {item.name}: {item.value?.toLocaleString()}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </Card>

            {/* ═══ 5. Profiles Card ═══ */}
            <Card className="rounded-xl border border-border bg-card overflow-hidden shadow-none">
              <div className="p-4 pt-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <UserSearch className="h-4 w-4 text-primary" />
                    </div>
                    <span className="text-sm font-bold tracking-tight">Profiles</span>
                  </div>
                  <Link to="/social-profiles" className="text-[11px] font-medium text-primary hover:underline inline-flex items-center gap-1">
                    View <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex-1 space-y-1.5">
                    <p className="text-3xl font-bold tabular-nums text-foreground leading-none">{getProfileCount()}</p>
                    <p className="text-[10px] text-muted-foreground font-medium">
                      {PROFILE_PLATFORMS.find(p => p.id === profilePlatform)?.label || 'All platforms'}
                    </p>
                    <div className="relative">
                      <select
                        value={profilePlatform}
                        onChange={(e) => setProfilePlatform(e.target.value)}
                        className="appearance-none bg-muted/40 text-[10px] font-semibold text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring w-28 pr-5 px-2.5 py-1.5 rounded-md border border-border"
                      >
                        {PROFILE_PLATFORMS.map((p) => (
                          <option key={p.id} value={p.id}>{p.label}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-2.5 w-2.5 text-violet-400 pointer-events-none" />
                    </div>
                  </div>
                  <div className="w-[150px] h-[150px] relative">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                      <PieChart>
                        <Pie
                          data={profilePieSlices}
                          cx="50%" cy="50%" innerRadius={32} outerRadius={62}
                          dataKey="displayValue" strokeWidth={2} stroke="hsl(var(--card))"
                          labelLine={false} label={renderCustomLabel}
                          animationBegin={0} animationDuration={800} animationEasing="ease-out"
                        >
                          {profilePieSlices.map((entry, idx) => (
                            <Cell
                              key={idx}
                              fill={entry.color}
                              className="drop-shadow-sm cursor-pointer"
                              onClick={() => navigateFromPieEntry(entry)}
                            />
                          ))}
                        </Pie>
                        <RechartsTooltip content={<CustomPieTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="px-4 py-2.5 border-t border-border bg-muted/20 flex gap-4">
                {profilePieData.map((item, i) => (
                  <Tooltip key={i}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => navigateFromPieEntry(item)}
                        className="flex-1 text-center group cursor-pointer"
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <div className="w-2 h-2 rounded-full shadow-sm transition-transform group-hover:scale-125" style={{ backgroundColor: item.color }}></div>
                          <span className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">{item.label}</span>
                        </div>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs font-bold">
                      {item.name}: {item.value?.toLocaleString()}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>

              <div className="px-4 py-2 border-t border-border bg-muted/10">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">New Profiles Added This Week</span>
                  <span className="text-sm font-bold tabular-nums text-foreground">{getProfileWeekAddedCount()}</span>
                </div>
              </div>
            </Card>


          </TooltipProvider>
        </div>
      </div>


    </div>
  );
};

export default Dashboard;
