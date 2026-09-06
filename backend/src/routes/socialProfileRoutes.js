const express = require('express');
const router = express.Router();
const {
  listPlatforms,
  createPlatform,
  updatePlatform,
  deletePlatform,
  listProfiles,
  createProfile,
  createProfilesBatch,
  updateProfile,
  deleteProfile,
  toggleMonitoring,
  startAllMonitoring,
  bulkToggleStatus,
  previewProfileIdentity,
} = require('../controllers/socialProfileController');

const { authorize } = require('../middleware/auth.middleware');

const PROFILE_ALLOWED_PAGES = ['/social-profiles'];

router.use(authorize({ pages: PROFILE_ALLOWED_PAGES }));

router.route('/platforms')
  .get(listPlatforms)
  .post(createPlatform);

router.route('/platforms/:id')
  .put(updatePlatform)
  .delete(deletePlatform);

router.post('/preview', previewProfileIdentity);
router.post('/batch', createProfilesBatch);

router.route('/')
  .get(listProfiles)
  .post(createProfile);

router.put('/bulk-status', bulkToggleStatus);
router.put('/monitoring/start-all', startAllMonitoring);

router.put('/:id/monitoring', toggleMonitoring);

router.route('/:id')
  .put(updateProfile)
  .delete(deleteProfile);

module.exports = router;
