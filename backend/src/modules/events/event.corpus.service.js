const dbOf = require('../../lib/dbOf');
const cfg = require('./event.config');

/**
 * Tenant-learned "generic" vocabulary: tokens that appear in a large share of
 * the tenant's own monitored posts (any language). Learned from data, so there
 * is no hardcoded word list and every tenant gets its own.
 */
const cache = new WeakMap(); // tenant prisma client -> { at, tokens }

const splitTokens = (text) =>
  String(text || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((t) => t.length >= 2);

const getGenericTokens = async (db) => {
  const prisma = dbOf(db);
  const hit = cache.get(prisma);
  if (hit && Date.now() - hit.at < cfg.corpusTtlMs) return hit.tokens;

  let tokens = new Set();
  try {
    const rows = await prisma.social_media_posts.findMany({
      select: { text: true },
      orderBy: { fetched_at: 'desc' },
      take: cfg.corpusSampleSize,
    });
    const docs = rows.map((r) => r.text).filter((t) => t && String(t).trim());
    if (docs.length >= cfg.minCorpusDocs) {
      const df = new Map();
      for (const d of docs) {
        for (const t of new Set(splitTokens(d))) df.set(t, (df.get(t) || 0) + 1);
      }
      const min = Math.ceil(docs.length * cfg.genericDocFreq);
      tokens = new Set([...df.entries()].filter(([, n]) => n >= min).map(([t]) => t));
      tokens.edge = new Set(
        [...df.entries()].filter(([, n]) => n >= Math.ceil(docs.length * cfg.edgeDocFreq)).map(([t]) => t)
      );
    }
  } catch (_) {
    /* catalog table missing/unreadable: fall back to structural rules only */
  }
  if (!tokens.edge) tokens.edge = new Set();
  cache.set(prisma, { at: Date.now(), tokens });
  return tokens;
};

module.exports = { getGenericTokens, splitTokens };
