const axios = require('axios');
const Alert = require('../models/Alert');
const Content = require('../models/Content');
const { createAuditLog } = require('../services/auditService');
const { fetchTweetDetail } = require('../services/rapidApiXService');
const YouTubeService = require('../services/youtube.service');
const { fetchInstagramPostDetail } = require('../services/rapidApiInstagramService');
const { resolveFacebookInvestigation } = require('../services/facebookInvestigationService');
const { resolveFacebookCanonicalPost } = require('../services/facebookCanonicalResolver');
const { parsePostUrl } = require('../services/urlParserService');
const { analyzeContent } = require('../services/analysisService');
const { analyzeInvestigationText } = require('../services/investigationAnalysisService');
const { enqueueInvestigation } = require('../services/investigationQueueService');
const { archiveContentMedia, archiveTwitterMedia, archiveFacebookMedia } = require('../services/contentS3Service');
const cacheService = require('../services/cacheService');
const translationService = require('../services/translationService');
const cheerio = require('cheerio');
const { v4: uuidv4 } = require('uuid');
const Source = require('../models/Source');
const POI = require('../models/POI');
const logger = require('../utils/logger');

const escapeRegex = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Apply "profile-only" filter: exclude event-scoped alerts.
// Alerts raised BY the event pipeline stay on the Events board — that is
// deliberate and unchanged (`event_id = null`).
//
// What was NOT deliberate: excluding every alert whose content merely happens to
// also be tagged to an event. A post monitored from a Source vanished from the
// Alerts board the moment any active event also matched it. That exclusion is
// removed; source-created alerts stay visible regardless of event tagging.
// (It also generated the multi-MB `$nin` lines in the query log.)
const applyProfileOnlyFilter = async (query) => {
  query.event_id = null;
  return query;
};

const WORKFLOW_STATUSES = new Set(['acknowledged', 'false_positive', 'escalated', 'resolved']);

const resolveAlertDateBounds = (startDate, endDate) => {
  const hasExplicitRange = Boolean(startDate || endDate);
  const start = startDate ? new Date(startDate) : (() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    d.setHours(0, 0, 0, 0);
    return d;
  })();
  if (!hasExplicitRange) return { start, end: null };
  const end = endDate ? new Date(endDate) : new Date();
  if (endDate && /^\d{4}-\d{2}-\d{2}$/.test(String(endDate))) {
    end.setHours(23, 59, 59, 999);
  }
  return { start, end };
};

// Active tab: publish date only (monitoring new posts).
// Workflow tabs (ack / FP / escalated): also match acknowledged_at / created_at
// so older posts actioned this week still appear — otherwise the tab count
// (all-time summary) and the dated list disagree and the grid looks empty.
const applyAlertDateFilter = (query, { startDate, endDate, status } = {}) => {
  const { start, end } = resolveAlertDateBounds(startDate, endDate);
  const range = end ? { $gte: start, $lte: end } : { $gte: start };
  const workflow = WORKFLOW_STATUSES.has(String(status || '').toLowerCase());

  if (!workflow) {
    query.content_published_at = range;
    return query;
  }

  query.$and = query.$and || [];
  query.$and.push({
    $or: [
      { content_published_at: range },
      { acknowledged_at: range },
      { created_at: range }
    ]
  });
  return query;
};

const normalizeIdentifier = (platform, identifier) => {
  if (!identifier) return '';
  const id = String(identifier).trim();

  switch (String(platform).toLowerCase()) {
    case 'x':
    case 'twitter':
      return id.replace(/^@/, '').toLowerCase();
    case 'youtube':
    case 'instagram':
      return id.toLowerCase();
    default:
      return id;
  }
};

const mediaHasS3Gaps = (media = []) => {
  if (!Array.isArray(media) || media.length === 0) return false;
  return media.some((item) => {
    const hasSource = Boolean(item?.video_url || item?.url);
    return hasSource && !item?.s3_url;
  });
};

const archiveAlertMediaForContent = async (contentDetails = {}) => {
  const platform = String(contentDetails.platform || '').toLowerCase();
  const contentId = contentDetails.id;
  if (!contentId || !['x', 'instagram', 'facebook'].includes(platform)) return;

  const media = Array.isArray(contentDetails.media) ? contentDetails.media : [];
  const quotedMedia = Array.isArray(contentDetails?.quoted_content?.media) ? contentDetails.quoted_content.media : [];

  if (!mediaHasS3Gaps(media) && (platform !== 'x' || !mediaHasS3Gaps(quotedMedia))) {
    return;
  }

  try {
    const patch = {};

    if (platform === 'x') {
      if (mediaHasS3Gaps(media)) {
        patch.media = await archiveTwitterMedia(media, contentDetails.content_id || contentId);
      }
      if (mediaHasS3Gaps(quotedMedia)) {
        patch.quoted_content = {
          ...(contentDetails.quoted_content || {}),
          media: await archiveTwitterMedia(
            quotedMedia,
            `${contentDetails.content_id || contentId}_quoted_${contentDetails?.quoted_content?.author_handle || 'unknown'}`
          )
        };
      }
      const effectiveMedia = patch.media || media;
      patch.is_media_archived = effectiveMedia.length > 0 && !mediaHasS3Gaps(effectiveMedia);
    } else if (platform === 'instagram' && mediaHasS3Gaps(media)) {
      patch.media = await archiveContentMedia(media, contentDetails.content_id || contentId, {
        useUniqueFileName: true,
        replaceOriginalUrls: false
      });
      patch.is_media_archived = patch.media.length > 0 && !mediaHasS3Gaps(patch.media);
    } else if (platform === 'facebook' && mediaHasS3Gaps(media)) {
      patch.media = await archiveFacebookMedia(media, contentDetails.content_id || contentId, {
        replaceOriginalUrls: false,
        postUrl: contentDetails.content_url
      });
      patch.is_media_archived = patch.media.length > 0 && !mediaHasS3Gaps(patch.media);
    }

    if (Object.keys(patch).length > 0) {
      await Content.updateOne({ id: contentId }, { $set: patch });
    }
  } catch (error) {
    logger.error(`[Alerts] Media archive retry failed for ${platform}:${contentDetails.content_id || contentId} - ${error.message}`);
  }
};

const queueAlertMediaArchival = (alerts = []) => {
  const candidates = (Array.isArray(alerts) ? alerts : [])
    .map((a) => a?.content_details)
    .filter((content) => content && (content.platform === 'x' || content.platform === 'instagram' || content.platform === 'facebook'))
    .slice(0, 10);

  if (candidates.length === 0) return;

  Promise.allSettled(candidates.map((content) => archiveAlertMediaForContent(content)))
    .catch(() => {
      // Intentionally swallow background errors.
    });
};

const getCacheKey = (prefix, params) => {
  const ordered = Object.keys(params || {})
    .sort()
    .reduce((acc, key) => {
      acc[key] = params[key];
      return acc;
    }, {});
  return `${prefix}:${JSON.stringify(ordered)}`;
};

const readCache = async (key) => cacheService.get(key);
const writeCache = async (key, value, ttl = 20) => cacheService.set(key, value, ttl);
const clearAlertCache = async () => {
  await cacheService.invalidatePrefix('alerts:list:v5');
  await cacheService.invalidatePrefix('alerts:stats:v5');
  await cacheService.invalidatePrefix('dashboard:v2');
  await cacheService.invalidatePrefix('alert_summary');
  await cacheService.invalidatePrefix('unread_count');
};

const applySearchCondition = (query, searchTerm) => {
  if (!searchTerm || !String(searchTerm).trim()) return query;

  const terms = String(searchTerm).trim().split(/[\s,]+/).filter(Boolean);
  const searchRegex = terms.length > 0
    ? { $regex: terms.map((t) => escapeRegex(t)).join('|'), $options: 'i' }
    : { $regex: escapeRegex(String(searchTerm)), $options: 'i' };

  const searchOr = [
    { title: searchRegex },
    { author: searchRegex },
    { author_handle: searchRegex },
    { description: searchRegex },
    { content_url: searchRegex }
  ];

  if (query.$or) {
    query.$and = query.$and || [];
    query.$and.push({ $or: query.$or });
    query.$and.push({ $or: searchOr });
    delete query.$or;
  } else {
    query.$or = searchOr;
  }

  return query;
};

// @desc    Get alerts
// @route   GET /api/alerts
// @access  Private
const getAlerts = async (req, res) => {
  try {
    const {
      status,
      risk_level,
      virality_level,
      search,
      platform,
      startDate,
      endDate,
      alert_type,
      keyword,
      category,
      page = 1,
      limit = 20
    } = req.query;

    const query = {};

    // Status Filter
    if (status && status !== 'all') {
      query.status = status;
    } else if (!status) {
      query.status = 'active';
    }

    // Source ID Filter (for POI specific alerts)
    if (req.query.source_id) {
      // Handle lookup logic if needed, but usually content_id -> content -> source_id
      // However, standard alerts don't have direct source_id usually, they link to content.
      // But let's check if Alert model has source_id or we need to filter via content lookup.
      // Looking at updateAlert, it seems we can add source_id to alert, OR we rely on content.
      // The efficient way for existing alerts is looking up via content's source_id.
      // BUT, for new architecture, we might want to filter by the source of the content.
      // existing implementation of getAlerts does lookup.
    }

    // Simplest approach: We will handle source_id filtering AFTER lookup or during aggregation if possible.
    // For now, let's pass it to the aggregation match if we use aggregation.


    // Risk Level Filter (AI severity — independent of virality)
    if (risk_level && risk_level !== 'all') query.risk_level = risk_level;

    // Virality Level Filter (engagement spread — null means not viral and is excluded)
    if (virality_level && virality_level !== 'all') {
      const v = String(virality_level).toLowerCase();
      if (v === 'any' || v === 'viral') {
        query.virality_level = { $in: ['low', 'medium', 'high'] };
      } else {
        query.virality_level = v;
      }
    }

    // Platform Filter
    if (platform && platform !== 'all') query.platform = platform;

    // Alert Type (Category) Filter
    if (alert_type && alert_type !== 'all') {
      if (alert_type === 'risk') {
        query.alert_type = { $in: ['keyword_risk', 'ai_risk', null] };
      } else {
        query.alert_type = alert_type;
      }
    }

    applyAlertDateFilter(query, { startDate, endDate, status });

    const includeStats = String(req.query.includeStats || '').toLowerCase() === 'true';
    const cursor = req.query.cursor;
    let pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    // Support page-encoded cursor for aggregation path (format: "p:N")
    if (cursor && cursor.startsWith('p:')) {
      const cursorPage = parseInt(cursor.substring(2), 10);
      if (!isNaN(cursorPage) && cursorPage > 0) pageNum = cursorPage;
    }

    const skip = (pageNum - 1) * limitNum;
    const hasSearch = search && search.trim();
    const hasKeyword = keyword && keyword !== 'all';
    const hasCategory = category && category !== 'all';

    // Pre-resolve category / keyword / source_id filters into content_id sets
    // to avoid expensive $lookup pipelines that blow the 32 MB sort memory limit.
    const Source = require('../models/Source');

    const cacheKey = getCacheKey('alerts:list:v5', {
      ...req.query,
      includeStats,
      cursor: cursor || ''
    });
    const cachedResponse = await readCache(cacheKey);
    if (cachedResponse) return res.status(200).json(cachedResponse);

    // ---------- Pre-resolve category → content IDs ----------
    if (hasCategory) {
      // 1. Find sources matching the category
      const catSources = await Source.find({ category }).select('id').lean();
      const catSourceIds = catSources.map(s => s.id);

      if (catSourceIds.length === 0) {
        // No sources for this category → return empty immediately
        const emptyPayload = {
          alerts: [],
          pagination: { total: 0, page: pageNum, totalPages: 0, hasMore: false, nextCursor: null }
        };
        if (includeStats) emptyPayload.stats = await buildAlertStats({ ...req.query, search: hasSearch ? search : '' });
        return res.status(200).json(emptyPayload);
      }

      // 2. Find content IDs belonging to those sources
      const catContentIds = await Content.distinct('id', { source_id: { $in: catSourceIds } });

      // Also match alerts that have source_category directly
      // Combine: content_id in catContentIds OR source_category === category
      if (catContentIds.length > 0) {
        query.$or = [
          { content_id: { $in: catContentIds } },
          { source_category: category }
        ];
      } else {
        query.source_category = category;
      }
    }

    // ---------- Pre-resolve source_id filter ----------
    if (req.query.source_id) {
      const sid = req.query.source_id;
      const mongoose = require('mongoose');

      const possibleSourceIds = [sid];
      if (mongoose.Types.ObjectId.isValid(sid)) {
        const sourceRecord = await Source.findById(sid).select('id').lean();
        if (sourceRecord?.id) possibleSourceIds.push(sourceRecord.id);
      }

      const sidContentIds = await Content.distinct('id', { source_id: { $in: possibleSourceIds } });

      if (sidContentIds.length > 0) {
        query.content_id = { ...(query.content_id || {}), $in: sidContentIds };
      } else {
        // No content for this source → empty
        const emptyPayload = {
          alerts: [],
          pagination: { total: 0, page: pageNum, totalPages: 0, hasMore: false, nextCursor: null }
        };
        if (includeStats) emptyPayload.stats = await buildAlertStats({ ...req.query, search: hasSearch ? search : '' });
        return res.status(200).json(emptyPayload);
      }
    }

    // ---------- Pre-resolve keyword filter ----------
    if (hasKeyword) {
      const kw = String(keyword).trim().toLowerCase();
      const kwContentIds = await Content.distinct('id', {
        'risk_factors.keyword': { $regex: `^${escapeRegex(kw)}`, $options: 'i' }
      });

      // Match alerts with keyword in normalized array OR content with keyword risk_factor
      const kwOr = [{ matched_keywords_normalized: kw }];
      if (kwContentIds.length > 0) kwOr.push({ content_id: { $in: kwContentIds } });

      if (query.$or) {
        // Combine with existing $or (from category) using $and
        query.$and = query.$and || [];
        query.$and.push({ $or: query.$or });
        query.$and.push({ $or: kwOr });
        delete query.$or;
      } else {
        query.$or = kwOr;
      }
    }

    if (hasSearch) {
      applySearchCondition(query, search);
    }

    // Profile-only: exclude event-scoped alerts from the Alerts page.
    await applyProfileOnlyFilter(query);

    let alerts = [];
    let hasMore = false;
    let nextCursor = null;
    let total;

    const rows = await Alert.find(query)
      .sort({ content_published_at: -1, created_at: -1, id: -1 })
      .skip(skip)
      .limit(limitNum + 1)
      .lean();

    hasMore = rows.length > limitNum;
    alerts = hasMore ? rows.slice(0, limitNum) : rows;
    if (hasMore) {
      nextCursor = `p:${pageNum + 1}`;
    }
    if (!cursor) total = await Alert.countDocuments(query);
    logger.debug(`[Alerts] retrieved ${alerts.length} alert(s) for page=${pageNum} status=${query.status || 'any'} total=${total ?? 'n/a'}`);

    // Join content + source for only visible rows
    const contentIds = Array.from(new Set(alerts.map((a) => a.content_id || a.content_ref_id).filter(Boolean)));
    const contents = await Content.find({ id: { $in: contentIds } })
      .select('id content_id platform content_type content_url text author_handle published_at engagement media is_deleted deleted_at is_expired expired_at availability_status is_repost original_author original_author_name original_author_avatar quoted_content url_cards thumbnails risk_factors risk_level source_id translated_text scraped_content location media_location')
      .lean();

    // For Facebook content with empty media, try to extract from raw_data
    const fbEmptyMediaIds = contents
      .filter(c => c.platform === 'facebook' && (!c.media || c.media.length === 0))
      .map(c => c.id);
    if (fbEmptyMediaIds.length > 0) {
      const rawDocs = await Content.find({ id: { $in: fbEmptyMediaIds } })
        .select('id raw_data')
        .lean();
      const rawMap = new Map(rawDocs.map(d => [d.id, d.raw_data]));
      for (const c of contents) {
        if (c.platform === 'facebook' && (!c.media || c.media.length === 0)) {
          const raw = rawMap.get(c.id);
          if (raw) {
            const extracted = [];
            const fields = [raw.full_picture, raw.picture, raw.image, raw.video, raw.video_thumbnail, raw.source];
            fields.forEach(f => { if (f && typeof f === 'string') extracted.push(f); });
            if (Array.isArray(raw.album_preview)) {
              raw.album_preview.forEach(a => { const u = a?.url || a; if (u) extracted.push(u); });
            }
            if (Array.isArray(raw.images)) {
              raw.images.forEach(u => { if (u && typeof u === 'string') extracted.push(u); });
            }
            const unique = [...new Set(extracted.filter(Boolean))];
            if (unique.length > 0) {
              c.media = unique.map(url => ({
                type: /\.(mp4|webm|mov|m3u8)(\?|$)/i.test(url) || /video/i.test(url) ? 'video' : 'photo',
                url,
                preview: url
              }));
            }
          }
        }
      }
    }

    const contentMap = new Map(contents.map((c) => [c.id, c]));

    const sourceIds = Array.from(new Set(contents.map((c) => c.source_id).filter(Boolean)));
    const sources = await Source.find({ id: { $in: sourceIds } })
      .select('id profile_image_url is_verified display_name identifier category')
      .lean();
    const sourceMap = new Map(sources.map((s) => [s.id, s]));
    const sourcesWithAvatar = sources.filter((s) => s.profile_image_url).length;
    logger.debug(`[Alerts] profile image extraction: ${sourcesWithAvatar}/${sources.length} source(s) have a profile_image_url`);

    // Fetch analysis for all content IDs
    const Analysis = require('../models/Analysis');
    const analyses = await Analysis.aggregate([
      { $match: { content_id: { $in: contentIds } } },
      { $sort: { analyzed_at: -1, created_at: -1 } },
      { $group: { _id: '$content_id', latest: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$latest' } }
    ]).allowDiskUse(true);
    const analysisMap = new Map();
    // Use a map of content_id -> last analysis (most recent)
    analyses.forEach(a => {
      const current = analysisMap.get(a.content_id);
      if (!current || new Date(a.analyzed_at) > new Date(current.analyzed_at)) {
        analysisMap.set(a.content_id, a);
      }
    });

    const hydrated = alerts.map((alert) => {
      const content = contentMap.get(alert.content_id || alert.content_ref_id);
      if (content && analysisMap.has(content.id)) {
        content.analysis = analysisMap.get(content.id);
      }
      const source = content ? sourceMap.get(content.source_id) : null;
      return {
        ...alert,
        content_details: content || null,
        source_meta: source
          ? {
            profile_image_url: source.profile_image_url,
            is_verified: source.is_verified,
            name: source.display_name,
            handle: source.identifier
          }
          : null
      };
    });

    queueAlertMediaArchival(hydrated);
    logger.debug(`[Alerts] sending ${hydrated.length} hydrated alert(s) to client for rendering (with_avatar=${hydrated.filter((a) => a.source_meta?.profile_image_url).length})`);

    const responsePayload = {
      alerts: hydrated,
      pagination: {
        total,
        page: pageNum,
        totalPages: typeof total === 'number' ? Math.ceil(total / limitNum) : undefined,
        hasMore,
        nextCursor
      }
    };

    if (includeStats) {
      responsePayload.stats = await buildAlertStats({
        ...req.query,
        search: hasSearch ? search : ''
      });
    }

    await writeCache(cacheKey, responsePayload, 20);
    res.status(200).json(responsePayload);

  } catch (error) {
    logger.error('Error fetching alerts:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update alert
// @route   PUT /api/alerts/:id
// @access  Private
const updateAlert = async (req, res) => {
  try {
    const { status, notes, source_id, risk_level } = req.body;
    const alert = await Alert.findOne({ id: req.params.id });

    if (!alert) {
      return res.status(404).json({ message: 'Alert not found' });
    }

    // MongoDB rejects mixing top-level field assignments with atomic
    // operators in the same update document, so build `$set` and `$push`
    // explicitly here. Previously this silently failed and status_history
    // never got populated.
    const setDoc = {};
    const pushDoc = {};

    const statusChanged = status && status !== alert.status;
    if (status) {
      setDoc.status = status;
      setDoc.acknowledged_by = req.user.id;
      setDoc.acknowledged_at = new Date();
    }
    if (statusChanged) {
      pushDoc.status_history = {
        from: alert.status || null,
        to: status,
        changed_by: req.user?.id || null,
        changed_by_email: req.user?.email || null,
        notes: notes || '',
        at: new Date()
      };
    }

    if (risk_level && ['low', 'medium', 'high'].includes(risk_level)) {
      setDoc.risk_level = risk_level;
    }

    if (notes) setDoc.notes = notes;
    if (source_id !== undefined) setDoc.source_id = source_id;

    const updateDoc = {};
    if (Object.keys(setDoc).length) updateDoc.$set = setDoc;
    if (Object.keys(pushDoc).length) updateDoc.$push = pushDoc;

    const updatedAlert = await Alert.findOneAndUpdate(
      { id: req.params.id },
      updateDoc,
      // Partial $set/$push — do not run full-document validators so any
      // historical platform values outside the current enum cannot block status edits.
      { new: true, runValidators: false }
    );

    await clearAlertCache();
    // --- ML FEEDBACK LOOP ---
    // If status changed to false positive or escalated, record feedback
    if (status && status !== alert.status && (status === 'false_positive' || status === 'escalated')) {
      try {
        const feedbackService = require('../services/feedbackService');
        const Content = require('../models/Content');

        // Fetch full content text
        const content = await Content.findOne({
          $or: [{ id: alert.content_id }, { content_id: alert.content_id }]
        });

        if (content && content.text) {
          // Pass the alert's actual risk level so feedbackService can
          // determine the correct training label
          await feedbackService.recordFeedback({
            text: content.text,
            category: alert.category_id || alert.category || 'Normal',
            legal_sections: alert.legal_sections,
            review_status: status,
            current_risk: alert.risk_level || 'low'
          });
        }
      } catch (fbError) {
        logger.error('[AlertController] Feedback recording failed:', fbError);
        // Don't block the response
      }
    }

    // --- ML FEEDBACK for RISK LEVEL CHANGE ---
    // If risk level was manually changed, send feedback so model learns
    if (risk_level && risk_level !== alert.risk_level) {
      try {
        const feedbackService = require('../services/feedbackService');
        const Content = require('../models/Content');

        const content = await Content.findOne({
          $or: [{ id: alert.content_id }, { content_id: alert.content_id }]
        });

        if (content && content.text) {
          // Determine review_status based on direction of change
          const riskOrder = { low: 0, medium: 1, high: 2 };
          const oldLevel = (alert.risk_level || 'low').toLowerCase();
          const newLevel = risk_level.toLowerCase();
          // Escalation (low→medium, low→high, medium→high) → treat as 'escalated'
          // De-escalation (high→medium, high→low, medium→low) → treat as 'false_positive'
          const reviewStatus = riskOrder[newLevel] > riskOrder[oldLevel] ? 'escalated' : 'false_positive';

          await feedbackService.recordFeedback({
            text: content.text,
            category: alert.category_id || alert.category || 'Normal',
            legal_sections: alert.legal_sections,
            review_status: reviewStatus,
            current_risk: oldLevel
          });
          logger.info(`[AlertController] Risk level feedback sent: ${oldLevel} → ${newLevel} (as ${reviewStatus})`);
        }
      } catch (fbError) {
        logger.error('[AlertController] Risk level feedback recording failed:', fbError);
      }
    }

    await createAuditLog(req.user, 'update', 'alert', req.params.id, { status, risk_level, source_id });

    res.status(200).json(updatedAlert);
  } catch (error) {
    logger.error('[AlertController] updateAlert error:', error.message, error.stack);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get alert stats
// @route   GET /api/alerts/stats
// @access  Private
const buildAlertStats = async (params = {}) => {
  const { risk_level, virality_level, search, platform, startDate, endDate, alert_type, keyword, category, status } = params;
  const query = {};

  if (risk_level && risk_level !== 'all') query.risk_level = risk_level;
  if (virality_level && virality_level !== 'all') {
    const v = String(virality_level).toLowerCase();
    if (v === 'any' || v === 'viral') {
      query.virality_level = { $in: ['low', 'medium', 'high'] };
    } else {
      query.virality_level = v;
    }
  }
  if (platform && platform !== 'all') query.platform = platform;
  if (alert_type && alert_type !== 'all') {
    if (alert_type === 'risk') query.alert_type = { $in: ['keyword_risk', 'ai_risk', null] };
    else query.alert_type = alert_type;
  }
  // Stats are shown across tabs; use workflow date matching so FP / escalated /
  // acknowledged counts include recently actioned older posts.
  applyAlertDateFilter(query, {
    startDate,
    endDate,
    status: WORKFLOW_STATUSES.has(String(status || '').toLowerCase()) ? status : 'acknowledged'
  });
  const hasKeyword = keyword && keyword !== 'all';
  const hasCategory = category && category !== 'all';
  const hasSearch = search && search.trim();

  const Source = require('../models/Source');

  // Pre-resolve category → content IDs (avoids $lookup in pipeline)
  if (hasCategory) {
    const catSources = await Source.find({ category }).select('id').lean();
    const catSourceIds = catSources.map(s => s.id);
    if (catSourceIds.length === 0) {
      return { active: 0, acknowledged: 0, escalated: 0, resolved: 0, false_positive: 0, escalated_pending_report: 0 };
    }
    const catContentIds = await Content.distinct('id', { source_id: { $in: catSourceIds } });
    if (catContentIds.length > 0) {
      query.$or = [{ content_id: { $in: catContentIds } }, { source_category: category }];
    } else {
      query.source_category = category;
    }
  }

  // Pre-resolve keyword → content IDs
  if (hasKeyword) {
    const kw = String(keyword).trim().toLowerCase();
    const kwContentIds = await Content.distinct('id', {
      'risk_factors.keyword': { $regex: `^${escapeRegex(kw)}`, $options: 'i' }
    });
    const kwOr = [{ matched_keywords_normalized: kw }];
    if (kwContentIds.length > 0) kwOr.push({ content_id: { $in: kwContentIds } });
    if (query.$or) {
      query.$and = query.$and || [];
      query.$and.push({ $or: query.$or });
      query.$and.push({ $or: kwOr });
      delete query.$or;
    } else {
      query.$or = kwOr;
    }
  }

  if (hasSearch) {
    applySearchCondition(query, search);
  }

  // Profile-only: exclude event-scoped alerts.
  await applyProfileOnlyFilter(query);

  const basePipeline = [{ $match: { ...query } }];

  const [statusResult, pendingResult] = await Promise.all([
    Alert.aggregate([
      ...basePipeline,
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]),
    Alert.aggregate([
      ...basePipeline,
      { $match: { status: 'escalated' } },
      {
        $lookup: {
          from: 'reports',
          let: { alertId: '$id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$alert_id', '$$alertId'] } } },
            { $limit: 1 }
          ],
          as: 'report_exists'
        }
      },
      { $match: { report_exists: { $size: 0 } } },
      { $count: 'count' }
    ])
  ]);

  const stats = { active: 0, acknowledged: 0, escalated: 0, resolved: 0, false_positive: 0, escalated_pending_report: 0 };
  statusResult.forEach((item) => {
    if (item._id && Object.prototype.hasOwnProperty.call(stats, item._id)) stats[item._id] = item.count;
  });
  stats.escalated_pending_report = pendingResult?.[0]?.count || 0;

  // Virality breakdown (independent dimension) for filter visibility / chips
  const viralityQuery = { ...query };
  delete viralityQuery.virality_level;
  const viralityResult = await Alert.aggregate([
    { $match: viralityQuery },
    {
      $group: {
        _id: { $ifNull: ['$virality_level', null] },
        count: { $sum: 1 }
      }
    }
  ]);
  const virality = { low: 0, medium: 0, high: 0, total: 0 };
  viralityResult.forEach((row) => {
    const level = row._id;
    if (level === 'low' || level === 'medium' || level === 'high') {
      virality[level] = row.count;
      virality.total += row.count;
    }
  });
  stats.virality = virality;

  return stats;
};

const getAlertStats = async (req, res) => {
  try {
    const statsCacheKey = getCacheKey('alerts:stats:v5', req.query || {});
    const cachedStats = await readCache(statsCacheKey);
    if (cachedStats) return res.status(200).json(cachedStats);

    const stats = await buildAlertStats(req.query || {});
    await writeCache(statsCacheKey, stats, 20);
    res.status(200).json(stats);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get unread alerts count
// @route   GET /api/alerts/unread
// @access  Private
const getUnreadCount = async (req, res) => {
  try {
    const unreadCacheKey = 'unread_count:v2';
    const cachedUnread = await readCache(unreadCacheKey);
    if (cachedUnread) return res.status(200).json(cachedUnread);

    const [count, latestAlert] = await Promise.all([
      Alert.countDocuments({ is_read: false }),
      Alert.findOne({ is_read: false })
        .sort({ created_at: -1 })
        .select('title risk_level description id')
        .lean()
    ]);

    const payload = { count, latest_alert: latestAlert };
    await writeCache(unreadCacheKey, payload, 20);
    res.status(200).json(payload);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Mark all alerts as read
// @route   PUT /api/alerts/read
// @access  Private
const markAllAsRead = async (req, res) => {
  try {
    await Alert.updateMany(
      { is_read: false },
      { $set: { is_read: true } }
    );
    await clearAlertCache();
    res.status(200).json({ message: 'All alerts marked as read' });
  } catch (error) {
    logger.error('[AlertController] markAllAsRead error:', error.message, error.stack);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single alert by ID
// @route   GET /api/alerts/:id
// @access  Private
const getAlertById = async (req, res) => {
  try {
    const alert = await Alert.findOne({ id: req.params.id });

    if (!alert) {
      return res.status(404).json({ message: 'Alert not found' });
    }

    // Manual lookup for content details if needed by frontend
    // Alternatively, use an aggregate pipeline like in getAlerts
    const result = await Alert.aggregate([
      { $match: { id: req.params.id } },
      {
        $lookup: {
          from: 'contents',
          localField: 'content_id',
          foreignField: 'id',
          as: 'content_data'
        }
      },
      {
        $unwind: {
          path: '$content_data',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $lookup: {
          from: 'sources',
          localField: 'content_data.source_id',
          foreignField: 'id',
          as: 'source_data'
        }
      },
      {
        $unwind: {
          path: '$source_data',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $lookup: {
          from: 'analyses',
          let: {
            alertAnalysisId: '$analysis_id',
            contentId: '$content_id'
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: ['$id', '$$alertAnalysisId'] },
                    { $eq: ['$content_id', '$$contentId'] }
                  ]
                }
              }
            },
            { $sort: { analyzed_at: -1, created_at: -1 } },
            { $limit: 1 }
          ],
          as: 'analysis_data'
        }
      },
      {
        $addFields: {
          content_details: {
            id: '$content_data.id',
            platform: '$content_data.platform',
            content_type: '$content_data.content_type',
            content_url: '$content_data.content_url',
            text: '$content_data.text',
            author_handle: '$content_data.author_handle',
            published_at: '$content_data.published_at',
            media: '$content_data.media',
            is_deleted: '$content_data.is_deleted',
            deleted_at: '$content_data.deleted_at',
            is_expired: '$content_data.is_expired',
            expired_at: '$content_data.expired_at',
            availability_status: '$content_data.availability_status',
            risk_level: '$content_data.risk_level',
            analysis: { $arrayElemAt: ['$analysis_data', 0] }
          },
          source_meta: {
            profile_image_url: '$source_data.profile_image_url',
            is_verified: '$source_data.is_verified',
            name: '$source_data.display_name',
            handle: '$source_data.identifier'
          }
        }
      },
      { $project: { analysis_data: 0, content_data: 0, source_data: 0 } }
    ]);

    const responsePayload = result[0];
    if (responsePayload?.content_details) {
      queueAlertMediaArchival([responsePayload]);
    }

    res.status(200).json(responsePayload);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Investigate a link (One-off check)
// @route   POST /api/alerts/investigate
// @access  Private
const fs = require('fs');
const path = require('path');

const resolveShortenedUrl = async (url, maxRedirects = 3) => {
  if (maxRedirects === 0) return url;
  try {
    const res = await axios.head(url, {
      maxRedirects: 0,
      validateStatus: (status) => status >= 300 && status < 400,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    });
    const location = res.headers.location;
    if (location) {
      const nextUrl = location.startsWith('http') ? location : new URL(location, url).href;
      return await resolveShortenedUrl(nextUrl, maxRedirects - 1);
    }
  } catch (e) {
    // If HEAD fails or No redirect, return original
  }
  return url;
};

const resolveCanonicalFacebookPostUrl = async (url) => {
  const candidates = buildFacebookShareCandidates(url);
  let best = url;

  for (const candidate of candidates) {
    const redirected = await resolveUrlViaGetRedirects(candidate);
    const redirectedPath = safeParseUrl(redirected)?.pathname || '';
    if (redirected && !/\/share\/(?:v|r|p)\//i.test(redirectedPath)) {
      return redirected;
    }

    try {
      const response = await axios.get(candidate, {
        timeout: 20000,
        maxRedirects: 5,
        responseType: 'text',
        validateStatus: () => true,
        headers: buildSocialScrapeHeaders(candidate, 'facebook')
      });

      const finalUrl = response?.request?.res?.responseUrl || response?.request?.responseURL || redirected || candidate;
      const finalPath = safeParseUrl(finalUrl)?.pathname || '';
      if (finalUrl && !/\/share\/(?:v|r|p)\//i.test(finalPath)) {
        best = finalUrl;
      }

      const html = typeof response?.data === 'string' ? response.data : '';
      if (html) {
        const $ = cheerio.load(html);
        const ogUrl = $('meta[property="og:url"]').attr('content')
          || $('link[rel="canonical"]').attr('href')
          || '';
        if (ogUrl) {
          const absoluteOgUrl = ogUrl.startsWith('http') ? ogUrl : new URL(ogUrl, finalUrl || candidate).href;
          const ogPath = safeParseUrl(absoluteOgUrl)?.pathname || '';
          if (!/\/share\/(?:v|r|p)\//i.test(ogPath)) {
            return absoluteOgUrl;
          }
        }
      }
    } catch (error) {
      logger.info(`[Investigation] Facebook canonical URL scrape failed for ${candidate}: ${error.message}`);
    }
  }

  return best;
};

const resolveUrlViaGetRedirects = async (url) => {
  try {
    const response = await axios.get(url, {
      timeout: 20000,
      maxRedirects: 5,
      responseType: 'text',
      validateStatus: () => true,
      headers: {
        ...buildSocialScrapeHeaders(url, 'facebook')
      }
    });

    const finalUrl = response?.request?.res?.responseUrl || response?.request?.responseURL || url;
    return finalUrl || url;
  } catch (_) {
    return url;
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

const safeParseUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    return new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch {
    return null;
  }
};

const normalizeUrlForCompare = (value) => {
  const parsed = safeParseUrl(value);
  if (!parsed) return String(value || '').trim().toLowerCase();
  const host = parsed.hostname.replace(/^m\./i, '').replace(/^www\./i, 'www.').toLowerCase();
  const path = (parsed.pathname || '').replace(/\/+$/, '').toLowerCase();
  const search = parsed.search || '';
  return `https://${host}${path}${search}`;
};

const isProbablyDirectMediaUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return false;
  return /\.(?:jpg|jpeg|png|gif|webp|bmp|svg|mp4|webm|mov|m3u8)(?:[\?#]|$)/i.test(raw)
    || /(?:cdninstagram|fbcdn|fbsbx|googlevideo|ytimg|ggpht|twimg|scontent)/i.test(raw);
};

const collectMetadataMediaUrls = (media = []) => {
  const urls = new Set();
  const visit = (value, depth = 0) => {
    if (!value || depth > 4) return;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) urls.add(trimmed);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry) => visit(entry, depth + 1));
      return;
    }
    if (typeof value === 'object') {
      [
        'url', 'uri', 'src', 'preview', 'preview_url', 'preview_image_url',
        'video_url', 'videoUrl', 'hd_url', 'sd_url', 'image_url',
        'thumbnail_url', 'display_url', 'original_url', 'original_video_url',
        's3_url', 's3_preview'
      ].forEach((key) => visit(value[key], depth + 1));
    }
  };
  visit(media);
  return Array.from(urls);
};

const buildSocialScrapeHeaders = (url, platform = '') => {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9'
  };

  const normalized = String(platform || '').toLowerCase();
  if (normalized === 'facebook') {
    headers.Referer = 'https://www.facebook.com/';
    headers.Origin = 'https://www.facebook.com';
  } else if (normalized === 'instagram') {
    headers.Referer = 'https://www.instagram.com/';
    headers.Origin = 'https://www.instagram.com';
  } else if (normalized === 'youtube') {
    headers.Referer = 'https://www.youtube.com/';
    headers.Origin = 'https://www.youtube.com';
  } else if (normalized === 'x') {
    headers.Referer = 'https://x.com/';
    headers.Origin = 'https://x.com';
  }

  try {
    const parsed = new URL(url);
    headers.Host = parsed.host;
  } catch (_) {
    // ignore
  }

  return headers;
};

const extractOgMediaFromHtml = (html, platform = '') => {
  const $ = cheerio.load(html || '');
  const readMeta = (...selectors) => {
    for (const selector of selectors) {
      const value = $(selector).attr('content');
      if (value && String(value).trim()) return String(value).trim();
    }
    return '';
  };

  const normalizedPlatform = String(platform || '').toLowerCase();
  const items = [];
  const seen = new Set();
  const pushItem = (type, url, preview = '') => {
    const resolvedUrl = String(url || '').trim();
    if (!resolvedUrl || seen.has(`${type}:${resolvedUrl}`)) return;
    seen.add(`${type}:${resolvedUrl}`);
    items.push({
      type,
      url: resolvedUrl,
      preview: preview || resolvedUrl
    });
  };

  const ogVideo = readMeta(
    'meta[property="og:video:secure_url"]',
    'meta[property="og:video:url"]',
    'meta[property="og:video"]',
    'meta[name="twitter:player:stream"]'
  );
  const ogImage = readMeta(
    'meta[property="og:image:secure_url"]',
    'meta[property="og:image:url"]',
    'meta[property="og:image"]',
    'meta[name="twitter:image"]'
  );

  if (ogVideo) pushItem('video', ogVideo, ogImage);
  if (ogImage) pushItem('photo', ogImage, ogImage);

  if (normalizedPlatform === 'facebook') {
    const htmlMatches = Array.from(String(html || '').matchAll(/https?:\/\/[^"'\\\s]*(?:fbcdn|fbsbx|video)[^"'\\\s]*/gi))
      .map((match) => match?.[0])
      .filter(Boolean);
    htmlMatches.forEach((candidate) => {
      pushItem(/\.(mp4|webm|m3u8)(\?|$)/i.test(candidate) ? 'video' : 'photo', candidate, ogImage);
    });
  }

  return items;
};

const fetchSocialPageMetadata = async (url, platform = '') => {
  try {
    const normalizedPlatform = String(platform || '').toLowerCase();
    const response = await axios.get(url, {
      timeout: 20000,
      maxRedirects: 5,
      validateStatus: () => true,
      headers: buildSocialScrapeHeaders(url, normalizedPlatform)
    });

    const finalUrl = response?.request?.res?.responseUrl || response?.request?.responseURL || url;
    const html = typeof response?.data === 'string' ? response.data : '';
    if (!html) return null;

    const $ = cheerio.load(html);
    const readMeta = (...selectors) => {
      for (const selector of selectors) {
        const value = $(selector).attr('content');
        if (value && String(value).trim()) return String(value).trim();
      }
      return '';
    };

    const media = extractOgMediaFromHtml(html, normalizedPlatform);
    const title = readMeta('meta[property="og:title"]', 'meta[name="twitter:title"]') || $('title').text().trim();
    const description = readMeta(
      'meta[property="og:description"]',
      'meta[name="description"]',
      'meta[name="twitter:description"]'
    );
    const author = readMeta('meta[property="og:site_name"]', 'meta[name="author"]')
      || (normalizedPlatform === 'facebook' ? 'Facebook' : normalizedPlatform);

    return {
      id: '',
      title: title || `${normalizedPlatform} post`,
      text: description || title || '',
      description: description || '',
      author,
      author_handle: author,
      created_at: new Date(),
      platform: normalizedPlatform,
      content_type: media.some((item) => item.type === 'video') ? 'video' : 'post',
      media,
      canonical_url: finalUrl,
      metrics: {}
    };
  } catch (error) {
    logger.error(`[Investigation] Social metadata fetch failed for ${platform}:${url} - ${error.message}`);
    return null;
  }
};

const enrichInvestigationMedia = async ({ platform, resolvedUrl, metadata }) => {
  const normalizedPlatform = String(platform || '').toLowerCase();
  const currentMedia = Array.isArray(metadata?.media) ? metadata.media.filter(Boolean) : [];
  const currentUrls = collectMetadataMediaUrls(currentMedia);
  const hasUsableMedia = currentUrls.some((candidate) => candidate !== resolvedUrl && isProbablyDirectMediaUrl(candidate));

  if (normalizedPlatform === 'youtube') {
    const thumb = currentMedia.find((item) => item?.preview)?.preview
      || currentMedia.find((item) => item?.url && !isProbablyDirectMediaUrl(item.url))?.preview
      || currentMedia.find((item) => item?.url && !/\.(mp4|webm|mov|m3u8)(\?|$)/i.test(item.url))?.url
      || '';

    return {
      ...metadata,
      content_type: metadata?.content_type || 'video',
      media: [{
        type: 'video',
        url: resolvedUrl,
        preview: thumb || resolvedUrl
      }]
    };
  }

  if (hasUsableMedia || !resolvedUrl || !['facebook', 'instagram'].includes(normalizedPlatform)) {
    return metadata;
  }

  try {
    const response = await axios.get(resolvedUrl, {
      timeout: 20000,
      headers: buildSocialScrapeHeaders(resolvedUrl, normalizedPlatform)
    });

    if (typeof response.data !== 'string') return metadata;

    const scrapedMedia = extractOgMediaFromHtml(response.data, normalizedPlatform);
    if (!scrapedMedia.length) return metadata;

    const merged = [...currentMedia];
    const seen = new Set(currentUrls);
    scrapedMedia.forEach((item) => {
      if (!item?.url || seen.has(item.url)) return;
      seen.add(item.url);
      merged.push(item);
    });

    return {
      ...metadata,
      media: merged,
      content_type: metadata?.content_type || (scrapedMedia.some((item) => item.type === 'video') ? 'video' : 'post')
    };
  } catch (error) {
    logger.error(`[Investigation] Media enrichment scrape failed for ${normalizedPlatform}:${resolvedUrl} - ${error.message}`);
    return metadata;
  }
};

const parseInvestigationTarget = (value) => {
  const parsed = safeParseUrl(value);
  if (!parsed) return { platform: '', contentId: '' };

    const sharedParsed = parsePostUrl(parsed.href);
    if (sharedParsed?.platform) {
      return {
        platform: sharedParsed.platform,
        contentId: sharedParsed.postId || ''
      };
    }

    const host = parsed.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
    const pathname = parsed.pathname || '';
    const pathParts = pathname.split('/').filter(Boolean);

  if (host.includes('x.com') || host.includes('twitter.com')) {
    const statusMatch = pathname.match(/(?:\/i\/web)?\/(?:status|statuses)\/(\d+)/i);
    return {
      platform: 'x',
      contentId: statusMatch?.[1] || pathParts.find((p) => /^\d{15,}$/.test(p)) || ''
    };
  }

  if (host.includes('youtube.com') || host.includes('youtu.be')) {
    const vParam = parsed.searchParams.get('v');
    let videoId = '';
    if (vParam) videoId = vParam;
    if (!videoId && host.includes('youtu.be')) videoId = pathParts[0] || '';
    if (!videoId) {
      const m = pathname.match(/\/(?:shorts|embed|live|v)\/([^/?#&]+)/i);
      if (m?.[1]) videoId = m[1];
    }

    return {
      platform: 'youtube',
      contentId: videoId
    };
  }

  if (host.includes('instagram.com')) {
    const postMatch = pathname.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
    if (postMatch?.[1]) {
      return { platform: 'instagram', contentId: postMatch[1] };
    }

    const storyMatch = pathname.match(/\/stories\/([^/]+)\/(\d+)/i);
    if (storyMatch?.[2]) {
      return { platform: 'instagram', contentId: storyMatch[2] };
    }

    return { platform: 'instagram', contentId: '' };
  }

  if (host.includes('facebook.com') || host.includes('fb.watch')) {
    const storyFbid = parsed.searchParams.get('story_fbid') || parsed.searchParams.get('fbid');
    const watchId = parsed.searchParams.get('v');
    const pfbidMatch = pathname.match(/\/posts\/(pfbid[a-z0-9]+)/i);
    const shareMatch = pathname.match(/\/share\/(?:v|r|p)\/([^/?#]+)/i);
    const pathIdMatch = pathname.match(/\/(?:posts|videos|reel|reels|photo|permalink|watch)\/(\d+)/i);
    const groupsPostMatch = pathname.match(/\/groups\/[^/]+\/posts\/(\d+)/i);
    const fallbackId = pathParts.find((p) => /^\d{8,}$/.test(p)) || '';

    return {
      platform: 'facebook',
      contentId: pfbidMatch?.[1] || storyFbid || watchId || pathIdMatch?.[1] || groupsPostMatch?.[1] || shareMatch?.[1] || fallbackId
    };
  }

  return { platform: '', contentId: '' };
};

const fetchGenericLinkMetadata = async (url) => {
  try {
    logger.info(`[Investigation] Fetching generic metadata for: ${url}`);
    const response = await axios.get(url, {
      timeout: 10000,
      validateStatus: () => true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    const title = $('title').text() || $('meta[property="og:title"]').attr('content') || $('meta[name="twitter:title"]').attr('content') || 'Unknown Title';
    const description = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || $('meta[name="twitter:description"]').attr('content') || '';
    const author = $('meta[name="author"]').attr('content') || $('meta[property="og:site_name"]').attr('content') || new URL(url).hostname;
    const thumbnail = $('meta[property="og:image"]').attr('content') || $('meta[name="twitter:image"]').attr('content') || '';

    return {
      title,
      text: description || title,
      description,
      author,
      platform: 'web',
      media: thumbnail ? [{ type: 'photo', url: thumbnail }] : [],
      created_at: new Date()
    };
  } catch (error) {
    logger.error(`[Investigation] Generic metadata fetch failed for ${url}:`, error.message);
    return null;
  }
};

const investigateLink = async (req, res) => {
  try {
    const { url } = req.body;
    const Source = require('../models/Source');

    logger.info(`[Investigation] ENTRY: POST /api/alerts/investigate with URL: ${url}`);
    if (!url) return res.status(400).json({ message: 'URL is required' });

    const originalUrl = url;

    // Resolve shortened links (t.co, bit.ly etc)
    let resolvedUrl = url;
    if (url.includes('t.co') || url.includes('bit.ly') || url.includes('tinyurl.com')) {
      const resolved = await resolveShortenedUrl(url);
      if (resolved !== url) {
        logger.info(`[Investigation] Resolved ${url} to ${resolved}`);
        resolvedUrl = resolved;
      }
    }

    const parsedInputUrl = safeParseUrl(resolvedUrl);
    const inputHost = parsedInputUrl?.hostname?.toLowerCase() || '';
    let facebookCanonicalResolution = null;
    if (inputHost.includes('facebook.com') || inputHost.includes('fb.watch')) {
      facebookCanonicalResolution = await resolveFacebookCanonicalPost(resolvedUrl);
      if (facebookCanonicalResolution?.canonicalUrl && facebookCanonicalResolution.canonicalUrl !== resolvedUrl) {
        logger.info(
          `[Investigation] Canonicalized Facebook URL ${resolvedUrl} -> ${facebookCanonicalResolution.canonicalUrl}`
        );
        resolvedUrl = facebookCanonicalResolution.canonicalUrl;
      }
    }

    logger.info(`[Investigation] Starting on-demand check for: ${resolvedUrl} (User: ${req.user?.email || 'unknown'})`);

    let platform = '';
    let contentId = '';
    let metadata = null;

    // 1. Identify platform and content id from URL
    const target = parseInvestigationTarget(resolvedUrl);
    platform = target.platform;
    contentId = target.contentId;
    if (platform) {
      logger.info(`[Investigation] Detected ${platform} link, content ID: ${contentId || 'N/A'}`);
    }

    if (!platform) {
      logger.info(`[Investigation] URL not a primary social link: ${resolvedUrl}. Attempting generic fetch...`);
      platform = 'web';
    }

    if (!contentId) {
      contentId = `${platform}_${Buffer.from(resolvedUrl).toString('base64').substring(0, 16)}`;
    }

    // 2. Fetch Metadata
    try {
      if (platform === 'x') {
        metadata = await fetchTweetDetail(contentId);
      } else if (platform === 'youtube') {
        const details = await YouTubeService.getVideoDetails([contentId]);
        if (details && details.length > 0) {
          const yt = details[0];
          metadata = {
            id: yt.id,
            title: yt.title,
            text: yt.description || yt.title,
            description: yt.description || '',
            author: yt.channelTitle || 'YouTube',
            author_handle: yt.channelId || '',
            created_at: yt.publishedAt ? new Date(yt.publishedAt) : new Date(),
            platform: 'youtube',
            content_type: 'video',
            media: yt?.thumbnails ? [{ type: 'photo', url: yt.thumbnails?.high?.url || yt.thumbnails?.default?.url }] : [],
            metrics: yt.statistics || {}
          };
        }
      } else if (platform === 'instagram') {
        metadata = await fetchInstagramPostDetail(contentId);
        if (metadata) {
          // Normalize Instagram metadata for analysis
          metadata.text = metadata.text || '';
          metadata.title = `Instagram Post by ${metadata.author_handle}`;
        }
      } else if (platform === 'facebook') {
        const fbInvestigation = await resolveFacebookInvestigation({
          originalUrl,
          canonicalUrl: resolvedUrl,
          contentId,
          canonicalResolution: facebookCanonicalResolution,
          fetchPageMetadata: fetchSocialPageMetadata
        });

        if (fbInvestigation.status !== 'verified') {
          logger.warn(
            `[Investigation] Facebook post unresolved (${fbInvestigation.status}) for ${originalUrl} -> ${fbInvestigation.canonical_url}`
          );
          return res.status(422).json({
            message: fbInvestigation.message,
            status: fbInvestigation.status,
            platform: 'facebook',
            original_url: fbInvestigation.original_url,
            canonical_url: fbInvestigation.canonical_url,
            content_id: fbInvestigation.content_id || contentId,
            partial: fbInvestigation.partial
          });
        }

        metadata = fbInvestigation.metadata;
        resolvedUrl = fbInvestigation.canonical_url || resolvedUrl;
        contentId = fbInvestigation.content_id || contentId;
        if (metadata) {
          metadata.title = metadata.title || `Facebook Post by ${metadata.author}`;
          metadata.text = metadata.text || metadata.description || metadata.title;
          metadata.original_url = originalUrl;
          metadata.canonical_url = resolvedUrl;
        }
      } else if (platform === 'web') {
        metadata = await fetchGenericLinkMetadata(resolvedUrl);
      }

      if (metadata && platform !== 'web' && platform !== 'facebook') {
        metadata = await enrichInvestigationMedia({ platform, resolvedUrl, metadata });
      }
    } catch (fetchError) {
      if (platform === 'facebook') {
        logger.error(`[Investigation] Facebook metadata fetch failed: ${fetchError.message}`);
        return res.status(422).json({
          message: 'Facebook post identity could not be verified. Investigation was not analyzed to avoid mismatched content.',
          status: 'unresolved',
          platform: 'facebook',
          original_url: originalUrl,
          canonical_url: resolvedUrl,
          content_id: contentId,
          error: fetchError.message
        });
      }
      logger.error(`[Investigation] Metadata fetch failed for ${platform}:${contentId}: ${fetchError.message}. Falling back to generic metadata fetch.`);
    }

    if (!metadata && platform !== 'facebook') {
      const genericMetadata = await fetchGenericLinkMetadata(resolvedUrl);
      if (genericMetadata) {
        metadata = {
          ...genericMetadata,
          platform,
          title: genericMetadata.title || `${platform.toUpperCase()} post`,
          text: genericMetadata.text || genericMetadata.description || genericMetadata.title || '',
          author: genericMetadata.author || platform,
          author_handle: genericMetadata.author || platform,
          created_at: genericMetadata.created_at || new Date(),
          content_type: genericMetadata.content_type || 'post'
        };
        logger.info(`[Investigation] Using generic metadata fallback for ${platform}:${contentId}`);
      }
    }

    if (metadata?.canonical_url && metadata.canonical_url !== resolvedUrl) {
      resolvedUrl = metadata.canonical_url;
      const canonicalTarget = parseInvestigationTarget(resolvedUrl);
      if (canonicalTarget?.platform) {
        platform = canonicalTarget.platform;
      }
      if (canonicalTarget?.contentId) {
        contentId = canonicalTarget.contentId;
      }
    }

    if (!metadata) {
      logger.info(`[Investigation] ❌ CRITICAL: No metadata returned for ${platform}:${contentId}. URL was: ${resolvedUrl}`);
      return res.status(404).json({
        message: `Could not fetch details for this ${platform} link. The post might be private, deleted, or API-limited.`,
        debug: { platform, contentId, resolvedUrl }
      });
    }

    logger.info(`[Investigation] Successfully fetched metadata for ${platform}:${contentId}. Content length: ${metadata.text?.length || 0}`);
    logger.info(`[Investigation] Calling analyzeContent for ID: ${contentId}`);

    // 3. Analyze Content
    let analysis;
    const manualAnalysisId = uuidv4();
    try {
      analysis = await enqueueInvestigation(async () => {
        return analyzeInvestigationText(metadata.text || metadata.description || metadata.title, {
          platform,
          content_id: contentId,
          content: {
            ...metadata,
            media: metadata.media || (platform === 'youtube' ? [{ url: resolvedUrl, type: 'video' }] : [])
          },
          analysisId: manualAnalysisId
        });
      }, {
        timeoutMs: Math.max(5000, Number(process.env.INVESTIGATION_QUEUE_JOB_TIMEOUT_MS || 55000)),
        label: `${platform}:${contentId}`
      });
      logger.info(`[Investigation] Analysis completed for ID: ${contentId}. Risk: ${analysis.risk_level}`);
    } catch (analysisError) {
      logger.error(`[Investigation] Analysis failed for ID: ${contentId}: ${analysisError.message}`);
      // Fallback analysis object
      analysis = {
        risk_level: 'low',
        risk_score: 10,
        intent: 'unknown',
        reasons: [`Analysis failed: ${analysisError.message}`]
      };
    }

    // 4. Save Content Record (permanent)
    let contentRecord;
    try {
      // Check if content already exists
      contentRecord = await Content.findOne({ platform, content_id: contentId });

      if (!contentRecord) {
        // Create new content record
        contentRecord = await Content.create({
          platform,
          content_id: contentId,
          content_url: resolvedUrl,
          text: metadata.text || metadata.description || metadata.title,
          author: metadata.author || metadata.channelTitle || 'Unknown',
          author_handle: metadata.author_handle || metadata.channelId || 'unknown',
          published_at: metadata.created_at || metadata.publishedAt || new Date(),
          media: metadata.media || [],
          risk_score: analysis.risk_score || 0,
          risk_level: analysis.risk_level || 'low',
          threat_intent: analysis.intent,
          threat_reasons: analysis.reasons || [],
          engagement: metadata.metrics || metadata.statistics || {},
          ...(platform === 'facebook' && metadata.original_url ? {
            raw_data: {
              investigation_original_url: metadata.original_url,
              investigation_canonical_url: metadata.canonical_url || resolvedUrl,
              investigation_verified: true
            }
          } : {})
        });
        logger.info(`[Investigation] Created new Content record: ${contentRecord.id}`);
      } else {
        logger.info(`[Investigation] Found existing Content record: ${contentRecord.id}`);
        const nextMedia = Array.isArray(metadata.media) && metadata.media.length > 0
          ? metadata.media
          : contentRecord.media;
        const nextEngagement = metadata.metrics || metadata.statistics || contentRecord.engagement || {};
        const nextText = metadata.text || metadata.description || metadata.title || contentRecord.text;

        contentRecord = await Content.findOneAndUpdate(
          { id: contentRecord.id },
          {
            $set: {
              content_url: resolvedUrl || contentRecord.content_url,
              text: nextText,
              author: metadata.author || metadata.channelTitle || contentRecord.author,
              author_handle: metadata.author_handle || metadata.channelId || contentRecord.author_handle,
              published_at: metadata.created_at || metadata.publishedAt || contentRecord.published_at,
              media: nextMedia,
              engagement: nextEngagement,
              risk_score: analysis.risk_score || contentRecord.risk_score || 0,
              risk_level: analysis.risk_level || contentRecord.risk_level || 'low',
              threat_intent: analysis.intent || contentRecord.threat_intent,
              threat_reasons: analysis.reasons || contentRecord.threat_reasons || []
            }
          },
          { new: true }
        );
      }
    } catch (contentError) {
      logger.error(`[Investigation] Failed to save Content record:`, contentError.message);
      // Continue anyway, we can still create the alert
    }

    // 5. Check if author is already in Sources (monitoring status)
    let is_monitored = false;
    let existingSource = null; // Declare outside try-catch so it's accessible later
    try {
      const authorHandle = metadata.author_handle || metadata.channelId || metadata.author;
      const normalizedHandle = normalizeIdentifier(platform, authorHandle);
      const platformKeys = platform === 'x' || platform === 'twitter' ? ['x', 'twitter'] : [platform];
      const handleVariants = new Set([
        authorHandle,
        normalizedHandle,
        normalizedHandle ? `@${normalizedHandle}` : null,
        authorHandle ? `@${authorHandle}` : null
      ].filter(Boolean));
      const identifiersToCheck = Array.from(handleVariants);
      logger.info(`[Investigation] Checking monitoring status for platform: ${platformKeys.join(',')}, identifier: ${normalizedHandle}`);

      existingSource = await Source.findOne({
        platform: { $in: platformKeys },
        identifier: { $in: identifiersToCheck }
      });

      if (existingSource) {
        is_monitored = true;
        logger.info(`[Investigation] ✓ Author is monitored. Source ID: ${existingSource.id}`);
      } else {
        logger.info(`[Investigation] ✗ Author is NOT monitored. No matching source found.`);
      }
    } catch (sourceError) {
      logger.error(`[Investigation] Failed to check monitoring status:`, sourceError.message);
    }

    // 6. Create permanent Alert record
    let alertRecord;
    try {
      alertRecord = await Alert.create({
        content_id: contentRecord?.id || contentId,
        content_published_at: contentRecord?.published_at || metadata?.published_at || new Date(),
        content_ref_id: contentRecord?.id || null,
        source_id: existingSource?.id || null, // Link to source if monitored
        source_category: existingSource?.category || null,
        title: metadata.title || metadata.text?.substring(0, 100) || 'Investigated Post',
        description: metadata.description || metadata.text || '',
        content_url: resolvedUrl,
        platform,
        author: metadata.author || metadata.channelTitle || 'Unknown',
        author_handle: metadata.author_handle || metadata.channelId,
        matched_keywords_normalized: (analysis?.highlights || []).map((k) => String(k).trim().toLowerCase()).filter(Boolean),
        risk_level: analysis.risk_level || 'low',
        status: 'active',
        alert_type: 'ai_risk',
        is_investigation: true,
        threat_details: {
          intent: analysis.intent || 'unknown',
          reasons: analysis.reasons || [],
          highlights: analysis.highlights || [],
          risk_score: analysis.risk_score || 0
        },
        legal_sections: analysis.legal_sections || [],
        violated_policies: analysis.violated_policies || [],
        classification_explanation: analysis.explanation || '',
        ml_analysis: analysis.ml_analysis || null,
        llm_analysis: analysis.llm_analysis || null
      });
      logger.info(`[Investigation] Created new Alert record: ${alertRecord.id}${existingSource ? ` linked to Source: ${existingSource.id}` : ''}`);
    } catch (alertError) {
      logger.error(`[Investigation] Failed to create Alert record:`, alertError.message);
      // Return error if we can't create the alert
      return res.status(500).json({ message: 'Failed to save investigation results to database' });
    }

    // 7. Return Alert with monitoring status
    const responseAlert = {
      id: alertRecord.id,
      content_id: contentRecord?.id || contentId,
      title: alertRecord.title,
      description: alertRecord.description,
      risk_level: alertRecord.risk_level,
      threat_details: alertRecord.threat_details,
      matched_keywords_normalized: alertRecord.matched_keywords_normalized || [],
      violated_policies: alertRecord.violated_policies || [],
      legal_sections: alertRecord.legal_sections || [],
      classification_explanation: alertRecord.classification_explanation || '',
      llm_analysis: alertRecord.llm_analysis || null,
      platform: alertRecord.platform,
      author: alertRecord.author,
      author_handle: alertRecord.author_handle,
      created_at: alertRecord.created_at,
      status: alertRecord.status,
      is_investigation: true,
      is_monitored,
      content_details: {
        content_type: metadata.content_type || (platform === 'instagram' ? 'post' : undefined),
        text: metadata.text || metadata.description || metadata.title,
        author_handle: metadata.author_handle || metadata.channelId,
        media: metadata.media || contentRecord?.media || (metadata.thumbnails ? [{ url: metadata.thumbnails.high?.url || metadata.thumbnails.default?.url }] : []),
        engagement: metadata.metrics || metadata.statistics,
        url: resolvedUrl,
        content_url: contentRecord?.content_url || resolvedUrl,
        ...(platform === 'facebook' && metadata.original_url ? {
          original_url: metadata.original_url,
          canonical_url: metadata.canonical_url || resolvedUrl,
          investigation_verified: true
        } : {}),
        published_at: contentRecord?.published_at || metadata.created_at || metadata.publishedAt || null,
        is_deleted: contentRecord?.is_deleted || false,
        deleted_at: contentRecord?.deleted_at || null,
        is_expired: contentRecord?.is_expired || false,
        expired_at: contentRecord?.expired_at || null,
        availability_status: contentRecord?.availability_status || 'available',
        analysis: analysis || null
      }
    };

    await clearAlertCache();
    logger.info(`[Investigation] Completed successfully for ${platform}:${contentId}. Risk: ${analysis.risk_level}, Monitored: ${is_monitored}`);
    res.status(200).json(responseAlert);
  } catch (error) {
    logger.error('[Investigation] Critical failure:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get lightweight alert counts per status (no $lookup, ultra-fast)
// @route   GET /api/alerts/summary
// @access  Private
const getAlertSummary = async (req, res) => {
  try {
    const summaryCacheKey = 'alert_summary:v3';
    const cached = await readCache(summaryCacheKey);
    if (cached) return res.status(200).json(cached);

    const summaryQuery = await applyProfileOnlyFilter({});
    const [statusCounts, unreadCount] = await Promise.all([
      Alert.aggregate([
        { $match: summaryQuery },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Alert.countDocuments({ ...summaryQuery, is_read: false })
    ]);

    const summary = { active: 0, acknowledged: 0, escalated: 0, resolved: 0, false_positive: 0, unread: unreadCount };
    statusCounts.forEach(item => {
      if (item._id && summary.hasOwnProperty(item._id)) summary[item._id] = item.count;
    });

    await writeCache(summaryCacheKey, summary, 20);
    res.status(200).json(summary);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Translate alert content
// @route   POST /api/alerts/translate
// @access  Private
const translateAlertContent = async (req, res) => {
  try {
    const { text, target = 'en' } = req.body;

    if (!text) {
      return res.status(400).json({ message: 'Text to translate is required' });
    }

    const translatedText = await translationService.translate(text, target);

    res.status(200).json({
      translatedText,
      originalText: text
    });
  } catch (error) {
    logger.error('[AlertController] Translation Error:', error.message);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get dashboard stats grouped by platform in a single call (ultra-fast, no $lookup)
// @route   GET /api/alerts/dashboard-stats
// @access  Private
const getDashboardStats = async (req, res) => {
  try {
    const dashCacheKey = 'dashboard:v3:alerts';
    const cached = await readCache(dashCacheKey);
    if (cached) return res.status(200).json(cached);

    const platforms = ['twitter', 'x', 'youtube', 'facebook', 'instagram', 'whatsapp'];
    const statuses = ['active', 'acknowledged', 'escalated', 'false_positive'];

    // Default to the same 7-day window the Alerts page uses, so dashboard
    // counts match "Showing X of Y alerts" on /alerts.
    const windowStart = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      d.setHours(0, 0, 0, 0);
      return d;
    })();
    const windowEnd = new Date();
    const dateMatch = { content_published_at: { $gte: windowStart, $lte: windowEnd } };

    // Single aggregation: group by platform + status
    const [statusByPlatform, pendingReports, velocityByPlatform, severityByPlatformRaw] = await Promise.all([
      Alert.aggregate([
        { $match: dateMatch },
        { $group: { _id: { platform: '$platform', status: '$status' }, count: { $sum: 1 } } }
      ]).allowDiskUse(true),

      // Escalated alerts without reports
      Alert.aggregate([
        { $match: { ...dateMatch, status: 'escalated' } },
        {
          $lookup: {
            from: 'reports',
            let: { alertId: '$id' },
            pipeline: [
              { $match: { $expr: { $eq: ['$alert_id', '$$alertId'] } } },
              { $project: { _id: 1 } },
              { $limit: 1 }
            ],
            as: 'report_exists'
          }
        },
        { $match: { report_exists: { $size: 0 } } },
        { $group: { _id: '$platform', count: { $sum: 1 } } }
      ]),

      // Viral alerts by platform (any non-null virality_level)
      Alert.aggregate([
        {
          $match: {
            ...dateMatch,
            status: 'active',
            virality_level: { $in: ['low', 'medium', 'high'] }
          }
        },
        { $group: { _id: '$platform', count: { $sum: 1 } } }
      ]),

      // Severity (risk_level) breakdown by platform
      Alert.aggregate([
        { $match: { ...dateMatch, status: 'active' } },
        { $group: { _id: { platform: '$platform', risk_level: { $toLower: { $ifNull: ['$risk_level', 'medium'] } } }, count: { $sum: 1 } } }
      ])
    ]);

    // Normalize x -> twitter
    const normPlatform = (p) => (p === 'x' ? 'twitter' : p);

    // Build result
    const initCounts = () => ({ active: 0, acknowledged: 0, escalated: 0, false_positive: 0 });
    const byPlatform = { all: initCounts() };
    platforms.forEach(p => { byPlatform[normPlatform(p)] = byPlatform[normPlatform(p)] || initCounts(); });

    statusByPlatform.forEach(({ _id, count }) => {
      const plat = normPlatform(_id.platform);
      const status = _id.status;
      if (!statuses.includes(status)) return;
      if (!byPlatform[plat]) byPlatform[plat] = initCounts();
      byPlatform[plat][status] = (byPlatform[plat][status] || 0) + count;
      byPlatform.all[status] = (byPlatform.all[status] || 0) + count;
    });

    // Pending report counts
    const pendingByPlatform = { all: 0 };
    pendingReports.forEach(({ _id, count }) => {
      const plat = normPlatform(_id);
      pendingByPlatform[plat] = (pendingByPlatform[plat] || 0) + count;
      pendingByPlatform.all += count;
    });

    // Viral counts
    const viralByPlatform = { all: 0 };
    velocityByPlatform.forEach(({ _id, count }) => {
      const plat = normPlatform(_id);
      viralByPlatform[plat] = (viralByPlatform[plat] || 0) + count;
      viralByPlatform.all += count;
    });

    // Severity breakdown: { all: { high: N, medium: N, low: N }, twitter: { ... } }
    const initSeverity = () => ({ high: 0, medium: 0, low: 0 });
    const severityByPlatform = { all: initSeverity() };
    severityByPlatformRaw.forEach(({ _id, count }) => {
      const plat = normPlatform(_id.platform);
      const level = _id.risk_level || 'medium';
      if (!severityByPlatform[plat]) severityByPlatform[plat] = initSeverity();
      severityByPlatform[plat][level] = (severityByPlatform[plat][level] || 0) + count;
      severityByPlatform.all[level] = (severityByPlatform.all[level] || 0) + count;
    });

    const result = { byPlatform, pendingByPlatform, viralByPlatform, severityByPlatform };
    await writeCache(dashCacheKey, result, 20);
    res.status(200).json(result);
  } catch (error) {
    logger.error('Dashboard stats error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Check for similar escalated alerts
const getSimilarEscalatedAlerts = async (req, res) => {
  logger.info('--- getSimilarEscalatedAlerts CALLED ---');
  try {
    const { text } = req.body;
    logger.info('Checking text length:', text ? text.length : 'N/A');

    if (!text) return res.status(400).json({ message: 'Text is required' });

    // Call ML Service for Model-Based Similarity (TF-IDF/Embeddings on Training Data)
    try {
      const mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:8006';
      const mlRes = await axios.post(`${mlServiceUrl}/similar-escalated`, { text }, {
        headers: { 'x-api-key': process.env.GATEWAY_API_KEY || '' }
      });
      // (() => {})('ML Service Response:', mlRes.data);

      const { is_similar, score, matched_text } = mlRes.data;
      let responseAlerts = [];

      if (is_similar && matched_text) {
        // Find the Alert in DB that corresponds to this matched text (Optional Best Effort)
        const Content = require('../models/Content');
        const matchingContent = await Content.findOne({ text: matched_text }).select('content_id');

        if (matchingContent) {
          const foundAlert = await Alert.findOne({
            content_id: matchingContent.content_id,
            status: 'escalated'
          }).select('id created_at status title');

          if (foundAlert) {
            responseAlerts.push({
              id: foundAlert.id,
              text: matched_text,
              timestamp: foundAlert.created_at,
              title: foundAlert.title || 'Escalated Alert',
              score: score,
              is_db_record: true
            });
          }
        }

        // Always return the ML detection even if DB lookup fails
        if (responseAlerts.length === 0) {
          responseAlerts.push({
            id: 'ml_memory_detection',
            text: matched_text,
            timestamp: new Date(),
            title: 'Historical Model Data',
            score: score,
            is_training_data: true
          });
        }
      }

      return res.status(200).json({
        similarCount: responseAlerts.length,
        alerts: responseAlerts,
        ml_score: score || 0,
        matched_text: matched_text || null
      });

    } catch (mlErr) {
      logger.error('ML Service Error:', mlErr.message);
      return res.status(200).json({ similarCount: 0, alerts: [], error: 'ML Service Unavailable' });
    }
  } catch (error) {
    logger.error('Error checking similar escalated alerts:', error);
    res.status(500).json({ message: 'Server error check similarity' });
  }
};

const changeAlertCategory = async (req, res) => {
  try {
    const { category } = req.body;
    const VALID_CATEGORIES = ['political', 'communal', 'trouble_makers', 'defamation', 'narcotics', 'history_sheeters', 'others'];

    if (!category || !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ message: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` });
    }

    const alert = await Alert.findOne({ id: req.params.id });
    if (!alert) {
      return res.status(404).json({ message: 'Alert not found' });
    }

    // Find source - by source_id first, then fallback to platform + author_handle
    let source = null;
    if (alert.source_id) {
      source = await Source.findOne({ id: alert.source_id });
    }
    if (!source && alert.author_handle) {
      const handleNorm = String(alert.author_handle).replace(/^@/, '').toLowerCase();
      const platform = String(alert.platform || '').toLowerCase();
      const platformAliases = platform === 'x' || platform === 'twitter' ? ['x', 'twitter'] : [platform];
      source = await Source.findOne({
        identifier: { $regex: new RegExp('^@?' + handleNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') },
        platform: { $in: platformAliases },
        is_active: true
      });
      if (source) {
        alert.source_id = source.id;
      }
    }
    if (!source) {
      return res.status(404).json({ message: 'No source found for this alert' });
    }

    const oldCategory = source.category;

    // Update source + this alert immediately (fast path)
    await Promise.all([
      Source.updateOne({ _id: source._id }, { $set: { category } }),
      Alert.updateOne({ _id: alert._id }, { $set: { source_category: category, source_id: source.id } })
    ]);

    // Respond immediately — heavy work happens in background
    res.status(200).json({ message: 'Category updated', source_id: source.id, category });

    // Background: bulk update other alerts, POI sync, audit log, cache clear
    setImmediate(async () => {
      try {
        // Bulk update all other alerts from same source
        await Alert.updateMany(
          { source_id: source.id, _id: { $ne: alert._id } },
          { $set: { source_category: category } }
        );

        // Backfill alerts matched by author_handle that lack source_id
        if (alert.author_handle) {
          const handleNorm = String(alert.author_handle).replace(/^@/, '').toLowerCase();
          const handleRegex = new RegExp('^@?' + handleNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
          await Alert.updateMany(
            { author_handle: handleRegex, source_id: { $in: [null, undefined] }, _id: { $ne: alert._id } },
            { $set: { source_category: category, source_id: source.id } }
          );
        }

        // Sync to linked POIs
        try {
          const sourcePlatform = String(source.platform || '').toLowerCase();
          const platformAliases = sourcePlatform === 'x' || sourcePlatform === 'twitter' ? ['x', 'twitter'] : [sourcePlatform];
          const handleNorm = String(source.identifier || '').replace(/^@/, '').toLowerCase();

          const linkedPois = await POI.find({
            $or: [
              { 'socialMedia.sourceId': source.id },
              ...(handleNorm ? [{ socialMedia: { $elemMatch: { platform: { $in: platformAliases }, handle: { $in: [handleNorm, `@${handleNorm}`] } } } }] : [])
            ]
          });

          for (const poi of linkedPois) {
            let changed = false;
            poi.socialMedia = poi.socialMedia.map(sm => {
              const smId = String(sm?.sourceId || '').trim();
              const smHandle = String(sm?.handle || '').replace(/^@/, '').toLowerCase();
              if (smId === source.id || (platformAliases.includes(String(sm?.platform || '').toLowerCase()) && smHandle === handleNorm)) {
                if (sm.category !== category) {
                  changed = true;
                  return { ...(sm.toObject ? sm.toObject() : sm), category };
                }
              }
              return sm;
            });
            if (changed) await poi.save();
          }
        } catch (poiErr) {
          logger.error('[AlertController] POI sync failed during category change:', poiErr.message);
        }

        await createAuditLog(req.user, 'update', 'source', source.id, { action: 'change_category', old_category: oldCategory, new_category: category, triggered_from_alert: alert.id });
        await clearAlertCache();
      } catch (bgErr) {
        logger.error('[AlertController] Background category sync error:', bgErr.message);
      }
    });
  } catch (error) {
    logger.error('[AlertController] changeAlertCategory error:', error.message);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Bulk fetch alerts by IDs with full content_details + source_meta
// @route   POST /api/alerts/bulk
// @access  Private
const getAlertsByIds = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'ids array required' });
    }
    const safeIds = ids.slice(0, 100); // cap at 100

    const results = await Alert.aggregate([
      { $match: { id: { $in: safeIds } } },
      { $lookup: { from: 'contents', localField: 'content_id', foreignField: 'id', as: 'content_data' } },
      { $unwind: { path: '$content_data', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'sources', localField: 'content_data.source_id', foreignField: 'id', as: 'source_data' } },
      { $unwind: { path: '$source_data', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'analyses',
          let: { alertAnalysisId: '$analysis_id', contentId: '$content_id' },
          pipeline: [
            { $match: { $expr: { $or: [{ $eq: ['$id', '$$alertAnalysisId'] }, { $eq: ['$content_id', '$$contentId'] }] } } },
            { $sort: { analyzed_at: -1 } },
            { $limit: 1 }
          ],
          as: 'analysis_data'
        }
      },
      {
        $addFields: {
          // Include ALL content fields so cards render exactly like normal alerts
          content_details: {
            $mergeObjects: [
              '$content_data',
              { analysis: { $arrayElemAt: ['$analysis_data', 0] } }
            ]
          },
          source_meta: {
            profile_image_url: '$source_data.profile_image_url',
            is_verified: '$source_data.is_verified',
            name: '$source_data.display_name',
            handle: '$source_data.identifier'
          }
        }
      },
      { $project: { analysis_data: 0, content_data: 0, source_data: 0 } }
    ]);

    // Media fallback — mirror the logic in getAlerts() so Top-Alerts cards
    // render images for posts where content.media is empty but raw_data still
    // carries the platform's CDN URLs (Facebook full_picture/picture/video,
    // album previews, etc.).
    const needsRawMedia = results
      .filter((a) => {
        const c = a.content_details;
        return c && (!c.media || c.media.length === 0);
      })
      .map((a) => a.content_details?.id)
      .filter(Boolean);

    if (needsRawMedia.length) {
      const rawDocs = await Content.find({ id: { $in: needsRawMedia } })
        .select('id raw_data')
        .lean();
      const rawMap = new Map(rawDocs.map((d) => [d.id, d.raw_data]));
      for (const a of results) {
        const c = a.content_details;
        if (!c || (c.media && c.media.length > 0)) continue;
        const raw = rawMap.get(c.id);
        if (!raw) continue;
        const extracted = [];
        const candidates = [
          raw.full_picture, raw.picture, raw.image, raw.video,
          raw.video_thumbnail, raw.source, raw.thumbnail_url,
          raw.display_url, raw.thumbnail_src
        ];
        candidates.forEach((f) => { if (f && typeof f === 'string') extracted.push(f); });
        if (Array.isArray(raw.album_preview)) {
          raw.album_preview.forEach((x) => { const u = x?.url || x; if (u) extracted.push(u); });
        }
        if (Array.isArray(raw.images)) {
          raw.images.forEach((u) => { if (u && typeof u === 'string') extracted.push(u); });
        }
        if (Array.isArray(raw.media)) {
          raw.media.forEach((m) => {
            const u = m?.media_url || m?.display_url || m?.url || m?.preview || m?.thumbnail_url;
            if (u && typeof u === 'string') extracted.push(u);
          });
        }
        const unique = [...new Set(extracted.filter(Boolean))];
        if (unique.length > 0) {
          c.media = unique.map((url) => ({
            type: /\.(mp4|webm|mov|m3u8)(\?|$)/i.test(url) || /video/i.test(url) ? 'video' : 'photo',
            url,
            preview: url
          }));
        }
      }
    }

    // Return in the same order as the input ids array
    const byId = Object.fromEntries(results.map(a => [a.id, a]));
    const ordered = safeIds.map(id => byId[id]).filter(Boolean);
    res.status(200).json({ alerts: ordered });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Daily Workflow KPI — count of alert status transitions per day.
// @route   GET /api/alerts/workflow-kpi?start=YYYY-MM-DD&end=YYYY-MM-DD&format=json|csv
// @access  Private
// Aggregates Alert.status_history entries (one push per status change) and
// returns either JSON (default) or a downloadable CSV. Date range defaults to
// the last 7 days when no params are supplied. Timezone is the server's local
// time — same convention as the rest of the dashboard.
const TRACKED_TRANSITIONS = ['acknowledged', 'escalated', 'resolved', 'false_positive'];

const getWorkflowKpi = async (req, res) => {
  try {
    const format = String(req.query.format || 'json').toLowerCase();
    // Default range = today (IST). The UI starts on today; users can widen
    // the range from the date pickers if they want a trend view.
    const now = new Date();
    const istTodayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
    const [yy, mm, dd] = istTodayStr.split('-').map(Number);
    // 00:00 IST = previous day 18:30 UTC; 23:59:59 IST = same day 18:29:59 UTC.
    const defaultStart = new Date(Date.UTC(yy, mm - 1, dd, 0, 0, 0) - 5.5 * 3600 * 1000);
    const defaultEnd = new Date(Date.UTC(yy, mm - 1, dd, 23, 59, 59, 999) - 5.5 * 3600 * 1000);

    // Interpret bare YYYY-MM-DD inputs as IST day boundaries so the picker
    // matches what users see on screen (the aggregation buckets by IST).
    const parseIstBoundary = (s, endOfDay) => {
      if (!s) return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s);
      const [y, m, d] = s.split('-').map(Number);
      const base = Date.UTC(y, m - 1, d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
      return new Date(base - 5.5 * 3600 * 1000);
    };
    const start = parseIstBoundary(req.query.start, false) || defaultStart;
    const end = parseIstBoundary(req.query.end, true) || defaultEnd;
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
      return res.status(400).json({ message: 'Invalid date range' });
    }

    // Two sources:
    //   1. New transitions logged into status_history (post-feature).
    //   2. Legacy alerts where status_history was never populated — fall
    //      back to their current `status` + `acknowledged_at` (the only
    //      timestamp captured before status_history existed). This is what
    //      makes the KPI show data right now instead of waiting for the
    //      team to acknowledge new alerts.
    const rows = await Alert.aggregate([
      { $unwind: '$status_history' },
      { $match: {
          'status_history.at': { $gte: start, $lte: end },
          'status_history.to': { $in: TRACKED_TRANSITIONS }
      } },
      { $project: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$status_history.at', timezone: 'Asia/Kolkata' } },
          to: '$status_history.to'
      } },
      { $unionWith: {
          coll: 'alerts',
          pipeline: [
            { $match: {
                status: { $in: TRACKED_TRANSITIONS },
                acknowledged_at: { $gte: start, $lte: end },
                $or: [
                  { status_history: { $exists: false } },
                  { status_history: { $size: 0 } }
                ]
            } },
            { $project: {
                date: { $dateToString: { format: '%Y-%m-%d', date: '$acknowledged_at', timezone: 'Asia/Kolkata' } },
                to: '$status'
            } }
          ]
      } },
      { $group: { _id: { date: '$date', to: '$to' }, count: { $sum: 1 } } }
    ]);

    // Materialise a row per day in the range so the UI gets a dense series.
    // Use IST since the aggregation buckets by Asia/Kolkata above.
    const istKey = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    const dailyMap = new Map();
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = istKey(d);
      if (dailyMap.has(key)) continue;
      const row = { date: key, total: 0 };
      for (const status of TRACKED_TRANSITIONS) row[status] = 0;
      dailyMap.set(key, row);
    }
    const totals = TRACKED_TRANSITIONS.reduce((acc, s) => (acc[s] = 0, acc), { total: 0 });
    for (const r of rows) {
      const row = dailyMap.get(r._id.date);
      if (!row) continue;
      row[r._id.to] = r.count;
      row.total += r.count;
      totals[r._id.to] += r.count;
      totals.total += r.count;
    }
    const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // ── Per-user breakdown: who escalated/acknowledged/resolved how many ──
    const userRows = await Alert.aggregate([
      { $unwind: '$status_history' },
      { $match: {
          'status_history.at': { $gte: start, $lte: end },
          'status_history.to': { $in: TRACKED_TRANSITIONS },
          'status_history.changed_by': { $nin: [null, ''] }
      } },
      { $group: {
          _id: { user: '$status_history.changed_by', to: '$status_history.to' },
          email: { $first: '$status_history.changed_by_email' },
          count: { $sum: 1 }
      } }
    ]);

    const userMap = new Map();
    for (const r of userRows) {
      const uid = String(r._id.user);
      if (!userMap.has(uid)) {
        const row = { user_id: uid, name: '', email: r.email || '', total: 0 };
        for (const s of TRACKED_TRANSITIONS) row[s] = 0;
        userMap.set(uid, row);
      }
      const row = userMap.get(uid);
      row[r._id.to] = (row[r._id.to] || 0) + r.count;
      row.total += r.count;
      if (!row.email && r.email) row.email = r.email;
    }

    // Resolve names from User collection (best-effort; tolerate non-ObjectId ids)
    if (userMap.size > 0) {
      try {
        const mongoose = require('mongoose');
        const User = require('../models/User');
        const ids = Array.from(userMap.keys());
        const objectIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));
        const users = await User.find({
          $or: [
            ...(objectIds.length ? [{ _id: { $in: objectIds } }] : []),
            { email: { $in: Array.from(userMap.values()).map(u => u.email).filter(Boolean) } }
          ]
        }).select('full_name email').lean();
        for (const u of users) {
          const byId = userMap.get(String(u._id));
          if (byId && !byId.name) byId.name = u.full_name || '';
          // Also patch by email (for rows whose changed_by isn't a Mongo id)
          for (const row of userMap.values()) {
            if (!row.name && row.email && row.email === u.email) row.name = u.full_name || '';
          }
        }
      } catch (e) {
        logger.error('[WorkflowKpi] user name lookup failed:', e.message);
      }
    }

    const byUser = Array.from(userMap.values())
      .sort((a, b) => (b.escalated - a.escalated) || (b.total - a.total));

    if (format === 'csv') {
      const header = ['date', ...TRACKED_TRANSITIONS, 'total'];
      const lines = [header.join(',')];
      for (const row of daily) {
        lines.push(header.map((h) => row[h] ?? 0).join(','));
      }
      lines.push(['TOTAL', ...TRACKED_TRANSITIONS.map((s) => totals[s]), totals.total].join(','));
      lines.push('');
      lines.push(['user', 'email', ...TRACKED_TRANSITIONS, 'total'].join(','));
      const csvEscape = (v) => {
        const s = String(v ?? '');
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      for (const u of byUser) {
        lines.push([
          csvEscape(u.name || u.user_id),
          csvEscape(u.email),
          ...TRACKED_TRANSITIONS.map((s) => u[s] || 0),
          u.total
        ].join(','));
      }
      const csv = lines.join('\n');
      const filename = `alert-workflow-${start.toISOString().slice(0, 10)}_to_${end.toISOString().slice(0, 10)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(csv);
    }

    return res.status(200).json({
      range: { start: start.toISOString(), end: end.toISOString() },
      statuses: TRACKED_TRANSITIONS,
      daily,
      totals,
      byUser
    });
  } catch (err) {
    logger.error('[AlertController] getWorkflowKpi error:', err.message);
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getAlerts,
  getAlertById,
  getAlertsByIds,
  updateAlert,
  getAlertStats,
  getAlertSummary,
  getDashboardStats,
  getUnreadCount,
  markAllAsRead,
  investigateLink,
  translateAlertContent,
  getSimilarEscalatedAlerts,
  changeAlertCategory,
  getWorkflowKpi
};
