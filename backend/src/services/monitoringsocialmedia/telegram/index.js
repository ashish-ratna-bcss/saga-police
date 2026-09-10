const dbOf = require('../../../lib/dbOf');
const { runTelegramProfile } = require('./runProfile');
const {
  startScheduler,
  stopScheduler,
  markInFlight,
  clearInFlight,
  isInFlight,
} = require('./scheduler');

const TELEGRAM_FIELDS = [
  { key: 'username', label: 'Username', type: 'text', required: false, placeholder: 'e.g. somchannel' },
  { key: 'url', label: 't.me URL', type: 'url', required: false, placeholder: 'https://t.me/...' },
  { key: 'channel_id', label: 'Channel ID', type: 'text', required: false, placeholder: 'numeric id' },
];

/** Ensure Telegram exists in platforms catalog (Social Profiles picker). */
const ensureTelegramPlatform = async ({ db } = {}) => {
  const prisma = dbOf(db);
  try {
    await prisma.platforms.upsert({
      where: { slug: 'telegram' },
      create: {
        slug: 'telegram',
        name: 'Telegram',
        icon: 'Telegram',
        color: '#229ED9',
        is_active: true,
        fields: TELEGRAM_FIELDS,
      },
      update: {
        is_active: true,
        icon: 'Telegram',
        color: '#229ED9',
        fields: TELEGRAM_FIELDS,
      },
    });
  } catch (err) {
    console.warn('[monitoringsocialmedia/telegram] ensure platform:', err.message);
  }
};

const startProfile = async (profileId, { db, dbName } = {}) => {
  await ensureTelegramPlatform({ db });
  if (isInFlight(profileId, dbName)) return;
  markInFlight(profileId, dbName);
  try {
    await runTelegramProfile(profileId, { force: true, db, dbName });
  } finally {
    clearInFlight(profileId, dbName);
  }
};

const stopProfile = (profileId, { dbName } = {}) => {
  clearInFlight(profileId, dbName);
};

const startSchedulerWrapped = () => {
  ensureTelegramPlatform().catch(() => {});
  startScheduler();
};

module.exports = {
  startProfile,
  stopProfile,
  startScheduler: startSchedulerWrapped,
  stopScheduler,
  runTelegramProfile,
  ensureTelegramPlatform,
};
