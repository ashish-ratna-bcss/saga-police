const express = require('express');
const router = express.Router();
const { register, login, refreshToken, getMe, forgotPassword, resetPassword, verifyResetToken, ssoBridge } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refreshToken);
router.get('/me', protect, getMe);
router.get('/sso-bridge', protect, ssoBridge);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);
router.get('/reset-password/:token/verify', verifyResetToken);

module.exports = router;
