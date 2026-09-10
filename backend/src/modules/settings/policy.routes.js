const express = require('express');
const {
    getPolicies,
    getPolicy,
    createPolicy,
    updatePolicy,
    deletePolicy
} = require('./policy.controller');
const { authorize } = require('../../middleware/auth.middleware');

const router = express.Router();

router.use(authorize());

router
    .route('/')
    .get(getPolicies)
    .post(createPolicy);

router
    .route('/:id')
    .get(getPolicy)
    .put(updatePolicy)
    .delete(deletePolicy);

module.exports = router;
