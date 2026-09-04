const express = require('express');
const router = express.Router();
const {
    getAllPOIs,
    getPOIById,
    createPOI,
    updatePOI,
    deletePOI,
    getLatestReport,
    getPoiBySourceId,
    getPoiStats
} = require('../controllers/poiController');
const { authorize } = require('../middleware/auth.middleware');

 // router.use(authorize({ pages: ['/person-of-interest'] }));

router.get('/', getAllPOIs);
router.get('/stats', getPoiStats);
router.get('/by-source/:sourceId', getPoiBySourceId);
router.get('/:id/report/latest', getLatestReport);
router.get('/:id', getPOIById);
router.post('/', createPOI);
router.put('/:id', updatePOI);
router.delete('/:id', deletePOI);

module.exports = router;