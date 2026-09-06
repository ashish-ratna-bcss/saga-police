const {
  listPolicies,
  getPolicy,
  createPolicy,
  updatePolicy,
  deletePolicy,
} = require('../modules/settings/settings.service');
const mappingService = require('../services/mappingService');

// @desc    Get all policy mappings
// @route   GET /api/policies
// @access  Private (Admin)
exports.getPolicies = async (req, res) => {
  try {
    const policies = await listPolicies();
    res.status(200).json({ success: true, count: policies.length, data: policies });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// @desc    Get single policy mapping
// @route   GET /api/policies/:id
// @access  Private (Admin)
exports.getPolicy = async (req, res) => {
  try {
    const policy = await getPolicy(req.params.id);
    if (!policy) {
      return res.status(404).json({ success: false, error: 'Policy not found' });
    }
    res.status(200).json({ success: true, data: policy });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// @desc    Create new policy mapping
// @route   POST /api/policies
// @access  Private (Admin)
exports.createPolicy = async (req, res) => {
  try {
    const policy = await createPolicy(req.body);
    await mappingService.forceRefresh();
    res.status(201).json({ success: true, data: policy });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({ success: false, error: 'Category ID already exists' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
};

// @desc    Update policy mapping
// @route   PUT /api/policies/:id
// @access  Private (Admin)
exports.updatePolicy = async (req, res) => {
  try {
    const policy = await updatePolicy(req.params.id, req.body);
    await mappingService.forceRefresh();
    res.status(200).json({ success: true, data: policy });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ success: false, error: 'Policy not found' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
};

// @desc    Delete policy mapping
// @route   DELETE /api/policies/:id
// @access  Private (Admin)
exports.deletePolicy = async (req, res) => {
  try {
    const ok = await deletePolicy(req.params.id);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Policy not found' });
    }
    await mappingService.forceRefresh();
    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
