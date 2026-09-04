const express = require('express');
const router = express.Router();
const { getContent, getContentFeed, getContentDetail, getContentStats, checkContentAvailability, getUnavailableContent } = require('../controllers/contentController');
const { authorize } = require('../middleware/auth.middleware');

const CONTENT_ALLOWED_PAGES = [
  '/content',
  '/intel-processed',
  '/monitors',
  '/x-monitor',
  '/facebook-monitor',
  '/instagram-monitor',
  '/youtube-monitor'
];

router.use(authorize({ pages: CONTENT_ALLOWED_PAGES }));

router.get('/', authorize({ pages: ['/monitors'] }), getContent);
router.get('/feed', authorize({ pages: ['/monitors'] }), getContentFeed);
router.get('/stats', authorize({ pages: ['/monitors'] }), getContentStats);
router.get('/unavailable', authorize({ pages: ['/monitors'] }), getUnavailableContent);
router.post('/check-availability', authorize({ pages: ['/monitors'] }), checkContentAvailability);
router.get('/:id', getContentDetail);

module.exports = router;
