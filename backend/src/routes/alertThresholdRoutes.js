const express = require('express');
const router = express.Router();
const {
    getAlertThresholds,
    createAlertThreshold,
    updateAlertThreshold,
    deleteAlertThreshold,
    bulkUpdateThresholds
} = require('../controllers/alertThresholdController');
const { authorize } = require('../middleware/auth.middleware');

// Apply auth to all routes
router.use(authorize({ pages: ['/settings'] }));

// GET all thresholds, POST new threshold
router.route('/')
    .get(getAlertThresholds)
    .post(createAlertThreshold);

// Bulk update (must come before :id route)
router.put('/bulk', bulkUpdateThresholds);

// Single threshold operations
router.route('/:id')
    .put(updateAlertThreshold)
    .delete(deleteAlertThreshold);

module.exports = router;
