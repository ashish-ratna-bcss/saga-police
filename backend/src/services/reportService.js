const Report = require('../models/Report');
const Alert = require('../models/Alert');
const Content = require('../models/Content');
const Analysis = require('../models/Analysis');
const cacheService = require('./cacheService');
const logger = require('../utils/logger');

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Generate a unique serial number for a report.
 * Format: PLATFORM-SN-MM-DD-YYYY
 */
const generateSerialNumber = async (platform) => {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();

    const platformCode = platform.toUpperCase().substring(0, 1); // X, Y, F, I
    const dateStr = `${dd}${mm}${yyyy}`; // ddmmyyyy

    // Count ALL reports created for this platform (no date filter)
    const count = await Report.countDocuments({
        platform: platform.toLowerCase()
    });

    const sn = String(count + 1).padStart(4, '0'); // 0001
    return `${platformCode}${sn}-${dateStr}`; // x0001-ddmmyyyy
};

/**
 * Create a new report based on an alert.
 */
const createReportFromAlert = async (alertId) => {
    const alert = await Alert.findOne({ id: alertId });
    if (!alert) throw new Error('Alert not found');

    const content = await Content.findOne({ id: alert.content_id });
    const analysis = await Analysis.findOne({ id: alert.analysis_id });

    // Check if report already exists
    const existingReport = await Report.findOne({ alert_id: alertId });
    if (existingReport) {
        return existingReport;
    }

    const serialNumber = await generateSerialNumber(alert.platform);

    const reportData = {
        serial_number: serialNumber,
        alert_id: alertId,
        platform: alert.platform,
        target_user_details: {
            name: alert.author || 'Unknown',
            handle: content?.author_handle || alert.author,
            profile_url: `https://x.com/${(content?.author_handle || alert.author).replace('@', '')}`,
            avatar_url: content?.original_author_avatar || '',
            is_verified: false // Source model would have this
        },
        content_summary: content?.text || alert.description,
        media_links: content?.media?.map(m => m.url) || [],
        legal_sections: alert.legal_sections || [],
        violated_policies: alert.violated_policies || [],
        status: 'sent_to_intermediary'
    };

    const report = new Report(reportData);
    await report.save();

    // Update alert status to escalated
    alert.status = 'escalated';
    await alert.save();
    await cacheService.invalidatePrefix('reports:stats:v1');
    await cacheService.invalidatePrefix('dashboard:v2');
    await cacheService.invalidatePrefix('alerts:stats:v2');

    // --- ML FEEDBACK LOOP ---
    // Recording report generation as confirmed escalation (HIGH risk)
    try {
        const feedbackService = require('./feedbackService');
        if (content && content.text) {
            await feedbackService.recordFeedback({
                text: content.text,
                category: alert.category_id || 'Abusive',
                legal_sections: alert.legal_sections,
                review_status: 'escalated',
                current_risk: 'HIGH'
            });
            logger.info(`[ReportService] Recorded feedback for report: ${alertId}`);
        }
    } catch (fbError) {
        logger.error('[ReportService] Feedback recording failed:', fbError);
    }

    return report;
};

/**
 * Get all reports with filtering and pagination.
 */
const getAllReports = async (filters = {}) => {
    const { platform, status, search, startDate, endDate, page = 1, limit = 20, keyword, alert_type, risk_level, virality_level, category } = filters;
    const query = {};

    if (platform && platform !== 'all') query.platform = platform;
    if (status && status !== 'all') query.status = status;
    if (startDate || endDate) {
        query.generated_at = {};
        if (startDate) query.generated_at.$gte = new Date(startDate);
        if (endDate) query.generated_at.$lte = new Date(endDate);
    }

    const pageNum = Math.max(parseInt(page) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const skip = (pageNum - 1) * limitNum;

    const needsJoinsForFiltering = (category && category !== 'all') ||
        (keyword && keyword !== 'all') ||
        (risk_level && risk_level !== 'all') ||
        (virality_level && virality_level !== 'all') ||
        (alert_type && alert_type !== 'all');

    const normalizedSearch = String(search || '').trim();

    let dataPipeline = [];
    let countFilter = null; // for fast parallel count

    if (!needsJoinsForFiltering) {
        // ── Optimized path: $text index for search, paginate Report collection first ──
        const matchFilter = { ...query };

        if (normalizedSearch) {
            // Use the compound text index { serial_number, target_user_details.name, target_user_details.handle }
            matchFilter.$text = { $search: normalizedSearch };
        }

        countFilter = matchFilter; // countDocuments can use same filter

        dataPipeline.push({ $match: matchFilter });

        // Sort: text-score relevance when searching, otherwise newest first
        if (normalizedSearch) {
            dataPipeline.push({ $sort: { score: { $meta: 'textScore' }, generated_at: -1 } });
        } else {
            dataPipeline.push({ $sort: { generated_at: -1 } });
        }

        dataPipeline.push({ $skip: skip });
        dataPipeline.push({ $limit: limitNum });

        // Lookups run on paginated slice only (max limitNum docs)
        dataPipeline.push(
            {
                $lookup: {
                    from: 'alerts',
                    localField: 'alert_id',
                    foreignField: 'id',
                    as: 'alert_data'
                }
            },
            { $unwind: { path: '$alert_data', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'contents',
                    localField: 'alert_data.content_id',
                    foreignField: 'id',
                    as: 'content_data'
                }
            },
            { $unwind: { path: '$content_data', preserveNullAndEmptyArrays: true } }
        );
    } else {
        // ── Legacy path: Joins happen before filtering ──
        dataPipeline = [
            { $match: query },
            {
                $lookup: {
                    from: 'alerts',
                    localField: 'alert_id',
                    foreignField: 'id',
                    as: 'alert_data'
                }
            },
            { $unwind: { path: '$alert_data', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'contents',
                    localField: 'alert_data.content_id',
                    foreignField: 'id',
                    as: 'content_data'
                }
            },
            { $unwind: { path: '$content_data', preserveNullAndEmptyArrays: true } }
        ];

        if (category && category !== 'all') {
            dataPipeline.push(
                {
                    $lookup: {
                        from: 'sources',
                        localField: 'content_data.source_id',
                        foreignField: 'id',
                        as: 'source_data'
                    }
                },
                { $unwind: { path: '$source_data', preserveNullAndEmptyArrays: true } },
                { $match: { $or: [{ 'alert_data.source_category': category }, { 'source_data.category': category }] } }
            );
        }

        if (keyword && keyword !== 'all') {
            dataPipeline.push({
                $match: {
                    'content_data.risk_factors.keyword': { $regex: `^${escapeRegex(keyword)}`, $options: 'i' }
                }
            });
        }

        if (risk_level && risk_level !== 'all') {
            dataPipeline.push({ $match: { 'alert_data.risk_level': risk_level } });
        }

        if (virality_level && virality_level !== 'all') {
            dataPipeline.push({ $match: { 'alert_data.virality_level': String(virality_level).toLowerCase() } });
        }

        if (alert_type && alert_type !== 'all') {
            if (alert_type === 'risk') {
                dataPipeline.push({ $match: { 'alert_data.alert_type': { $in: ['keyword_risk', 'ai_risk', null] } } });
            } else {
                dataPipeline.push({ $match: { 'alert_data.alert_type': alert_type } });
            }
        }

        if (normalizedSearch) {
            const searchPattern = escapeRegex(normalizedSearch);
            dataPipeline.push({
                $match: {
                    $or: [
                        { serial_number: { $regex: searchPattern, $options: 'i' } },
                        { 'target_user_details.name': { $regex: searchPattern, $options: 'i' } },
                        { 'target_user_details.handle': { $regex: searchPattern, $options: 'i' } },
                        { 'content_data.text': { $regex: searchPattern, $options: 'i' } }
                    ]
                }
            });
        }

        dataPipeline.push(
            { $sort: { generated_at: -1 } },
            { $skip: skip },
            { $limit: limitNum }
        );
    }

    // Source lookup for category column (runs on paginated slice only)
    dataPipeline.push(
        {
            $lookup: {
                from: 'sources',
                localField: 'content_data.source_id',
                foreignField: 'id',
                as: 'source_data'
            }
        },
        { $unwind: { path: '$source_data', preserveNullAndEmptyArrays: true } },
        {
            $addFields: {
                id: '$_id',
                joined_content_url: '$alert_data.content_url',
                source_category: {
                    $ifNull: ['$alert_data.source_category', '$source_data.category']
                }
            }
        }
    );

    // ── Run data + count in parallel ──
    let items, total;

    if (countFilter) {
        // Optimized path: fast countDocuments (uses index)
        [items, total] = await Promise.all([
            Report.aggregate(dataPipeline),
            Report.countDocuments(countFilter)
        ]);
    } else {
        // Legacy path: count via separate aggregation (same filters, no skip/limit/lookups-after-filter)
        const countPipeline = dataPipeline
            .filter(stage => !stage.$skip && !stage.$limit && !stage.$addFields && !stage.$sort)
            .filter(stage => {
                // Keep $match, $lookup, $unwind stages needed for filtering — exclude final source lookup
                if (stage.$lookup && stage.$lookup.from === 'sources' && !needsJoinsForFiltering) return false;
                return true;
            });
        countPipeline.push({ $count: 'total' });

        const [dataResult, countResult] = await Promise.all([
            Report.aggregate(dataPipeline),
            Report.aggregate(countPipeline).catch(() => [])
        ]);
        items = dataResult;
        total = countResult[0]?.total || 0;
    }

    return {
        items,
        pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.max(Math.ceil(total / limitNum), 1)
        }
    };
};
const updateReport = async (alertId, updateData) => {
    const report = await Report.findOneAndUpdate(
        { alert_id: alertId },
        {
            $set: updateData
        },
        { new: true }
    );
    if (!report) throw new Error('Report not found');
    await cacheService.invalidatePrefix('reports:stats:v1');
    await cacheService.invalidatePrefix('dashboard:v2');
    return report;
};

const getReportStats = async () => {
    const cacheKey = 'reports:stats:v1:all';
    const cached = await cacheService.get(cacheKey);
    if (cached) return cached;

    const grouped = await Report.aggregate([
        {
            $group: {
                _id: { platform: '$platform', status: '$status' },
                count: { $sum: 1 }
            }
        }
    ]);

    const normalizePlatform = (platform) => (platform === 'x' ? 'twitter' : platform);
    const statuses = ['generated', 'printed', 'sent', 'sent_to_intermediary', 'awaiting_reply', 'closed'];
    const platforms = ['all', 'twitter', 'youtube', 'facebook', 'instagram', 'whatsapp'];
    const byPlatform = {};
    const byStatus = Object.fromEntries(statuses.map((s) => [s, 0]));
    const totals = { total: 0 };

    platforms.forEach((p) => {
        byPlatform[p] = { total: 0 };
        statuses.forEach((s) => {
            byPlatform[p][s] = 0;
        });
    });

    grouped.forEach(({ _id, count }) => {
        const platform = normalizePlatform(_id.platform || 'unknown');
        const status = _id.status;
        if (!statuses.includes(status)) return;
        if (!byPlatform[platform]) {
            byPlatform[platform] = { total: 0 };
            statuses.forEach((s) => {
                byPlatform[platform][s] = 0;
            });
        }
        byPlatform[platform][status] += count;
        byPlatform[platform].total += count;
        byPlatform.all[status] += count;
        byPlatform.all.total += count;
        byStatus[status] += count;
        totals.total += count;
    });

    const payload = { byPlatform, byStatus, totals };
    await cacheService.set(cacheKey, payload, 30);
    return payload;
};

module.exports = {
    generateSerialNumber,
    createReportFromAlert,
    getAllReports,
    updateReport,
    getReportStats
};
