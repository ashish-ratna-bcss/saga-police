const express = require('express');
const router = express.Router();
const { getSettings, updateSettings, getAllSettingsData } = require('./settings.controller');
const { authorize } = require('../../middleware/auth.middleware');

router.use(authorize({ pages: ['/settings'] }));

// Combined endpoint — returns settings + keywords + thresholds + templates in one call
router.get('/all', getAllSettingsData);

router.route('/')
  .get(getSettings)
  .put(updateSettings);

// Mongo TwitterAccount scraping accounts — disabled in Postgres-only mode
const mongoAccountsGone = (_req, res) =>
  res.status(410).json({
    message: 'Settings accounts API retired (Mongo scraper accounts). Use social profiles / catalog monitoring.',
  });

router.route('/accounts').post(mongoAccountsGone).get(mongoAccountsGone);
router.route('/accounts/:id').delete(mongoAccountsGone);
router.route('/accounts/reset').post(mongoAccountsGone);

module.exports = router;
