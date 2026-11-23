const dbOf = require('../../lib/dbOf');

/**
 * Profile Catalog "Relevance": how much attention an account's recent alerts deserve, 0-100.
 * Only the account's OWN alerts count (an account never borrows its sibling accounts' alerts).
 *
 *   points   each alert in the last 30 days: high 25, medium 10, low 0 (low-risk noise adds nothing),
 *            weighted by age: up to 7 days x1, up to 14 days x0.75, older x0.5
 *   volume   plus up to 20 when many of the account's own posts raised a high / medium alert
 *            (10% or more of its posts in the window gets the full 20; fewer gets a proportional share)
 *   level    70+ highly relevant, 30-69 moderately relevant, below 30 low relevance, no alerts at all: none
 *
 * The level, label and hint are returned with the score, so every screen says the same thing the numbers say.
 * No DB write / no schema column.
 */
const WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const POINTS = { high: 25, medium: 10, low: 0 };
const VOLUME_BONUS_MAX = 20;
const VOLUME_FULL_SHARE = 0.1;
const LEVELS = { high: 70, medium: 30 };

const recencyWeight = (ageDays) => (ageDays <= 7 ? 1 : ageDays <= 14 ? 0.75 : 0.5);

const describe = (level, { high, medium, low }) => {
  const mix = [high && `${high} high`, medium && `${medium} medium`, low && `${low} low`].filter(Boolean).join(', ');
  if (level === 'none') return { label: 'No recent alerts', hint: `No alerts in the last ${WINDOW_DAYS} days` };
  const label = level === 'high' ? 'Highly relevant' : level === 'medium' ? 'Moderately relevant' : 'Low relevance';
  return { label, hint: `${mix} in the last ${WINDOW_DAYS} days` };
};

/**
 * @param {Array<{ risk_level?: string, posted_at?: Date|string|null, created_at?: Date|string|null }>} alerts  this account's alerts in the window
 * @param {{ postCount?: number, now?: number }} [opts]  postCount = the account's posts in the same window
 */
const computeAccountRelevance = (alerts = [], { postCount = 0, now = Date.now() } = {}) => {
  let high = 0;
  let medium = 0;
  let low = 0;
  let recent7 = 0;
  let severity = 0;

  for (const alert of alerts) {
    const risk = String(alert.risk_level || 'low').toLowerCase();
    const level = risk === 'high' || risk === 'critical' ? 'high' : risk === 'medium' ? 'medium' : 'low';
    if (level === 'high') high++;
    else if (level === 'medium') medium++;
    else low++;

    const when = new Date(alert.posted_at || alert.created_at || now).getTime();
    const ageDays = Number.isFinite(when) ? Math.max(0, (now - when) / DAY_MS) : WINDOW_DAYS;
    if (ageDays <= 7) recent7++;
    severity += POINTS[level] * recencyWeight(ageDays);
  }

  const serious = high + medium;
  const posts = Math.max(Number(postCount) || 0, serious);
  const volume = serious ? Math.round(VOLUME_BONUS_MAX * Math.min(1, serious / posts / VOLUME_FULL_SHARE)) : 0;
  const score = serious ? Math.min(100, Math.round(severity + volume)) : 0;

  const level = !alerts.length ? 'none' : score >= LEVELS.high ? 'high' : score >= LEVELS.medium ? 'medium' : 'low';
  return {
    score,
    level,
    ...describe(level, { high, medium, low }),
    total_alerts: alerts.length,
    high_alerts: high,
    medium_alerts: medium,
    low_alerts: low,
    recent_alerts_7d: recent7,
    posts_in_window: Number(postCount) || 0,
    window_days: WINDOW_DAYS,
    computed_at: new Date(now).toISOString(),
  };
};

/**
 * Attach dynamically computed `relevance` to flattened account rows, from each account's own alerts and posts
 * in the last 30 days (two grouped reads, whatever the number of rows).
 */
const attachRelevanceToAccounts = async (accounts = [], { db } = {}) => {
  const prisma = dbOf(db);
  if (!accounts.length) return accounts;

  const accountIds = accounts.map((a) => a.id).filter((id) => Number.isInteger(id));
  const windowStart = new Date(Date.now() - WINDOW_DAYS * DAY_MS);

  const [alerts, postCounts] = accountIds.length
    ? await Promise.all([
        prisma.social_media_alerts.findMany({
          where: {
            account_id: { in: accountIds },
            OR: [
              { posted_at: { gte: windowStart } },
              { AND: [{ posted_at: null }, { created_at: { gte: windowStart } }] },
            ],
          },
          select: { account_id: true, risk_level: true, posted_at: true, created_at: true },
        }),
        prisma.social_media_posts.groupBy({
          by: ['account_id'],
          // posted_at only, so the existing (account_id, posted_at) index answers it.
          where: { account_id: { in: accountIds }, posted_at: { gte: windowStart } },
          _count: { _all: true },
        }),
      ])
    : [[], []];

  const alertsBy = new Map();
  for (const alert of alerts) {
    if (!alertsBy.has(alert.account_id)) alertsBy.set(alert.account_id, []);
    alertsBy.get(alert.account_id).push(alert);
  }
  const postsBy = new Map(postCounts.map((p) => [p.account_id, p._count._all]));

  const now = Date.now();
  return accounts.map((account) => ({
    ...account,
    relevance: computeAccountRelevance(alertsBy.get(account.id) || [], { postCount: postsBy.get(account.id) || 0, now }),
  }));
};

module.exports = {
  computeAccountRelevance,
  attachRelevanceToAccounts,
  WINDOW_DAYS,
  LEVELS,
};
