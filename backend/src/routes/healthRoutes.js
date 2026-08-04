const express = require('express');
const router = express.Router();
const healthController = require('../controllers/healthController');

// GET /api/health/status
router.get('/status', healthController.getSystemHealth);

module.exports = router;
