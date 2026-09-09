const express = require('express');
const router = express.Router();
const { getOsintToolsConfig } = require('./osintTools.controller');
const { authorize } = require('../../middleware/auth.middleware');

router.use(authorize());

router.get('/config', getOsintToolsConfig);

module.exports = router;
