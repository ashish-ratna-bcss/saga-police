const express = require('express');
const { authorize } = require('../../middleware/auth.middleware');
const c = require('./integration.controller');

const router = express.Router();
const PAGES = ['/settings', '/social-profiles', '/setup'];

router.use(authorize({ pages: PAGES }));

router.get('/blugate', c.getBlugate);
router.post('/blugate/fetch', c.fetchBlugate);

router.get('/custom', c.listCustomEndpoints);
router.post('/custom', c.createCustomEndpoint);
router.put('/custom/:id', c.updateCustomEndpoint);
router.delete('/custom/:id', c.deleteCustomEndpoint);

module.exports = router;
