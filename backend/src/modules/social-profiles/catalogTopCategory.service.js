const { Prisma } = require('../../generated/tenant-client');
const dbOf = require('../../lib/dbOf');

/**
 * Profile Catalog "Category": pick the highest-risk meaningful category on an
 * account's analysed posts, then the most common within that risk tier.
 * Noise labels (Normal / Neutral / Monitor / …) are ignored.
 * No DB write / no schema column.
 */

const NOISE = new Set(['normal', 'neutral', 'unknown', 'monitor', 'null', 'none', 'uncategorized', '']);

/** Compact badge labels for the 12 default LE policy category_ids. */
const SHORT_LABELS = {
  COMMUNAL_INCITEMENT_RELIGIOUS_DISCORD: 'Communal Incitement',
  MISINFORMATION_CIVIC_ELECTION_DEEPFAKES: 'Misinfo / Deepfakes',
  CHILD_SEXUAL_EXPLOITATION_POCSO: 'CSE / POCSO',
  CYBER_HARASSMENT_WOMEN_SAFETY_DOXXING: 'Cyber Harassment',
  TERRORISM_EXTREMISM_SEPARATISM: 'Terrorism / Extremism',
  PUBLIC_DISORDER_MOB_VIOLENCE_INCITEMENT: 'Public Disorder',
  FINANCIAL_FRAUD_CYBER_CRIME_SCAMS: 'Financial Fraud',
  DRUGS_NARCOTICS_CONTRABAND_TRAFFICKING: 'Drugs / Narcotics',
  DEFAMATION_EXTORTION_IMPERSONATION_OF_OFFICIALS: 'Defamation / Extortion',
  ILLEGAL_WEAPONS_EXPLOSIVES_FIREARMS: 'Illegal Weapons',
  THREAT_TO_CRITICAL_INFRASTRUCTURE_CYBER_WARFARE: 'Critical Infrastructure',
  SUICIDE_SELF_HARM_CYBER_BULLYING: 'Self-harm / Bullying',
};

const toKey = (raw) =>
  String(raw || '')
    .trim()
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .toUpperCase();

const formatFullLabel = (raw) => {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
  if (!cleaned) return null;
  return cleaned.replace(/\b\w/g, (ch) => ch.toUpperCase());
};

const shortLabelOf = (raw) => {
  const key = toKey(raw);
  if (SHORT_LABELS[key]) return SHORT_LABELS[key];
  const full = formatFullLabel(raw);
  if (!full) return null;
  // Unknown / custom ids: keep first two Title-Case words so the badge stays short.
  const parts = full.split(' ').filter(Boolean);
  if (parts.length <= 3) return full;
  return `${parts.slice(0, 2).join(' ')}…`;
};

const isNoise = (category) => NOISE.has(String(category || '').trim().toLowerCase());

/**
 * Prefer categories that appear on high-risk posts, then medium, then any.
 * Within a tier, most frequent wins.
 */
const pickTopCategory = (rows = []) => {
  const usable = [];
  for (const row of rows) {
    const raw = String(row.category || '').trim();
    if (!raw || isNoise(raw)) continue;
    const count = Number(row.count) || 0;
    const high = Number(row.high_count) || 0;
    const medium = Number(row.medium_count) || 0;
    if (!count) continue;
    usable.push({
      key: toKey(raw),
      full: formatFullLabel(raw),
      label: shortLabelOf(raw),
      count,
      high,
      medium,
    });
  }
  if (!usable.length) return null;

  const byTier = (tier) => {
    const pool =
      tier === 'high'
        ? usable.filter((r) => r.high > 0)
        : tier === 'medium'
          ? usable.filter((r) => r.medium > 0)
          : usable;
    if (!pool.length) return null;
    pool.sort((a, b) => {
      const aScore = tier === 'high' ? a.high : tier === 'medium' ? a.medium : a.count;
      const bScore = tier === 'high' ? b.high : tier === 'medium' ? b.medium : b.count;
      if (bScore !== aScore) return bScore - aScore;
      if (b.count !== a.count) return b.count - a.count;
      return String(a.label).localeCompare(String(b.label));
    });
    return pool[0];
  };

  return byTier('high') || byTier('medium') || byTier('any');
};

/**
 * Attach top_category fields to flattened account rows from each account's
 * own analysed posts.
 */
const attachTopCategoryToAccounts = async (accounts = [], { db } = {}) => {
  const prisma = dbOf(db);
  if (!accounts.length) return accounts;

  const accountIds = accounts.map((a) => a.id).filter((id) => Number.isInteger(id));
  if (!accountIds.length) {
    return accounts.map((a) => ({
      ...a,
      top_category: null,
      top_category_key: null,
      top_category_full: null,
      top_category_count: 0,
    }));
  }

  const rows = await prisma.$queryRaw`
    SELECT
      account_id,
      coalesce(
        nullif(
          regexp_replace(
            initcap(replace(replace(trim(analysis_result->>'category'), '_', ' '), '-', ' ')),
            '\\s+',
            ' ',
            'g'
          ),
          ''
        ),
        'Normal'
      ) AS category,
      COUNT(*)::int AS count,
      COUNT(*) FILTER (
        WHERE lower(coalesce(analysis_result->>'risk_level', '')) IN ('high', 'critical')
      )::int AS high_count,
      COUNT(*) FILTER (
        WHERE lower(coalesce(analysis_result->>'risk_level', '')) = 'medium'
      )::int AS medium_count
    FROM social_media_posts
    WHERE account_id IN (${Prisma.join(accountIds)})
      AND analysis_status = 'done'
      AND nullif(trim(analysis_result->>'category'), '') IS NOT NULL
    GROUP BY account_id, 2
  `;

  const byAccount = new Map();
  for (const row of rows || []) {
    const id = Number(row.account_id);
    if (!Number.isInteger(id)) continue;
    if (!byAccount.has(id)) byAccount.set(id, []);
    byAccount.get(id).push(row);
  }

  return accounts.map((account) => {
    const top = pickTopCategory(byAccount.get(account.id) || []);
    return {
      ...account,
      top_category: top?.label || null,
      top_category_key: top?.key || null,
      top_category_full: top?.full || null,
      top_category_count: top?.count || 0,
    };
  });
};

module.exports = {
  SHORT_LABELS,
  toKey,
  formatFullLabel,
  shortLabelOf,
  isNoise,
  pickTopCategory,
  attachTopCategoryToAccounts,
};
