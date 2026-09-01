const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../utils/logger');
const { extractFacebookPostToken } = require('./rapidApiFacebookService');

const FACEBOOK_CRAWLER_UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
const FACEBOOK_FACEBOT_UA = 'Facebot';
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const isFacebookShareUrl = (value) => /\/share\/(?:v|r|p)\//i.test(String(value || ''));

const safeParseUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    return new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch {
    return null;
  }
};

const buildFacebookShareCandidates = (url) => {
  const candidates = new Set([url]);
  const parsed = safeParseUrl(url);
  if (!parsed) return Array.from(candidates);

  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname || '';
  if (/\/share\/(?:v|r|p)\//i.test(path) && host.includes('facebook.com')) {
    const mUrl = new URL(parsed.href);
    mUrl.hostname = host.replace(/^www\./i, 'm.');
    candidates.add(mUrl.href);

    const mbasicUrl = new URL(parsed.href);
    mbasicUrl.hostname = host.replace(/^www\./i, 'mbasic.');
    candidates.add(mbasicUrl.href);
  }

  return Array.from(candidates);
};

const extractPfbidFromText = (value) => {
  const match = String(value || '').match(/(pfbid[a-z0-9]+)/i);
  return match?.[1] || '';
};

const extractNumericPostIdFromUrl = (value) => {
  const parsed = safeParseUrl(value);
  if (!parsed) return '';
  const pathMatch = parsed.pathname.match(/\/posts\/(\d{8,})\/?$/i);
  if (pathMatch?.[1]) return pathMatch[1];
  const storyFbid = parsed.searchParams.get('story_fbid');
  if (storyFbid && /^\d+$/.test(storyFbid)) return storyFbid;
  return '';
};

const stripFacebookUrl = (value) => {
  const parsed = safeParseUrl(value);
  if (!parsed) return String(value || '').trim();
  parsed.hash = '';
  const path = (parsed.pathname || '').replace(/\/+$/, '');
  return `https://${parsed.hostname.replace(/^m\./i, 'www.')}${path}`;
};

const buildCanonicalPfbidUrl = (finalUrl, pfbid) => {
  const fromFinal = extractPfbidFromText(finalUrl);
  const token = pfbid || fromFinal;
  if (!token) return stripFacebookUrl(finalUrl);

  const parsed = safeParseUrl(finalUrl);
  if (!parsed) return `https://www.facebook.com/posts/${token}`;

  const pathParts = (parsed.pathname || '').split('/').filter(Boolean);
  const postsIdx = pathParts.findIndex((p) => p.toLowerCase() === 'posts');
  if (postsIdx > 0) {
    const page = pathParts.slice(0, postsIdx).join('/');
    return `https://www.facebook.com/${page}/posts/${token}`;
  }

  return `https://www.facebook.com/posts/${token}`;
};

const extractOgMedia = (html) => {
  const $ = cheerio.load(html || '');
  const readMeta = (...selectors) => {
    for (const selector of selectors) {
      const value = $(selector).attr('content');
      if (value && String(value).trim()) return String(value).trim();
    }
    return '';
  };

  const image = readMeta(
    'meta[property="og:image"]',
    'meta[property="og:image:url"]',
    'meta[name="twitter:image"]'
  );
  const video = readMeta('meta[property="og:video"]', 'meta[property="og:video:url"]');

  const media = [];
  if (image) media.push({ type: 'photo', url: image });
  if (video) media.push({ type: 'video', url: video });

  return media;
};

const fetchFacebookPageSnapshot = async (url, userAgent) => {
  const response = await axios.get(url, {
    timeout: 25000,
    maxRedirects: 10,
    responseType: 'text',
    validateStatus: () => true,
    headers: {
      'User-Agent': userAgent,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });

  const finalUrl = response?.request?.res?.responseUrl
    || response?.request?.responseURL
    || url;
  const html = typeof response?.data === 'string' ? response.data : '';
  const $ = cheerio.load(html);

  const readMeta = (selector) => {
    const value = $(selector).attr('content');
    return value && String(value).trim() ? String(value).trim() : '';
  };

  const ogUrl = readMeta('meta[property="og:url"]') || $('link[rel="canonical"]').attr('href') || '';
  const absoluteOgUrl = ogUrl
    ? (ogUrl.startsWith('http') ? ogUrl : new URL(ogUrl, finalUrl).href)
    : '';

  const pfbidFromFinal = extractPfbidFromText(finalUrl);
  const pfbidFromOg = extractPfbidFromText(absoluteOgUrl);
  const pfbidsInHtml = [...new Set((html.match(/pfbid[a-z0-9]+/gi) || []))];
  const pfbid = pfbidFromFinal || pfbidFromOg || pfbidsInHtml[0] || '';

  const numericId = extractNumericPostIdFromUrl(absoluteOgUrl)
    || extractNumericPostIdFromUrl(finalUrl);

  const canonicalUrl = pfbid
    ? buildCanonicalPfbidUrl(finalUrl, pfbid)
    : stripFacebookUrl(absoluteOgUrl || finalUrl);

  return {
    status: response.status,
    inputUrl: url,
    finalUrl,
    ogUrl: absoluteOgUrl,
    canonicalUrl,
    pfbid,
    numericId,
    title: readMeta('meta[property="og:title"]') || $('title').text().trim(),
    description: readMeta('meta[property="og:description"]')
      || readMeta('meta[name="description"]'),
    author: readMeta('meta[property="og:site_name"]') || '',
    media: extractOgMedia(html),
    htmlLen: html.length,
    userAgent
  };
};

/**
 * Resolve a Facebook post URL (especially /share/...) to canonical pfbid identity.
 * Uses crawler UA when browser UA cannot resolve share links.
 */
const resolveFacebookCanonicalPost = async (url) => {
  const input = String(url || '').trim();
  const result = {
    originalUrl: input,
    canonicalUrl: input,
    pfbid: '',
    numericId: '',
    ogUrl: '',
    title: '',
    description: '',
    author: '',
    media: [],
    resolvedVia: 'unresolved',
    snapshot: null
  };

  if (!input) return result;

  const candidates = buildFacebookShareCandidates(input);
  const userAgents = isFacebookShareUrl(input)
    ? [FACEBOOK_CRAWLER_UA, FACEBOOK_FACEBOT_UA, CHROME_UA]
    : [CHROME_UA, FACEBOOK_CRAWLER_UA];

  for (const candidate of candidates) {
    for (const userAgent of userAgents) {
      try {
        const snapshot = await fetchFacebookPageSnapshot(candidate, userAgent);
        const finalPath = safeParseUrl(snapshot.finalUrl)?.pathname || '';
        const hasPfbid = Boolean(snapshot.pfbid);
        const escapedShare = !isFacebookShareUrl(snapshot.finalUrl) && !isFacebookShareUrl(snapshot.canonicalUrl);

        if (hasPfbid && escapedShare) {
          const resolved = {
            ...result,
            canonicalUrl: snapshot.canonicalUrl,
            pfbid: snapshot.pfbid,
            numericId: snapshot.numericId,
            ogUrl: snapshot.ogUrl,
            title: snapshot.title,
            description: snapshot.description,
            author: snapshot.title || snapshot.author,
            media: snapshot.media,
            resolvedVia: userAgent.includes('facebookexternalhit') || userAgent === FACEBOOK_FACEBOT_UA
              ? 'crawler_ua'
              : 'browser_ua',
            snapshot
          };
          logger.info(
            `[FacebookCanonical] Resolved ${input} -> ${resolved.canonicalUrl} (pfbid=${resolved.pfbid}, via=${resolved.resolvedVia})`
          );
          return resolved;
        }

        if (!isFacebookShareUrl(input) && escapedShare && snapshot.canonicalUrl !== input) {
          const token = extractFacebookPostToken(snapshot.canonicalUrl);
          if (token && !isFacebookShareUrl(snapshot.canonicalUrl)) {
            return {
              ...result,
              canonicalUrl: snapshot.canonicalUrl,
              pfbid: extractPfbidFromText(snapshot.canonicalUrl) || token,
              numericId: snapshot.numericId,
              ogUrl: snapshot.ogUrl,
              title: snapshot.title,
              description: snapshot.description,
              author: snapshot.title || snapshot.author,
              media: snapshot.media,
              resolvedVia: 'browser_ua',
              snapshot
            };
          }
        }

        if (isFacebookShareUrl(input) && snapshot.status >= 400 && !hasPfbid) {
          continue;
        }
      } catch (error) {
        logger.info(`[FacebookCanonical] Snapshot failed for ${candidate}: ${error.message}`);
      }
    }
  }

  return result;
};

module.exports = {
  FACEBOOK_CRAWLER_UA,
  FACEBOOK_FACEBOT_UA,
  isFacebookShareUrl,
  fetchFacebookPageSnapshot,
  resolveFacebookCanonicalPost,
  extractPfbidFromText,
  buildCanonicalPfbidUrl
};
