const { runFacebookProfile } = require('./runProfile');
const {
  startScheduler,
  stopScheduler,
  markInFlight,
  clearInFlight,
  isInFlight,
} = require('./scheduler');

/** Kickoff fetch for a Facebook profile (ignores poll interval once). */
const startProfile = async (profileId, { db, dbName } = {}) => {
  if (isInFlight(profileId, dbName)) return;
  markInFlight(profileId, dbName);
  try {
    await runFacebookProfile(profileId, { force: true, db, dbName });
  } finally {
    clearInFlight(profileId, dbName);
  }
};

/** Clear in-flight tracking; scheduler skips stopped profiles by status. */
const stopProfile = (profileId, { dbName } = {}) => {
  clearInFlight(profileId, dbName);
};

module.exports = {
  startProfile,
  stopProfile,
  startScheduler,
  stopScheduler,
  runFacebookProfile,
};
