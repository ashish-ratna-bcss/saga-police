const express = require('express');
const {
    getPolicies,
    getPolicy,
    createPolicy,
    updatePolicy,
    deletePolicy
} = require('./policy.controller');

const router = express.Router();

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
