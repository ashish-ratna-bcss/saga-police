const {
  listThresholds,
  upsertThreshold,
  bulkUpsertThresholds,
} = require('../modules/settings/settings.service');
const { createAuditLog } = require('../services/auditService');
const prisma = require('../../prisma/client');

const requireAdmin = (req, res) => {
  if (!['superadmin', 'admin'].includes(req.user.role)) {
    res.status(403).json({ message: 'Insufficient permissions' });
    return false;
  }
  return true;
};

// @desc    Get all alert thresholds
// @route   GET /api/alert-thresholds
// @access  Private
const getAlertThresholds = async (req, res) => {
  try {
    const thresholds = await listThresholds(req.query.platform || undefined);
    res.status(200).json(thresholds);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create new alert threshold
// @route   POST /api/alert-thresholds
// @access  Private (Admin)
const createAlertThreshold = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { platform, low_threshold, medium_threshold, high_threshold, time_window_minutes } = req.body;
    if (!platform) {
      return res.status(400).json({ message: 'platform is required' });
    }

    const existing = await prisma.alert_thresholds.findUnique({ where: { platform } });
    if (existing) {
      return res.status(400).json({
        message: 'Threshold already exists for this platform. Use PUT to update.',
      });
    }

    const threshold = await upsertThreshold(platform, {
      low_threshold,
      medium_threshold,
      high_threshold,
      time_window_minutes,
    });

    await createAuditLog(req.user, 'create', 'alert_threshold', threshold.id, req.body);
    res.status(201).json(threshold);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update alert threshold
// @route   PUT /api/alert-thresholds/:id
// @access  Private (Admin)
const updateAlertThreshold = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const existing = await prisma.alert_thresholds.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!existing) {
      return res.status(404).json({ message: 'Threshold not found' });
    }

    const updated = await prisma.alert_thresholds.update({
      where: { id: existing.id },
      data: {
        low_threshold:
          req.body.low_threshold !== undefined
            ? Number(req.body.low_threshold)
            : existing.low_threshold,
        medium_threshold:
          req.body.medium_threshold !== undefined
            ? Number(req.body.medium_threshold)
            : existing.medium_threshold,
        high_threshold:
          req.body.high_threshold !== undefined
            ? Number(req.body.high_threshold)
            : existing.high_threshold,
        time_window_minutes:
          req.body.time_window_minutes !== undefined
            ? Number(req.body.time_window_minutes)
            : existing.time_window_minutes,
        is_active:
          req.body.is_active !== undefined ? Boolean(req.body.is_active) : existing.is_active,
      },
    });

    await createAuditLog(req.user, 'update', 'alert_threshold', req.params.id, req.body);
    res.status(200).json(updated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete alert threshold
// @route   DELETE /api/alert-thresholds/:id
// @access  Private (Admin)
const deleteAlertThreshold = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    try {
      await prisma.alert_thresholds.delete({ where: { id: String(req.params.id) } });
    } catch {
      return res.status(404).json({ message: 'Threshold not found' });
    }

    await createAuditLog(req.user, 'delete', 'alert_threshold', req.params.id, {});
    res.status(200).json({ message: 'Threshold deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Bulk upsert thresholds
// @route   PUT /api/alert-thresholds/bulk
// @access  Private (Admin)
const bulkUpdateThresholds = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { thresholds } = req.body;
    if (!Array.isArray(thresholds)) {
      return res.status(400).json({ message: 'thresholds must be an array' });
    }

    const results = await bulkUpsertThresholds(thresholds);
    await createAuditLog(req.user, 'bulk_update', 'alert_threshold', 'bulk', {
      count: results.length,
    });

    res.status(200).json(results);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getAlertThresholds,
  createAlertThreshold,
  updateAlertThreshold,
  deleteAlertThreshold,
  bulkUpdateThresholds,
};
