const express = require('express');
const { authorize } = require('../../middleware/auth.middleware');
const {
  list,
  listAssignable,
  create,
  update,
  remove,
} = require('./role.controller');

const router = express.Router();

router.get('/assignable', authorize({ manageUsers: true }), listAssignable);
router.get('/', authorize({ manageRoles: true }), list);
router.post('/', authorize({ manageRoles: true }), create);
router.put('/:id', authorize({ manageRoles: true }), update);
router.delete('/:id', authorize({ manageRoles: true }), remove);

module.exports = router;
