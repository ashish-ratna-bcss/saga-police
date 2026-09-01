const {
  fetchPostByUrl,
  postMatchesTarget,
  extractFacebookPostToken,
  normalizeFacebookUrlForMatch
} = require('./rapidApiFacebookService');
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
  investigation_verified: true
});

const pageUrlMatchesTarget = (pageUrl, originalUrl, canonicalUrl, contentId) => {
  if (!pageUrl) return false;

  const fakePost = {
    url: pageUrl,
    id: extractFacebookPostToken(pageUrl)
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

/**
 * Resolve and verify a Facebook post for on-demand investigation.
 * Never uses /search/posts. Returns verified metadata or an unresolved result.
 */
const resolveFacebookInvestigation = async ({
  originalUrl,
  canonicalUrl,
  contentId = '',
  fetchPageMetadata = null,
  fetchPost = fetchPostByUrl
}) => {
  const resolvedCanonical = canonicalUrl || originalUrl;
  const result = {
    status: 'unresolved',
    original_url: originalUrl,
    canonical_url: resolvedCanonical,
    content_id: contentId || '',
    message: '',
    metadata: null,
    partial: null
  };

  const lookupAttempts = Array.from(new Set(
    [resolvedCanonical, originalUrl, contentId].filter(Boolean)
  ));

  let matchedPost = null;

  for (const lookup of lookupAttempts) {
    try {
      const post = await fetchPost(lookup, { throwOnCooldown: true });
      if (!post) continue;

      if (!postMatchesInvestigation(post, originalUrl, resolvedCanonical, contentId)) {
        logger.warn(
          `[FacebookInvestigation] Rejected /post result for lookup=${lookup} (id=${post.id || 'n/a'})`
        );
        continue;
      }

      matchedPost = post;
      break;
    } catch (error) {
      if (error?.code === 'FB_RAPIDAPI_COOLDOWN' || error?.response?.status === 429) {
        throw error;
      }
    }
  }

  if (!matchedPost) {
    result.message = 'Facebook post identity could not be verified. Investigation was not analyzed to avoid mismatched content.';
    result.partial = {
      original_url: originalUrl,
      canonical_url: resolvedCanonical,
      content_id: contentId || null,
      reason: 'no_verified_post'
    };
    return result;
  }

  const verifiedCanonical = matchedPost.url || resolvedCanonical || originalUrl;
  const metadata = mapPostToMetadata(matchedPost, contentId, originalUrl, verifiedCanonical);
  const verifiedContentId = metadata.id || contentId;

  if (!metadata.text?.trim() && typeof fetchPageMetadata === 'function') {
    const scrapeUrl = verifiedCanonical || resolvedCanonical || originalUrl;
    const scraped = await fetchPageMetadata(scrapeUrl, 'facebook');
    const scrapePageUrl = scraped?.canonical_url || scrapeUrl;

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

  if ((!metadata.media || metadata.media.length === 0) && typeof fetchPageMetadata === 'function') {
    const scrapeUrl = verifiedCanonical || resolvedCanonical || originalUrl;
    const scraped = await fetchPageMetadata(scrapeUrl, 'facebook');
    const scrapePageUrl = scraped?.canonical_url || scrapeUrl;

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
  result.message = 'Facebook post verified via /post';
  return result;
};

module.exports = {
  resolveFacebookInvestigation,
  mapPostToMetadata,
  pageUrlMatchesTarget,
  postMatchesInvestigation
};
