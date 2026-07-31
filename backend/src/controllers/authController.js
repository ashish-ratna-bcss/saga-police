const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const { createAuditLog } = require('../services/auditService');
const { sendPasswordResetEmail } = require('../utils/mailer');

const generateToken = (id) => {
  return jwt.sign({ user_id: id }, process.env.JWT_SECRET || 'blura-hub-secret-key-change-in-production', {
    expiresIn: '24h',
  });
};

const generateRefreshToken = (id) => {
  return jwt.sign({ user_id: id }, process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET || 'blura-hub-secret-key-change-in-production', {
    expiresIn: '7d',
  });
};

const getTokenFromRequest = (req) => {
  if (req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      return parts[1];
    }
    return req.headers.authorization;
  }
  if (req.headers['x-refresh-token']) {
    return req.headers['x-refresh-token'];
  }
  return req.body.refresh_token;
};

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res) => {
  try {
    const { email, password, full_name } = req.body;

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'role')) {
      return res.status(400).json({ message: 'role cannot be set on registration' });
    }

    if (!email || !password || !full_name) {
      return res.status(400).json({ message: 'Please add all fields' });
    }

    if (typeof email !== 'string' || typeof password !== 'string' || typeof full_name !== 'string') {
      return res.status(400).json({ message: 'Invalid field types' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return res.status(400).json({ message: 'Invalid email' });
    }
    if (password.length < 8 || password.length > 200) {
      return res.status(400).json({ message: 'Password must be 8–200 characters' });
    }
    if (full_name.length < 1 || full_name.length > 120) {
      return res.status(400).json({ message: 'Invalid full_name length' });
    }

    // Check if user exists
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      email,
      password: hashedPassword,
      full_name,
      role: 'level-1'
    });

    if (user) {
      res.status(201).json({
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        created_at: user.created_at
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Authenticate a user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check for user email
    const user = await User.findOne({ email });

    if (user && (await bcrypt.compare(password, user.password))) {
      if (!user.is_active) {
        return res.status(403).json({ message: 'Account is inactive' });
      }

      await createAuditLog(user, 'login', 'user', user.id, { ip: req.ip });

      const access_token = generateToken(user.id);
      const refresh_token = generateRefreshToken(user.id);
      const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await User.findByIdAndUpdate(user._id, {
        refreshToken: refresh_token,
        refreshTokenExpiresAt: refreshExpiresAt
      });

      res.json({
        access_token,
        refresh_token,
        token_type: 'bearer',
        expires_in: 24 * 60 * 60,
        refresh_expires_in: 7 * 24 * 60 * 60,
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role
        }
      });
    } else {
      // Optional: Log failed login attempts
      // await createAuditLog({ id: 'system', name: 'System' }, 'failed_login', 'user', null, { email, ip: req.ip });
      res.status(401).json({ message: 'Invalid credentials' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Refresh an access token
// @route   POST /api/auth/refresh
// @access  Public
const refreshToken = async (req, res) => {
  try {
    const token = getTokenFromRequest(req);

    if (!token) {
      return res.status(401).json({ message: 'Refresh token is required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET || 'blura-hub-secret-key-change-in-production');
    } catch (error) {
      return res.status(401).json({ message: 'Invalid or expired refresh token' });
    }

    const user = await User.findOne({ id: decoded.user_id });
    if (!user || !user.refreshToken || user.refreshToken !== token) {
      return res.status(401).json({ message: 'Refresh token not recognized' });
    }

    if (user.refreshTokenExpiresAt && user.refreshTokenExpiresAt < new Date()) {
      return res.status(401).json({ message: 'Refresh token expired' });
    }

    const access_token = generateToken(user.id);
    const refresh_token = generateRefreshToken(user.id);
    const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    user.refreshToken = refresh_token;
    user.refreshTokenExpiresAt = refreshExpiresAt;
    await user.save();

    res.json({
      access_token,
      refresh_token,
      token_type: 'bearer',
      expires_in: 24 * 60 * 60,
      refresh_expires_in: 7 * 24 * 60 * 60
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get user data
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  res.status(200).json(req.user);
};

// @desc    Send password-reset email
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Always return 200 to prevent email enumeration
    if (!user || !user.is_active) {
      return res.json({ message: 'If that email exists, a reset link has been sent.' });
    }

    // Generate a secure random token
    const rawToken = crypto.randomBytes(32).toString('hex');
    // Store a hash of the token (never store raw tokens)
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    await user.save();

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetUrl = `${frontendUrl}/reset-password/${rawToken}`;

    const sent = await sendPasswordResetEmail(user.email, resetUrl, user.full_name);
    if (!sent) {
      // Clear token if email failed so user can retry immediately
      user.passwordResetToken = null;
      user.passwordResetExpires = null;
      await user.save();
      return res.status(500).json({ message: 'Failed to send email. Please contact your administrator.' });
    }

    await createAuditLog(user, 'password_reset_requested', 'user', user.id, { ip: req.ip });

    res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (error) {
    console.error('[Auth] forgotPassword error:', error);
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};

// @desc    Reset password using token
// @route   POST /api/auth/reset-password/:token
// @access  Public
const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password || password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }

    // Validate password strength
    const strongRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;
    if (!strongRegex.test(password)) {
      return res.status(400).json({
        message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
      });
    }

    // Hash the incoming token and find a matching user
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ message: 'Reset token is invalid or has expired' });
    }

    // Set new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    user.passwordChangedAt = new Date();
    // Invalidate existing refresh tokens
    user.refreshToken = '';
    user.refreshTokenExpiresAt = null;
    await user.save();

    await createAuditLog(user, 'password_reset_completed', 'user', user.id, { ip: req.ip });

    res.json({ message: 'Password has been reset successfully. You can now log in.' });
  } catch (error) {
    console.error('[Auth] resetPassword error:', error);
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};

// @desc    Verify reset token is still valid
// @route   GET /api/auth/reset-password/:token/verify
// @access  Public
const verifyResetToken = async (req, res) => {
  try {
    const { token } = req.params;
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ valid: false, message: 'Reset token is invalid or has expired' });
    }

    res.json({ valid: true });
  } catch (error) {
    res.status(500).json({ valid: false, message: 'Verification failed' });
  }
};


// @desc    Internal SSO bridge for COPINT OSINT (localhost callers only)
// @route   GET /api/auth/sso-bridge
// @access  Private (Bearer JWT)
const ssoBridge = async (req, res) => {
  try {
    const clientIp = (req.headers['x-real-ip'] || req.ip || '').replace('::ffff:', '');
    const allowed = ['127.0.0.1', '::1', 'localhost'];
    if (!allowed.includes(clientIp)) {
      return res.status(403).json({ message: 'SSO bridge is restricted to internal callers' });
    }

    const user = await User.findOne({ id: req.user.id }).select('email full_name role password is_active');
    if (!user || !user.is_active) {
      return res.status(403).json({ message: 'User inactive or not found' });
    }

    res.json({
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      password_hash: user.password,
    });
  } catch (error) {
    console.error('[Auth] ssoBridge error:', error);
    res.status(500).json({ message: 'SSO bridge failed' });
  }
};

module.exports = {
  register,
  login,
  refreshToken,
  getMe,
  forgotPassword,
  resetPassword,
  verifyResetToken,
  ssoBridge,
};
