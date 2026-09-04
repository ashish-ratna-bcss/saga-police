const Settings = require('../models/Settings');
const { createAuditLog } = require('../services/auditService');

// In-memory cache for settings (avoids DB round-trip on every GET)
let _settingsCache = null;
let _settingsCacheTime = 0;
const SETTINGS_CACHE_TTL = 30000; // 30 seconds

const invalidateSettingsCache = () => {
  _settingsCache = null;
  _settingsCacheTime = 0;
};

// @desc    Get settings
// @route   GET /api/settings
// @access  Private
const getSettings = async (req, res) => {
  try {
    // Return cached response if fresh
    if (_settingsCache && (Date.now() - _settingsCacheTime) < SETTINGS_CACHE_TTL) {
      return res.status(200).json(_settingsCache);
    }

    let settings = await Settings.findOne({ id: 'global_settings' }).lean();

    if (!settings) {
      const created = await Settings.create({ id: 'global_settings' });
      settings = created.toObject();
    }

    // Ensure UI-facing fields are present even for older docs
    const doc = settings;
    if (doc.risk_threshold_high === undefined) doc.risk_threshold_high = doc.high_risk_threshold ?? 70;
    if (doc.risk_threshold_medium === undefined) doc.risk_threshold_medium = doc.medium_risk_threshold ?? 40;
    if (doc.monitoring_interval_minutes === undefined) doc.monitoring_interval_minutes = 5;

    // Ensure api_config defaults for older docs
    const CATEGORIES = ['political', 'communal', 'trouble_makers', 'defamation', 'narcotics', 'history_sheeters', 'others'];
    const defaultCategoryFreqs = {};
    for (const c of CATEGORIES) defaultCategoryFreqs[c] = 60;

    const defaultApiConfig = {
      monitoring: {
        enabled: true,
        frequencies: {
          x: { ...defaultCategoryFreqs },
          instagram: { ...defaultCategoryFreqs },
          facebook: { ...defaultCategoryFreqs },
          youtube: { ...defaultCategoryFreqs }
        }
      },
      events: { x: 60, instagram: 60, facebook: 60, youtube: 60, enabled: true },
      grievances: { x: 60, facebook: 60, enabled: true }
    };
    if (!doc.api_config) {
      doc.api_config = defaultApiConfig;
    } else {
      // Migrate old flat monitoring → new frequencies structure
      if (!doc.api_config.monitoring) {
        doc.api_config.monitoring = defaultApiConfig.monitoring;
      } else {
        if (doc.api_config.monitoring.enabled === undefined) doc.api_config.monitoring.enabled = true;
        if (!doc.api_config.monitoring.frequencies) {
          doc.api_config.monitoring.frequencies = defaultApiConfig.monitoring.frequencies;
        } else {
          for (const plat of ['x', 'instagram', 'facebook', 'youtube']) {
            if (!doc.api_config.monitoring.frequencies[plat]) {
              doc.api_config.monitoring.frequencies[plat] = { ...defaultCategoryFreqs };
            } else {
              for (const cat of CATEGORIES) {
                if (doc.api_config.monitoring.frequencies[plat][cat] === undefined) {
                  doc.api_config.monitoring.frequencies[plat][cat] = 60;
                }
              }
            }
          }
        }
      }
      for (const mod of ['events', 'grievances']) {
        if (!doc.api_config[mod]) {
          doc.api_config[mod] = defaultApiConfig[mod];
        } else {
          for (const key of Object.keys(defaultApiConfig[mod])) {
            if (doc.api_config[mod][key] === undefined) {
              doc.api_config[mod][key] = defaultApiConfig[mod][key];
            }
          }
        }
      }
    }

    // Cache the built response
    _settingsCache = doc;
    _settingsCacheTime = Date.now();

    res.status(200).json(doc);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update settings
// @route   PUT /api/settings
// @access  Private (Admin/Analyst only)
const updateSettings = async (req, res) => {
  try {
    if (!['superadmin', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const updateDoc = { ...req.body, updated_at: new Date() };

    // Normalize threshold field names (UI uses risk_threshold_*; backend uses *_risk_threshold)
    if (updateDoc.risk_threshold_high !== undefined) {
      updateDoc.high_risk_threshold = updateDoc.risk_threshold_high;
    }
    if (updateDoc.risk_threshold_medium !== undefined) {
      updateDoc.medium_risk_threshold = updateDoc.risk_threshold_medium;
    }

    // Also keep UI fields aligned if backend fields are provided
    if (updateDoc.high_risk_threshold !== undefined && updateDoc.risk_threshold_high === undefined) {
      updateDoc.risk_threshold_high = updateDoc.high_risk_threshold;
    }
    if (updateDoc.medium_risk_threshold !== undefined && updateDoc.risk_threshold_medium === undefined) {
      updateDoc.risk_threshold_medium = updateDoc.medium_risk_threshold;
    }

    const settings = await Settings.findOneAndUpdate(
      { id: 'global_settings' },
      updateDoc,
      { new: true, upsert: true }
    );

    // Invalidate cache so next GET fetches fresh data
    invalidateSettingsCache();

    await createAuditLog(req.user, 'update', 'settings', 'global_settings', updateDoc);

    res.status(200).json(settings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all settings page data in one call (settings + keywords + thresholds + templates)
// @route   GET /api/settings/all
// @access  Private
const getAllSettingsData = async (req, res) => {
  try {
    const Keyword = require('../models/Keyword');
    const AlertThreshold = require('../models/AlertThreshold');
    const Template = require('../models/Template');

    // If settings cache is fresh, use it; otherwise fetch from DB
    let settingsDoc;
    if (_settingsCache && (Date.now() - _settingsCacheTime) < SETTINGS_CACHE_TTL) {
      settingsDoc = _settingsCache;
    } else {
      // Fetch settings and build the doc (same logic as getSettings)
      let settings = await Settings.findOne({ id: 'global_settings' }).lean();
      if (!settings) {
        const created = await Settings.create({ id: 'global_settings' });
        settings = created.toObject();
      }
      const doc = settings;
      if (doc.risk_threshold_high === undefined) doc.risk_threshold_high = doc.high_risk_threshold ?? 70;
      if (doc.risk_threshold_medium === undefined) doc.risk_threshold_medium = doc.medium_risk_threshold ?? 40;
      if (doc.monitoring_interval_minutes === undefined) doc.monitoring_interval_minutes = 5;

      const CATEGORIES = ['political', 'communal', 'trouble_makers', 'defamation', 'narcotics', 'history_sheeters', 'others'];
      const defaultCategoryFreqs = {};
      for (const c of CATEGORIES) defaultCategoryFreqs[c] = 60;
      const defaultApiConfig = {
        monitoring: { enabled: true, frequencies: { x: { ...defaultCategoryFreqs }, instagram: { ...defaultCategoryFreqs }, facebook: { ...defaultCategoryFreqs }, youtube: { ...defaultCategoryFreqs } } },
        events: { x: 60, instagram: 60, facebook: 60, youtube: 60, enabled: true },
        grievances: { x: 60, facebook: 60, enabled: true }
      };
      if (!doc.api_config) {
        doc.api_config = defaultApiConfig;
      } else {
        if (!doc.api_config.monitoring) doc.api_config.monitoring = defaultApiConfig.monitoring;
        else {
          if (doc.api_config.monitoring.enabled === undefined) doc.api_config.monitoring.enabled = true;
          if (!doc.api_config.monitoring.frequencies) doc.api_config.monitoring.frequencies = defaultApiConfig.monitoring.frequencies;
          else {
            for (const plat of ['x', 'instagram', 'facebook', 'youtube']) {
              if (!doc.api_config.monitoring.frequencies[plat]) doc.api_config.monitoring.frequencies[plat] = { ...defaultCategoryFreqs };
              else { for (const cat of CATEGORIES) { if (doc.api_config.monitoring.frequencies[plat][cat] === undefined) doc.api_config.monitoring.frequencies[plat][cat] = 60; } }
            }
          }
        }
        for (const mod of ['events', 'grievances']) {
          if (!doc.api_config[mod]) doc.api_config[mod] = defaultApiConfig[mod];
          else { for (const key of Object.keys(defaultApiConfig[mod])) { if (doc.api_config[mod][key] === undefined) doc.api_config[mod][key] = defaultApiConfig[mod][key]; } }
        }
      }
      _settingsCache = doc;
      _settingsCacheTime = Date.now();
      settingsDoc = doc;
    }

    // Fetch keywords, thresholds, templates in parallel (single DB round-trip batch)
    const [keywords, thresholds, templates] = await Promise.all([
      Keyword.find({}).limit(1000).lean(),
      AlertThreshold.find({}).sort({ platform: 1 }).lean(),
      Template.find().sort({ created_at: -1 }).lean()
    ]);

    res.status(200).json({
      settings: settingsDoc,
      keywords,
      thresholds,
      templates
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getSettings,
  updateSettings,
  getAllSettingsData
};
