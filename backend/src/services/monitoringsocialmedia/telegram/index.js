const prisma = require('../../../../prisma/client');
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
const ensureTelegramPlatform = async () => {
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

const startProfile = async (profileId) => {
  await ensureTelegramPlatform();
  if (isInFlight(profileId)) return;
  markInFlight(profileId);
  try {
    await runTelegramProfile(profileId, { force: true });
  } finally {
    clearInFlight(profileId);
  }
};

const stopProfile = (profileId) => {
  clearInFlight(profileId);
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
