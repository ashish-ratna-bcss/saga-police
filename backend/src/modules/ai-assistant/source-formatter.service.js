/**
 * Enrich retrieved chunks with source metadata (best-effort).
 */

async function enrichSources(prisma, chunks = []) {
  const out = [];
  for (const c of chunks) {
    const base = {
      chunk_id: c.chunk_id,
      source_table: c.source_table,
      source_id: c.source_id,
      similarity_score: c.similarity_score,
      excerpt: String(c.content || '').slice(0, 400),
      metadata: {
        title: null,
        platform: null,
        published_at: null,
        url: null,
      },
    };
    try {
      const meta = await lookupSource(prisma, c.source_table, c.source_id);
      if (meta) base.metadata = { ...base.metadata, ...meta };
    } catch {
      /* ignore */
    }
    out.push(base);
  }
  return out;
}

async function lookupSource(prisma, table, id) {
  if (table === 'social_media_posts') {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT left(coalesce(text,''), 120) AS title, platform, posted_at AS published_at, url
       FROM social_media_posts WHERE id = $1::bigint LIMIT 1`,
      id
    );
    return rows[0] || null;
  }
  if (table === 'social_media_alerts') {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT title,
              platform, risk_level, coalesce(posted_at, created_at) AS published_at,
              content_url AS url
       FROM social_media_alerts WHERE id = $1::bigint LIMIT 1`,
      id
    );
    return rows[0] || null;
  }
  if (table === 'social_media_grievances') {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT left(coalesce(text, ''), 120) AS title,
              platform, posted_at AS published_at, content_url AS url
       FROM social_media_grievances WHERE id = $1::bigint LIMIT 1`,
      id
    );
    return rows[0] || null;
  }
  if (table === 'social_media_events') {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT name AS title, NULL::text AS platform, start_date AS published_at, NULL::text AS url
       FROM social_media_events WHERE id = $1::bigint LIMIT 1`,
      id
    );
    return rows[0] || null;
  }
  if (table === 'news_articles') {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT title, language AS platform, published_at, url
       FROM news_articles WHERE article_id = $1 LIMIT 1`,
      id
    );
    return rows[0] || null;
  }
  return null;
}

/** Deep-link hints for the UI (frontend may map further). */
function sourceHref(sourceTable, sourceId) {
  switch (sourceTable) {
    case 'social_media_alerts':
      return `/alerts`;
    case 'social_media_grievances':
      return `/grievances`;
    case 'social_media_events':
      return `/events`;
    case 'social_media_posts':
      return `/analytics-hub`;
    case 'news_articles':
      return `/analysis-tools/news`;
    default:
      return null;
  }
}

module.exports = {
  enrichSources,
  lookupSource,
  sourceHref,
};
