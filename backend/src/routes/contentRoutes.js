const express = require('express');
const router = express.Router();
const { getContent, getContentFeed, getContentDetail, getContentStats, checkContentAvailability, getUnavailableContent } = require('../controllers/contentController');
const { protect } = require('../middleware/authMiddleware');
const { requireAnyPageAccess, requirePlatformFeatureAccess } = require('../middleware/rbacMiddleware');

const CONTENT_ALLOWED_PAGES = [
  '/content',
  '/intel-processed',
  '/monitors',
  '/x-monitor',
  '/facebook-monitor',
  '/instagram-monitor',
  '/youtube-monitor'
];

router.use(protect, requireAnyPageAccess(CONTENT_ALLOWED_PAGES));

router.get('/', requirePlatformFeatureAccess('/monitors', (req) => req.query.platform), getContent);
router.get('/feed', requirePlatformFeatureAccess('/monitors', (req) => req.query.platform), getContentFeed);
router.get('/stats', requirePlatformFeatureAccess('/monitors', (req) => req.query.platform), getContentStats);
router.get('/unavailable', requirePlatformFeatureAccess('/monitors', (req) => req.query.platform), getUnavailableContent);
router.post('/check-availability', requirePlatformFeatureAccess('/monitors', (req) => req.body.platform), checkContentAvailability);
router.get('/:id', getContentDetail);

module.exports = router;
