const express = require('express');
const router = express.Router();
const { authorize } = require('../../middleware/auth.middleware');
const {
  getHealth,
  getSources,
  getArticles,
  getArticle,
  getSavedArticles,
  getSearches,
  getSearchArticles,
  deleteSearch,
} = require('./news.controller');

// The News module lives inside Analysis Tools, so it shares that page's access.
router.use(authorize({ pages: ['/analysis-tools'] }));

// Live (BluGate news-api)
// GET /api/news/health
router.get('/health', getHealth);
// GET /api/news/sources?country=&state=&language=&source=
router.get('/sources', getSources);
// GET /api/news/articles?keyword=&country=&language=&location=&state=&district=&source=&limit=&offset=&search_id=
//   → live results, also stored in the caller's tenant DB (response.saved = { search_id, stored })
router.get('/articles', getArticles);
// GET /api/news/articles/:articleId — live copy, else the tenant's stored copy
router.get('/articles/:articleId', getArticle);

// Stored in the caller's tenant DB
// GET /api/news/saved?keyword=&country=&language=&location=&state=&district=&source=&from=&to=&limit=&offset=
router.get('/saved', getSavedArticles);
// GET /api/news/searches?limit=&offset=
router.get('/searches', getSearches);
// GET /api/news/searches/:searchId/articles?limit=&offset=
router.get('/searches/:searchId/articles', getSearchArticles);
// DELETE /api/news/searches/:searchId — own searches only; articles stay saved
router.delete('/searches/:searchId', deleteSearch);

module.exports = router;
