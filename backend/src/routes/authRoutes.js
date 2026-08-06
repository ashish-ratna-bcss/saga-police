const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { register, login, refreshToken, getMe, forgotPassword, resetPassword, verifyResetToken, ssoBridge } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 100),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many authentication attempts, please try again later' }
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.AUTH_PASSWORD_RESET_RATE_LIMIT_MAX || 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many password reset attempts, please try again later' }
});

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/refresh', authLimiter, refreshToken);
router.get('/me', protect, getMe);
router.get('/sso-bridge', protect, ssoBridge);
router.post('/forgot-password', passwordResetLimiter, forgotPassword);
router.post('/reset-password/:token', passwordResetLimiter, resetPassword);
router.get('/reset-password/:token/verify', passwordResetLimiter, verifyResetToken);

module.exports = router;
