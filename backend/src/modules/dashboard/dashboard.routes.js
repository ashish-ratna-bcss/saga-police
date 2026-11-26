const express = require('express');
const { authorize } = require('../../middleware/auth.middleware');
const { getDashboardOverview, getDashboardPosts } = require('./dashboard.controller');

const router = express.Router();

router.get('/overview', authorize(), getDashboardOverview);
router.get('/posts', authorize(), getDashboardPosts);

module.exports = router;
