const logger = require('../../utils/logger');
const {
  listKeywords,
  createKeyword,
  updateKeyword,
  deleteKeyword,
} = require('./alert.keyword.service');

const getKeywords = async (req, res) => {
  try {
    const keywords = await listKeywords({
      category: req.query.category,
      active: req.query.active,
    });
    return res.status(200).json(keywords);
  } catch (error) {
    logger.error('[AlertsKeywords] list failed:', error);
    return res.status(500).json({ message: error.message });
  }
};

const postKeyword = async (req, res) => {
  try {
    const result = await createKeyword(req.body || {}, { user: req.user });
    return res.status(201).json(result);
  } catch (error) {
    logger.error('[AlertsKeywords] create failed:', error);
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const putKeyword = async (req, res) => {
  try {
    const result = await updateKeyword(req.params.id, req.body || {}, { user: req.user });
    return res.status(200).json(result);
  } catch (error) {
    logger.error('[AlertsKeywords] update failed:', error);
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const removeKeyword = async (req, res) => {
  try {
    const result = await deleteKeyword(req.params.id, { user: req.user });
    return res.status(200).json(result);
  } catch (error) {
    logger.error('[AlertsKeywords] delete failed:', error);
    return res.status(error.status || 500).json({ message: error.message });
  }
};

module.exports = {
  getKeywords,
  postKeyword,
  putKeyword,
  removeKeyword,
};
