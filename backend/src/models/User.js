const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const userSchema = new mongoose.Schema({
  id: {
    type: String,
    default: uuidv4,
    unique: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  full_name: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['superadmin', 'level-1', 'level-2'],
    default: 'level-1'
  },
  is_active: {
    type: Boolean,
    default: true
  },
  refreshToken: {
    type: String,
    default: ''
  },
  refreshTokenExpiresAt: {
    type: Date
  },
  passwordResetToken: {
    type: String,
    default: null
  },
  passwordResetExpires: {
    type: Date,
    default: null
  },
  passwordChangedAt: {
    type: Date
  },
  created_at: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('User', userSchema);
