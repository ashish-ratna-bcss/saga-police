const { runFacebookProfile } = require('./runProfile');
const {
  startScheduler,
  stopScheduler,
  markInFlight,
  clearInFlight,
  isInFlight,
} = require('./scheduler');

/** Kickoff fetch for a Facebook profile (ignores poll interval once). */
const startProfile = async (profileId) => {
  if (isInFlight(profileId)) return;
  markInFlight(profileId);
  try {
    await runFacebookProfile(profileId, { force: true });
  } finally {
    clearInFlight(profileId);
  }
};

/** Clear in-flight tracking; scheduler skips stopped profiles by status. */
const stopProfile = (profileId) => {
  clearInFlight(profileId);
};

module.exports = {
  startProfile,
  stopProfile,
  startScheduler,
  stopScheduler,
  runFacebookProfile,
};
