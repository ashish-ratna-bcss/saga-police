const dbOf = require('../../../lib/dbOf');
const { runRedditProfile } = require('./runProfile');
const {
  startScheduler,
  stopScheduler,
  markInFlight,
  clearInFlight,
  isInFlight,
} = require('./scheduler');

const REDDIT_FIELDS = [
  {
    key: 'username',
    label: 'Username',
    type: 'text',
    required: true,
    placeholder: 'e.g. spez',
  },
];

/** Ensure Reddit exists in platforms catalog (Social Profiles picker). */
const ensureRedditPlatform = async ({ db } = {}) => {
  const prisma = dbOf(db);
  try {
    await prisma.platforms.upsert({
      where: { slug: 'reddit' },
      create: {
        slug: 'reddit',
        name: 'Reddit',
        icon: 'Reddit',
        color: '#FF4500',
        is_active: true,
        fields: REDDIT_FIELDS,
      },
      update: {
        is_active: true,
        icon: 'Reddit',
        color: '#FF4500',
        fields: REDDIT_FIELDS,
      },
    });
  } catch (err) {
    console.warn('[monitoringsocialmedia/reddit] ensure platform:', err.message);
  }
};

const startProfile = async (profileId, { db, dbName } = {}) => {
  await ensureRedditPlatform({ db });
  if (isInFlight(profileId, dbName)) return;
  markInFlight(profileId, dbName);
  try {
    await runRedditProfile(profileId, { force: true, db, dbName });
  } finally {
    clearInFlight(profileId, dbName);
  }
};

const stopProfile = (profileId, { dbName } = {}) => {
  clearInFlight(profileId, dbName);
};

const startSchedulerWrapped = () => {
  ensureRedditPlatform().catch(() => {});
  startScheduler();
};

module.exports = {
  startProfile,
  stopProfile,
  startScheduler: startSchedulerWrapped,
  stopScheduler,
  runRedditProfile,
  ensureRedditPlatform,
  REDDIT_FIELDS,
};
