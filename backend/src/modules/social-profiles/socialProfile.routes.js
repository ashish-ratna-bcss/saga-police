const express = require('express');
const router = express.Router();
const {
  listPlatforms,
  createPlatform,
  updatePlatform,
  deletePlatform,
  listProfiles,
  getProfile,
  listProfilePosts,
  createProfile,
  createProfilesBatch,
  updateProfile,
  deleteProfile,
  toggleMonitoring,
  startAllMonitoring,
  stopAllMonitoring,
  bulkToggleStatus,
  previewProfileIdentity,
} = require('./socialProfile.controller');

const { authorize } = require('../../middleware/auth.middleware');

/** Social Profiles page + Settings Grievances tab (add/list/remove grievance sources). */
const PROFILE_ALLOWED_PAGES = ['/social-profiles', '/settings'];
/** Settings → Platforms manage (add/edit/delete) */
const PLATFORM_MANAGE_PAGES = ['/settings', '/social-profiles'];

router.get('/platforms', authorize({ pages: PLATFORM_MANAGE_PAGES }), listPlatforms);
router.post('/platforms', authorize({ pages: PLATFORM_MANAGE_PAGES }), createPlatform);
router.put('/platforms/:id', authorize({ pages: PLATFORM_MANAGE_PAGES }), updatePlatform);
router.delete('/platforms/:id', authorize({ pages: PLATFORM_MANAGE_PAGES }), deletePlatform);

router.use(authorize({ pages: PROFILE_ALLOWED_PAGES }));

router.post('/preview', previewProfileIdentity);
router.post('/batch', createProfilesBatch);

router.route('/')
  .get(listProfiles)
  .post(createProfile);

router.put('/bulk-status', bulkToggleStatus);
router.put('/monitoring/start-all', startAllMonitoring);
router.put('/monitoring/stop-all', stopAllMonitoring);

router.put('/:id/monitoring', toggleMonitoring);
router.get('/:id/posts', listProfilePosts);

router.route('/:id')
  .get(getProfile)
  .put(updateProfile)
  .delete(deleteProfile);

module.exports = router;
