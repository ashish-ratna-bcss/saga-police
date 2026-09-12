const {
  listThresholds,
  upsertThreshold,
  bulkUpsertThresholds,
} = require('./settings.service');
const { createAuditLog } = require('../../lib/audit');
const dbOf = require('../../lib/dbOf');

const requireAdmin = (req, res) => {
  if (!['superadmin', 'admin'].includes(req.user.role)) {
    res.status(403).json({ message: 'Insufficient permissions' });
    return false;
  }
  return true;
};

const sendServiceError = (res, error) => {
  const status = error.status || 500;
  res.status(status).json({ message: error.message });
};

// @desc    Get viral thresholds (from platforms)
// @route   GET /api/alert-thresholds
// @access  Private
const getAlertThresholds = async (req, res) => {
  try {
    const thresholds = await listThresholds(req.query.platform || undefined, {
      db: req.tenantPrisma,
    });
    res.status(200).json(thresholds);
  } catch (error) {
    sendServiceError(res, error);
  }
};

// @desc    Update viral thresholds for an existing platform (by slug)
// @route   POST /api/alert-thresholds
// @access  Private (Admin)
const createAlertThreshold = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { platform, low_threshold, medium_threshold, high_threshold, time_window_minutes } =
      req.body;
    if (!platform) {
      return res.status(400).json({ message: 'platform is required' });
    }

    const threshold = await upsertThreshold(
      platform,
      {
        low_threshold,
        medium_threshold,
        high_threshold,
        time_window_minutes,
      },
      { db: req.tenantPrisma }
    );

    await createAuditLog({
      req,
      user: req.user,
      action: 'update',
      resourceType: 'alert_threshold',
      resourceId: threshold.id,
      newData: req.body,
    });
    res.status(200).json(threshold);
  } catch (error) {
    sendServiceError(res, error);
  }
};

// @desc    Update viral thresholds by platform id
// @route   PUT /api/alert-thresholds/:id
// @access  Private (Admin)
const updateAlertThreshold = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const prisma = dbOf(req.tenantPrisma);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: 'Invalid platform id' });
    }

    const existing = await prisma.platforms.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: 'Platform not found' });
    }

    const updated = await upsertThreshold(
      existing.slug,
      {
        low_threshold: req.body.low_threshold,
        medium_threshold: req.body.medium_threshold,
        high_threshold: req.body.high_threshold,
        time_window_minutes: req.body.time_window_minutes,
        is_active: req.body.is_active,
      },
      { db: req.tenantPrisma }
    );

    await createAuditLog({
      req,
      user: req.user,
      action: 'update',
      resourceType: 'alert_threshold',
      resourceId: req.params.id,
      oldData: {
        low_threshold: existing.low_threshold,
        medium_threshold: existing.medium_threshold,
        high_threshold: existing.high_threshold,
        time_window_minutes: existing.time_window_minutes,
        is_active: existing.is_active,
      },
      newData: req.body,
    });
    res.status(200).json(updated);
  } catch (error) {
    sendServiceError(res, error);
  }
};

// @desc    Viral thresholds live on platforms — delete via Platforms instead
// @route   DELETE /api/alert-thresholds/:id
// @access  Private (Admin)
const deleteAlertThreshold = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    return res.status(400).json({
      message: 'Viral thresholds are part of each platform. Remove or edit the platform instead.',
    });
  } catch (error) {
    sendServiceError(res, error);
  }
};

// @desc    Bulk upsert thresholds onto platforms
// @route   PUT /api/alert-thresholds/bulk
// @access  Private (Admin)
const bulkUpdateThresholds = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { thresholds } = req.body;
    if (!Array.isArray(thresholds)) {
      return res.status(400).json({ message: 'thresholds must be an array' });
    }

    const results = await bulkUpsertThresholds(thresholds, { db: req.tenantPrisma });
    await createAuditLog({
      req,
      user: req.user,
      action: 'bulk_update',
      resourceType: 'alert_threshold',
      resourceId: 'bulk',
      newData: { count: results.length, thresholds },
    });

    res.status(200).json(results);
  } catch (error) {
    sendServiceError(res, error);
  }
};

module.exports = {
  getAlertThresholds,
  createAlertThreshold,
  updateAlertThreshold,
  deleteAlertThreshold,
  bulkUpdateThresholds,
};
