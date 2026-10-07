const express = require('express');
const router = express.Router();
const { authorize } = require('../../middleware/auth.middleware');
const {
  getHealth,
  getSources,
  getArticles,
  collect,
  getArticle,
  getSearches,
  deleteSearch,
} = require('./news.controller');

// The News module lives inside Analysis Tools, so it shares that page's access.
router.use(authorize({ pages: ['/analysis-tools'] }));

// Live (BluGate news-api)
// GET /api/news/health
router.get('/health', getHealth);
// GET /api/news/sources?country=&state=&language=&source=
router.get('/sources', getSources);

// The caller's tenant DB — the News page only ever shows these
// GET /api/news/articles?keyword=&min_match=&country=&language=&location=&state=&district=&source=&from=&to=&limit=&offset=
router.get('/articles', getArticles);
// GET /api/news/articles/:articleId — saved copy (live fallback)
router.get('/articles/:articleId', getArticle);

// POST /api/news/collect  { keyword, country, language, state, district, source, location, min_match, search_id }
//   → fetch the latest matching articles live and save them: { search_id, fetched, new, live_count, pending_sources }
router.post('/collect', collect);

// Search history
// GET /api/news/searches?limit=&offset=
router.get('/searches', getSearches);
// DELETE /api/news/searches/:searchId — own searches only; articles stay saved
router.delete('/searches/:searchId', deleteSearch);

module.exports = router;
