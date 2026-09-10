const dbOf = require('../../lib/dbOf');
const { enqueuePost } = require('../sentimentanalysis');

/**
 * Upsert a normalized post into social_media_posts.
 * New posts (and text changes) are queued for sentiment analysis.
 * @param {object} row
 * @param {{ db?: object, dbName?: string|null }} [options]
 * @returns {{ created: boolean, id: bigint|number }}
 */
const upsertPost = async (row, { db, dbName } = {}) => {
  const prisma = dbOf(db);
  const platform = String(row.platform || '').toLowerCase();
  const external_id = String(row.external_id || '');
  if (!platform || !external_id) {
    throw new Error('platform and external_id are required');
  }

  const existing = await prisma.social_media_posts.findUnique({
    where: { platform_external_id: { platform, external_id } },
    select: { id: true, text: true, analysis_status: true },
  });

  const data = {
    account_id: row.account_id,
    platform,
    external_id,
    url: row.url || null,
    text: row.text || null,
    author_name: row.author_name || null,
    author_handle: row.author_handle || null,
    media_type: row.media_type || null,
    media_urls: row.media_urls || [],
    engagement: row.engagement || {},
    posted_at: row.posted_at || null,
    raw_data: row.raw_data || {},
    fetched_at: new Date(),
  };

  if (existing) {
    const textChanged =
      String(existing.text || '').trim() !== String(data.text || '').trim();
    const shouldReanalyze =
      textChanged ||
      existing.analysis_status === 'pending' ||
      existing.analysis_status === 'failed';

    const updated = await prisma.social_media_posts.update({
      where: { id: existing.id },
      data: {
        url: data.url,
        text: data.text,
        author_name: data.author_name,
        author_handle: data.author_handle,
        media_type: data.media_type,
        media_urls: data.media_urls,
        engagement: data.engagement,
        posted_at: data.posted_at,
        raw_data: data.raw_data,
        fetched_at: data.fetched_at,
        account_id: data.account_id,
        ...(textChanged
          ? {
              analysis_status: 'pending',
              analysis_error: null,
              analysis_result: {},
              analyzed_at: null,
            }
          : {}),
      },
    });

    if (shouldReanalyze) {
      enqueuePost(updated.id, { dbName });
    }
    return { created: false, id: updated.id };
  }

  const created = await prisma.social_media_posts.create({
    data: {
      ...data,
      analysis_status: 'pending',
    },
  });
  enqueuePost(created.id, { dbName });
  return { created: true, id: created.id };
};

module.exports = { upsertPost };
