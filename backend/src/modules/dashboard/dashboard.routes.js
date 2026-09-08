const express = require('express');
const { authorize } = require('../../middleware/auth.middleware');
const { getDashboardOverview } = require('./dashboard.controller');

const router = express.Router();

router.get('/overview', authorize(), getDashboardOverview);

module.exports = router;
