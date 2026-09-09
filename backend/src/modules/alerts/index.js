const alertRoutes = require('./alert.routes');
const keywordRoutes = require('./keyword.routes');
const alertService = require('./alert.service');
const alertController = require('./alert.controller');
const alertUtils = require('./alert.utils');
const alertKeywordService = require('./alert.keyword.service');
const alertEngagerService = require('./alert.engager.service');

module.exports = {
  alertRoutes,
  keywordRoutes,
  alertService,
  alertController,
  alertUtils,
  alertKeywordService,
  alertEngagerService,
  createAlertFromCatalogPost: alertService.createAlertFromCatalogPost,
  isCatalogStore: alertUtils.isCatalogStore,
};
