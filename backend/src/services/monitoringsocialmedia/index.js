const dbOf = require('../../lib/dbOf');
const facebook = require('./facebook');
const x = require('./x');
const youtube = require('./youtube');
const instagram = require('./instagram');
const telegram = require('./telegram');

const ADAPTERS = {
  facebook,
  x,
  twitter: x,
  youtube,
  instagram,
  telegram,
};

const resolveSlug = async (accountId, { db } = {}) => {
  const prisma = dbOf(db);
  const row = await prisma.social_media_accounts.findUnique({
    where: { id: accountId },
    include: { platforms: { select: { slug: true } } },
  });
  return row?.platforms?.slug || null;
};

/** Route Start kickoff to the right platform folder. */
const startProfile = async (accountId, { db, dbName } = {}) => {
  const slug = await resolveSlug(accountId, { db });
  const adapter = ADAPTERS[slug];
  if (adapter?.startProfile) {
    return adapter.startProfile(accountId, { db, dbName });
  }
  console.log(
    `[monitoringsocialmedia] start skipped — no adapter for platform "${slug}" (id=${accountId})`
  );
};

/** Route Stop cleanup. */
const stopProfile = async (accountId, { db, dbName } = {}) => {
  const slug = await resolveSlug(accountId, { db });
  const adapter = ADAPTERS[slug];
  if (adapter?.stopProfile) {
    return adapter.stopProfile(accountId, { db, dbName });
  }
};

/** Boot all platform schedulers. */
const startScheduler = () => {
  facebook.startScheduler();
  x.startScheduler();
  youtube.startScheduler();
  instagram.startScheduler();
  telegram.startScheduler();
};

const stopScheduler = () => {
  facebook.stopScheduler();
  x.stopScheduler();
  youtube.stopScheduler();
  instagram.stopScheduler();
  telegram.stopScheduler();
};

module.exports = {
  startProfile,
  stopProfile,
  startScheduler,
  stopScheduler,
};
