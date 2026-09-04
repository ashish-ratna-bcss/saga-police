const express = require('express');
const { getRoles, getAssignableRoles, postRole, putRole, removeRole } = require('./role.controller');
const { authorize } = require('../../middleware/auth.middleware');

const router = express.Router();

// Any user who can manage accounts needs to see which roles they're allowed
// to hand out — this must stay outside the manageRoles gate below.
router.get('/assignable', authorize({ manageUsers: true }), getAssignableRoles);

router.use(authorize({ manageRoles: true }));

router.get('/', getRoles);
router.post('/', postRole);
router.put('/:id', putRole);
router.delete('/:id', removeRole);

module.exports = router;
