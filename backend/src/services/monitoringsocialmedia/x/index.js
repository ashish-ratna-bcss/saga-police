const { runXProfile } = require('./runProfile');
const {
  startScheduler,
  stopScheduler,
  markInFlight,
  clearInFlight,
  isInFlight,
} = require('./scheduler');

const startProfile = async (accountId, { db, dbName } = {}) => {
  if (isInFlight(accountId, dbName)) return;
  markInFlight(accountId, dbName);
  try {
    await runXProfile(accountId, { force: true, db, dbName });
  } finally {
    clearInFlight(accountId, dbName);
  }
};

const stopProfile = (accountId, { dbName } = {}) => {
  clearInFlight(accountId, dbName);
};

module.exports = {
  startProfile,
  stopProfile,
  startScheduler,
  stopScheduler,
  runXProfile,
};
