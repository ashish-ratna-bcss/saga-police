const express = require('express');
const router = express.Router();
const { lookupPostLocation } = require('./postLocation.controller');

router.post('/lookup', lookupPostLocation);
router.get('/lookup', lookupPostLocation);

module.exports = router;
