const express = require('express');
const router = express.Router();
const { authorize } = require('../middleware/auth.middleware');
const {
  getStories,
  storeStories,
  markViewed,
  deleteStory,
  bulkDeleteStories,
  cleanupStories,
  getStoryStats
} = require('../controllers/instagramStoryController');

router.use(authorize({ pages: ['/alerts', '/instagram-monitor', '/monitors'] }));

router.get('/', getStories);
router.get('/stats', getStoryStats);

// Store stories from API fetches
router.post('/store', storeStories);

// Mark story as viewed
router.put('/:id/viewed', markViewed);

// Admin-level delete
router.delete('/bulk', bulkDeleteStories);
router.delete('/:id', deleteStory);

// Cleanup expired stories
router.post('/cleanup', cleanupStories);

module.exports = router;
