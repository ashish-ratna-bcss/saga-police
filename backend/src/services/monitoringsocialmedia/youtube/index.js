const { runYouTubeProfile } = require('./runProfile');
const {
  startScheduler,
  stopScheduler,
  markInFlight,
  clearInFlight,
  isInFlight,
} = require('./scheduler');

const startProfile = async (accountId) => {
  if (isInFlight(accountId)) return;
  markInFlight(accountId);
  try {
    await runYouTubeProfile(accountId, { force: true });
  } finally {
    clearInFlight(accountId);
  }
};

const stopProfile = (accountId) => {
  clearInFlight(accountId);
};

module.exports = {
  startProfile,
  stopProfile,
  startScheduler,
  stopScheduler,
  runYouTubeProfile,
};
