const Keyword = require('../models/Keyword');
const { createAuditLog } = require('../services/auditService');

// @desc    Get keywords
// @route   GET /api/keywords
// @access  Private
const getKeywords = async (req, res) => {
  try {
    const { category } = req.query;
    const query = {};

    if (category) query.category = category;

    const keywords = await Keyword.find(query).limit(1000).lean();
    res.status(200).json(keywords);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create keyword
// @route   POST /api/keywords
// @access  Private
const createKeyword = async (req, res) => {
  try {
    const keyword = await Keyword.create(req.body);
    await createAuditLog(req.user, 'create', 'keyword', keyword.id, { keyword: keyword.keyword });
    res.status(201).json(keyword);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete keyword
// @route   DELETE /api/keywords/:id
// @access  Private
const deleteKeyword = async (req, res) => {
  try {
    const keyword = await Keyword.findOne({ id: req.params.id });

    if (!keyword) {
      return res.status(404).json({ message: 'Keyword not found' });
    }

    await keyword.deleteOne();
    await createAuditLog(req.user, 'delete', 'keyword', req.params.id, {});

    res.status(204).json(null);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Import rescan service
const { rescanContent } = require('../services/monitorService');

// ... existing code ...

const triggerRescan = async (req, res) => {
  try {
    const result = await rescanContent();
    await createAuditLog(req.user, 'scan', 'content', 'retroactive', { count: result.scanned });
    res.status(200).json({ message: 'Retroactive scan started', result });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getKeywords,
  createKeyword,
  deleteKeyword,
  triggerRescan
};
