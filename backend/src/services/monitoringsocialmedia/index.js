const prisma = require('../../../prisma/client');
const facebook = require('./facebook');
const x = require('./x');
const youtube = require('./youtube');

const ADAPTERS = {
  facebook,
  x,
  twitter: x, // alias
  youtube,
  // instagram intentionally omitted
};

const resolveSlug = async (accountId) => {
  const row = await prisma.social_media_accounts.findUnique({
    where: { id: accountId },
    include: { platforms: { select: { slug: true } } },
  });
  return row?.platforms?.slug || null;
};

/** Route Start kickoff to the right platform folder. */
const startProfile = async (accountId) => {
  const slug = await resolveSlug(accountId);
  const adapter = ADAPTERS[slug];
  if (adapter?.startProfile) {
    return adapter.startProfile(accountId);
  }
  console.log(
    `[monitoringsocialmedia] start skipped — no adapter for platform "${slug}" (id=${accountId})`
  );
};

/** Route Stop cleanup. */
const stopProfile = async (accountId) => {
  const slug = await resolveSlug(accountId);
  const adapter = ADAPTERS[slug];
  if (adapter?.stopProfile) {
    return adapter.stopProfile(accountId);
  }
};

/** Boot all platform schedulers (Facebook, X, YouTube — not Instagram). */
const startScheduler = () => {
  facebook.startScheduler();
  x.startScheduler();
  youtube.startScheduler();
};

const stopScheduler = () => {
  facebook.stopScheduler();
  x.stopScheduler();
  youtube.stopScheduler();
};

module.exports = {
  startProfile,
  stopProfile,
  startScheduler,
  stopScheduler,
};
