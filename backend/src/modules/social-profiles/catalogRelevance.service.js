const dbOf = require('../../lib/dbOf');

const WINDOW_DAYS = 30;

const computeAccountRelevance = (alerts = []) => {
  let high = 0;
  let medium = 0;
  let low = 0;

  for (const alert of alerts) {
    const risk = String(alert.risk_level || 'low').toLowerCase();
    if (risk === 'high') high++;
    else if (risk === 'medium') medium++;
    else low++;
  }

  const rawScore = (high * 30) + (medium * 15) + (low * 5);
  const score = Math.min(100, rawScore);

  return {
    score,
    total_alerts: alerts.length,
    high_alerts: high,
    medium_alerts: medium,
    low_alerts: low,
    computed_at: new Date().toISOString(),
  };
};

/**
 * Attach dynamically computed `relevance` to flattened account rows based on ALERTS.
 * Alerts: this account first; if none, sibling accounts on the same profile.
 * No DB write / no schema column.
 */
const attachRelevanceToAccounts = async (accounts = [], { db } = {}) => {
  const prisma = dbOf(db);
  if (!accounts.length) return accounts;

  const accountIds = accounts.map((a) => a.id).filter((id) => Number.isInteger(id));
  const profileIds = [
    ...new Set(accounts.map((a) => a.profile_id).filter((id) => Number.isInteger(id))),
  ];

  const accountToProfile = new Map();
  let fetchIds = [...accountIds];

  if (profileIds.length) {
    const siblings = await prisma.social_media_accounts.findMany({
      where: { profile_id: { in: profileIds } },
      select: { id: true, profile_id: true },
    });
    for (const s of siblings) accountToProfile.set(s.id, s.profile_id);
    fetchIds = [...new Set(siblings.map((s) => s.id))];
  } else {
    for (const a of accounts) {
      if (Number.isInteger(a.id)) accountToProfile.set(a.id, a.profile_id ?? null);
    }
  }

  const windowStart = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const alerts = fetchIds.length
    ? await prisma.social_media_alerts.findMany({
        where: {
          account_id: { in: fetchIds },
          OR: [
            { posted_at: { gte: windowStart } },
            { AND: [{ posted_at: null }, { created_at: { gte: windowStart } }] },
          ],
        },
        select: { account_id: true, risk_level: true },
      })
    : [];

  const byAccount = new Map();
  const byProfile = new Map();
  for (const alert of alerts) {
    if (!byAccount.has(alert.account_id)) byAccount.set(alert.account_id, []);
    byAccount.get(alert.account_id).push(alert);

    const pid = accountToProfile.get(alert.account_id);
    if (pid != null) {
      if (!byProfile.has(pid)) byProfile.set(pid, []);
      byProfile.get(pid).push(alert);
    }
  }

  return accounts.map((account) => {
    const own = byAccount.get(account.id) || [];
    const profileAlerts =
      account.profile_id != null ? byProfile.get(account.profile_id) || [] : [];
    const alertsForScore = own.length ? own : profileAlerts;

    return {
      ...account,
      relevance: computeAccountRelevance(alertsForScore),
    };
  });
};

module.exports = {
  computeAccountRelevance,
  attachRelevanceToAccounts,
  WINDOW_DAYS,
};
