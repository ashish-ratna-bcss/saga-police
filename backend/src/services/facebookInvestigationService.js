const {
  fetchVerifiedFacebookPostFromApi,
  postMatchesTarget,
  extractFacebookPostToken,
  normalizeFacebookUrlForMatch
} = require('./rapidApiFacebookService');
const {
  resolveFacebookCanonicalPost,
  fetchFacebookPageSnapshot,
  FACEBOOK_CRAWLER_UA,
  isFacebookShareUrl,
  extractPfbidFromText
} = require('./facebookCanonicalResolver');
const logger = require('../utils/logger');

const mapPostToMetadata = (post, contentId, originalUrl, canonicalUrl) => ({
  id: post.id || contentId || '',
  title: post.text ? String(post.text).substring(0, 120) : `Facebook post by ${post.author || 'Unknown'}`,
  text: post.text || '',
  description: post.text || '',
  author: post.author || 'Facebook User',
  author_handle: post.author_handle || post.author || 'facebook',
  created_at: post.created_at || new Date(),
  platform: 'facebook',
  content_type: 'post',
  media: Array.isArray(post.media)
    ? post.media.map((m) => (typeof m === 'string' ? { type: 'photo', url: m } : m)).filter((m) => m?.url)
    : [],
  metrics: post.metrics || {},
  canonical_url: canonicalUrl || post.url || originalUrl,
  original_url: originalUrl,
  investigation_verified: true,
  verification_source: post.verification_source || 'rapidapi_post'
});

const pageUrlMatchesTarget = (pageUrl, originalUrl, canonicalUrl, contentId) => {
  if (!pageUrl) return false;

  const fakePost = {
    url: pageUrl,
    id: extractFacebookPostToken(pageUrl) || extractPfbidFromText(pageUrl)
  };
  const targets = [canonicalUrl, originalUrl].filter(Boolean);

  return targets.some((target) => {
    if (normalizeFacebookUrlForMatch(pageUrl) === normalizeFacebookUrlForMatch(target)) {
      return true;
    }
    return postMatchesTarget(fakePost, target, contentId);
  });
};

const postMatchesInvestigation = (post, originalUrl, canonicalUrl, contentId) => {
  const targets = [canonicalUrl, originalUrl].filter(Boolean);
  if (!targets.length) {
    return postMatchesTarget(post, '', contentId);
  }
  return targets.some((target) => postMatchesTarget(post, target, contentId));
};

const buildPostFromCanonicalSnapshot = (snapshot, canonicalUrl, pfbid) => {
  if (!snapshot || !pfbid || !canonicalUrl) return null;

  const text = snapshot.description || snapshot.title || '';
  const media = Array.isArray(snapshot.media) ? snapshot.media.filter((m) => m?.url) : [];
  if (!text.trim() && media.length === 0) return null;

  return {
    id: pfbid,
    url: canonicalUrl,
    text,
    author: snapshot.author || snapshot.title || 'Facebook User',
    author_handle: snapshot.author || 'facebook',
    media,
    metrics: {},
    verification_source: 'facebook_crawler_og',
    created_at: new Date()
  };
};

const identityIsCanonical = (canonicalUrl, pfbid, numericId = '') => {
  if (!canonicalUrl || isFacebookShareUrl(canonicalUrl)) return false;
  if (pfbid && extractPfbidFromText(canonicalUrl) === pfbid) return true;
  if (numericId && String(canonicalUrl).includes(`/${numericId}`)) return true;
  return Boolean(extractPfbidFromText(canonicalUrl));
};

/**
 * Resolve and verify a Facebook post for on-demand investigation.
 * Never uses /search/posts. Returns verified metadata or an unresolved result.
 */
const resolveFacebookInvestigation = async ({
  originalUrl,
  canonicalUrl,
  contentId = '',
  canonicalResolution = null,
  fetchPageMetadata = null,
  fetchPostFromApi = fetchVerifiedFacebookPostFromApi,
  resolveCanonical = resolveFacebookCanonicalPost
}) => {
  let resolved = canonicalResolution;
  if (!resolved) {
    resolved = await resolveCanonical(canonicalUrl || originalUrl);
  }

  const resolvedCanonical = resolved?.canonicalUrl || canonicalUrl || originalUrl;
  const resolvedPfbid = resolved?.pfbid || extractPfbidFromText(resolvedCanonical);
  const resolvedNumericId = resolved?.numericId || '';
  const resolvedContentId = resolvedPfbid || contentId || resolvedNumericId;

  const result = {
    status: 'unresolved',
    original_url: originalUrl,
    canonical_url: resolvedCanonical,
    content_id: resolvedContentId || contentId || '',
    message: '',
    metadata: null,
    partial: null,
    resolution: resolved ? {
      resolved_via: resolved.resolvedVia,
      pfbid: resolvedPfbid || null,
      numeric_id: resolvedNumericId || null
    } : null
  };

  if (!identityIsCanonical(resolvedCanonical, resolvedPfbid, resolvedNumericId)) {
    result.message = 'Facebook post identity could not be verified. Investigation was not analyzed to avoid mismatched content.';
    result.partial = {
      original_url: originalUrl,
      canonical_url: resolvedCanonical,
      content_id: contentId || null,
      reason: 'canonical_unresolved'
    };
    return result;
  }

  let matchedPost = null;

  try {
    matchedPost = await fetchPostFromApi({
      canonicalUrl: resolvedCanonical,
      pfbid: resolvedPfbid,
      numericId: resolvedNumericId,
      originalUrl
    }, { throwOnCooldown: true });

    if (matchedPost && !postMatchesInvestigation(matchedPost, originalUrl, resolvedCanonical, resolvedContentId)) {
      logger.warn(
        `[FacebookInvestigation] Rejected RapidAPI /post result (id=${matchedPost.id || 'n/a'})`
      );
      matchedPost = null;
    }
  } catch (error) {
    if (error?.code === 'FB_RAPIDAPI_COOLDOWN' || error?.response?.status === 429) {
      throw error;
    }
  }

  if (!matchedPost) {
    const snapshot = resolved?.snapshot
      || await fetchFacebookPageSnapshot(resolvedCanonical, FACEBOOK_CRAWLER_UA);
    matchedPost = buildPostFromCanonicalSnapshot(snapshot, resolvedCanonical, resolvedPfbid);

    if (matchedPost && !postMatchesInvestigation(matchedPost, originalUrl, resolvedCanonical, resolvedContentId)) {
      logger.warn('[FacebookInvestigation] Rejected crawler snapshot post identity mismatch');
      matchedPost = null;
    }
  }

  if (!matchedPost) {
    result.message = 'Facebook post identity could not be verified. Investigation was not analyzed to avoid mismatched content.';
    result.partial = {
      original_url: originalUrl,
      canonical_url: resolvedCanonical,
      content_id: resolvedContentId || contentId || null,
      reason: 'no_verified_post'
    };
    return result;
  }

  const verifiedCanonical = matchedPost.url || resolvedCanonical || originalUrl;
  const metadata = mapPostToMetadata(matchedPost, resolvedContentId, originalUrl, verifiedCanonical);
  const verifiedContentId = metadata.id || resolvedContentId;

  if (
    !metadata.text?.trim()
    && matchedPost.verification_source === 'rapidapi_post'
    && typeof fetchPageMetadata === 'function'
  ) {
    const scraped = await fetchPageMetadata(verifiedCanonical, 'facebook');
    const scrapePageUrl = scraped?.canonical_url || verifiedCanonical;

    if (
      scraped?.text?.trim()
      && pageUrlMatchesTarget(scrapePageUrl, originalUrl, verifiedCanonical, verifiedContentId)
    ) {
      metadata.text = scraped.text;
      metadata.description = scraped.description || scraped.text;
      metadata.title = scraped.title || metadata.title;
      metadata.og_description_fallback = true;
    }
  }

  if (
    (!metadata.media || metadata.media.length === 0)
    && matchedPost.verification_source === 'rapidapi_post'
    && typeof fetchPageMetadata === 'function'
  ) {
    const scraped = await fetchPageMetadata(verifiedCanonical, 'facebook');
    const scrapePageUrl = scraped?.canonical_url || verifiedCanonical;

    if (
      pageUrlMatchesTarget(scrapePageUrl, originalUrl, verifiedCanonical, verifiedContentId)
      && Array.isArray(scraped?.media)
      && scraped.media.length > 0
    ) {
      metadata.media = scraped.media;
      metadata.media_og_fallback = true;
    }
  }

  if (!metadata.text?.trim() && (!metadata.media || metadata.media.length === 0)) {
    result.status = 'partial';
    result.message = 'Facebook post identity was verified, but no analyzable text or media was available.';
    result.metadata = metadata;
    result.canonical_url = verifiedCanonical;
    result.content_id = verifiedContentId;
    result.partial = {
      original_url: originalUrl,
      canonical_url: verifiedCanonical,
      content_id: verifiedContentId,
      reason: 'verified_empty_content'
    };
    return result;
  }

  result.status = 'verified';
  result.canonical_url = verifiedCanonical;
  result.content_id = verifiedContentId;
  result.metadata = metadata;
  result.message = `Facebook post verified via ${metadata.verification_source}`;
  return result;
};

module.exports = {
  resolveFacebookInvestigation,
  mapPostToMetadata,
  pageUrlMatchesTarget,
  postMatchesInvestigation,
  buildPostFromCanonicalSnapshot,
  identityIsCanonical
};
