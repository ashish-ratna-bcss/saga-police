import React, { useState, useCallback } from 'react';
import { ExternalLink, Youtube, Facebook, Instagram, Download, Repeat, Heart, MessageSquare, UserPlus, Play, ThumbsUp, Share2, Eye, Copy, Check, MapPin, Globe, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import ReactPlayer from 'react-player';
import { VideoPlayer } from './AlertCards';
import { TelegramBrandLogo, RedditBrandLogo } from './PlatformBrandIcon';
import { AlertService } from '../api';

/* ──────────────────────────────────────────────
   X (𝕏) Logo SVG — official glyph
   ────────────────────────────────────────────── */
const XLogo = ({ className = '' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

/* ──────────────────────────────────────────────
   Platform theme configs
   ────────────────────────────────────────────── */
const PLATFORM_THEMES = {
  x: {
    bg: 'bg-white dark:bg-zinc-900',
    text: 'text-zinc-900 dark:text-zinc-100',
    muted: 'text-zinc-500 dark:text-zinc-400',
    border: 'border-zinc-200 dark:border-zinc-700',
    accent: 'text-zinc-900 dark:text-zinc-100',
    icon: <XLogo className="h-4 w-4" />,
    name: '𝕏',
    engagement: [
      { key: 'comments', icon: MessageSquare, label: 'Replies' },
      { key: 'retweets', icon: Repeat, label: 'Reposts' },
      { key: 'likes', icon: Heart, label: 'Likes' },
      { key: 'views', icon: Eye, label: 'Views' }
    ]
  },
  youtube: {
    bg: 'bg-white dark:bg-zinc-900',
    text: 'text-zinc-900 dark:text-zinc-100',
    muted: 'text-zinc-500 dark:text-zinc-400',
    border: 'border-zinc-200 dark:border-zinc-700',
    accent: 'text-red-600',
    icon: <Youtube className="h-4 w-4 text-red-600" />,
    name: 'YouTube',
    engagement: [
      { key: 'views', icon: Eye, label: 'Views' },
      { key: 'likes', icon: ThumbsUp, label: 'Likes' },
      { key: 'comments', icon: MessageSquare, label: 'Comments' }
    ]
  },
  facebook: {
    bg: 'bg-white dark:bg-zinc-900',
    text: 'text-zinc-900 dark:text-zinc-100',
    muted: 'text-zinc-500 dark:text-zinc-400',
    border: 'border-zinc-200 dark:border-zinc-700',
    accent: 'text-blue-600',
    icon: <Facebook className="h-4 w-4 text-blue-600" />,
    name: 'Facebook',
    engagement: [
      { key: 'likes', icon: ThumbsUp, label: 'Like' },
      { key: 'comments', icon: MessageSquare, label: 'Comment' },
      { key: 'retweets', icon: Share2, label: 'Share' }
    ]
  },
  instagram: {
    bg: 'bg-white dark:bg-zinc-900',
    text: 'text-zinc-900 dark:text-zinc-100',
    muted: 'text-zinc-500 dark:text-zinc-400',
    border: 'border-zinc-200 dark:border-zinc-700',
    accent: 'text-pink-600',
    icon: <Instagram className="h-4 w-4 text-pink-600" />,
    name: 'Instagram',
    engagement: [
      { key: 'likes', icon: Heart, label: 'Likes' },
      { key: 'comments', icon: MessageSquare, label: 'Comments' }
    ]
  },
  telegram: {
    bg: 'bg-white dark:bg-zinc-900',
    text: 'text-zinc-900 dark:text-zinc-100',
    muted: 'text-zinc-500 dark:text-zinc-400',
    border: 'border-zinc-200 dark:border-zinc-700',
    accent: 'text-sky-600',
    icon: <TelegramBrandLogo className="h-4 w-4 text-sky-600" />,
    name: 'Telegram',
    engagement: [
      { key: 'views', icon: Eye, label: 'Views' },
      { key: 'comments', icon: MessageSquare, label: 'Replies' },
      { key: 'likes', icon: Heart, label: 'Reactions' }
    ]
  },
  reddit: {
    bg: 'bg-white dark:bg-zinc-900',
    text: 'text-zinc-900 dark:text-zinc-100',
    muted: 'text-zinc-500 dark:text-zinc-400',
    border: 'border-zinc-200 dark:border-zinc-700',
    accent: 'text-orange-600',
    icon: <RedditBrandLogo className="h-4 w-4 text-orange-600" />,
    name: 'Reddit',
    engagement: [
      { key: 'likes', icon: ThumbsUp, label: 'Upvotes' },
      { key: 'comments', icon: MessageSquare, label: 'Comments' }
    ]
  }
};

const DEFAULT_THEME = PLATFORM_THEMES.x;

/* ──────────────────────────────────────────────
   Media helpers
   ────────────────────────────────────────────── */
const getMediaUrl = (item) => {
  if (!item) return null;
  if (typeof item === 'string') return item || null;
  const raw = item.s3_url || item.url || item.video_url || item.original_video_url || item.original_url || null;
  return raw || null;
};

/* Facebook-specific: collect ALL candidate URLs for fallback chains */
const getAllMediaUrls = (item) => {
  if (!item) return [];
  if (typeof item === 'string') return [item].filter(Boolean);
  const urls = [item.s3_url, item.url, item.video_url, item.original_video_url, item.original_url, item.s3_preview, item.preview_url, item.preview, item.original_preview].filter(Boolean);
  return [...new Set(urls)];
};

const getVideoUrl = (item) => {
  if (!item) return null;
  if (typeof item === 'string') return item || null;
  const raw =
    item.video_url ||
    item.s3_url ||
    item.original_video_url ||
    item.url ||
    item.original_url ||
    null;
  return raw || null;
};

const getMediaPreview = (item) => {
  const raw = item?.s3_preview || item?.preview_url || item?.preview || item?.original_preview || null;
  return raw || null;
};

const getMediaType = (item) => {
  if (item.type === 'video' || item.type === 'animated_gif') return 'video';
  if (item.type === 'photo' || item.type === 'image') return 'photo';
  const url = getMediaUrl(item);
  if (!url) return 'photo';
  if (url.match(/\.(mp4|m3u8|webm|mov)(\?|$)/i)) return 'video';
  return 'photo';
};

const extractYouTubeId = (value) => {
  const input = String(value || '').trim();
  if (!input) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
  try {
    const url = new URL(input);
    const host = url.hostname.replace('www.', '').toLowerCase();
    if (host === 'youtu.be') {
      const seg = url.pathname.split('/').filter(Boolean)[0];
      return seg || null;
    }
    if (host.includes('youtube.com')) {
      const v = url.searchParams.get('v');
      if (v) return v;
      const parts = url.pathname.split('/').filter(Boolean);
      const embedIdx = parts.findIndex((p) => p === 'embed' || p === 'shorts' || p === 'live');
      if (embedIdx >= 0 && parts[embedIdx + 1]) return parts[embedIdx + 1];
    }
  } catch {
    return null;
  }
  return null;
};

/* ──────────────────────────────────────────────
   Facebook-specific fallback components
   ────────────────────────────────────────────── */

/* FacebookImage: tries each URL in sequence; shows placeholder if all fail */
const FacebookImage = ({ urls, alt, className }) => {
  const [urlIdx, setUrlIdx] = React.useState(0);
  const [failed, setFailed] = React.useState(false);

  const handleError = () => {
    if (urlIdx + 1 < urls.length) {
      setUrlIdx(urlIdx + 1);
    } else {
      setFailed(true);
    }
  };

  if (failed) {
    return (
      <div className={`flex flex-col items-center justify-center bg-blue-50 text-blue-400 ${className}`}>
        <Facebook className="h-8 w-8 mb-1 opacity-50" />
        <span className="text-[10px] font-medium opacity-60">Image unavailable</span>
      </div>
    );
  }

  return <img src={urls[urlIdx]} alt={alt} className={className} loading="lazy" onError={handleError} />;
};

/* FacebookVideoPlayer: tries <video> first, then ReactPlayer, then preview poster with "View on Facebook" */
const FacebookVideoPlayer = ({ videoUrl, preview, contentUrl, fallbackUrls }) => {
  const [mode, setMode] = React.useState('native'); // 'native' | 'reactplayer' | 'poster'

  const handleVideoError = () => {
    if (mode === 'native') setMode('reactplayer');
    else setMode('poster');
  };

  if (mode === 'native') {
    return (
      <video
        src={videoUrl}
        controls
        poster={preview || undefined}
        className="absolute top-0 left-0 w-full h-full object-cover"
        preload="metadata"
        onError={handleVideoError}
      />
    );
  }

  if (mode === 'reactplayer') {
    return (
      <ReactPlayer
        url={videoUrl}
        controls
        width="100%"
        height="100%"
        style={{ position: 'absolute', top: 0, left: 0 }}
        onError={handleVideoError}
        config={{ file: { attributes: { poster: preview || undefined } } }}
      />
    );
  }

  /* Poster fallback — show preview image with "View on Facebook" overlay */
  const posterSrc = preview || (fallbackUrls && fallbackUrls.find(u => u && /\.(jpg|jpeg|png|webp)/i.test(u)));
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900">
      {posterSrc ? (
        <img src={posterSrc} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
      ) : null}
      <div className="relative z-10 flex flex-col items-center gap-2">
        <div className="w-14 h-14 rounded-full bg-blue-600/90 flex items-center justify-center shadow-lg">
          <Play className="h-7 w-7 text-white ml-0.5" />
        </div>
        {contentUrl && (
          <a href={contentUrl} target="_blank" rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors shadow">
            View on Facebook
          </a>
        )}
      </div>
    </div>
  );
};

const MediaGrid = ({ media, platformTheme, platform, contentUrl, contentId }) => {
  if (!media || media.length === 0) return null;
  const validItems = media.filter(m => getMediaUrl(m));
  if (validItems.length === 0) return null;

  const isFacebook = platform === 'facebook';

  const renderItem = (item, idx) => {
    const url = getMediaUrl(item);
    const videoUrl = getVideoUrl(item);
    const preview = getMediaPreview(item);
    const type = getMediaType(item);
    const fallbackUrls = isFacebook ? getAllMediaUrls(item) : [];

    const handleDownload = (e, downloadUrl) => {
      e.preventDefault();
      e.stopPropagation();
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = downloadUrl.split('/').pop()?.split('?')[0] || 'download';
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    if (type === 'video') {
      const isYouTube =
        platform === 'youtube' ||
        url.includes('youtube.com') ||
        url.includes('youtu.be') ||
        String(contentUrl || '').includes('youtube.com') ||
        String(contentUrl || '').includes('youtu.be');
      const youtubeId =
        extractYouTubeId(contentId) ||
        extractYouTubeId(contentUrl) ||
        extractYouTubeId(url);

      return (
        <div key={idx} className={`relative w-full overflow-hidden rounded-xl ${platformTheme.border} border group bg-zinc-900 ${validItems.length > 1 ? 'h-40' : 'h-52'}`}>
          {isYouTube && youtubeId ? (
            <iframe
              src={`https://www.youtube.com/embed/${youtubeId}?rel=0&modestbranding=1`}
              title={`youtube-${youtubeId}`}
              className="absolute inset-0 h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          ) : isYouTube ? (
            <ReactPlayer
              url={contentUrl || url}
              controls
              width="100%"
              height="100%"
              style={{ position: 'absolute', top: 0, left: 0 }}
            />
          ) : isFacebook ? (
            <FacebookVideoPlayer videoUrl={videoUrl || url} preview={preview} contentUrl={contentUrl} fallbackUrls={fallbackUrls} />
          ) : (
            <div className="absolute inset-0 h-full w-full overflow-hidden">
              <VideoPlayer
                url={videoUrl || url}
                preview={preview || undefined}
                platform={platform}
                contentUrl={contentUrl}
              />
            </div>
          )}
          <button
            title="Download Media"
            onClick={(e) => handleDownload(e, videoUrl || url)}
            className="absolute top-2 right-2 p-1.5 rounded-md bg-black/60 text-white backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-black/80">
            <Download className="h-4 w-4" />
          </button>
        </div>
      );
    }

    /* Photo rendering with Facebook fallback chain */
    return (
      <div key={idx} className={`relative rounded-xl overflow-hidden ${platformTheme.border} border group ${validItems.length > 1 ? 'aspect-square max-h-40' : 'max-h-56'}`}>
        {isFacebook ? (
          <FacebookImage
            urls={fallbackUrls.length > 0 ? fallbackUrls : [url]}
            alt=""
            className="w-full h-full max-h-56 object-cover"
          />
        ) : (
          <img
            src={url}
            alt=""
            className="w-full h-full max-h-56 object-cover"
            loading="lazy"
            onError={(e) => { e.target.closest('div').style.display = 'none'; }}
          />
        )}
        <button
          title="Download Media"
          onClick={(e) => handleDownload(e, url)}
          className="absolute top-2 right-2 p-1.5 rounded-md bg-black/60 text-white backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-black/80">
          <Download className="h-4 w-4" />
        </button>
      </div>
    );
  };

  return (
    <div className={`${validItems.length > 1 ? 'grid grid-cols-2 gap-1' : ''} mt-3 rounded-xl overflow-hidden`}>
      {validItems.slice(0, 4).map(renderItem)}
    </div>
  );
};

const QuotedCard = ({ quoted, platformTheme }) => {
  if (!quoted) return null;
  const theme = platformTheme || DEFAULT_THEME;
  return (
    <div className={`mt-3 rounded-xl border ${theme.border} p-3 ${theme.bg}`}>
      <div className="flex items-center gap-2 mb-1.5">
        {quoted.profile_image_url && <img src={quoted.profile_image_url} className="h-5 w-5 rounded-full" alt="" />}
        <span className={`text-xs font-bold ${theme.text}`}>{quoted.author_name}</span>
        <span className={`text-[11px] ${theme.muted}`}>@{quoted.author_handle}</span>
      </div>
      <p className={`text-[13px] leading-relaxed line-clamp-4 ${theme.text}`}>{quoted.text}</p>
      {quoted.media && quoted.media.length > 0 && (
        <MediaGrid media={quoted.media} platformTheme={theme} />
      )}
    </div>
  );
};

const URLCard = ({ card, platformTheme }) => {
  if (!card || !card.expanded_url) return null;
  const theme = platformTheme || DEFAULT_THEME;
  let domain = '';
  try { domain = new URL(card.expanded_url).hostname.replace('www.', ''); } catch { domain = ''; }
  return (
    <a href={card.expanded_url} target="_blank" rel="noopener noreferrer"
      className={`block mt-3 rounded-xl border ${theme.border} overflow-hidden hover:opacity-90 transition-opacity`}>
      {card.image && (
        <div className="w-full aspect-[2/1] overflow-hidden bg-muted">
          <img src={card.image} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <div className={`p-3 ${theme.bg}`}>
        <div className={`text-[10px] ${theme.muted} uppercase tracking-wider`}>{domain}</div>
        <div className={`text-xs font-bold line-clamp-1 mt-0.5 ${theme.text}`}>{card.title}</div>
        {card.description && <div className={`text-[11px] ${theme.muted} line-clamp-2 mt-0.5`}>{card.description}</div>}
      </div>
    </a>
  );
};

/* ══════════════════════════════════════════════════════════
   ContentCard — Platform-themed content display
   ══════════════════════════════════════════════════════════ */
const ContentCard = ({ item, index, onDownload, onAddSource }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isTranslated, setIsTranslated] = useState(false);
  const [translatedText, setTranslatedText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const theme = PLATFORM_THEMES[item.platform] || DEFAULT_THEME;

  const cleanText = (t) => (t || '').replace(/\n*\[Image text\][\s\S]*$/i, '').replace(/\*\*Intent Detected:\*\*.*?(?:\n\n|\n|$)/g, '').trim();
  const rawText = item?.text || '';
  const postText = cleanText(rawText) || rawText;

  const handleTranslate = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isTranslated) {
      setIsTranslated(false);
      return;
    }
    if (translatedText) {
      setIsTranslated(true);
      return;
    }
    if (!postText) return;
    setIsTranslating(true);
    try {
      const res = await AlertService.translate(postText);
      if (res?.data?.translatedText) {
        setTranslatedText(res.data.translatedText);
        setIsTranslated(true);
      }
    } catch (err) {
      console.error('Translation failed:', err);
    } finally {
      setIsTranslating(false);
    }
  };

  const handleCopyText = useCallback(() => {
    const text = postText || '';
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [postText]);

  return (
    <div className={`rounded-2xl border ${theme.border} ${theme.bg} overflow-hidden shadow-sm hover:shadow-md transition-shadow`} data-testid={`content-item-${index}`}>
      <div className="p-4 space-y-2.5">

        {/* Top Bar: Platform + Timestamp + Sentiment + Actions */}
        <div className="flex items-center justify-between gap-2">
          <div className={`flex flex-wrap items-center gap-2 text-xs ${theme.muted}`}>
            {theme.icon}
            <span className="font-medium">{new Date(item.published_at).toLocaleString()}</span>
            {item.sentiment ? (
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${
                  String(item.sentiment).toLowerCase() === 'negative'
                    ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                    : String(item.sentiment).toLowerCase() === 'positive'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'bg-slate-500/15 text-slate-700 dark:text-slate-300'
                }`}
              >
                {item.sentiment}
              </span>
            ) : item.analysis_status && item.analysis_status !== 'done' ? (
              <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300 capitalize">
                {item.analysis_status === 'pending' || item.analysis_status === 'processing'
                  ? 'analyzing…'
                  : item.analysis_status}
              </span>
            ) : null}
            {item.risk_level ? (
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${
                  String(item.risk_level).toLowerCase() === 'high' ||
                  String(item.risk_level).toLowerCase() === 'critical'
                    ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                    : String(item.risk_level).toLowerCase() === 'medium'
                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                      : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                }`}
              >
                risk: {item.risk_level}
              </span>
            ) : null}
            {/* Stance is a separate judgment from sentiment above (author's
                position toward the tenant, not the post's overall tone) —
                kept as its own labeled badge so the two are never conflated. */}
            {item.stance ? (
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${
                  String(item.stance).toLowerCase() === 'oppose'
                    ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                    : String(item.stance).toLowerCase() === 'support'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : String(item.stance).toLowerCase() === 'unclear'
                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                        : 'bg-slate-500/15 text-slate-700 dark:text-slate-300'
                }`}
                title={
                  typeof item.stance_confidence === 'number'
                    ? `Confidence: ${Math.round(item.stance_confidence * 100)}%`
                    : undefined
                }
              >
                stance: {item.stance}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {onDownload && (
              <Button variant="ghost" size="sm" onClick={() => onDownload(item)}
                className={`h-7 px-2 text-[11px] ${theme.muted} hover:opacity-80 gap-1`}>
                <Download className="h-3 w-3" /> Save
              </Button>
            )}
            <Button asChild variant="ghost" size="sm" className={`h-7 px-2 text-[11px] ${theme.accent} gap-1`}>
              <a href={item.content_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3 w-3" /> Original
              </a>
            </Button>
          </div>
        </div>

        {/* Author Profile + Add Source */}
        <div className="flex items-center justify-between gap-3 min-w-0">
          <div className="flex items-center gap-2.5 min-w-0 shrink">
            {item.author_avatar && <img src={item.author_avatar} className="h-10 w-10 shrink-0 rounded-full border shadow-sm" alt="" />}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className={`font-bold text-sm leading-tight truncate ${theme.text}`}>{item.author}</h3>
                {item.verified && (
                  <div className={`${item.platform === 'x' ? 'bg-white text-black' : 'bg-sky-500 text-white'} rounded-full p-0.5`}>
                    <div className="w-2 h-2 bg-current rounded-full" />
                  </div>
                )}
              </div>
              <p className={`text-xs ${theme.muted} truncate`}>@{item.author_handle}</p>
              {item.location?.name && (
                <a
                  href={
                    typeof item.location.lat === 'number' && typeof item.location.lng === 'number'
                      ? `https://www.google.com/maps/search/?api=1&query=${item.location.lat},${item.location.lng}`
                      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location.name)}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  title={
                    (item.location.source === 'author_profile' ? 'Author profile location · ' : '') +
                    ([item.location.address, item.location.city, item.location.country].filter(Boolean).join(', ') || item.location.name)
                  }
                  className={`mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border ${theme.border} ${theme.muted} hover:opacity-80 transition-opacity max-w-full`}
                >
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {item.location.source === 'author_profile' ? `~ ${item.location.name}` : item.location.name}
                  </span>
                </a>
              )}
            </div>
          </div>
          {onAddSource && (
            <Button variant="outline" size="sm" onClick={() => onAddSource(item)}
              className="h-8 px-3 gap-1.5 text-xs font-semibold shrink-0 hover:bg-primary/5 hover:border-primary/30 transition-all">
              <UserPlus className="h-3.5 w-3.5" />
              Add to Monitor
            </Button>
          )}
        </div>

        {/* Text Content */}
        <div className="relative group/text">
          <p className={`text-[14px] leading-[1.6] whitespace-pre-wrap break-words select-text ${theme.text} ${isExpanded ? '' : 'line-clamp-4'} overflow-hidden`}>
            {isTranslated ? translatedText : postText}
          </p>
          {postText && (
            <button
              onClick={handleCopyText}
              title="Copy text"
              className={`absolute top-0 right-0 p-1 rounded-md opacity-0 group-hover/text:opacity-100 transition-all duration-150 ${copied ? 'text-emerald-600 bg-emerald-50' : `${theme.muted} bg-white/80 hover:bg-gray-100`}`}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          )}
          <div className="flex items-center gap-3 mt-1.5">
            {postText && (postText.length > 180 || (postText.match(/\n/g) || []).length > 3) && (
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className={`text-[12px] font-semibold text-primary hover:underline cursor-pointer`}
              >
                {isExpanded ? 'Read less' : 'Read more'}
              </button>
            )}
            {postText && (
              <button
                type="button"
                onClick={handleTranslate}
                disabled={isTranslating}
                className="text-[12px] font-semibold text-primary hover:underline inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                {isTranslating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Globe className="h-3 w-3" />
                )}
                <span>{isTranslated ? 'Show Original' : (isTranslating ? 'Translating...' : 'Translate')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Media */}
        <MediaGrid
          media={item.media}
          platformTheme={theme}
          platform={item.platform}
          contentUrl={item.content_url}
          contentId={item.content_id}
        />

        {/* Quoted */}
        {item.quoted_content && <QuotedCard quoted={item.quoted_content} platformTheme={theme} />}

        {/* URL Cards */}
        {item.url_cards && item.url_cards.map((card, idx) => <URLCard key={idx} card={card} platformTheme={theme} />)}

        {/* Engagement Metrics — platform specific */}
        <div className={`flex items-center gap-5 pt-2.5 border-t ${theme.border} text-xs ${theme.muted}`}>
          {theme.engagement.map(({ key, icon: Icon, label }) => {
            const val = Number(item.engagement?.[key] || 0);
            return (
              <div key={key} className="flex items-center gap-1.5 cursor-default hover:opacity-80 transition-opacity" title={label}>
                <Icon className="h-3.5 w-3.5" />
                <span>{val.toLocaleString()}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ContentCard;
