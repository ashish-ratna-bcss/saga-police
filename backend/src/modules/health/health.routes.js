const express = require('express');
const router = express.Router();
const healthController = require('./health.controller');

// GET /api/health/status
router.get('/status', healthController.getSystemHealth);

module.exports = router;
