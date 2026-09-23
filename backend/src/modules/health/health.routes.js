const express = require('express');
const router = express.Router();
const { authorize } = require('../../middleware/auth.middleware');
const healthController = require('./health.controller');

router.use(authorize({ pages: ['/system-health'] }));

// GET /api/health/status
router.get('/status', healthController.getSystemHealth);

module.exports = router;
