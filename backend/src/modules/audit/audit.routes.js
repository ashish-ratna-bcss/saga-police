const express = require('express');
const { authorize } = require('../../middleware/auth.middleware');
const { listAuditLogs } = require('./audit.controller');

const router = express.Router();

router.get('/', authorize({ manageUsers: true }), listAuditLogs);

module.exports = { auditRoutes: router };
