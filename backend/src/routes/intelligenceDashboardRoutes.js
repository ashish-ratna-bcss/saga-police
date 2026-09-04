const express = require('express');
const router = express.Router();
const {
  getAlertsIntelligence,
  getGrievancesIntelligence,
  getProfilesIntelligence
} = require('../controllers/intelligenceDashboardController');
const { authorize } = require('../middleware/auth.middleware');

router.use(authorize({ pages: ['/analytics', '/unified-reports', '/intelligence-dashboard'] }));

router.get('/alerts', getAlertsIntelligence);
router.get('/grievances', getGrievancesIntelligence);
router.get('/profiles', getProfilesIntelligence);

module.exports = router;
