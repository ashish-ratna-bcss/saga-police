const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { fetchInstagramPostDetail } = require('../services/rapidApiInstagramService');
const { fetchTweetDetail } = require('../services/rapidApiXService');
const { enqueueForensicTask } = require('../services/forensicQueueService');
const youtubeService = require('../services/youtube.service');
const { protect } = require('../middleware/authMiddleware');
const router = express.Router();
const execFileAsync = promisify(execFile);

// Rollback: DEEPFAKE_AUTH_REQUIRED=false restores pre-E0 open access (not for production).
const deepfakeAuthRequired = String(process.env.DEEPFAKE_AUTH_REQUIRED || 'true').toLowerCase() !== 'false';
if (deepfakeAuthRequired) {
    router.use(protect);
}

// Configuration for Deepfake ML Service
// Use DEEPFAKE_ML_URL to avoid conflict with remote ML_SERVICE_URL
const DEEPFAKE_ML_URL = process.env.DEEPFAKE_ML_URL || 'http://localhost:8001';

const runHighPriorityForensicTask = (task, label) => enqueueForensicTask(task, {
    priority: 'high',
    label: `deepfake-page:${label}`
});

// Setup Multer for memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

const isHttpUrl = (value) => {
    try {
        const u = new URL(value);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
};

const toAbsoluteUrl = (value, baseUrl) => {
    if (!value) return null;
    try {
        return new URL(value, baseUrl).href;
    } catch {
        return null;
    }
};

const inferMediaTypeFromUrl = (value = '') => {
    const url = value.toLowerCase();
    if (url.match(/\.(svg)(\?|#|$)/)) return null;
    if (url.match(/\.(mp4|mov|mkv|webm|avi|m4v|m3u8)(\?|#|$)/)) return 'video';
    if (url.match(/\.(jpg|jpeg|png|webp|gif|bmp|tiff)(\?|#|$)/)) return 'image';
    return null;
};

const shouldSkipMediaUrl = (value = '') => {
    const url = String(value || '').toLowerCase();
    if (!url) return true;
    if (url.startsWith('data:')) return true;
    if (url.match(/\.(svg)(\?|#|$)/)) return true;
    // Skip common non-content assets often present in page chrome.
    if (url.includes('logo') || url.includes('favicon') || url.includes('sprite')) return true;
    // Skip Google image thumbnails / CDN noise — these are low-res search thumbnails,
    // not the actual target content.
    if (url.includes('gstatic.com') || url.includes('googleusercontent.com') || url.includes('google.com/images') || url.includes('encrypted-tbn')) return true;
    return false;
};

const collectUniqueMediaItems = (items, limit = 12) => {
    const seen = new Set();
    const unique = [];

    for (const item of items) {
        const normalizedUrl = toAbsoluteUrl(item?.url, item?.baseUrl);
        const type = item?.type || inferMediaTypeFromUrl(normalizedUrl || '');
        if (!normalizedUrl || !type || !isHttpUrl(normalizedUrl) || shouldSkipMediaUrl(normalizedUrl)) continue;

        const key = `${type}|${normalizedUrl}`;
        if (seen.has(key)) continue;

        seen.add(key);
        unique.push({ url: normalizedUrl, type });
        if (unique.length >= limit) break;
    }

    return unique;
};

const extractJsonUrls = (value, baseUrl, forcedType = null) => {
    const items = [];
    const visit = (current) => {
        if (!current) return;

        if (current && typeof current === 'object' && 'value' in current) {
            const absolute = toAbsoluteUrl(current.value, baseUrl);
            const type = current.forcedType || inferMediaTypeFromUrl(current.value);
            if (absolute && type) {
                items.push({ url: absolute, type });
            }
            return;
        }

        if (typeof current === 'string') {
            const trimmed = current.trim();
            const absolute = toAbsoluteUrl(trimmed, baseUrl);
            const type = forcedType || inferMediaTypeFromUrl(trimmed);
            if (absolute && type) {
                items.push({ url: absolute, type });
            }
            return;
        }

        if (Array.isArray(current)) {
            current.forEach(visit);
            return;
        }

        if (typeof current === 'object') {
            [
                ['contentUrl', 'video'],
                ['embedUrl', 'video'],
                ['thumbnailUrl', 'image'],
                ['image', 'image'],
                ['thumbnail', 'image'],
                ['url', null],
                ['src', null]
            ].forEach(([key, typeHint]) => {
                if (current[key]) visit(typeHint ? { value: current[key], forcedType: typeHint } : current[key]);
            });

            Object.values(current).forEach(value => {
                if (value && typeof value === 'object') visit(value);
            });
            return;
        }
    };

    visit(value);
    return items;
};

const extractMediaItemsWithBrowser = async (pageUrl) => {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });

        const page = await browser.newPage();
        const networkItems = [];

        page.on('response', response => {
            try {
                const request = response.request();
                const resourceType = request.resourceType();
                const responseUrl = response.url();
                const contentType = String(response.headers()?.['content-type'] || '').toLowerCase();

                if (!isHttpUrl(responseUrl) || shouldSkipMediaUrl(responseUrl)) return;

                if (resourceType === 'image' || contentType.startsWith('image/')) {
                    networkItems.push({ url: responseUrl, type: 'image' });
                    return;
                }

                if (resourceType === 'media' || contentType.startsWith('video/')) {
                    networkItems.push({ url: responseUrl, type: 'video' });
                }
            } catch {
                // Ignore response inspection failures.
            }
        });

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1440, height: 2000 });
        await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        await Promise.race([
            page.waitForSelector('img, video, meta[property="og:image"], meta[property="og:video"]', { timeout: 8000 }).catch(() => null),
            new Promise(resolve => setTimeout(resolve, 8000))
        ]);

        await new Promise(resolve => setTimeout(resolve, 1500));

        const rawItems = await page.evaluate(() => {
            const pushIfPresent = (items, value, type) => {
                if (!value || typeof value !== 'string') return;
                const trimmed = value.trim();
                if (!trimmed) return;
                items.push({ url: trimmed, type });
            };

            const fromSrcSet = (value) => {
                if (!value) return null;
                const first = String(value).split(',')[0]?.trim();
                return first ? first.split(/\s+/)[0] : null;
            };

            const items = [];

            document.querySelectorAll('meta[property="og:image"], meta[property="og:image:url"], meta[name="twitter:image"]').forEach(el => {
                pushIfPresent(items, el.getAttribute('content'), 'image');
            });
            document.querySelectorAll('meta[property="og:video"], meta[property="og:video:url"], meta[name="twitter:player"]').forEach(el => {
                pushIfPresent(items, el.getAttribute('content'), 'video');
            });

            document.querySelectorAll('img').forEach(el => {
                pushIfPresent(items, el.currentSrc || el.src, 'image');
                pushIfPresent(items, el.getAttribute('data-src'), 'image');
                pushIfPresent(items, fromSrcSet(el.getAttribute('srcset')), 'image');
            });

            document.querySelectorAll('video').forEach(el => {
                pushIfPresent(items, el.currentSrc || el.src, 'video');
                pushIfPresent(items, el.getAttribute('poster'), 'image');
            });

            document.querySelectorAll('video source, source').forEach(el => {
                const src = el.getAttribute('src');
                const inferredType = String(el.getAttribute('type') || '').includes('video') ? 'video' : null;
                pushIfPresent(items, src, inferredType);
            });

            document.querySelectorAll('script[type="application/ld+json"]').forEach(el => {
                const text = el.textContent;
                if (text) items.push({ url: text, type: 'json-ld' });
            });

            return items;
        });

        const structuredItems = [...networkItems];
        for (const item of rawItems) {
            if (item.type === 'json-ld') {
                try {
                    const parsed = JSON.parse(item.url);
                    structuredItems.push(...extractJsonUrls(parsed, pageUrl));
                } catch {
                    // Ignore malformed json-ld blocks.
                }
            } else {
                structuredItems.push(item);
            }
        }

        return collectUniqueMediaItems(structuredItems, 12);
    } catch (error) {
        (() => {})(`[Deepfake Link] Browser extraction failed for ${pageUrl}: ${error.message}`);
        return [];
    } finally {
        if (browser) {
            await browser.close().catch(() => {});
        }
    }
};

const extractInstagramRef = (url) => {
    const match = String(url || '').match(/instagram\.com\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
    if (!match) return null;
    const rawKind = String(match[1] || '').toLowerCase();
    const kind = rawKind === 'reels' ? 'reel' : rawKind;
    return { kind, shortcode: match[2] };
};

const getInstagramPublicUrls = (shortcode, kind = 'p') => {
    const base = `https://www.instagram.com/${kind}/${shortcode}/`;
    return {
        canonical: base,
        embed: `${base}embed/`,
        embedCaptioned: `${base}embed/captioned/`
    };
};

const isLikelyInstagramMediaUrl = (value = '') => {
    const url = String(value || '').toLowerCase();
    if (!url) return false;
    if (/cdninstagram|scontent|fbcdn/.test(url)) return true;
    if (url.includes('instagram.com') && url.match(/\.(mp4|m3u8)(\?|#|$)/)) return true;
    return false;
};

const extractMediaItemsWithYtDlp = async (pageUrl) => {
    try {
        const { stdout } = await execFileAsync('yt-dlp', ['--skip-download', '--dump-single-json', pageUrl], {
            timeout: 30000,
            maxBuffer: 8 * 1024 * 1024,
            windowsHide: true
        });

        if (!stdout) return [];

        const parsed = JSON.parse(stdout);
        const entries = Array.isArray(parsed?.entries) ? parsed.entries : [parsed];
        const out = [];

        for (const entry of entries) {
            if (!entry || typeof entry !== 'object') continue;

            const directVideoUrl = typeof entry.url === 'string' ? entry.url : null;
            const thumbnail = typeof entry.thumbnail === 'string' ? entry.thumbnail : null;

            if (directVideoUrl && isHttpUrl(directVideoUrl)) {
                out.push({ url: directVideoUrl, type: 'video' });
            }

            if (thumbnail && isHttpUrl(thumbnail)) {
                out.push({ url: thumbnail, type: 'image' });
            }
        }

        return collectUniqueMediaItems(out, 12);
    } catch (error) {
        (() => {})(`[Deepfake Link] yt-dlp extraction failed for ${pageUrl}: ${error.message}`);
        return [];
    }
};

const getInstagramOEmbedUrls = (postUrl) => {
    const encoded = encodeURIComponent(postUrl);
    return [
        `https://www.instagram.com/api/v1/oembed/?omitscript=true&url=${encoded}`,
        `https://www.instagram.com/api/v1/oembed/?url=${encoded}`,
        `https://api.instagram.com/oembed/?omitscript=true&url=${encoded}`,
        `https://api.instagram.com/oembed/?url=${encoded}`
    ];
};

const extractInstagramMediaFromJson = (data) => {
    const out = [];
    const push = (url, type) => {
        if (!url || !isHttpUrl(url) || shouldSkipMediaUrl(url)) return;
        out.push({ url, type });
    };

    const walk = (node) => {
        if (!node || typeof node !== 'object') return;

        if (typeof node.video_url === 'string') {
            push(node.video_url, 'video');
        }

        const videoVersions = Array.isArray(node.video_versions) ? node.video_versions : [];
        videoVersions.forEach(v => push(v?.url, 'video'));

        const imageCandidates = node.image_versions2?.candidates;
        if (Array.isArray(imageCandidates)) {
            push(imageCandidates[0]?.url, 'image');
        }

        const carousel = Array.isArray(node.carousel_media) ? node.carousel_media : [];
        carousel.forEach(walk);

        Object.values(node).forEach(value => {
            if (value && typeof value === 'object') walk(value);
        });
    };

    walk(data);
    return collectUniqueMediaItems(out, 12);
};

const extractTweetId = (url) => {
    const match = String(url || '').match(/status\/(\d+)/i);
    return match ? match[1] : null;
};

const extractYouTubeId = (url) => {
    const input = String(url || '');
    let match = input.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
    if (match) return match[1];
    match = input.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
    if (match) return match[1];
    match = input.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})/);
    if (match) return match[1];
    match = input.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/);
    return match ? match[1] : null;
};

const extractTikTokVideoId = (url) => {
    const input = String(url || '');
    let match = input.match(/video\/(\d+)/);
    if (match) return match[1];
    match = input.match(/\/@[\w.-]+\/video\/(\d+)/);
    if (match) return match[1];
    match = input.match(/vt\.tiktok\.com\/(\w+)/);
    if (match) return match[1];
    return null;
};

const extractFacebookPostId = (url) => {
    const input = String(url || '');
    let match = input.match(/facebook\.com.*story\.php\?story_fbid=(\d+)/);
    if (match) return match[1];
    match = input.match(/facebook\.com\/[\w.-]+\/posts\/(\d+)/);
    if (match) return match[1];
    match = input.match(/facebook\.com\/video\.php\?v=(\d+)/);
    if (match) return match[1];
    match = input.match(/facebook\.com\/watch\/\?v=(\d+)/);
    if (match) return match[1];
    return null;
};

const resolveSocialMediaItems = async (url) => {
    const mediaItems = [];

    if (/instagram\.com\//i.test(url)) {
        const igRef = extractInstagramRef(url);
        if (igRef) {
            const { shortcode, kind } = igRef;
            const instagramUrls = getInstagramPublicUrls(shortcode, kind);

            // 0) For reels, try yt-dlp first to get direct video stream URLs.
            if (kind === 'reel') {
                const ytdlpItems = await extractMediaItemsWithYtDlp(instagramUrls.canonical);
                const reelVideos = ytdlpItems.filter(item => item.type === 'video' && isLikelyInstagramMediaUrl(item.url));
                if (reelVideos.length) {
                    mediaItems.push(...reelVideos);
                }
            }

            // 1) Try Instagram JSON endpoint for public media details.
            // This often exposes `video_url` for reels.
            try {
                const jsonRes = await axios.get(`${instagramUrls.canonical}?__a=1&__d=dis`, {
                    timeout: 12000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'X-IG-App-ID': '936619743392459',
                        'Accept': 'application/json,text/plain,*/*'
                    }
                });

                const jsonItems = extractInstagramMediaFromJson(jsonRes.data)
                    .filter(item => isLikelyInstagramMediaUrl(item.url));

                if (jsonItems.length) {
                    if (kind === 'reel') {
                        const videosFirst = [...jsonItems].sort((a, b) => (a.type === 'video' ? -1 : 1) - (b.type === 'video' ? -1 : 1));
                        mediaItems.push(...videosFirst);
                    } else {
                        mediaItems.push(...jsonItems);
                    }
                }
            } catch (jsonErr) {
                (() => {})(`[Deepfake Link] Instagram JSON media failed for ${shortcode}: ${jsonErr?.response?.status || jsonErr.message}`);
            }

            // 2. Try Instagram public oEmbed — works for public posts, no key needed
            for (const oembedUrl of getInstagramOEmbedUrls(instagramUrls.canonical)) {
                if (mediaItems.length) break;
                try {
                    const oRes = await axios.get(oembedUrl, {
                        timeout: 10000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0',
                            'Accept': 'application/json,text/html;q=0.9,*/*;q=0.8'
                        }
                    });

                    const thumb = oRes.data?.thumbnail_url;
                    if (thumb && isHttpUrl(thumb) && !shouldSkipMediaUrl(thumb)) {
                        mediaItems.push({ url: thumb, type: 'image' });
                        break;
                    }

                    const embedHtml = typeof oRes.data?.html === 'string' ? oRes.data.html : '';
                    if (embedHtml) {
                        const extracted = extractMediaItemsFromHtml(embedHtml, instagramUrls.embed)
                            .filter(item => isLikelyInstagramMediaUrl(item.url));
                        if (extracted.length) {
                            mediaItems.push(...extracted);
                            break;
                        }
                    }
                } catch (oErr) {
                    (() => {})(`[Deepfake Link] Instagram oEmbed failed for ${shortcode}: ${oErr?.response?.status || oErr.message}`);
                }
            }

            // 3. Try public embed pages — these are much more accessible than the main post URL.
            if (!mediaItems.length) {
                for (const embedUrl of [instagramUrls.embedCaptioned, instagramUrls.embed]) {
                    try {
                        const embedRes = await axios.get(embedUrl, {
                            timeout: 15000,
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                            }
                        });

                        const extracted = extractMediaItemsFromHtml(embedRes.data, embedUrl)
                            .filter(item => isLikelyInstagramMediaUrl(item.url));

                        if (extracted.length) {
                            if (kind === 'reel') {
                                const videosFirst = [...extracted].sort((a, b) => (a.type === 'video' ? -1 : 1) - (b.type === 'video' ? -1 : 1));
                                mediaItems.push(...videosFirst);
                            } else {
                                mediaItems.push(...extracted);
                            }
                            break;
                        }
                    } catch (embedErr) {
                        (() => {})(`[Deepfake Link] Instagram embed page failed for ${shortcode}: ${embedErr?.response?.status || embedErr.message}`);
                    }
                }
            }

            // 4. Browser fallback against the public embed URLs instead of the login wall page.
            if (!mediaItems.length) {
                const browserTargets = kind === 'reel'
                    ? [instagramUrls.embedCaptioned, instagramUrls.embed, instagramUrls.canonical]
                    : [instagramUrls.embedCaptioned, instagramUrls.embed];

                for (const embedUrl of browserTargets) {
                    const browserItems = await extractMediaItemsWithBrowser(embedUrl);
                    const filteredBrowserItems = browserItems.filter(item => isLikelyInstagramMediaUrl(item.url));
                    if (filteredBrowserItems.length) {
                        if (kind === 'reel') {
                            const videosFirst = [...filteredBrowserItems].sort((a, b) => (a.type === 'video' ? -1 : 1) - (b.type === 'video' ? -1 : 1));
                            mediaItems.push(...videosFirst);
                        } else {
                            mediaItems.push(...filteredBrowserItems);
                        }
                        break;
                    }
                }
            }

            // 5. Fall through to RapidAPI
            if (!mediaItems.length) {
                const detail = await fetchInstagramPostDetail(shortcode);
                const media = Array.isArray(detail?.media) ? detail.media : [];
                media.forEach(item => {
                    const mediaUrl = item?.url;
                    if (!mediaUrl) return;
                    const type = String(item?.type || '').toLowerCase().includes('video') ? 'video' : 'image';
                    mediaItems.push({ url: mediaUrl, type });
                });
            }

            // For reels, prefer real video assets over thumbnails when available.
            if (kind === 'reel') {
                const reelVideos = mediaItems.filter(item => item.type === 'video');
                if (reelVideos.length) {
                    mediaItems.length = 0;
                    mediaItems.push(...reelVideos);
                } else {
                    // Do not silently degrade to a thumbnail image for reels.
                    // Hand off the canonical reel page URL as a video source so the
                    // ML service can resolve/download the actual reel video.
                    mediaItems.length = 0;
                    mediaItems.push({ url: instagramUrls.canonical, type: 'video' });
                }
            }
        }
    }

    if ((/x\.com\//i.test(url) || /twitter\.com\//i.test(url)) && !mediaItems.length) {
        // Strategy: Browser extraction (fast) → RapidAPI (reliable)
        (() => {})(`[Deepfake Link] Twitter extraction starting for: ${url}`);
        
        // 1. Try browser-based extraction first (works without API keys)
        let browserItems = [];
        try {
            (() => {})(`[Deepfake Link] Attempting browser extraction for Twitter...`);
            browserItems = await extractMediaItemsWithBrowser(url);
            if (browserItems.length) {
                (() => {})(`[Deepfake Link] Browser extraction found ${browserItems.length} items from Twitter`);
                mediaItems.push(...browserItems);
            }
        } catch (browserErr) {
            (() => {})(`[Deepfake Link] Twitter browser extraction failed: ${browserErr.message}`);
        }

        // 2. Fallback to RapidAPI if browser didn't find anything
        if (!mediaItems.length) {
            try {
                (() => {})(`[Deepfake Link] Attempting RapidAPI extraction for Twitter...`);
                const tweetId = extractTweetId(url);
                if (tweetId) {
                    const detail = await fetchTweetDetail(tweetId);
                    const media = Array.isArray(detail?.media) ? detail.media : [];
                    if (media.length) {
                        (() => {})(`[Deepfake Link] RapidAPI found ${media.length} media items from Twitter`);
                    }
                    media.forEach(item => {
                        const mediaUrl = item?.url || item?.preview;
                        if (!mediaUrl) return;
                        const type = String(item?.type || '').toLowerCase().includes('video') ? 'video' : 'image';
                        mediaItems.push({ url: mediaUrl, type });
                    });
                }
            } catch (rapidErr) {
                (() => {})(`[Deepfake Link] Twitter RapidAPI fallback failed: ${rapidErr.message}`);
                // If RapidAPI also fails, try to at least get the thumbnail from og:image
                try {
                    const twitterRes = await axios.get(url, {
                        timeout: 15000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                        }
                    });
                    const extracted = extractMediaItemsFromHtml(twitterRes.data, url);
                    if (extracted.length) {
                        (() => {})(`[Deepfake Link] HTML extraction found ${extracted.length} items from Twitter`);
                        mediaItems.push(...extracted);
                    }
                } catch (htmlErr) {
                    (() => {})(`[Deepfake Link] Twitter HTML extraction also failed: ${htmlErr.message}`);
                }
            }
        }

        if (mediaItems.length) {
            (() => {})(`[Deepfake Link] Twitter: Successfully extracted ${mediaItems.length} media items`);
        } else {
            (() => {})(`[Deepfake Link] Twitter: Could not extract any media items`);
            // Always fall back to the tweet URL as a video source so ML service
            // can resolve the real media via yt-dlp.
            mediaItems.push({ url, type: 'video' });
        }
    }

    if ((/youtube\.com\//i.test(url) || /youtu\.be\//i.test(url)) && !mediaItems.length) {
        // Prefer yt-dlp so YouTube links are analyzed as video rather than only thumbnail images.
        const ytdlpItems = await extractMediaItemsWithYtDlp(url);
        const videoItems = ytdlpItems.filter(item => item.type === 'video');
        if (videoItems.length) {
            mediaItems.push(...videoItems);
        } else {
            const videoId = extractYouTubeId(url);
            if (videoId) {
                try {
                    const details = await youtubeService.getVideoDetails([videoId]);
                    const video = Array.isArray(details) ? details[0] : null;
                    const thumb = video?.thumbnails?.maxres?.url || video?.thumbnails?.standard?.url || video?.thumbnails?.high?.url || video?.thumbnails?.medium?.url || video?.thumbnails?.default?.url;
                    if (thumb) {
                        mediaItems.push({ url: thumb, type: 'image' });
                    }
                } catch (ytApiErr) {
                    (() => {})(`[Deepfake Link] YouTube metadata fallback failed: ${ytApiErr.message}`);
                }
            }

            // Keep flow alive — pass YouTube URL to ML service for yt-dlp resolution.
            if (!mediaItems.length) {
                mediaItems.push({ url, type: 'video' });
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // ─ FACEBOOK VIDEO & POST EXTRACTION
    // ═══════════════════════════════════════════════════════════
    if (/facebook\.com\//i.test(url) && !mediaItems.length) {
        // Try yt-dlp first for direct video resolution
        const ytdlpItems = await extractMediaItemsWithYtDlp(url);
        const videoItems = ytdlpItems.filter(item => item.type === 'video');
        if (videoItems.length) {
            mediaItems.push(...videoItems);
        } else {
            // Fallback to browser extraction and OG tags
            try {
                const facebookRes = await axios.get(url, {
                    timeout: 20000,
                    maxRedirects: 5,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    }
                });

                const extracted = extractMediaItemsFromHtml(facebookRes.data, url);
                if (extracted.length) {
                    const videoFirst = [...extracted].sort((a, b) => (a.type === 'video' ? -1 : 1) - (b.type === 'video' ? -1 : 1));
                    mediaItems.push(...videoFirst);
                }
            } catch (fbErr) {
                (() => {})(`[Deepfake Link] Facebook extraction failed: ${fbErr.message}`);
            }

            // Browser fallback if no media found
            if (!mediaItems.length) {
                const browserItems = await extractMediaItemsWithBrowser(url);
                if (browserItems.length) {
                    const videoFirst = [...browserItems].sort((a, b) => (a.type === 'video' ? -1 : 1) - (b.type === 'video' ? -1 : 1));
                    mediaItems.push(...videoFirst);
                }
            }

            if (!mediaItems.length) {
                // Keep end-to-end flow alive by passing the page URL for ML-side
                // yt-dlp resolution.
                mediaItems.push({ url, type: 'video' });
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // ─ TIKTOK VIDEO EXTRACTION
    // ═══════════════════════════════════════════════════════════
    if (/tiktok\.com\//i.test(url) && !mediaItems.length) {
        // TikTok heavily relies on JavaScript; yt-dlp is the most reliable approach
        const ytdlpItems = await extractMediaItemsWithYtDlp(url);
        if (ytdlpItems.length) {
            // TikTok is always video-first
            const videoItems = ytdlpItems.filter(item => item.type === 'video');
            if (videoItems.length) {
                mediaItems.push(...videoItems);
            } else {
                mediaItems.push(...ytdlpItems);
            }
        }

        // Browser fallback for metadata
        if (!mediaItems.length) {
            try {
                const browserItems = await extractMediaItemsWithBrowser(url);
                const videoItems = browserItems.filter(item => item.type === 'video');
                if (videoItems.length) {
                    mediaItems.push(...videoItems);
                } else if (browserItems.length) {
                    mediaItems.push(...browserItems);
                }
            } catch (tkErr) {
                (() => {})(`[Deepfake Link] TikTok extraction failed: ${tkErr.message}`);
            }
        }

        if (!mediaItems.length) {
            mediaItems.push({ url, type: 'video' });
        }
    }

    return mediaItems;
};

const normalizeBatchItem = (item, req) => {
    const buildSourceProxyUrl = (rawUrl) => {
        if (!rawUrl || !isHttpUrl(rawUrl)) return null;
        return `${req.protocol}://${req.get('host')}/api/deepfake/source?url=${encodeURIComponent(rawUrl)}`;
    };

    const previewCandidate = item.playbackUrl || item.resolvedUrl || item.url;

    const normalized = {
        ...item,
        label: item.label || item.verdict || 'UNKNOWN',
        type: item.type || inferMediaTypeFromUrl(item.url) || 'video',
        previewUrl: buildSourceProxyUrl(previewCandidate) || previewCandidate || null
    };

    if (normalized.full_forensic_timeline) {
        normalized.full_forensic_timeline = normalized.full_forensic_timeline.map(frame => ({
            ...frame,
            imageUrl: frame.imageUrl ? `${req.protocol}://${req.get('host')}/api/deepfake/forensics/${frame.imageUrl.split('/').pop()}` : null
        }));
    }

    if (normalized.top_suspicious_frames) {
        normalized.top_suspicious_frames = normalized.top_suspicious_frames.map(frame => ({
            ...frame,
            imageUrl: frame.imageUrl ? `${req.protocol}://${req.get('host')}/api/deepfake/forensics/${frame.imageUrl.split('/').pop()}` : null
        }));
    }

    return normalized;
};

const extractMediaItemsFromHtml = (html, baseUrl) => {
    const $ = cheerio.load(html);
    const collected = [];

    const pushMedia = (rawUrl, forcedType = null) => {
        const abs = toAbsoluteUrl(rawUrl, baseUrl);
        if (!abs || !isHttpUrl(abs)) return;
        if (shouldSkipMediaUrl(abs)) return;
        const type = forcedType || inferMediaTypeFromUrl(abs);
        if (!type) return;
        collected.push({ url: abs, type });
    };

    // Meta tags from OG/Twitter cards
    pushMedia($('meta[property="og:video"]').attr('content'), 'video');
    pushMedia($('meta[property="og:video:url"]').attr('content'), 'video');
    pushMedia($('meta[property="og:image"]').attr('content'), 'image');
    pushMedia($('meta[property="og:image:url"]').attr('content'), 'image');
    pushMedia($('meta[property="og:image:secure_url"]').attr('content'), 'image');
    pushMedia($('meta[name="twitter:image"]').attr('content'), 'image');
    pushMedia($('meta[name="twitter:image:src"]').attr('content'), 'image');
    pushMedia($('meta[name="twitter:player"]').attr('content'), 'video');
    pushMedia($('link[rel="image_src"]').attr('href'), 'image');

    $('script[type="application/ld+json"]').each((_, el) => {
        const text = $(el).contents().text();
        if (!text) return;
        try {
            const parsed = JSON.parse(text);
            collected.push(...extractJsonUrls(parsed, baseUrl));
        } catch {
            // Ignore malformed json-ld blocks.
        }
    });

    // Video/image tags in the page
    $('video').each((_, el) => {
        pushMedia($(el).attr('src'), 'video');
        pushMedia($(el).attr('poster'), 'image');
    });
    $('video source').each((_, el) => pushMedia($(el).attr('src'), 'video'));
    $('img').each((_, el) => {
        pushMedia($(el).attr('src'), 'image');
        pushMedia($(el).attr('srcset')?.split(',')[0]?.trim()?.split(/\s+/)?.[0], 'image');
        pushMedia($(el).attr('data-src'), 'image');
        pushMedia($(el).attr('data-original'), 'image');
    });

    $('[style*="background-image"]').each((_, el) => {
        const style = $(el).attr('style') || '';
        const match = style.match(/url\((['"]?)(.*?)\1\)/i);
        if (match?.[2]) pushMedia(match[2], 'image');
    });

    $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        const inferredType = inferMediaTypeFromUrl(href || '');
        if (inferredType) pushMedia(href, inferredType);
    });

    return collectUniqueMediaItems(collected, 12);
};

/**
 * @route   POST /api/deepfake/image
 * @desc    Analyze an image for deepfakes
 */
router.post('/image', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No image file uploaded' });
        }

        const formData = new FormData();
        formData.append('file', req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype
        });

        // Bypass Node.js queue — call Python directly.
        // Python's PriorityLock (priority=1) ensures UI gets GPU
        // ahead of batch items even if a batch is in progress.
        const response = await axios.post(`${DEEPFAKE_ML_URL}/detect/image`, formData, {
            headers: {
                ...formData.getHeaders(),
                'x-api-key': process.env.GATEWAY_API_KEY || ''
            }
        });

        const responseData = response.data;

        // Normalize for frontend
        const finalResult = {
            ...responseData,
            label: responseData.label || responseData.verdict || 'UNKNOWN',
            type: 'image'
        };

        res.json(finalResult);
    } catch (error) {
        (() => {})('Deepfake Image Analysis Error:', error.message);
        const status = error.response?.status || 500;
        const message = error.response?.data?.detail || 'Deepfake image analysis failed';
        res.status(status).json({ message, error: error.message });
    }
});

/**
 * @route   POST /api/deepfake/video
 * @desc    Analyze a video for deepfakes
 */
router.post('/video', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No video file uploaded' });
        }

        const formData = new FormData();
        formData.append('file', req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype
        });

        // Bypass Node.js queue — call Python directly.
        // Python's PriorityLock (priority=1) ensures UI gets GPU
        // ahead of batch items even if a batch is in progress.
        const response = await axios.post(`${DEEPFAKE_ML_URL}/detect/video`, formData, {
            headers: {
                ...formData.getHeaders(),
                'x-api-key': process.env.GATEWAY_API_KEY || ''
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            timeout: 300000 // 5 minutes for video processing
        });

        const responseData = response.data;

        // Rewrite imageUrls to be served through the backend proxy
        if (responseData.full_forensic_timeline) {
            responseData.full_forensic_timeline = responseData.full_forensic_timeline.map(frame => ({
                ...frame,
                imageUrl: frame.imageUrl ? `${req.protocol}://${req.get('host')}/api/deepfake/forensics/${frame.imageUrl.split('/').pop()}` : null
            }));
        }
        if (responseData.top_suspicious_frames) {
            responseData.top_suspicious_frames = responseData.top_suspicious_frames.map(frame => ({
                ...frame,
                imageUrl: frame.imageUrl ? `${req.protocol}://${req.get('host')}/api/deepfake/forensics/${frame.imageUrl.split('/').pop()}` : null
            }));
        }

        // Normalize for frontend
        const finalResult = {
            ...responseData,
            label: responseData.label || responseData.verdict || 'UNKNOWN',
            type: 'video'
        };

        res.json(finalResult);
    } catch (error) {
        (() => {})('Deepfake Video Analysis Error:', error.message);
        const status = error.response?.status || 500;
        const message = error.response?.data?.detail || 'Deepfake video analysis failed';
        res.status(status).json({ message, error: error.message });
    }
});

/**
 * @route   POST /api/deepfake/link
 * @desc    Analyze media discovered from a pasted webpage URL
 */
router.post('/link', async (req, res) => {
    try {
        const { url } = req.body || {};
        if (!url || !isHttpUrl(url)) {
            return res.status(400).json({ message: 'A valid URL is required' });
        }

        let mediaItems = [];
        const directType = inferMediaTypeFromUrl(url);
        const isSocialUrl = /instagram\.com|x\.com|twitter\.com|youtube\.com|youtu\.be|facebook\.com|fb\.watch|tiktok\.com/i.test(url);

        if (directType) {
            mediaItems = [{ url, type: directType }];
        } else if (isSocialUrl) {
            // Social pages often serve sparse or misleading HTML. Try the targeted
            // platform resolver first, then a real browser pass.
            mediaItems = await resolveSocialMediaItems(url);
            if (!mediaItems.length) {
                mediaItems = await extractMediaItemsWithBrowser(url);
            }
        } else {
            try {
                const pageRes = await axios.get(url, {
                    timeout: 20000,
                    maxRedirects: 5,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    }
                });

                const finalUrl = pageRes.request?.res?.responseUrl || url;
                const contentType = String(pageRes.headers?.['content-type'] || '').toLowerCase();
                if (contentType.startsWith('image/')) {
                    mediaItems = [{ url: finalUrl, type: 'image' }];
                } else if (contentType.startsWith('video/')) {
                    mediaItems = [{ url: finalUrl, type: 'video' }];
                } else if (typeof pageRes.data === 'string') {
                    mediaItems = extractMediaItemsFromHtml(pageRes.data, finalUrl);
                }
            } catch (pageErr) {
                // Many social websites block HTML scraping from server-side requests.
                if (pageErr?.response?.status) {
                    (() => {})(`[Deepfake Link] Page fetch blocked (${pageErr.response.status}) for ${url}, trying API fallback`);
                }
            }

            if (!mediaItems.length) {
                mediaItems = await extractMediaItemsWithBrowser(url);
            }

            if (!mediaItems.length) {
                mediaItems = await resolveSocialMediaItems(url);
            }
        }

        if (!mediaItems.length) {
            return res.json({
                sourceUrl: url,
                analyzedCount: 0,
                results: [],
                message: 'No analyzable image/video media found in the provided link'
            });
        }

        // Bypass Node.js queue — call Python directly.
        // Python's PriorityLock (priority=1) ensures UI gets GPU
        // ahead of batch items even if a batch is in progress.
        const mlRes = await axios.post(
            `${DEEPFAKE_ML_URL}/detect/batch`,
            { media_items: mediaItems, include_previews: true, priority: 1 },
            {
              timeout: 300000,
              headers: { 'x-api-key': process.env.GATEWAY_API_KEY || '' }
            }
        );

        const results = Array.isArray(mlRes.data?.results) ? mlRes.data.results : [];
        const normalizedResults = results.map(item => normalizeBatchItem(item, req));

        res.json({
            sourceUrl: url,
            analyzedCount: normalizedResults.length,
            results: normalizedResults
        });
    } catch (error) {
        (() => {})('Deepfake Link Analysis Error:', error.message);
        const status = 500;
        const message = error.response?.data?.detail || error.response?.data?.message || 'Unable to analyze this link. The site may block scraping; try a direct media URL or a public post.';
        res.status(status).json({ message, error: error.message });
    }
});

/**
 * @route   GET /api/deepfake/source?url=...
 * @desc    Proxy source media URLs (e.g. Instagram CDN, TikTok, Facebook) for reliable frontend preview
 *          Handles range requests for video streaming and various content types.
 */
router.get('/source', async (req, res) => {
    try {
        const targetUrl = String(req.query?.url || '').trim();
        if (!isHttpUrl(targetUrl)) {
            return res.status(400).json({ message: 'A valid media URL is required' });
        }

        let referer = undefined;
        try {
            const u = new URL(targetUrl);
            referer = `${u.protocol}//${u.host}/`;
        } catch {
            referer = undefined;
        }

        const config = {
            responseType: 'stream',
            timeout: 45000, // Increased timeout for social media
            maxRedirects: 10, // More redirects for tracking
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/*,video/*,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                ...(referer ? { Referer: referer } : {})
            },
            validateStatus: (status) => status >= 200 && status < 400
        };

        // Support range requests for video streaming
        if (req.headers.range) {
            config.headers.Range = req.headers.range;
        }

        (() => {})(`[Deepfake Source] Proxying: ${targetUrl.substring(0, 100)}...`);
        const response = await axios.get(targetUrl, config);

        // Log response headers for debugging
        (() => {})(`[Deepfake Source] Response Content-Type: ${response.headers['content-type']}, Size: ${response.headers['content-length']}`);

        // Set appropriate response headers
        if (response.headers['content-type']) {
            res.setHeader('Content-Type', response.headers['content-type']);
        }
        if (response.headers['content-length']) {
            res.setHeader('Content-Length', response.headers['content-length']);
        }
        if (response.headers['content-range']) {
            res.setHeader('Content-Range', response.headers['content-range']);
            res.status(206); // Partial Content
        }
        if (response.status === 206) {
            res.status(206);
        }

        // Allow cross-origin access for video preview
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Cache-Control', 'public, max-age=300'); // Shorter cache for social media
        
        // Add content-disposition to prevent issues
        res.setHeader('Content-Disposition', 'inline');

        response.data.pipe(res);
    } catch (error) {
        (() => {})('Source Media Proxy Error:', {
            message: error.message,
            code: error.code,
            status: error.response?.status,
            statusText: error.response?.statusText
        });
        
        // Return different errors based on the issue
        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
            res.status(502).json({ message: 'Unable to reach media server. Media may be deleted or restricted.' });
        } else if (error.response?.status === 403) {
            res.status(403).json({ message: 'Access denied. The media may require authentication or have hotlink protection.' });
        } else if (error.response?.status === 404) {
            res.status(404).json({ message: 'Media not found. It may have been deleted.' });
        } else {
            res.status(error.response?.status || 502).json({ 
                message: 'Unable to fetch source media',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
});

/**
 * @route   GET /api/deepfake/forensics/:filename
 * @desc    Proxy forensic preview images from ML service
 */
router.get('/forensics/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const imageUrl = `${DEEPFAKE_ML_URL}/static/forensics/${filename}`;

        const response = await axios({
            method: 'get',
            url: imageUrl,
            responseType: 'stream'
        });

        res.setHeader('Content-Type', response.headers['content-type']);
        response.data.pipe(res);
    } catch (error) {
        (() => {})('Forensic Image Proxy Error:', error.message);
        res.status(404).send('Not Found');
    }
});

module.exports = router;
