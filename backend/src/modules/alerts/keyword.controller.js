const {
  listKeywords,
  createKeyword,
  updateKeyword,
  deleteKeyword,
} = require('./alert.keyword.service');
const { createAuditLog } = require('../../lib/audit');

// @desc    Get keywords (Postgres)
// @route   GET /api/keywords
const getKeywords = async (req, res) => {
  try {
    const keywords = await listKeywords({}, { db: req.tenantPrisma });
    return res.status(200).json(keywords);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Create keyword (Postgres)
// @route   POST /api/keywords
const postKeyword = async (req, res) => {
  try {
    const result = await createKeyword(
      { ...(req.body || {}), rescan_catalog: true },
      { user: req.user, db: req.tenantPrisma }
    );
    return res.status(result.already_exists ? 200 : 201).json(result.keyword);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

// @desc    Update keyword (Postgres)
// @route   PUT /api/keywords/:id
const putKeyword = async (req, res) => {
  try {
    const result = await updateKeyword(
      req.params.id,
      { ...(req.body || {}), rescan_catalog: true },
      { user: req.user, db: req.tenantPrisma }
    );
    return res.status(200).json(result.keyword);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

// @desc    Delete keyword (Postgres)
// @route   DELETE /api/keywords/:id
const removeKeyword = async (req, res) => {
  try {
    await deleteKeyword(req.params.id, { user: req.user, db: req.tenantPrisma });
    return res.status(204).json(null);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

// @desc    Rescan all catalog posts against keywords; create missing alerts
// @route   POST /api/keywords/catalog-rescan
const catalogRescan = async (req, res) => {
  try {
    const { rescanAllCatalogPostsForKeywords } = require('./alert.keyword.service');
    const result = await rescanAllCatalogPostsForKeywords({ db: req.tenantPrisma });
    try {
      await createAuditLog(req.user, 'scan', 'keyword', 'catalog_rescan', result);
    } catch (_) {
      /* optional */
    }
    return res.status(200).json({ message: 'Catalog keyword rescan complete', result });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Legacy Mongo content rescan — use POST /api/keywords/catalog-rescan instead
const triggerRescan = async (_req, res) => {
  return res.status(410).json({
    message: 'Legacy content rescan retired. Use POST /api/keywords/catalog-rescan.',
  });
};

module.exports = {
  getKeywords,
  createKeyword: postKeyword,
  updateKeyword: putKeyword,
  deleteKeyword: removeKeyword,
  catalogRescan,
  triggerRescan,
};
