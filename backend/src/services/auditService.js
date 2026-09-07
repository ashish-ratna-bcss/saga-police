const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

const createAuditLog = async (user, action, resourceType, resourceId = null, details = null) => {
  // Mongo is opt-in; do not block login/API on buffering timeouts when disconnected.
  if (mongoose.connection.readyState !== 1) {
    return;
  }

  try {
    await AuditLog.create({
      user_id: user.id,
      user_email: user.email,
      user_name: user.full_name || user.name || user.email,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      details: details || {}
    });
  } catch (error) {
    logger.error(`Failed to create audit log: ${error.message}`);
  }
};

module.exports = { createAuditLog };
