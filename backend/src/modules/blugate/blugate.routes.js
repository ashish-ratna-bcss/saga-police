const express = require('express');
const router = express.Router();
const { authorize } = require('../../middleware/auth.middleware');
const { getBillingInfo } = require('./blugate.controller');

router.use(authorize({ pages: ['/blugate-billing'] }));

// GET /api/blugate/billing
router.get('/billing', getBillingInfo);

module.exports = router;
