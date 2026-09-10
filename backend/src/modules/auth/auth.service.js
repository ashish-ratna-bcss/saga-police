const jwt = require('jsonwebtoken');
const prisma = require('../../../prisma/client');
const { getJwtSecret, getJwtExpiresIn } = require('../../config/env');

const generateToken = (id, db_name = null) =>
  jwt.sign({ user_id: id, db_name }, getJwtSecret(), { expiresIn: getJwtExpiresIn() });

const findUserWithRole = async (where) =>
  prisma.users.findFirst({ where, include: { roles: true } });

module.exports = {
  generateToken,
  findUserWithRole,
};
