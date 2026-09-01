const Source = require('../models/Source');
const POI = require('../models/POI');
const { createAuditLog } = require('../services/auditService');
const mongoose = require('mongoose');
const { resolvePlatformIdentity, refreshPlatformIdentity } = require('../services/platformIdentityService');
const {
  extractStableUserId,
  collectLocalAliases,
  findDuplicateSource,
  duplicatePayload,
  uniqueNonEmpty
} = require('../services/sourceDedupeService');
const { persistSourceRelevance, recomputeAllSourceRelevance } = require('../services/profileRelevanceService');
const logger = require('../utils/logger');

// Facebook slugs are case-insensitive and may be pasted with an '@' prefix or
// trailing punctuation. Canonicalising here is what stops the same page being
// added twice as e.g. "/@MyHyderabadCity" and "/MyHyderabadCity".
const canonicalFacebookSlug = (value) => String(value || '')
  .trim()
  .replace(/^@+/, '')
  .replace(/[#?&/]+$/, '')
  .toLowerCase();

const normalizeFacebookIdentifier = (rawIdentifier) => {
  if (!rawIdentifier) return '';
  const input = String(rawIdentifier).trim();
  if (!input) return '';

  // Reject group monitoring explicitly (not supported by our RapidAPI integration)
  if (/facebook\.com\/(?:groups)\//i.test(input)) {
    return { kind: 'group', identifier: null };
  }

  // If it's a full URL, convert to a canonical Facebook Page/Profile URL.
  if (/^https?:\/\//i.test(input) || /facebook\.com\//i.test(input) || /fb\.me\//i.test(input) || /m\.facebook\.com\//i.test(input)) {
    try {
      const url = new URL(input.startsWith('http') ? input : `https://${input}`);
      const host = url.hostname.replace(/^www\./i, '');
      const pathname = url.pathname || '';

      // profile.php?id=123
      if (/profile\.php/i.test(pathname)) {
        const id = url.searchParams.get('id');
        if (id) return { kind: 'page', identifier: `https://www.facebook.com/profile.php?id=${id}` };
      }

      // /people/<name>/<numericId>  — the form Facebook itself copies to clipboard
      const peopleMatch = pathname.match(/^\/people\/(?:[^\/]+)\/(\d+)/i);
      if (peopleMatch?.[1]) {
        return { kind: 'page', identifier: `https://www.facebook.com/profile.php?id=${peopleMatch[1]}` };
      }

      // /pages/<name>/<id>
      const pagesMatch = pathname.match(/^\/pages\/(?:[^\/]+)\/([^\/]+)/i);
      if (pagesMatch?.[1]) {
        const slug = canonicalFacebookSlug(pagesMatch[1]);
        if (/^\d+$/.test(slug)) return { kind: 'page', identifier: `https://www.facebook.com/profile.php?id=${slug}` };
        return { kind: 'page', identifier: `https://www.facebook.com/${slug}` };
      }

      // /<usernameOrId>
      const first = pathname.split('/').filter(Boolean)[0];
      if (!first) return { kind: 'page', identifier: input };

      // Exclude common non-entity routes
      const banned = new Set(['watch', 'reel', 'share', 'photo', 'photos', 'videos', 'events', 'marketplace', 'help', 'login', 'search']);
      if (banned.has(canonicalFacebookSlug(first))) {
        return { kind: 'page', identifier: input };
      }

      const slug = canonicalFacebookSlug(first);
      if (!slug) return { kind: 'page', identifier: input };

      // A bare numeric slug is a profile id, not a username.
      if (/^\d+$/.test(slug)) {
        return { kind: 'page', identifier: `https://www.facebook.com/profile.php?id=${slug}` };
      }

      // fb.me short links typically redirect; keep the token as a canonical fb URL
      return { kind: 'page', identifier: `https://www.facebook.com/${slug}` };
    } catch (e) {
      // If URL parsing fails, fall through to raw
    }
  }

  // If it's already a slug/id, store as a canonical URL.
  const slug = canonicalFacebookSlug(input);
  if (!slug) return { kind: 'page', identifier: '' };
  if (/^\d+$/.test(slug)) {
    return { kind: 'page', identifier: `https://www.facebook.com/profile.php?id=${slug}` };
  }
  return { kind: 'page', identifier: `https://www.facebook.com/${slug}` };
};

const normalizeIdentifier = (platform, identifier) => {
  if (!identifier) return '';
  let id = String(identifier).trim();

  switch (platform.toLowerCase()) {
    case 'x':
    case 'twitter':
      // Remove @ and lowercase
      return id.replace(/^@/, '').toLowerCase();
    case 'youtube':
    case 'instagram':
      if (platform.toLowerCase() === 'youtube') {
        // Keep canonical YouTube channel ID casing intact.
        if (/^UC[A-Za-z0-9_-]{20,}$/.test(id)) return id;
        return id.toLowerCase();
      }
      // Typically case-insensitive handles
      // Normalize Instagram: strip @ and URL path to username
      if (platform.toLowerCase() === 'instagram') {
        // Handle full URL
        if (/^https?:\/\//i.test(id) || /instagram\.com\//i.test(id)) {
          try {
            const url = new URL(id.startsWith('http') ? id : `https://${id}`);
            const parts = url.pathname.split('/').filter(Boolean);
            if (parts.length > 0) id = parts[0];
          } catch (_) {
            // If URL parsing fails, fall through
          }
        }
        id = id.replace(/^@/, '');
      }
      return id.toLowerCase();
    case 'facebook': {
      // Route through the canonical Facebook normaliser so every entry point
      // (create, bulk-create, update) produces the same stored identifier.
      const normalized = normalizeFacebookIdentifier(id);
      return normalized?.identifier || id;
    }
    default:
      return id;
  }
};

const pickClientPlatformUserId = (body = {}, poiData = {}, platform) => {
  const direct = String(body.platform_user_id || body.platformUserId || '').trim();
  if (direct) return direct;
  const sm = Array.isArray(poiData?.socialMedia) ? poiData.socialMedia : [];
  const match = sm.find((row) => String(row?.platform || '').toLowerCase().trim() === String(platform || '').toLowerCase());
  return String(match?.platformUserId || match?.platform_user_id || '').trim();
};

const kickoffInitialScan = (source) => {
  if (!source || !['x', 'youtube', 'facebook', 'instagram'].includes(source.platform)) return;
  setImmediate(async () => {
    try {
      const { scanSourceOnce } = require('../services/monitorService');
      await scanSourceOnce(source);
    } catch (error) {
      logger.error(`[Source] Initial scan failed for ${source.identifier}: ${error.message}`);
    }
  });
};

// @desc    Get sources
// @route   GET /api/sources
// @access  Private
const getSources = async (req, res) => {
  try {
    const { platform, is_active, search, suggest, category } = req.query;
    const baseQuery = {};
    if (platform) baseQuery.platform = platform;
    if (is_active !== undefined) baseQuery.is_active = is_active === 'true';
    if (category && category !== 'all') {
      baseQuery.category = category.toLowerCase();
    }

    let results = [];

    // 1. Core Suggestions (Always priority)
    if (suggest) {
      const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rawNames = suggest.split(',').filter(n => n && n.length > 2);
      const uniqueNames = [...new Set(rawNames.map(n => n.toLowerCase().trim()))];
      const words = uniqueNames.flatMap(n => n.split(/[\s._-]+/)).filter(w => w.length > 2);
      const uniqueWords = [...new Set([...uniqueNames, ...words])];

      if (uniqueWords.length > 0) {
        const suggestQuery = {
          ...baseQuery,
          $or: uniqueWords.flatMap(n => {
            const e = escapeRegex(n);
            const eNorm = e.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
            return [
              { identifier: { $regex: e, $options: 'i' } },
              { identifier: { $regex: e.replace(/\s+/g, ''), $options: 'i' } },
              { display_name: { $regex: e, $options: 'i' } },
              { display_name_normalized: { $regex: eNorm, $options: 'i' } }
            ];
          })
        };
        results = await Source.find(suggestQuery).limit(100).lean();
      }
    }

    // 2. Search / General Population
    const secondaryQuery = { ...baseQuery };
    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const normalizedSearch = escapedSearch.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
      secondaryQuery.$or = [
        { identifier: { $regex: escapedSearch, $options: 'i' } },
        { display_name: { $regex: escapedSearch, $options: 'i' } },
        { display_name_normalized: { $regex: normalizedSearch, $options: 'i' } },
        { category: { $regex: escapedSearch, $options: 'i' } }
      ];

      // Also search across POI detail fields and pull in their linked sourceIds
      try {
        const searchRegex = { $regex: escapedSearch, $options: 'i' };
        const normalizedRegex = { $regex: normalizedSearch, $options: 'i' };
        const poiMatches = await POI.find({
          $or: [
            { name: searchRegex },
            { realName: searchRegex },
            { aliasNames: searchRegex },
            { mobileNumbers: searchRegex },
            { emailIds: searchRegex },
            { whatsappNumbers: searchRegex },
            { currentAddress: searchRegex },
            { psLimits: searchRegex },
            { districtCommisionerate: searchRegex },
            { firNo: searchRegex },
            { linkedIncidents: searchRegex },
            { lastUsedIp: searchRegex },
            { softwareHardwareIdentifiers: searchRegex },
            { briefSummary: searchRegex },
            { 'firDetails.firNo': searchRegex },
            { 'firDetails.psLimits': searchRegex },
            { 'firDetails.districtCommisionerate': searchRegex },
            { 'socialMedia.handle': searchRegex },
            { 'socialMedia.displayName': searchRegex },
            { 'socialMedia.displayNameNormalized': normalizedRegex },
            { 'previouslyDeletedProfiles.x': searchRegex },
            { 'previouslyDeletedProfiles.facebook': searchRegex },
            { 'previouslyDeletedProfiles.instagram': searchRegex },
            { 'previouslyDeletedProfiles.youtube': searchRegex },
            { 'previouslyDeletedProfiles.whatsapp': searchRegex },
            { 'customFields.value': searchRegex }
          ]
        }).select('socialMedia.sourceId').lean();

        // Collect unique sourceIds from matching POIs
        const poiSourceIds = new Set();
        for (const poi of poiMatches) {
          for (const sm of (poi.socialMedia || [])) {
            if (sm.sourceId) poiSourceIds.add(sm.sourceId);
          }
        }
        if (poiSourceIds.size > 0) {
          // Add POI-linked sources to the $or condition
          secondaryQuery.$or.push({ id: { $in: Array.from(poiSourceIds) } });
        }
      } catch (poiErr) {
        logger.error('[Sources] POI cross-search failed (non-fatal):', poiErr.message);
      }
    }    // Determine dynamic limit logic
    let queryLimit = 0; // 0 = no limit
    if (req.query.limit) {
      queryLimit = parseInt(req.query.limit, 10);
    } else if (search || suggest) {
      queryLimit = search ? 400 : 200;
    }

    // Fetch batch of general/search results
    let generalQuery = Source.find(secondaryQuery).sort({ created_at: -1 }).lean();
    if (queryLimit > 0) {
      generalQuery = generalQuery.limit(queryLimit);
    }
    const generalResults = await generalQuery;

    // Combine unique results
    const seenIds = new Set(results.map(s => s._id.toString()));
    generalResults.forEach(s => {
      if (!seenIds.has(s._id.toString())) {
        results.push(s);
      }
    });

    // Only slice if an artificial limit was applied for autocomplete scenarios
    if (queryLimit > 0) {
      res.status(200).json(results.slice(0, queryLimit + 100)); // Buffer for suggest combos
    } else {
      res.status(200).json(results);
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const sanitizeSourceUpdatePayload = (body, source) => {
  const updateData = {};

  if (body.isActive !== undefined && body.is_active === undefined) {
    updateData.is_active = Boolean(body.isActive);
  }
  if (body.is_active !== undefined) {
    updateData.is_active = Boolean(body.is_active);
  }

  const allowedFields = [
    'platform',
    'identifier',
    'display_name',
    'category',
    'priority',
    'follower_count',
    'joined_date',
    'is_verified',
    'profile_image_url',
    'platform_user_id',
    'statistics',
    'youtube_metadata'
  ];

  allowedFields.forEach((field) => {
    if (body[field] !== undefined) {
      updateData[field] = body[field];
    }
  });

  if (updateData.platform !== undefined) {
    updateData.platform = String(updateData.platform || '').toLowerCase().trim();
    if (!updateData.platform) {
      const err = new Error('platform cannot be empty');
      err.statusCode = 400;
      throw err;
    }
  }

  if (updateData.identifier !== undefined) {
    const nextIdentifier = String(updateData.identifier || '').trim();
    if (!nextIdentifier) {
      const err = new Error('identifier/handle cannot be empty');
      err.statusCode = 400;
      throw err;
    }
    updateData.identifier = normalizeIdentifier(updateData.platform || source.platform, nextIdentifier);
  }

  if (updateData.display_name !== undefined) {
    updateData.display_name = String(updateData.display_name || '').trim();
    if (!updateData.display_name) {
      const err = new Error('display_name cannot be empty');
      err.statusCode = 400;
      throw err;
    }
  }

  if (updateData.category !== undefined) {
    updateData.category = String(updateData.category || 'unknown').toLowerCase().trim() || 'unknown';
  }

  if (updateData.priority !== undefined) {
    updateData.priority = String(updateData.priority || '').toLowerCase().trim();
    if (!['high', 'medium', 'low'].includes(updateData.priority)) {
      const err = new Error('priority must be high, medium, or low');
      err.statusCode = 400;
      throw err;
    }
  }

  return updateData;
};

// @desc    Create source
// @route   POST /api/sources
// @access  Private
const createSource = async (req, res) => {
  try {
    let { platform, identifier, display_name, category, priority, follower_count, joined_date, poiData, is_active } = req.body;
    poiData = poiData || {};

    platform = String(platform || '').toLowerCase().trim();
    identifier = String(identifier || '').trim();
    display_name = String(display_name || '').trim();

    if (!platform) {
      return res.status(400).json({ message: 'platform is required' });
    }

    if (!identifier) {
      return res.status(400).json({ message: 'identifier/handle is required' });
    }

    if (poiData?.socialMedia && Array.isArray(poiData.socialMedia)) {
      const invalidRow = poiData.socialMedia.find((sm) => {
        const smPlatform = String(sm?.platform || '').toLowerCase().trim();
        const smHandle = String(sm?.handle || '').trim();
        const smDisplayName = String(sm?.displayName || sm?.display_name || '').trim();
        if (!smPlatform) return true;
        if (['x', 'twitter', 'facebook', 'instagram', 'youtube'].includes(smPlatform) && !smHandle) return true;
        if (!smDisplayName) return true;
        return false;
      });

      if (invalidRow) {
        return res.status(400).json({ message: 'Each social profile must include platform, handle, and display name' });
      }
    }

    if (platform === 'facebook') {
      const normalized = normalizeFacebookIdentifier(identifier);
      if (!normalized || !normalized.identifier) {
        if (normalized?.kind === 'group') {
          return res.status(400).json({
            message:
              'Facebook group monitoring is not supported with the current RapidAPI Facebook Scraper integration. Please add Facebook Pages (public) instead.'
          });
        }
        return res.status(400).json({ message: 'Invalid Facebook page identifier/URL' });
      }
      identifier = normalized.identifier;
      // Deliberately do NOT default display_name to the URL here — that is what
      // left rows showing "https://www.facebook.com/..." as their name. Leave it
      // blank so resolvePlatformIdentity below can supply the real page name.
    }

    identifier = normalizeIdentifier(platform, identifier);

    if (!display_name || !String(display_name).trim()) {
      display_name = identifier;
    }

    const clientUserId = pickClientPlatformUserId(req.body || {}, poiData, platform);
    const localAliases = collectLocalAliases(platform, identifier);
    const guessedUserId = clientUserId || extractStableUserId(platform, identifier);

    // Cheap local match first (@handle vs URL vs numeric id) — 0 provider calls.
    const localExisting = await findDuplicateSource(platform, {
      identifier,
      platformUserId: guessedUserId,
      aliases: localAliases
    });
    if (localExisting) {
      return res.status(400).json(duplicatePayload(localExisting));
    }

    // Resolve identity only when the UI/API did not already give us a stable id.
    // That one call also yields the canonical handle/URL so we can catch
    // "@user" vs an existing numeric-id source.
    let identity = null;
    if (clientUserId) {
      identity = {
        platformUserId: clientUserId,
        normalizedIdentifier: identifier,
        resolvedDisplayName: null,
        profileImageUrl: null,
        isVerified: null,
        method: 'client'
      };
    } else {
      try {
        identity = await resolvePlatformIdentity(platform, identifier);
      } catch (identityError) {
        logger.error(`[Source] Identity resolution failed for ${identifier}: ${identityError.message}`);
      }
    }

    const resolvedIdentifier = normalizeIdentifier(platform, identity?.normalizedIdentifier || identifier);
    const platformUserId = String(identity?.platformUserId || guessedUserId || '').trim();
    const resolvedAliases = uniqueNonEmpty([
      ...localAliases,
      ...collectLocalAliases(platform, resolvedIdentifier),
      resolvedIdentifier
    ]);

    const existing = await findDuplicateSource(platform, {
      identifier: resolvedIdentifier,
      platformUserId,
      aliases: resolvedAliases
    });
    if (existing) {
      return res.status(400).json(duplicatePayload(existing));
    }

    if (identity?.resolvedDisplayName && display_name === identifier) {
      display_name = identity.resolvedDisplayName;
    }

    identifier = resolvedIdentifier || identifier;

    const source = await Source.create({
      platform,
      identifier,
      platform_user_id: platformUserId,
      display_name,
      category: category ? category.toLowerCase() : 'unknown',
      priority: priority || 'medium',
      follower_count: follower_count || '',
      joined_date: joined_date || '',
      is_active: is_active !== false,
      is_verified: identity?.isVerified === true,
      profile_image_url: identity?.profileImageUrl || undefined,
      created_by: req.user.id
    });

    const persisted = await persistSourceRelevance(source).catch((error) => {
      logger.warn(`[Sources] Failed to compute relevance for ${source.id}: ${error.message}`);
      return null;
    });

    // Initial scan only — identity/profile were resolved above (or supplied by
    // the client), so do not spend a second provider call on fetchUserProfile.
    kickoffInitialScan(source);

    // Auto-create or link POI profile
    const linkOrCreatePOIFromSource = async (src, pData = {}) => {
      try {
        // Search for an existing POI that already has this source handle and platform in socialMedia
        // or a POI whose realName exactly matches the display name (simple heuristics).
        // Since alias/s can overlap, we rely primarily on socialMedia handle matching.
        let poi = await POI.findOne({
          'socialMedia.handle': src.identifier,
          'socialMedia.platform': src.platform
        });

        if (poi) {
          // If POI exists, ensure it has the sourceId linked
          const socialMediaIndex = poi.socialMedia.findIndex(
            (sm) => sm.handle === src.identifier && sm.platform === src.platform
          );
          if (socialMediaIndex !== -1 && !poi.socialMedia[socialMediaIndex].sourceId) {
            poi.socialMedia[socialMediaIndex].sourceId = src.id;
            poi.socialMedia[socialMediaIndex].platformUserId = src.platform_user_id || '';
            // Optionally update avatar if missing
            if (!poi.profileImage && src.profile_image_url) {
              poi.profileImage = src.profile_image_url;
            }
            await poi.save();
          }
        } else {
          // Construct social media array
          let smArray = [];
          if (pData.socialMedia && pData.socialMedia.length > 0) {
            smArray = [];
            for (const sm of pData.socialMedia) {
              const isPrimary = sm.handle === src.identifier && sm.platform === src.platform;
              let smSourceId = undefined;
              let smPlatformUserId = '';
              let smProfileImage = '';
              let smDisplayName = '';

              if (isPrimary) {
                smSourceId = src.id;
                smPlatformUserId = src.platform_user_id || '';
                smProfileImage = src.profile_image_url || '';
                smDisplayName = src.display_name;
              } else if (sm.handle && sm.platform) {
                // Determine normalized identifier
                let normId = sm.handle;
                if (sm.platform === 'facebook') {
                  const normalized = normalizeFacebookIdentifier(sm.handle);
                  if (normalized && normalized.identifier && normalized.kind !== 'group') {
                    normId = normalized.identifier;
                  }
                } else {
                  normId = normalizeIdentifier(sm.platform, sm.handle);
                }

                // Auto-create source if it doesn't exist (identity-aware, any identifier shape)
                if (normId) {
                  const smClientId = String(sm.platformUserId || sm.platform_user_id || '').trim();
                  const smAliases = collectLocalAliases(sm.platform, normId);
                  let exSource = await findDuplicateSource(sm.platform, {
                    identifier: normId,
                    platformUserId: smClientId || extractStableUserId(sm.platform, normId),
                    aliases: smAliases
                  });

                  let linkedIdentity = null;
                  if (!exSource) {
                    if (smClientId) {
                      linkedIdentity = {
                        platformUserId: smClientId,
                        normalizedIdentifier: normId,
                        resolvedDisplayName: sm.displayName || null,
                        profileImageUrl: sm.profileImage || null,
                        isVerified: null,
                        method: 'client'
                      };
                    } else {
                      linkedIdentity = await resolvePlatformIdentity(sm.platform, normId);
                    }

                    const linkedNormId = normalizeIdentifier(sm.platform, linkedIdentity?.normalizedIdentifier || normId);
                    const linkedUserId = String(linkedIdentity?.platformUserId || smClientId || '').trim();
                    exSource = await findDuplicateSource(sm.platform, {
                      identifier: linkedNormId,
                      platformUserId: linkedUserId,
                      aliases: uniqueNonEmpty([...smAliases, ...collectLocalAliases(sm.platform, linkedNormId), linkedNormId])
                    });

                    if (!exSource) {
                      exSource = await Source.create({
                        platform: sm.platform,
                        identifier: linkedNormId,
                        platform_user_id: linkedUserId,
                        display_name: sm.displayName || linkedIdentity?.resolvedDisplayName || sm.handle,
                        category: (sm.category || src.category || 'others').toLowerCase(),
                        priority: sm.priority || src.priority || 'medium',
                        is_active: sm.isActive !== false,
                        profile_image_url: linkedIdentity?.profileImageUrl || undefined,
                        is_verified: linkedIdentity?.isVerified === true,
                        created_by: src.created_by
                      });
                      kickoffInitialScan(exSource);
                    }
                  }

                  if (exSource) {
                    smSourceId = exSource.id;
                    smPlatformUserId = exSource.platform_user_id || '';
                    smDisplayName = exSource.display_name;
                    smProfileImage = exSource.profile_image_url || '';
                  }
                }
              }

              smArray.push({
                platform: sm.platform,
                sourceId: smSourceId,
                platformUserId: smPlatformUserId,
                handle: sm.handle,
                displayName: smDisplayName || undefined,
                profileImage: smProfileImage,
                followerCount: sm.followerCount || undefined,
                createdDate: sm.createdDate || undefined
              });
            }
          } else {
            smArray = [{
              platform: src.platform,
              sourceId: src.id,
              platformUserId: src.platform_user_id || '',
              handle: src.identifier,
              displayName: src.display_name,
              profileImage: src.profile_image_url || '',
              followerCount: src.follower_count || '',
              createdDate: src.joined_date || ''
            }];
          }

          // Create new POI
          const newPoi = new POI({
            name: pData.realName || src.display_name,
            realName: pData.realName || src.display_name,
            aliasNames: pData.aliasNames || [],
            mobileNumbers: pData.mobileNumbers || [],
            emailIds: pData.emailIds || [],
            whatsappNumbers: pData.whatsappNumbers || [],
            currentAddress: pData.currentAddress || '',
            psLimits: pData.psLimits || '',
            districtCommisionerate: pData.districtCommisionerate || '',
            lastUsedIp: pData.lastUsedIp || '',
            softwareHardwareIdentifiers: pData.softwareHardwareIdentifiers || '',
            firNo: pData.firNo || '',
            firDetails: pData.firDetails || [],
            linkedIncidents: pData.linkedIncidents || '',
            briefSummary: pData.briefSummary || '',
            escalatedToIntermediariesCount: pData.escalatedToIntermediariesCount ? Number(pData.escalatedToIntermediariesCount) : 0,
            profileImage: src.profile_image_url || '',
            socialMedia: smArray,
            previouslyDeletedProfiles: pData.previouslyDeletedProfiles || { x: [], facebook: [], instagram: [], youtube: [], whatsapp: [] },
            createdBy: 'system',
            status: 'active'
          });
          await newPoi.save();
        }
      } catch (err) {
        logger.error('[POI Link Error] Failed to auto-link/create POI for source:', err.message);
      }
    };

    // Do not await this to keep response fast
    linkOrCreatePOIFromSource(source, poiData);

    await createAuditLog(req.user, 'create', 'source', source.id, { display_name });

    res.status(201).json(persisted || source);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update source
// @route   PUT /api/sources/:id
// @access  Private
const updateSource = async (req, res) => {
  try {
    let source = await Source.findOne({ id: req.params.id });

    if (!source && mongoose.Types.ObjectId.isValid(req.params.id)) {
      source = await Source.findById(req.params.id);
    }

    if (!source) {
      return res.status(404).json({ message: 'Source not found' });
    }

    // Use the found source's actual ID (UUID) for the update query if possible, or _id
    const query = source.id ? { id: source.id } : { _id: source._id };

    const updateData = sanitizeSourceUpdatePayload(req.body || {}, source);

    const oldIdentifier = String(source.identifier || '').trim();
    const nextPlatform = String(updateData.platform || source.platform || '').toLowerCase().trim();
    const nextIdentifier = updateData.identifier !== undefined
      ? String(updateData.identifier || '').trim()
      : oldIdentifier;

    if (updateData.identifier && nextIdentifier && nextIdentifier !== oldIdentifier) {
      const dup = await findDuplicateSource(nextPlatform, {
        identifier: nextIdentifier,
        platformUserId: String(updateData.platform_user_id || source.platform_user_id || extractStableUserId(nextPlatform, nextIdentifier) || '').trim(),
        aliases: collectLocalAliases(nextPlatform, nextIdentifier),
        excludeId: source.id
      });
      if (dup) {
        return res.status(400).json(duplicatePayload(dup));
      }
    }

    const addToSet = {};
    if (
      nextIdentifier &&
      oldIdentifier &&
      nextIdentifier !== oldIdentifier &&
      nextPlatform !== 'youtube'
    ) {
      addToSet.old_identifiers = oldIdentifier;
    }

    const updatedSource = await Source.findOneAndUpdate(
      query,
      {
        $set: updateData,
        ...(Object.keys(addToSet).length ? { $addToSet: addToSet } : {})
      },
      { new: true, runValidators: true }
    );

    let sourceForResponse = updatedSource;
    if (
      updatedSource &&
      (
        updateData.display_name !== undefined ||
        updateData.identifier !== undefined ||
        updateData.category !== undefined
      )
    ) {
      const refreshed = await persistSourceRelevance(updatedSource).catch((error) => {
        logger.warn(`[Sources] Failed to recompute relevance for ${updatedSource.id}: ${error.message}`);
        return null;
      });
      if (refreshed) sourceForResponse = refreshed;
    }

    // Sync back to POI
    if (updatedSource) {
      try {
        const poiData = req.body.poiData;
        const sourceIdCandidates = [
          String(updatedSource.id || '').trim(),
          String(updatedSource._id || '').trim()
        ].filter(Boolean);
        const sourceUserId = String(updatedSource.platform_user_id || '').trim();
        const sourcePlatform = String(updatedSource.platform || '').toLowerCase();
        const sourcePlatformAliases = sourcePlatform === 'x' || sourcePlatform === 'twitter' ? ['x', 'twitter'] : [sourcePlatform];
        const sourceHandleNorm = String(updatedSource.identifier || '').replace(/^@/, '').toLowerCase();

        const linkedPois = await POI.find({
          $or: [
            { "socialMedia.sourceId": { $in: sourceIdCandidates } },
            ...(sourceUserId
              ? [{ socialMedia: { $elemMatch: { platform: { $in: sourcePlatformAliases }, platformUserId: sourceUserId } } }]
              : []),
            ...(sourceHandleNorm
              ? [{ socialMedia: { $elemMatch: { platform: { $in: sourcePlatformAliases }, handle: { $in: [sourceHandleNorm, `@${sourceHandleNorm}`] } } } }]
              : [])
          ]
        });

        for (const poi of linkedPois) {
          let hasChanges = false;

          // 1. Update POI core fields if poiData is provided
          if (poiData) {
            const fieldsToUpdate = [
              'realName', 'aliasNames', 'mobileNumbers', 'emailIds', 'whatsappNumbers',
              'currentAddress', 'psLimits', 'districtCommisionerate', 'lastUsedIp',
              'softwareHardwareIdentifiers', 'firNo', 'firDetails', 'linkedIncidents',
              'briefSummary', 'previouslyDeletedProfiles', 'profileImage', 'status'
            ];

            fieldsToUpdate.forEach(field => {
              if (poiData[field] !== undefined) {
                poi[field] = poiData[field];
                hasChanges = true;
              }
            });

            if (poiData.realName) {
              poi.name = poiData.realName;
            }
          }

          // 2. Update the specific socialMedia entry for this source
          poi.socialMedia = poi.socialMedia.map(sm => {
            const smSourceId = String(sm?.sourceId || '').trim();
            const smPlatform = String(sm?.platform || '').toLowerCase();
            const smPlatformUserId = String(sm?.platformUserId || '').trim();
            const smHandleNorm = String(sm?.handle || '').replace(/^@/, '').toLowerCase();

            const isSameSource = sourceIdCandidates.includes(smSourceId);
            const isSameProfile = sourcePlatformAliases.includes(smPlatform) && (
              (sourceUserId && smPlatformUserId === sourceUserId) ||
              (sourceHandleNorm && smHandleNorm === sourceHandleNorm)
            );

            if (isSameSource || isSameProfile) {
              const newCategory = (updatedSource.category || '').toLowerCase();
              const newPriority = updatedSource.priority || 'medium';
              const newIsActive = updatedSource.is_active;
              const newHandle = updatedSource.identifier || '';

              if (sm.category !== newCategory ||
                sm.priority !== newPriority ||
                sm.followerCount !== (updatedSource.follower_count || '') ||
                sm.createdDate !== (updatedSource.joined_date || '') ||
                sm.displayName !== updatedSource.display_name ||
                sm.is_active !== newIsActive ||
                sm.handle !== newHandle ||
                sm.platformUserId !== (updatedSource.platform_user_id || '')) {
                const smObj = sm.toObject ? sm.toObject() : sm;
                const oldSmHandle = String(smObj.handle || '').trim();
                const previousHandles = Array.isArray(smObj.previousHandles) ? [...smObj.previousHandles] : [];
                if (oldSmHandle && newHandle && oldSmHandle !== newHandle && !previousHandles.includes(oldSmHandle)) {
                  previousHandles.push(oldSmHandle);
                }

                hasChanges = true;
                return {
                  ...smObj,
                  sourceId: sm.sourceId || updatedSource.id,
                  platformUserId: updatedSource.platform_user_id || sm.platformUserId || '',
                  category: newCategory,
                  priority: newPriority,
                  followerCount: updatedSource.follower_count || '',
                  createdDate: updatedSource.joined_date || '',
                  displayName: updatedSource.display_name,
                  is_active: newIsActive,
                  handle: newHandle || sm.handle,
                  previousHandles
                };
              }
            }
            return sm;
          });

          if (hasChanges) {
            await poi.save();
          }
        }
      } catch (poiError) {
        logger.error('[Sync POI Error] Failed to sync source update to POI:', poiError.message);
      }
    }

    await createAuditLog(req.user, 'update', 'source', source.id || source._id, req.body);
    res.status(200).json(sourceForResponse);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'Source identifier already exists for this platform' });
    }
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete source
// @route   DELETE /api/sources/:id
// @access  Private
const deleteSource = async (req, res) => {
  try {
    let source = await Source.findOne({ id: req.params.id });

    if (!source && mongoose.Types.ObjectId.isValid(req.params.id)) {
      source = await Source.findById(req.params.id);
    }

    if (!source) {
      return res.status(404).json({ message: 'Source not found' });
    }

    // Capture the identifiers before the document is removed.
    const sourceKeys = [source.id, source._id?.toString()].filter(Boolean);
    const sourceLabel = source.display_name || source.identifier;

    await source.deleteOne();

    // Cleanup: unlink this source from any POI, then delete POIs that are left
    // with no monitored profile at all.
    //
    // A POI represents a monitored handle, so once its last handle is removed
    // the profile should go with it. Leaving it behind is what made the
    // dashboard report 811 profiles against 161 monitored sources.
    try {
      const linkedPois = await POI.find(
        { 'socialMedia.sourceId': { $in: sourceKeys } },
        { _id: 1 }
      ).lean();

      if (linkedPois.length > 0) {
        const linkedPoiIds = linkedPois.map((p) => p._id);

        await POI.updateMany(
          { _id: { $in: linkedPoiIds } },
          { $pull: { socialMedia: { sourceId: { $in: sourceKeys } } } }
        );

        const emptied = await POI.deleteMany({
          _id: { $in: linkedPoiIds },
          $or: [
            { socialMedia: { $size: 0 } },
            { socialMedia: { $exists: false } },
            { socialMedia: null }
          ]
        });

        if (emptied.deletedCount > 0) {
          logger.info(`[Source Cleanup] Removed ${emptied.deletedCount} POI profile(s) with no remaining monitored handle after deleting "${sourceLabel}"`);
        }
      }
    } catch (cleanupError) {
      logger.error('[Source Cleanup] Failed to clean up POIs:', cleanupError.message);
    }

    await createAuditLog(req.user, 'delete', 'source', source.id || source._id, {});

    res.status(204).json(null);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Manual check source
// @route   POST /api/sources/:id/check
// @access  Private
const manualCheck = async (req, res) => {
  try {
    let source = await Source.findOne({ id: req.params.id });

    if (!source && mongoose.Types.ObjectId.isValid(req.params.id)) {
      source = await Source.findById(req.params.id);
    }

    if (!source) {
      return res.status(404).json({ message: 'Source not found' });
    }

    // Simulate check logic or call a service
    source.last_checked = new Date();
    await source.save();

    await createAuditLog(req.user, 'manual_check', 'source', req.params.id, {
      display_name: source.display_name,
      status: 'checked'
    });

    res.status(200).json({ message: 'Manual check initiated', source });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Toggle source active status (pause/resume)
// @route   PUT /api/sources/:id/toggle
// @access  Private
const toggleSourceStatus = async (req, res) => {
  try {
    let source = await Source.findOne({ id: req.params.id });

    if (!source && mongoose.Types.ObjectId.isValid(req.params.id)) {
      source = await Source.findById(req.params.id);
    }

    if (!source) {
      return res.status(404).json({ message: 'Source not found' });
    }

    const query = source.id ? { id: source.id } : { _id: source._id };
    const updatedSource = await Source.findOneAndUpdate(
      query,
      { $set: { is_active: !source.is_active } },
      { new: true }
    );

    if (!updatedSource) {
      return res.status(404).json({ message: 'Source not found' });
    }

    const action = updatedSource.is_active ? 'resumed' : 'paused';
    await createAuditLog(req.user, action, 'source', updatedSource.id || updatedSource._id, {
      display_name: updatedSource.display_name,
      is_active: updatedSource.is_active
    });

    res.status(200).json({
      message: `Monitoring ${action} for ${updatedSource.display_name}`,
      source: updatedSource
    });
  } catch (error) {
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  }
};

// @desc    Bulk create sources
// @route   POST /api/sources/bulk
// @access  Private
const createSourcesBulk = async (req, res) => {
  try {
    let { platform, identifiers, category, priority } = req.body;

    platform = String(platform || '').toLowerCase();
    if (!platform) return res.status(400).json({ message: 'platform is required' });
    if (!Array.isArray(identifiers) || identifiers.length === 0) {
      return res.status(400).json({ message: 'identifiers must be a non-empty array' });
    }

    const created = [];
    const skipped = [];
    const failed = [];
    const seenUserIds = new Set();
    const seenAliases = new Set();

    for (const raw of identifiers) {
      try {
        let identifier = String(raw || '').trim();
        if (!identifier) {
          failed.push({ identifier: raw, reason: 'Empty identifier' });
          continue;
        }

        let display_name = identifier;

        if (platform === 'facebook') {
          const normalized = normalizeFacebookIdentifier(identifier);
          if (!normalized || !normalized.identifier) {
            if (normalized?.kind === 'group') {
              failed.push({ identifier, reason: 'Facebook group URLs are not supported' });
              continue;
            }
            failed.push({ identifier, reason: 'Invalid Facebook page identifier/URL' });
            continue;
          }
          identifier = normalized.identifier;
          display_name = identifier;
        }

        identifier = normalizeIdentifier(platform, identifier);
        const localAliases = collectLocalAliases(platform, identifier);
        const guessedUserId = extractStableUserId(platform, identifier);

        const aliasHit = localAliases.some((a) => seenAliases.has(a.toLowerCase()));
        if (aliasHit || (guessedUserId && seenUserIds.has(guessedUserId))) {
          skipped.push({ identifier, reason: 'profile already exist in sources' });
          continue;
        }

        const localExisting = await findDuplicateSource(platform, {
          identifier,
          platformUserId: guessedUserId,
          aliases: localAliases
        });
        if (localExisting) {
          skipped.push({
            identifier,
            reason: 'profile already exist in sources',
            id: localExisting.id
          });
          continue;
        }

        const identity = await resolvePlatformIdentity(platform, identifier);
        identifier = normalizeIdentifier(platform, identity?.normalizedIdentifier || identifier);
        const platformUserId = String(identity?.platformUserId || guessedUserId || '').trim();
        if (!display_name || !String(display_name).trim() || display_name === String(raw || '').trim()) {
          display_name = identity?.resolvedDisplayName || identifier;
        }

        const resolvedAliases = uniqueNonEmpty([
          ...localAliases,
          ...collectLocalAliases(platform, identifier),
          identifier
        ]);
        if (
          (platformUserId && seenUserIds.has(platformUserId)) ||
          resolvedAliases.some((a) => seenAliases.has(a.toLowerCase()))
        ) {
          skipped.push({ identifier, reason: 'profile already exist in sources' });
          continue;
        }

        const existing = await findDuplicateSource(platform, {
          identifier,
          platformUserId,
          aliases: resolvedAliases
        });
        if (existing) {
          skipped.push({ identifier, reason: 'profile already exist in sources', id: existing.id });
          continue;
        }

        const source = await Source.create({
          platform,
          identifier,
          platform_user_id: platformUserId,
          display_name,
          category: category ? String(category).toLowerCase() : 'unknown',
          priority: priority || 'medium',
          profile_image_url: identity?.profileImageUrl || undefined,
          is_verified: identity?.isVerified === true,
          created_by: req.user.id
        });

        await persistSourceRelevance(source).catch((error) => {
          logger.warn(`[Sources] Failed to compute relevance for ${source.id}: ${error.message}`);
        });

        if (platformUserId) seenUserIds.add(platformUserId);
        resolvedAliases.forEach((a) => seenAliases.add(a.toLowerCase()));

        // Auto-create or link POI profile
        const linkOrCreatePOIFromSource = async (src) => {
          try {
            let poi = await POI.findOne({
              'socialMedia.handle': src.identifier,
              'socialMedia.platform': src.platform
            });

            if (poi) {
              const socialMediaIndex = poi.socialMedia.findIndex(
                (sm) => sm.handle === src.identifier && sm.platform === src.platform
              );
              if (socialMediaIndex !== -1 && !poi.socialMedia[socialMediaIndex].sourceId) {
                poi.socialMedia[socialMediaIndex].sourceId = src.id;
                poi.socialMedia[socialMediaIndex].platformUserId = src.platform_user_id || '';
                if (!poi.profileImage && src.profile_image_url) {
                  poi.profileImage = src.profile_image_url;
                }
                await poi.save();
              }
            } else {
              const newPoi = new POI({
                name: src.display_name,
                realName: src.display_name,
                profileImage: src.profile_image_url || '',
                socialMedia: [{
                  platform: src.platform,
                  sourceId: src.id,
                  platformUserId: src.platform_user_id || '',
                  handle: src.identifier,
                  displayName: src.display_name,
                  profileImage: src.profile_image_url || '',
                }],
                createdBy: 'system',
                status: 'active'
              });
              await newPoi.save();
            }
          } catch (err) {
            logger.error('[POI Link Error] Failed to auto-link/create POI for bulk source:', err.message);
          }
        };

        // Fire and forget
        linkOrCreatePOIFromSource(source);

        created.push({ id: source.id, identifier: source.identifier, display_name: source.display_name });
      } catch (e) {
        failed.push({ identifier: raw, reason: e.message || 'Failed to create' });
      }
    }

    await createAuditLog(req.user, 'bulk_create', 'source', null, {
      platform,
      created: created.length,
      skipped: skipped.length,
      failed: failed.length
    });

    res.status(200).json({ created, skipped, failed });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getRetryAfterSeconds = (error) => {
  const header = error?.response?.headers?.['retry-after'];
  const parsedHeader = Number(header);
  if (Number.isFinite(parsedHeader) && parsedHeader > 0) return parsedHeader;
  if (Number.isFinite(error?.retryAfterSeconds) && error.retryAfterSeconds > 0) return error.retryAfterSeconds;

  const fallback = Number(process.env.RAPIDAPI_FACEBOOK_COOLDOWN_SECONDS);
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 90;
};

// @desc    Scan a single source now (fetch + ingest + analyze)
// @route   POST /api/sources/:id/scan
// @access  Private
const scanNow = async (req, res) => {
  try {
    const { scanSourceOnce } = require('../services/monitorService');
    let source = await Source.findOne({ id: req.params.id });
    if (!source && mongoose.Types.ObjectId.isValid(req.params.id)) {
      source = await Source.findById(req.params.id);
    }
    if (!source) {
      return res.status(404).json({ message: 'Source not found' });
    }

    // Guard: Instagram requires RapidAPI keys.
    if (source.platform === 'instagram') {
      const { getInstagramRapidApiKeys } = require('../services/rapidApiInstagramService');
      const keys = getInstagramRapidApiKeys();
      if (!keys || keys.length === 0) {
        return res.status(400).json({
          message: 'Instagram RapidAPI key is not configured. Please set RAPIDAPI_INSTAGRAM_KEY in .env or settings.'
        });
      }
    }

    // For now this endpoint is primarily intended for Facebook sources.
    // We still allow other platforms, but Facebook gets special 429 surfacing.
    const result = await scanSourceOnce(source, { throwOnCooldown: source.platform === 'facebook' });

    await createAuditLog(req.user, 'manual_scan', 'source', source.id || source._id, {
      platform: source.platform,
      identifier: source.identifier,
      scanned: result.scanned
    });

    return res.status(200).json({
      message: `Scan completed for ${source.display_name}`,
      scanned: result.scanned,
      ingested: result.ingested
    });
  } catch (error) {
    const status = error?.response?.status;
    if (status === 429 || error?.code === 'FB_RAPIDAPI_COOLDOWN') {
      return res.status(429).json({
        message: 'Facebook is temporarily rate limited. Please retry later.',
        retryAfterSeconds: getRetryAfterSeconds(error)
      });
    }
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Scan all active sources for a platform
// @route   POST /api/sources/scan-all
// @access  Private
const scanAllSources = async (req, res) => {
  try {
    const { scanSourceOnce } = require('../services/monitorService');
    const { platform } = req.body;
    const query = { is_active: true };
    if (platform) query.platform = platform;

    if (platform === 'instagram') {
      const { getInstagramRapidApiKeys } = require('../services/rapidApiInstagramService');
      const keys = getInstagramRapidApiKeys();
      if (!keys || keys.length === 0) {
        return res.status(400).json({
          message: 'Instagram RapidAPI key is not configured. Please set RAPIDAPI_INSTAGRAM_KEY in .env or settings.'
        });
      }
    }

    const sources = await Source.find(query);
    if (sources.length === 0) {
      return res.status(404).json({ message: 'No active sources found to scan' });
    }

    // We run them in sequence or small batches to avoid hitting local rate limits/concurrency issues too hard
    let totalScanned = 0;
    let totalIngested = 0;
    const results = [];

    for (const source of sources) {
      try {
        const result = await scanSourceOnce(source);
        totalScanned += result.scanned || 0;
        totalIngested += result.ingested || 0;
        results.push({ id: source.id, name: source.display_name, status: 'success', scanned: result.scanned });
      } catch (err) {
        results.push({ id: source.id, name: source.display_name, status: 'failed', error: err.message });
      }
    }

    await createAuditLog(req.user, 'bulk_scan', 'source', 'multiple', {
      platform,
      count: sources.length,
      totalScanned,
      totalIngested
    });

    res.status(200).json({
      message: `Bulk scan completed for ${sources.length} sources`,
      totalScanned,
      totalIngested,
      results
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get live Instagram profile info (followers, following, bio, etc.)
// @route   GET /api/sources/:id/instagram-profile
// @access  Private
const getInstagramProfile = async (req, res) => {
  try {
    const source = await Source.findOne({ id: req.params.id });
    if (!source) return res.status(404).json({ message: 'Source not found' });
    if (source.platform !== 'instagram') return res.status(400).json({ message: 'Source is not an Instagram account' });

    const handle = source.identifier;
    const { fetchUserProfile } = require('../services/rapidApiInstagramService');
    const raw = await fetchUserProfile(handle);

    // Extract profile from raw response (same logic as monitorService)
    const pickFirst = (...values) => values.find(v => v !== undefined && v !== null && v !== '');
    const data = raw?.data?.data || raw?.data || raw?.result || raw;
    const user = data?.user || data?.data?.user || data?.user_info?.user || data?.userInfo || data?.profile || data?.result?.user || data?.result?.data?.user || null;

    if (!user) {
      // Return cached data from source if API fails
      return res.json({
        username: source.identifier,
        full_name: source.display_name,
        profile_pic_url: source.profile_image_url || '',
        followers_count: source.statistics?.subscriber_count || 0,
        following_count: 0,
        media_count: source.statistics?.video_count || 0,
        biography: '',
        is_verified: source.is_verified || false,
        external_url: '',
        category: source.category || '',
        is_private: false,
        _cached: true
      });
    }

    const profileData = {
      username: pickFirst(user.username, user.user?.username, handle),
      full_name: pickFirst(user.full_name, user.name, user.fullName, user.user?.full_name, source.display_name),
      profile_pic_url: pickFirst(user.profile_pic_url_hd, user.profile_pic_url, user.profile_pic, user.avatar, source.profile_image_url),
      followers_count: Number(pickFirst(user.edge_followed_by?.count, user.follower_count, user.followers, user.followers_count) || source.statistics?.subscriber_count || 0),
      following_count: Number(pickFirst(user.edge_follow?.count, user.following_count, user.following, user.followees_count) || 0),
      media_count: Number(pickFirst(user.edge_owner_to_timeline_media?.count, user.media_count, user.posts_count, user.post_count) || source.statistics?.video_count || 0),
      biography: pickFirst(user.biography, user.bio, user.about, user.description) || '',
      is_verified: pickFirst(user.is_verified, user.isVerified) || false,
      external_url: pickFirst(user.external_url, user.website, user.url) || '',
      category: pickFirst(user.category_name, user.category, user.account_type) || source.category || '',
      is_private: pickFirst(user.is_private, user.isPrivate) || false,
      bio_links: user.bio_links || [],
      mutual_followers: user.edge_mutual_followed_by?.edges?.map(e => e.node?.username).filter(Boolean) || [],
      mutual_followers_count: user.edge_mutual_followed_by?.count || 0
    };

    // Update source with latest data
    const updates = {};
    if (profileData.profile_pic_url && profileData.profile_pic_url !== source.profile_image_url) {
      updates.profile_image_url = profileData.profile_pic_url;
    }
    if (profileData.full_name && profileData.full_name !== source.display_name) {
      updates.display_name = profileData.full_name;
    }
    if (profileData.is_verified !== undefined) {
      updates.is_verified = profileData.is_verified;
    }
    updates.statistics = {
      ...(source.statistics || {}),
      subscriber_count: profileData.followers_count || source.statistics?.subscriber_count || 0,
      video_count: profileData.media_count || source.statistics?.video_count || 0,
      view_count: source.statistics?.view_count || 0
    };
    if (Object.keys(updates).length > 0) {
      await Source.findOneAndUpdate({ id: source.id }, { $set: updates });
    }

    return res.json(profileData);
  } catch (error) {
    //(() => {})('[getInstagramProfile] Error:', error.message);
    // Fallback to cached source data
    try {
      const source = await Source.findOne({ id: req.params.id });
      if (source) {
        return res.json({
          username: source.identifier,
          full_name: source.display_name,
          profile_pic_url: source.profile_image_url || '',
          followers_count: source.statistics?.subscriber_count || 0,
          following_count: 0,
          media_count: source.statistics?.video_count || 0,
          biography: '',
          is_verified: source.is_verified || false,
          external_url: '',
          category: source.category || '',
          is_private: false,
          _cached: true
        });
      }
    } catch (_) { /* ignore */ }
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Refresh source identity (handle/metadata) using stable platform user id
// @route   POST /api/sources/:id/refresh-identity
// @access  Private
const refreshSourceIdentity = async (req, res) => {
  try {
    let source = await Source.findOne({ id: req.params.id });
    if (!source && mongoose.Types.ObjectId.isValid(req.params.id)) {
      source = await Source.findById(req.params.id);
    }
    if (!source) return res.status(404).json({ message: 'Source not found' });

    const oldIdentifier = String(source.identifier || '').trim();
    const oldDisplayName = String(source.display_name || '').trim();
    const oldPlatformUserId = String(source.platform_user_id || '').trim();

    const identity = await refreshPlatformIdentity(source);

    const newIdentifierRaw = identity?.normalizedIdentifier || oldIdentifier;
    let newIdentifier = normalizeIdentifier(source.platform, newIdentifierRaw || oldIdentifier);
    const newPlatformUserId = String(identity?.platformUserId || oldPlatformUserId || '').trim();
    const newDisplayName = String(identity?.resolvedDisplayName || oldDisplayName || oldIdentifier || '').trim();

    // Instagram provider can temporarily return stale usernames after a rename.
    // If the resolved username is one of previously seen old identifiers,
    // keep the current identifier until provider data catches up.
    if (String(source.platform || '').toLowerCase() === 'instagram') {
      const oldKnown = Array.isArray(source.old_identifiers)
        ? source.old_identifiers.map((v) => String(v || '').trim()).filter(Boolean)
        : [];
      if (
        newIdentifier &&
        oldIdentifier &&
        newIdentifier !== oldIdentifier &&
        oldKnown.includes(newIdentifier)
      ) {
        newIdentifier = oldIdentifier;
      }
    }

    const setData = {
      platform_user_id: newPlatformUserId,
      display_name: newDisplayName,
      last_identity_refresh_at: new Date()
    };

    // Keep YouTube source identifier as stable channel id. For other platforms, update identifier.
    if (source.platform !== 'youtube') {
      setData.identifier = newIdentifier;
    }
    if (identity?.profileImageUrl) {
      setData.profile_image_url = identity.profileImageUrl;
    }
    if (identity?.isVerified !== undefined && identity?.isVerified !== null) {
      setData.is_verified = !!identity.isVerified;
    }

    const addToSet = {};
    if (source.platform !== 'youtube' && newIdentifier && oldIdentifier && newIdentifier !== oldIdentifier) {
      addToSet.old_identifiers = oldIdentifier;
    }

    const updatedSource = await Source.findOneAndUpdate(
      source.id ? { id: source.id } : { _id: source._id },
      {
        $set: setData,
        ...(Object.keys(addToSet).length ? { $addToSet: addToSet } : {})
      },
      { new: true }
    );

    // Sync linked POI socialMedia rows and keep previous handles history.
    const sourceIdCandidates = [
      String(updatedSource.id || '').trim(),
      String(updatedSource._id || '').trim()
    ].filter(Boolean);

    const sourcePlatform = String(updatedSource.platform || '').toLowerCase();
    const sourcePlatformAliases = sourcePlatform === 'x' || sourcePlatform === 'twitter'
      ? ['x', 'twitter']
      : [sourcePlatform];
    const normalizedOldIdentifier = String(oldIdentifier || '').replace(/^@/, '').toLowerCase();
    const normalizedNewIdentifier = String(updatedSource.identifier || '').replace(/^@/, '').toLowerCase();
    const sourceUserIdCandidates = [
      String(oldPlatformUserId || '').trim(),
      String(updatedSource.platform_user_id || '').trim()
    ].filter(Boolean);

    const linkedPois = await POI.find({
      $or: [
        { 'socialMedia.sourceId': { $in: sourceIdCandidates } },
        ...(sourceUserIdCandidates.length
          ? [{
              socialMedia: {
                $elemMatch: {
                  platform: { $in: sourcePlatformAliases },
                  platformUserId: { $in: sourceUserIdCandidates }
                }
              }
            }]
          : []),
        ...(normalizedOldIdentifier
          ? [{
              socialMedia: {
                $elemMatch: {
                  platform: { $in: sourcePlatformAliases },
                  handle: { $in: [oldIdentifier, normalizedOldIdentifier, `@${normalizedOldIdentifier}`] }
                }
              }
            }]
          : []),
        ...(normalizedNewIdentifier
          ? [{
              socialMedia: {
                $elemMatch: {
                  platform: { $in: sourcePlatformAliases },
                  handle: { $in: [updatedSource.identifier, normalizedNewIdentifier, `@${normalizedNewIdentifier}`] }
                }
              }
            }]
          : [])
      ]
    });
    for (const poi of linkedPois) {
      let changed = false;
      poi.socialMedia = (poi.socialMedia || []).map((sm) => {
        const smSourceId = String(sm?.sourceId || '').trim();
        const smPlatform = String(sm?.platform || '').toLowerCase();
        const smHandle = String(sm?.handle || '').trim();
        const normalizedSmHandle = smHandle.replace(/^@/, '').toLowerCase();
        const smPlatformUserId = String(sm?.platformUserId || '').trim();

        const isSameSourceId = sourceIdCandidates.includes(smSourceId);
        const isSamePlatform = sourcePlatformAliases.includes(smPlatform);
        const isSameUserId = !!smPlatformUserId && sourceUserIdCandidates.includes(smPlatformUserId);
        const isSameHandle = !!normalizedSmHandle && (
          normalizedSmHandle === normalizedOldIdentifier ||
          normalizedSmHandle === normalizedNewIdentifier
        );

        if (!(isSameSourceId || (isSamePlatform && (isSameUserId || isSameHandle)))) return sm;

        const smObj = sm.toObject ? sm.toObject() : { ...sm };
        const currentSmHandle = String(smObj.handle || '').trim();

        // For YouTube, prefer currentHandle if available; otherwise keep existing displayed handle.
        const refreshedHandle = source.platform === 'youtube'
          ? String(identity?.currentHandle || currentSmHandle || updatedSource.identifier || '').trim()
          : String(updatedSource.identifier || currentSmHandle || '').trim();

        const previousHandles = Array.isArray(smObj.previousHandles) ? [...smObj.previousHandles] : [];
        if (refreshedHandle && currentSmHandle && refreshedHandle !== currentSmHandle && !previousHandles.includes(currentSmHandle)) {
          previousHandles.push(currentSmHandle);
        }

        const next = {
          ...smObj,
          sourceId: sourceIdCandidates.includes(String(smObj.sourceId || '').trim()) ? smObj.sourceId : (updatedSource.id || smObj.sourceId),
          handle: refreshedHandle || smObj.handle,
          platformUserId: updatedSource.platform_user_id || smObj.platformUserId || '',
          displayName: updatedSource.display_name || smObj.displayName,
          profileImage: updatedSource.profile_image_url || smObj.profileImage,
          previousHandles
        };

        if (
          next.handle !== smObj.handle ||
          next.platformUserId !== smObj.platformUserId ||
          next.displayName !== smObj.displayName ||
          next.profileImage !== smObj.profileImage ||
          JSON.stringify(next.previousHandles || []) !== JSON.stringify(smObj.previousHandles || [])
        ) {
          changed = true;
        }

        return next;
      });

      if (changed) {
        await poi.save();
      }
    }

    await createAuditLog(req.user, 'refresh_identity', 'source', updatedSource.id || updatedSource._id, {
      platform: updatedSource.platform,
      old_identifier: oldIdentifier,
      new_identifier: source.platform === 'youtube' ? oldIdentifier : updatedSource.identifier,
      method: identity?.method || 'unknown'
    });

    return res.status(200).json({
      source: updatedSource,
      identity: {
        method: identity?.method || 'unknown',
        oldIdentifier,
        newIdentifier: source.platform === 'youtube' ? oldIdentifier : updatedSource.identifier,
        platformUserId: updatedSource.platform_user_id || ''
      }
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Resolve stable platform user ID from a typed handle/username/url
// @route   POST /api/sources/resolve-identity
// @access  Private
const resolveSourceIdentity = async (req, res) => {
  try {
    let { platform, identifier } = req.body || {};
    platform = String(platform || '').toLowerCase().trim();
    identifier = String(identifier || '').trim();

    if (!platform || !identifier) {
      return res.status(400).json({ message: 'platform and identifier are required' });
    }

    if (platform === 'facebook') {
      const normalized = normalizeFacebookIdentifier(identifier);
      if (!normalized || !normalized.identifier) {
        if (normalized?.kind === 'group') {
          return res.status(400).json({
            message: 'Facebook group monitoring is not supported. Please use a Facebook Page/Profile.'
          });
        }
        return res.status(400).json({ message: 'Invalid Facebook identifier/URL' });
      }
      identifier = normalized.identifier;
    }

    identifier = normalizeIdentifier(platform, identifier);
    const localAliases = collectLocalAliases(platform, identifier);
    const guessedUserId = extractStableUserId(platform, identifier);

    const localExisting = await findDuplicateSource(platform, {
      identifier,
      platformUserId: guessedUserId,
      aliases: localAliases
    });
    if (localExisting) {
      return res.status(200).json({
        platform,
        identifier: localExisting.identifier,
        platformUserId: localExisting.platform_user_id || guessedUserId || '',
        displayName: localExisting.display_name || '',
        profileImageUrl: localExisting.profile_image_url || '',
        isVerified: localExisting.is_verified === true,
        method: 'existing',
        alreadyMonitored: true,
        existing: duplicatePayload(localExisting).existing
      });
    }

    const identity = await resolvePlatformIdentity(platform, identifier);
    const normalizedIdentifier = normalizeIdentifier(platform, identity?.normalizedIdentifier || identifier);
    const platformUserId = String(identity?.platformUserId || guessedUserId || '').trim();
    const existing = await findDuplicateSource(platform, {
      identifier: normalizedIdentifier,
      platformUserId,
      aliases: uniqueNonEmpty([
        ...localAliases,
        ...collectLocalAliases(platform, normalizedIdentifier),
        normalizedIdentifier
      ])
    });

    return res.status(200).json({
      platform,
      identifier: normalizedIdentifier,
      platformUserId,
      displayName: identity?.resolvedDisplayName || '',
      profileImageUrl: identity?.profileImageUrl || '',
      isVerified: identity?.isVerified === true,
      method: identity?.method || 'unresolved',
      alreadyMonitored: !!existing,
      existing: existing ? duplicatePayload(existing).existing : null
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const recomputeSourceRelevance = async (req, res) => {
  try {
    const sourceId = String(req.params.id || '').trim();
    if (sourceId) {
      const updated = await persistSourceRelevance(sourceId);
      if (!updated) {
        return res.status(404).json({ message: 'Source not found' });
      }
      return res.status(200).json(updated);
    }

    const result = await recomputeAllSourceRelevance();
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getSources,
  createSource,
  updateSource,
  deleteSource,
  manualCheck,
  toggleSourceStatus,
  scanNow,
  scanAllSources,
  createSourcesBulk,
  getInstagramProfile,
  resolveSourceIdentity,
  refreshSourceIdentity,
  recomputeSourceRelevance
};
