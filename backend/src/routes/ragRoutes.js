const express = require('express');
const router = express.Router();
const ragController = require('../controllers/ragController');
const { protect } = require('../middleware/authMiddleware');

// All RAG routes require authentication
router.use(protect);

router.get('/health', ragController.health);
router.get('/collections', ragController.collections);
router.post('/query', ragController.query);
router.post('/query/async', ragController.queryAsync);
router.post('/top-alerts/by-category', ragController.topAlertsByCategory);
router.get('/top-alerts/cached', ragController.topAlertsCached);
router.get('/jobs', ragController.listJobs);
router.get('/jobs/:id', ragController.getJob);
router.delete('/jobs/:id', ragController.deleteJob);
router.post('/ingest', ragController.ingest);
router.get('/stats', ragController.stats);

module.exports = router;
