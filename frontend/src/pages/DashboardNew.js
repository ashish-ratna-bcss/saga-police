import React, { useState, useEffect, lazy, Suspense, useRef } from 'react';
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
import { useDashboard } from '../contexts/DashboardContext';
import WorkflowKpiCard from '../components/dashboard/WorkflowKpiCard';

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
  const { dashboardData, loading, fetchDashboardData, refreshDashboard, hasCachedData } = useDashboard();
  const navigate = useNavigate();
  const [isRefreshing, setIsRefreshing] = useState(false);


  const [alertType, setAlertType] = useState('active');
  const [alertPlatform, setAlertPlatform] = useState('all');
  const [reportPlatform, setReportPlatform] = useState('all');
  const [reportStatus, setReportStatus] = useState('all');
  const [grievancePlatform, setGrievancePlatform] = useState('all');
  const [grievanceStatus, setGrievanceStatus] = useState('all');
  const [profilePlatform, setProfilePlatform] = useState('all');

  // Extract data from context
  const alertData = dashboardData?.alertData || {};
  const reportData = dashboardData?.reportData || {};
  const grievanceData = dashboardData?.grievanceData || {};
  const alertPendingReportData = dashboardData?.alertPendingReportData || {};
  const profileData = dashboardData?.profileData || {};
  const eventData = dashboardData?.eventData || {};

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshDashboard();
    setIsRefreshing(false);
  };

  if (loading && !hasCachedData) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="relative">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-violet-500/20 border-t-violet-600"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <Shield className="h-5 w-5 text-violet-600 animate-pulse" />
          </div>
        </div>
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
      target: { path: '/person-of-interest', params: { status: 'active', platform: profilePlatformKey } },
    },
    {
      label: 'Inactive',
      name: 'Inactive',
      value: profileSliceBase.inactive || 0,
      color: '#a1a1aa',
      target: { path: '/person-of-interest', params: { status: 'inactive', platform: profilePlatformKey } },
    },
  ];
  const profilePieSlices = ensureMinSlice(profilePieData.filter((entry) => entry.value > 0));

  return (
    <div className="animate-in fade-in duration-300 h-full overflow-y-auto" data-testid="dashboard">
      {/* Header with Refresh */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing || loading}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="flex flex-wrap gap-4">
        {/* Main Content - Left */}
<div className="flex-1 min-w-0 lg:min-w-[60%] space-y-4">
      <Suspense fallback={<LoadingSpinner />}>

        {/* ═══ Events Card (moved above Periscope) ═══ */}
        <Card className="relative overflow-hidden border border-amber-200/50 dark:border-amber-500/20 shadow-sm hover:shadow-lg hover:shadow-amber-500/5 transition-all duration-300">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-400" />
          <div className="p-4 pt-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg shadow-sm shadow-amber-200">
                  <CalendarDays className="h-4 w-4 text-white" />
                </div>
                <span className="text-sm font-bold tracking-tight">Events</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-end">
                  <p className="text-xl font-black bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent leading-none">{getEventCount()}</p>
                  <p className="text-[8px] text-muted-foreground uppercase font-bold tracking-tighter">Active</p>
                </div>
                <Link to="/events?status=active" className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 uppercase tracking-wider">
                  View <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>

            <div className="mt-4 space-y-1.5 max-h-[148px] overflow-y-auto pr-1 custom-scrollbar">
              {activeEvents.length > 0 ? (
                activeEvents.map((event, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-amber-50/50 dark:bg-amber-500/5 border border-amber-100/50 dark:border-amber-500/10 group hover:border-amber-300 transition-all">
                    <div className="w-1.5 h-1.5 rounded-full shrink-0 bg-green-500 animate-pulse" />
                    <span className="text-[11px] font-semibold truncate flex-1 text-foreground/80 group-hover:text-foreground">
                      {event.name || `Event #${i + 1}`}
                    </span>
                    <span className="text-[8px] font-bold text-green-600 dark:text-green-400 uppercase tracking-tighter">Live</span>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-muted-foreground/40">
                  <CalendarDays className="h-8 w-8 mb-2 opacity-20" />
                  <p className="text-[10px] font-medium italic">No active events found</p>
                </div>
              )}
            </div>
          </div>
        </Card>

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
        <div className="w-full lg:w-80 xl:w-[22rem] flex-shrink-0 space-y-4">
          <TooltipProvider>
            {/* ═══ 1. Active Alerts Card ═══ */}
            <Card className="relative overflow-hidden border border-rose-200/50 dark:border-rose-500/20 shadow-sm hover:shadow-lg hover:shadow-rose-500/5 transition-all duration-300">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 via-pink-500 to-rose-400" />
              <div className="p-4 pt-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-gradient-to-br from-rose-500 to-pink-600 rounded-lg shadow-sm shadow-rose-200">
                      <AlertTriangle className="h-4 w-4 text-white" />
                    </div>
                    <span className="text-sm font-bold tracking-tight">Alerts Summary</span>
                  </div>
                  <Link to="/intelligence-dashboard" className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1 uppercase tracking-wider">
                    View <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex-1 space-y-1.5">
                    <p className="text-4xl font-black bg-gradient-to-r from-rose-600 to-pink-600 bg-clip-text text-transparent leading-none">{alertData?.active?.[alertPlatform] ?? alertData?.active?.all ?? 0}</p>
                    <p className="text-[10px] text-muted-foreground font-medium">
                      {PLATFORMS.find(p => p.id === alertPlatform)?.label || 'All sources'}
                    </p>
                    <div className="relative">
                      <select
                        value={alertPlatform}
                        onChange={(e) => setAlertPlatform(e.target.value)}
                        className="appearance-none bg-rose-50 dark:bg-rose-500/10 text-[10px] font-semibold text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-rose-400/50 w-28 pr-5 px-2.5 py-1.5 rounded-lg border border-rose-200/50 dark:border-rose-500/20"
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

              <div className="px-4 py-3 border-t border-rose-100 dark:border-rose-500/10 bg-gradient-to-r from-rose-50/50 to-transparent dark:from-rose-500/5 grid grid-cols-5 gap-1">
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
            <Card className="relative overflow-hidden border border-blue-200/50 dark:border-blue-500/20 shadow-sm hover:shadow-lg hover:shadow-blue-500/5 transition-all duration-300">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-cyan-500 to-blue-400" />
              <div className="p-4 pt-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-lg shadow-sm shadow-blue-200">
                      <Send className="h-4 w-4 text-white" />
                    </div>
                    <span className="text-xs font-bold leading-tight tracking-tight">Escalated to SM Intermediaries</span>
                  </div>
                  <Link
                    to={buildRouteWithParams('/alerts', { status: 'reports', reportStatus: 'sent_to_intermediary', platform: reportPlatformKey })}
                    className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 flex-shrink-0 uppercase tracking-wider"
                  >
                    View <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex-1 space-y-1.5">
                    <p className="text-4xl font-black bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent leading-none">{getReportCount()}</p>
                    <p className="text-[10px] text-muted-foreground font-medium">
                      {PLATFORMS.find(p => p.id === reportPlatform)?.label || 'All sources'}
                    </p>
                    <div className="relative">
                      <select
                        value={reportPlatform}
                        onChange={(e) => setReportPlatform(e.target.value)}
                        className="appearance-none bg-blue-50 dark:bg-blue-500/10 text-[10px] font-semibold text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-400/50 w-28 pr-5 px-2.5 py-1.5 rounded-lg border border-blue-200/50 dark:border-blue-500/20"
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

              <div className="px-4 py-3 border-t border-blue-100 dark:border-blue-500/10 bg-gradient-to-r from-blue-50/50 to-transparent dark:from-blue-500/5 flex gap-4">
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
            <Card className="relative overflow-hidden border border-emerald-200/50 dark:border-emerald-500/20 shadow-sm hover:shadow-lg hover:shadow-emerald-500/5 transition-all duration-300">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-400" />
              <div className="p-4 pt-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg shadow-sm shadow-emerald-200">
                      <Users className="h-4 w-4 text-white" />
                    </div>
                    <span className="text-sm font-bold tracking-tight">Grievances</span>
                  </div>
                  <Link to="/grievances" className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 uppercase tracking-wider">
                    View <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex-1 space-y-1.5">
                    <p className="text-4xl font-black bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent leading-none">{getGrievanceCount()}</p>
                    <p className="text-[10px] text-muted-foreground font-medium">
                      {PLATFORMS.find(p => p.id === grievancePlatform)?.label || 'All sources'}
                    </p>
                    <div className="relative">
                      <select
                        value={grievancePlatform}
                        onChange={(e) => setGrievancePlatform(e.target.value)}
                        className="appearance-none bg-emerald-50 dark:bg-emerald-500/10 text-[10px] font-semibold text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-400/50 w-28 pr-5 px-2.5 py-1.5 rounded-lg border border-emerald-200/50 dark:border-emerald-500/20"
                      >
                        {PLATFORMS.filter(p => p.id !== 'youtube' && p.id !== 'instagram').map((p) => (
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

              <div className="px-4 py-3 border-t border-emerald-100 dark:border-emerald-500/10 bg-gradient-to-r from-emerald-50/50 to-transparent dark:from-emerald-500/5 flex gap-4">
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
            <Card className="relative overflow-hidden border border-violet-200/50 dark:border-violet-500/20 shadow-sm hover:shadow-lg hover:shadow-violet-500/5 transition-all duration-300">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-violet-400" />
              <div className="p-4 pt-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-gradient-to-br from-violet-500 to-fuchsia-600 rounded-lg shadow-sm shadow-violet-200">
                      <UserSearch className="h-4 w-4 text-white" />
                    </div>
                    <span className="text-sm font-bold tracking-tight">Profiles</span>
                  </div>
                  <Link to="/person-of-interest" className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1 uppercase tracking-wider">
                    View <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex-1 space-y-1.5">
                    <p className="text-4xl font-black bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent leading-none">{getProfileCount()}</p>
                    <p className="text-[10px] text-muted-foreground font-medium">
                      {PROFILE_PLATFORMS.find(p => p.id === profilePlatform)?.label || 'All platforms'}
                    </p>
                    <div className="relative">
                      <select
                        value={profilePlatform}
                        onChange={(e) => setProfilePlatform(e.target.value)}
                        className="appearance-none bg-violet-50 dark:bg-violet-500/10 text-[10px] font-semibold text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-violet-400/50 w-28 pr-5 px-2.5 py-1.5 rounded-lg border border-violet-200/50 dark:border-violet-500/20"
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

              <div className="px-4 py-3 border-t border-violet-100 dark:border-violet-500/10 bg-gradient-to-r from-violet-50/50 to-transparent dark:from-violet-500/5 flex gap-4">
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

              <div className="px-4 py-2 border-t border-violet-100 dark:border-violet-500/10 bg-violet-50/40 dark:bg-violet-500/5">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">New Profiles Added This Week</span>
                  <span className="text-sm font-black text-violet-700 dark:text-violet-300">{getProfileWeekAddedCount()}</span>
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
