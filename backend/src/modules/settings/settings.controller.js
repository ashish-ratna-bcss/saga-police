const {
  getSettingsDoc,
  updateSettingsDoc,
  listThresholds,
  listTemplates,
} = require('./settings.service');
const { listKeywords } = require('../alerts/alert.keyword.service');
const { createAuditLog } = require('../../lib/audit');

// @desc    Get settings
// @route   GET /api/settings
// @access  Private
const getSettings = async (req, res) => {
  try {
    const doc = await getSettingsDoc({ db: req.tenantPrisma });
    res.status(200).json(doc);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update settings
// @route   PUT /api/settings
// @access  Private (Admin only)
const updateSettings = async (req, res) => {
  try {
    if (!['superadmin', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const settings = await updateSettingsDoc(req.body || {}, { db: req.tenantPrisma });
    await createAuditLog(req.user, 'update', 'settings', 'global_settings', req.body);

    res.status(200).json(settings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all settings page data in one call
// @route   GET /api/settings/all
// @access  Private
const getAllSettingsData = async (req, res) => {
  try {
    const db = req.tenantPrisma;
    const [settings, keywords, thresholds, templates] = await Promise.all([
      getSettingsDoc({ db }),
      listKeywords({}, { db }).catch(() => []),
      listThresholds(undefined, { db }),
      listTemplates({ db }),
    ]);

    res.status(200).json({
      settings,
      keywords,
      thresholds,
      templates,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getSettings,
  updateSettings,
  getAllSettingsData,
};
