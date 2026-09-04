const express = require('express');
const {
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  getUserPermissions,
  updateUserPermissions,
} = require('./user.controller');
const { authorize } = require('../../middleware/auth.middleware');

const router = express.Router();

router.use(authorize({ manageUsers: true }));

router.get('/', getAllUsers);
router.post('/', createUser);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);
router.get('/:id/permissions', getUserPermissions);
router.put('/:id/permissions', updateUserPermissions);

module.exports = router;
