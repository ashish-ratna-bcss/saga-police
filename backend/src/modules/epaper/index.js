const { startScheduler, stopScheduler } = require('./epaper.poller');

module.exports = {
  epaperRoutes: require('./epaper.routes'),
  startScheduler,
  stopScheduler,
};
