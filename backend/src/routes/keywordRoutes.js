const express = require('express');
const router = express.Router();
const { getKeywords, createKeyword, deleteKeyword } = require('../controllers/keywordController');
const { authorize } = require('../middleware/auth.middleware');

router.get('/', authorize({ pages: ['/settings', '/alerts'] }), getKeywords);
router.post('/', authorize({ pages: ['/settings'] }), createKeyword);
router.post('/scan', authorize({ pages: ['/settings'] }), require('../controllers/keywordController').triggerRescan);
router.delete('/:id', authorize({ pages: ['/settings'] }), deleteKeyword);

module.exports = router;
