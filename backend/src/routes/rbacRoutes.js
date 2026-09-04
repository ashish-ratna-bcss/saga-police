/**
 * @deprecated Legacy /api/rbac mount — prefer flat /api/users, /api/roles, /api/me/permissions
 */
const express = require('express');
const {
  getAllPages,
  getAllUsers,
  createUser,
  getUserPermissions,
  updateUserPermissions,
  getMyPermissions,
  updateUser,
  deleteUser,
} = require('../modules/user/user.controller');
const { authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authorize());

router.get('/my-permissions', getMyPermissions);
router.get('/pages', authorize({ manageUsers: true }), getAllPages);
router.get('/users', authorize({ manageUsers: true }), getAllUsers);
router.post('/users', authorize({ manageUsers: true }), createUser);
router.put('/users/:id', authorize({ manageUsers: true }), updateUser);
router.delete('/users/:id', authorize({ manageUsers: true }), deleteUser);
router.get('/permissions/:id', authorize({ manageUsers: true }), getUserPermissions);
router.put('/permissions/:id', authorize({ manageUsers: true }), updateUserPermissions);

router.put('/users/:userId', authorize({ manageUsers: true }), (req, res, next) => {
  req.params.id = req.params.userId;
  return updateUser(req, res, next);
});
router.delete('/users/:userId', authorize({ manageUsers: true }), (req, res, next) => {
  req.params.id = req.params.userId;
  return deleteUser(req, res, next);
});
router.get('/permissions/:userId', authorize({ manageUsers: true }), (req, res, next) => {
  req.params.id = req.params.userId;
  return getUserPermissions(req, res, next);
});
router.put('/permissions/:userId', authorize({ manageUsers: true }), (req, res, next) => {
  req.params.id = req.params.userId;
  return updateUserPermissions(req, res, next);
});

module.exports = router;
