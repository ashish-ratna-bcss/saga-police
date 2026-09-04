const express = require('express');
const router = express.Router();
const sourceController = require('../controllers/sourceController');
const { 
  getSources, 
  createSource, 
  updateSource, 
  deleteSource, 
  manualCheck, 
  toggleSourceStatus, 
  scanNow, 
  scanAllSources, 
  createSourcesBulk, 
  getInstagramProfile,
  resolveSourceIdentity,
  refreshSourceIdentity,
  recomputeSourceRelevance
} = sourceController;

const { authorize } = require('../middleware/auth.middleware');

const SOURCE_ALLOWED_PAGES = [
  '/sources',
  '/global-search',
  '/surveillance',
  '/person-of-interest',
  '/monitors',
  '/x-monitor',
  '/facebook-monitor',
  '/instagram-monitor',
  '/youtube-monitor'
];

router.use(authorize({ pages: SOURCE_ALLOWED_PAGES }));

router.route('/')
  .get(authorize({ pages: ['/monitors'] }), getSources)
  .post(authorize({ pages: ['/monitors'] }), createSource);

router.post('/bulk', authorize({ pages: ['/monitors'] }), createSourcesBulk);
router.post('/recompute-relevance', recomputeSourceRelevance);
router.post('/scan-all', authorize({ pages: ['/monitors'] }), scanAllSources);
router.post('/resolve-identity', authorize({ pages: ['/monitors'] }), resolveSourceIdentity);

// Get escalation counts per source (count of Reports by matching handle to source identifier)
router.get('/escalation-counts', async (req, res) => {
  try {
    const Report = require('../models/Report');
    const Source = require('../models/Source');

    // Get all report counts grouped by handle (lowercased)
    const reportsByHandle = await Report.aggregate([
      { $match: { 'target_user_details.handle': { $ne: null } } },
      { $group: { _id: { $toLower: '$target_user_details.handle' }, count: { $sum: 1 } } }
    ]);

    // Build a lookup map: lowercase handle -> count (strip @ prefix too)
    const handleMap = {};
    reportsByHandle.forEach(r => {
      const raw = r._id || '';
      handleMap[raw] = (handleMap[raw] || 0) + r.count;
      const stripped = raw.replace(/^@/, '');
      if (stripped !== raw) handleMap[stripped] = (handleMap[stripped] || 0) + r.count;
    });

    // Get all sources and match by identifier
    const sources = await Source.find({}, { id: 1, identifier: 1 }).lean();
    const counts = {};
    sources.forEach(s => {
      const id = (s.identifier || '').toLowerCase();
      const count = handleMap[id] || handleMap['@' + id] || 0;
      if (count > 0) counts[s.id] = count;
    });

    res.json(counts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.route('/:id')
  .put(updateSource)
  .delete(deleteSource);

router.post('/:id/check', manualCheck);
router.post('/:id/scan', scanNow);
router.post('/:id/refresh-identity', refreshSourceIdentity);
router.post('/:id/recompute-relevance', recomputeSourceRelevance);
router.put('/:id/toggle', toggleSourceStatus);
router.get('/:id/instagram-profile', authorize({ pages: ['/monitors'] }), getInstagramProfile);

module.exports = router;
