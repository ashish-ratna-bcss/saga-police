const jwt = require('jsonwebtoken');
const prisma = require('../../../prisma/client');
const { getJwtSecret, getJwtExpiresIn } = require('../../config/env');

const generateToken = (id, db_name = null) =>
  jwt.sign({ user_id: id, db_name }, getJwtSecret(), { expiresIn: getJwtExpiresIn() });

const findUserWithRole = async (where) =>
  prisma.users.findFirst({
    where,
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      password: true,
      role_id: true,
      created_by: true,
      db_name: true,
      allowed_pages: true,
      allowed_platforms: true,
      can_manage_users: true,
      can_manage_roles: true,
      max_profiles: true,
      max_users: true,
      ui_mode: true,
      theme_color: true,
      application_details: true,
      port: true,
      logo_mime: true,
      created_at: true,
      updated_at: true,
      roles: true,
    },
  });

module.exports = {
  generateToken,
  findUserWithRole,
};
