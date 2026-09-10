const { runInstagramProfile } = require('./runProfile');
const {
  startScheduler,
  stopScheduler,
  markInFlight,
  clearInFlight,
  isInFlight,
} = require('./scheduler');

const startProfile = async (profileId, { db, dbName } = {}) => {
  if (isInFlight(profileId, dbName)) return;
  markInFlight(profileId, dbName);
  try {
    await runInstagramProfile(profileId, { force: true, db, dbName });
  } finally {
    clearInFlight(profileId, dbName);
  }
};

const stopProfile = (profileId, { dbName } = {}) => {
  clearInFlight(profileId, dbName);
};

module.exports = {
  startProfile,
  stopProfile,
  startScheduler,
  stopScheduler,
  runInstagramProfile,
};
