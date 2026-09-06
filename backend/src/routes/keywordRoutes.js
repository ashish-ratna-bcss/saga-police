const express = require('express');
const router = express.Router();
const {
  getKeywords,
  createKeyword,
  updateKeyword,
  deleteKeyword,
  catalogRescan,
  triggerRescan,
} = require('../controllers/keywordController');
const { authorize } = require('../middleware/auth.middleware');

router.get('/', authorize({ pages: ['/settings', '/alerts'] }), getKeywords);
router.post('/', authorize({ pages: ['/settings'] }), createKeyword);
router.post('/catalog-rescan', authorize({ pages: ['/settings', '/alerts'] }), catalogRescan);
router.post('/scan', authorize({ pages: ['/settings'] }), triggerRescan);
router.put('/:id', authorize({ pages: ['/settings'] }), updateKeyword);
router.delete('/:id', authorize({ pages: ['/settings'] }), deleteKeyword);

module.exports = router;
