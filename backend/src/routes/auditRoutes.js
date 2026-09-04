const express = require('express');
const router = express.Router();
const { getAuditLogs } = require('../controllers/auditController');
const { authorize } = require('../middleware/auth.middleware');

router.get('/', authorize({ pages: ['/audit-logs'] }), getAuditLogs);

module.exports = router;
