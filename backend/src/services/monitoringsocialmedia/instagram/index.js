const { runInstagramProfile } = require('./runProfile');
const {
  startScheduler,
  stopScheduler,
  markInFlight,
  clearInFlight,
  isInFlight,
} = require('./scheduler');

const startProfile = async (profileId) => {
  if (isInFlight(profileId)) return;
  markInFlight(profileId);
  try {
    await runInstagramProfile(profileId, { force: true });
  } finally {
    clearInFlight(profileId);
  }
};

const stopProfile = (profileId) => {
  clearInFlight(profileId);
};

module.exports = {
  startProfile,
  stopProfile,
  startScheduler,
  stopScheduler,
  runInstagramProfile,
};
