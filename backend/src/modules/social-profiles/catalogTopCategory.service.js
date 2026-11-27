const { Prisma } = require('../../generated/tenant-client');
const dbOf = require('../../lib/dbOf');

/**
 * Profile Catalog "Category": the most common *meaningful* analysis category
 * on an account's analysed posts. Noise labels (Normal / Neutral / Monitor / …)
 * are ignored so a flood of benign posts cannot hide the real top category.
 * No DB write / no schema column.
 */

const NOISE = new Set(['normal', 'neutral', 'unknown', 'monitor', 'null', 'none', 'uncategorized', '']);

const formatCategory = (raw) => {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
  if (!cleaned) return null;
  return cleaned.replace(/\b\w/g, (ch) => ch.toUpperCase());
};

const isNoise = (category) => NOISE.has(String(category || '').trim().toLowerCase());

/**
 * Pick the highest (most frequent) non-noise category.
 * Tie-break: more high-risk hits, then medium-risk, then A→Z.
 */
const pickTopCategory = (rows = []) => {
  let best = null;
  for (const row of rows) {
    const category = formatCategory(row.category);
    const count = Number(row.count) || 0;
    const high = Number(row.high_count) || 0;
    const medium = Number(row.medium_count) || 0;
    if (!category || !count || isNoise(category)) continue;
    if (
      !best ||
      count > best.count ||
      (count === best.count && high > best.high) ||
      (count === best.count && high === best.high && medium > best.medium) ||
      (count === best.count &&
        high === best.high &&
        medium === best.medium &&
        String(category).localeCompare(String(best.category)) < 0)
    ) {
      best = { category, count, high, medium };
    }
  }
  return best;
};

/**
 * Attach `top_category` (+ count) to flattened account rows from each account's
 * own analysed posts.
 */
const attachTopCategoryToAccounts = async (accounts = [], { db } = {}) => {
  const prisma = dbOf(db);
  if (!accounts.length) return accounts;

  const accountIds = accounts.map((a) => a.id).filter((id) => Number.isInteger(id));
  if (!accountIds.length) {
    return accounts.map((a) => ({ ...a, top_category: null, top_category_count: 0 }));
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
      top_category: top?.category || null,
      top_category_count: top?.count || 0,
    };
  });
};

module.exports = {
  formatCategory,
  isNoise,
  pickTopCategory,
  attachTopCategoryToAccounts,
};
