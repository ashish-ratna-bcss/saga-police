const express = require('express');
const {
  login,
  logout,
  getMe,
  updateMyUiMode,
  updateMyThemeColor,
  updateMyPlatforms,
} = require('./auth.controller');
const { authorize } = require('../../middleware/auth.middleware');

const router = express.Router();

router.post('/login', login);
router.post('/logout', logout);
router.get('/me', authorize(), getMe);
router.patch('/me/ui-mode', authorize(), updateMyUiMode);
router.patch('/me/theme-color', authorize(), updateMyThemeColor);
router.patch('/me/platforms', authorize(), updateMyPlatforms);

module.exports = router;
