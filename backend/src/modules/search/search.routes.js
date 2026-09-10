const express = require('express');
const router = express.Router();
const {
  listPlatformsHandler,
  searchProfilesHandler,
  searchContentHandler,
  saveHistoryHandler,
  listHistoryHandler,
  getHistoryByIdHandler,
  glanceSearchHandler,
} = require('./search.controller');
const { authorize } = require('../../middleware/auth.middleware');

router.use(authorize());

router.get('/platforms', listPlatformsHandler);
router.get('/profiles', searchProfilesHandler);
router.get('/content', searchContentHandler);
router.get('/glance', glanceSearchHandler);
router.post('/history', saveHistoryHandler);
router.get('/history', listHistoryHandler);
router.get('/history/:id', getHistoryByIdHandler);

module.exports = router;
