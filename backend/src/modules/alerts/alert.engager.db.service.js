/**
 * Frequent engagers computed from the tenant database only (no external API calls).
 *
 * Target = a monitored profile (all of its accounts across platforms).
 * Engagers are read from data already stored in social_media_posts.raw_data:
 *   - X:         other monitored accounts that retweet / quote / reply to / mention the target
 *   - Facebook:  commenters in `top_comments` on the target's posts
 *   - Instagram: usernames in `top_likers` on the target's posts
 * YouTube / Telegram / Reddit store no engager identity, so they contribute nothing.
 */
const dbOf = require('../../lib/dbOf');

const normalizeHandle = (value) =>
  String(value || '')
    .replace(/^@/, '')
    .trim()
    .toLowerCase();

const MAX_DAYS = 365;
const SAMPLE_LINKS = 5;

const pickAvatar = (previewData) => {
  const preview = previewData && typeof previewData === 'object' ? previewData : {};
  const summary = preview.summary && typeof preview.summary === 'object' ? preview.summary : {};
  return summary.image || preview.image || preview.profile_image_url || summary.profile_image_url || null;
};

/** Display handle: plain handle if any, else the last meaningful URL segment. */
const displayHandle = (handles) => {
  const list = handles.map((h) => String(h || '').trim()).filter(Boolean);
  const plain = list.find((h) => !/^https?:\/\//i.test(h));
  if (plain) return normalizeHandle(plain);
  const url = list[0] || '';
  const segs = url.replace(/[?#].*$/, '').split('/').filter(Boolean);
  const last = segs.filter((x) => !/^\d+$/.test(x) && x !== 'people').pop();
  return normalizeHandle(last || url);
};

const FREQ_ORDER = { 'super-active': 0, regular: 1, occasional: 2, 'one-time': 3 };

/** Frequency tier from distinct items engaged with and the target's post count. */
const frequencyOf = (n, totalPosts) => {
  const ratio = totalPosts > 0 ? Math.min(1, n / totalPosts) : 0;
  if (n >= 10 || (n >= 3 && ratio >= 0.5)) return 'super-active';
  if (n >= 5 || (n >= 2 && ratio >= 0.25)) return 'regular';
  if (n >= 2) return 'occasional';
  return 'one-time';
};

/**
 * Facebook profile-picture links are signed and carry their expiry (`oe=` hex unix time).
 * An expired link only returns 403, so drop it and let the screen show the person's initial.
 */
const freshAvatar = (url) => {
  if (!url) return null;
  const m = String(url).match(/[?&]oe=([0-9a-f]+)/i);
  if (m && Number.parseInt(m[1], 16) * 1000 < Date.now()) return null;
  return url;
};

/** Slug from a facebook.com/<slug> URL when it is a real vanity name (else null). */
const facebookSlug = (url) => {
  const m = String(url || '').match(/facebook\.com\/([A-Za-z0-9._-]+)\/?(?:\?|$)/);
  if (!m) return null;
  const slug = m[1].toLowerCase();
  if (slug.startsWith('pfbid') || slug === 'profile.php' || /^\d+$/.test(slug)) return null;
  return slug;
};

/** Profiles that have at least one stored post. */
const listProfiles = async ({ db } = {}) => {
  const prisma = dbOf(db);
  // Warm the cached X relationship scan in the background so opening a profile is instant.
  prisma.social_media_accounts
    .findMany({ where: { platforms: { slug: 'x' } }, select: { handle: true } })
    .then((xs) => loadXRelations(prisma, 30, [...new Set(xs.map((a) => normalizeHandle(a.handle)))].sort()))
    .catch(() => {});
  const accounts = await prisma.social_media_accounts.findMany({
    where: { is_active: true },
    include: {
      profile: { select: { id: true, display_name: true } },
      platforms: { select: { slug: true } },
      _count: { select: { posts: true } },
    },
    orderBy: { updated_at: 'desc' },
  });

  const byProfile = new Map();
  for (const a of accounts) {
    if (!a.profile || !(a._count?.posts > 0)) continue;
    if (!byProfile.has(a.profile.id)) {
      byProfile.set(a.profile.id, {
        profile_id: a.profile.id,
        handle: '',
        display_name: a.profile.display_name || a.handle,
        _handles: [],
        avatar: pickAvatar(a.preview_data),
        platforms: [],
        tweets_analyzed: 0,
        engagers: [],
        live: false,
      });
    }
    const row = byProfile.get(a.profile.id);
    if (!row.avatar) row.avatar = pickAvatar(a.preview_data);
    row._handles.push(a.handle);
    row.platforms.push({ platform: a.platforms?.slug, handle: a.handle, posts: a._count.posts });
    row.tweets_analyzed += a._count.posts;
  }
  return [...byProfile.values()].map(({ _handles, ...row }) => ({
    ...row,
    handle: displayHandle(_handles),
  }));
};

const X_SCREEN = (base) =>
  `COALESCE(
     ${base}#>>'{result,core,user_results,result,core,screen_name}',
     ${base}#>>'{result,core,user_results,result,legacy,screen_name}',
     ${base}#>>'{result,tweet,core,user_results,result,core,screen_name}',
     ${base}#>>'{result,tweet,core,user_results,result,legacy,screen_name}'
   )`;

const X_SQL = `
WITH x AS (
  SELECT p.external_id, p.url, p.posted_at,
         lower(ltrim(p.author_handle, '@')) AS eh,
         p.author_name,
         lower(${X_SCREEN("p.raw_data#>'{legacy,retweeted_status_result}'")}) AS rt_t,
         lower(${X_SCREEN("p.raw_data#>'{quoted_status_result}'")}) AS q_t,
         lower(p.raw_data#>>'{legacy,in_reply_to_screen_name}') AS rp_t,
         p.raw_data#>'{legacy,entities,user_mentions}' AS um,
         COALESCE(
           p.raw_data#>>'{legacy,retweeted_status_result,result,rest_id}',
           p.raw_data#>>'{quoted_status_result,result,rest_id}',
           p.raw_data#>>'{legacy,in_reply_to_status_id_str}'
         ) AS tid
  FROM social_media_posts p
  WHERE p.platform = 'x'
    AND p.posted_at >= $1::timestamptz
    AND p.author_handle IS NOT NULL
), u AS (
  SELECT eh, author_name, external_id, url, posted_at, tid, rt_t AS t, 'retweet' AS kind
    FROM x WHERE rt_t = ANY($2::text[])
  UNION ALL
  SELECT eh, author_name, external_id, url, posted_at, tid, q_t, 'quote'
    FROM x WHERE rt_t IS NULL AND q_t = ANY($2::text[])
  UNION ALL
  SELECT eh, author_name, external_id, url, posted_at, tid, rp_t, 'reply'
    FROM x WHERE rt_t IS NULL AND q_t IS NULL AND rp_t = ANY($2::text[])
  UNION ALL
  SELECT x.eh, x.author_name, x.external_id, x.url, x.posted_at, NULL, lower(m->>'screen_name'), 'mention'
    FROM x
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(x.um) = 'array' THEN x.um ELSE '[]'::jsonb END
    ) m
    WHERE x.rt_t IS NULL AND x.q_t IS NULL AND x.rp_t IS NULL
      AND lower(m->>'screen_name') = ANY($2::text[])
)
SELECT eh, t, kind, max(author_name) AS name,
       count(*)::int AS events,
       count(DISTINCT COALESCE(tid, external_id))::int AS n,
       min(posted_at) AS first_at, max(posted_at) AS last_at,
       (array_agg(url ORDER BY posted_at DESC))[1:${SAMPLE_LINKS}] AS urls
FROM u
WHERE eh IS NOT NULL AND eh <> t
GROUP BY eh, t, kind
`;

/**
 * X relationships are expensive to extract (scans raw_data of every X post), so the
 * scan runs once per tenant + window for ALL monitored X handles and is cached.
 */
const X_CACHE_TTL_MS = 10 * 60 * 1000;
const xCache = new WeakMap();

const loadXRelations = (prisma, days, allHandles) => {
  let perDb = xCache.get(prisma);
  if (!perDb) {
    perDb = new Map();
    xCache.set(prisma, perDb);
  }
  const key = `${days}|${allHandles.join(',')}`;
  const hit = perDb.get(key);
  if (hit && Date.now() - hit.at < X_CACHE_TTL_MS) return hit.promise;
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const promise = prisma.$queryRawUnsafe(X_SQL, since, allHandles);
  perDb.set(key, { at: Date.now(), promise });
  promise.catch(() => perDb.delete(key));
  if (perDb.size > 12) perDb.delete(perDb.keys().next().value);
  return promise;
};

const FB_SQL = `
SELECT c->'author'->>'id' AS eid,
       max(c->'author'->>'name') AS name,
       max(c->'author'->>'url') AS profile_url,
       (array_agg(c->'author'->>'profile_image_url' ORDER BY p.posted_at DESC)
          FILTER (WHERE c->'author'->>'profile_image_url' IS NOT NULL))[1] AS avatar,
       count(*)::int AS events,
       count(DISTINCT p.id)::int AS n,
       min(p.posted_at) AS first_at, max(p.posted_at) AS last_at,
       (array_agg(p.url ORDER BY p.posted_at DESC))[1:${SAMPLE_LINKS}] AS urls
FROM social_media_posts p
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(p.raw_data->'top_comments') = 'array'
       THEN p.raw_data->'top_comments' ELSE '[]'::jsonb END
) c
WHERE p.platform = 'facebook'
  AND p.account_id = ANY($1::text[]::int[])
  AND p.posted_at >= $2::timestamptz
  AND c->'author'->>'id' IS NOT NULL
  AND c->'author'->>'id' IS DISTINCT FROM p.raw_data#>>'{author,id}'
GROUP BY 1
`;

const IG_SQL = `
SELECT lower(l) AS eh,
       count(*)::int AS events,
       count(DISTINCT p.id)::int AS n,
       min(p.posted_at) AS first_at, max(p.posted_at) AS last_at,
       (array_agg(p.url ORDER BY p.posted_at DESC))[1:${SAMPLE_LINKS}] AS urls
FROM social_media_posts p
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE WHEN jsonb_typeof(p.raw_data->'top_likers') = 'array'
       THEN p.raw_data->'top_likers' ELSE '[]'::jsonb END
) l
WHERE p.platform = 'instagram'
  AND p.account_id = ANY($1::text[]::int[])
  AND p.posted_at >= $2::timestamptz
GROUP BY 1
`;

const addTo = (map, key, seed) => {
  if (!map.has(key)) {
    map.set(key, {
      handle: seed.handle || null,
      name: seed.name || seed.handle || null,
      avatar: null,
      verified: false,
      user_id: null,
      by_platform: {},
      by_kind: {},
      links: [],
      first_at: null,
      last_at: null,
      profile_urls: {},
    });
  }
  return map.get(key);
};

const absorb = (entry, { platform, kind, n, events, first_at, last_at, urls, name, avatar, profileUrl }) => {
  entry.by_platform[platform] = (entry.by_platform[platform] || 0) + n;
  entry.by_kind[kind] = (entry.by_kind[kind] || 0) + events;
  if (name && (!entry.name || entry.name === entry.handle)) entry.name = name;
  if (avatar && !entry.avatar) entry.avatar = avatar;
  if (profileUrl) entry.profile_urls[platform] = profileUrl;
  if (first_at && (!entry.first_at || first_at < entry.first_at)) entry.first_at = first_at;
  if (last_at && (!entry.last_at || last_at > entry.last_at)) entry.last_at = last_at;
  for (const u of urls || []) {
    if (u && entry.links.length < SAMPLE_LINKS && !entry.links.some((l) => l.url === u)) {
      entry.links.push({ platform, url: u });
    }
  }
};

/**
 * Combined engagers for one profile from stored posts only.
 */
const analyzeProfileFromDb = async (profileId, { periodDays = 30, platforms = null, db } = {}) => {
  const prisma = dbOf(db);
  const id = Number(profileId);
  if (!Number.isInteger(id) || id <= 0) {
    const err = new Error('profile id is required');
    err.status = 400;
    throw err;
  }
  const days = Math.max(1, Math.min(Number(periodDays) || 30, MAX_DAYS));
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const wanted = Array.isArray(platforms) && platforms.length ? new Set(platforms) : null;
  const want = (slug) => !wanted || wanted.has(slug);

  const accounts = await prisma.social_media_accounts.findMany({
    where: { profile_id: id },
    include: {
      profile: { select: { display_name: true } },
      platforms: { select: { slug: true } },
    },
  });
  if (!accounts.length) {
    const err = new Error('Profile not found');
    err.status = 404;
    throw err;
  }

  const byPlat = {};
  for (const a of accounts) {
    const slug = a.platforms?.slug;
    (byPlat[slug] = byPlat[slug] || []).push(a);
  }

  // Target's own post counts in the window (denominator for frequency tiers).
  const totals = await prisma.$queryRawUnsafe(
    `SELECT platform, count(*)::int AS n FROM social_media_posts
     WHERE account_id = ANY($1::text[]::int[]) AND posted_at >= $2::timestamptz GROUP BY platform`,
    accounts.map((a) => String(a.id)),
    since
  );
  const postsByPlatform = Object.fromEntries(totals.map((r) => [r.platform, r.n]));
  const totalPosts = totals.reduce((s, r) => s + r.n, 0);

  const map = new Map();
  const foundByPlatform = {};

  if (byPlat.x && want('x')) {
    const handles = byPlat.x.map((a) => normalizeHandle(a.handle));
    const allX = await prisma.social_media_accounts.findMany({
      where: { platforms: { slug: 'x' } },
      select: { handle: true },
    });
    const allHandles = [...new Set(allX.map((a) => normalizeHandle(a.handle)))].sort();
    const rows = await loadXRelations(prisma, days, allHandles);
    const mine = new Set(handles);
    const ids = new Set();
    for (const r of rows) {
      if (!mine.has(r.t) || mine.has(r.eh)) continue;
      const e = addTo(map, r.eh, { handle: r.eh, name: r.name });
      absorb(e, {
        platform: 'x',
        kind: r.kind,
        n: r.n,
        events: r.events,
        first_at: r.first_at,
        last_at: r.last_at,
        urls: r.urls,
        name: r.name,
        profileUrl: `https://x.com/${r.eh}`,
      });
      ids.add(r.eh);
    }
    foundByPlatform.x = ids.size;
  }

  if (byPlat.facebook && want('facebook')) {
    const rows = await prisma.$queryRawUnsafe(
      FB_SQL,
      byPlat.facebook.map((a) => String(a.id)),
      since
    );
    for (const r of rows) {
      const slug = facebookSlug(r.profile_url);
      const key = slug || `fb:${r.eid}`;
      const e = addTo(map, key, { handle: slug, name: r.name });
      e.user_id = e.user_id || r.eid;
      absorb(e, {
        platform: 'facebook',
        kind: 'comment',
        n: r.n,
        events: r.events,
        first_at: r.first_at,
        last_at: r.last_at,
        urls: r.urls,
        name: r.name,
        avatar: freshAvatar(r.avatar),
        profileUrl: r.profile_url,
      });
    }
    foundByPlatform.facebook = rows.length;
  }

  if (byPlat.instagram && want('instagram')) {
    const rows = await prisma.$queryRawUnsafe(
      IG_SQL,
      byPlat.instagram.map((a) => String(a.id)),
      since
    );
    for (const r of rows) {
      if (!r.eh) continue;
      const e = addTo(map, r.eh, { handle: r.eh });
      absorb(e, {
        platform: 'instagram',
        kind: 'like',
        n: r.n,
        events: r.events,
        first_at: r.first_at,
        last_at: r.last_at,
        urls: r.urls,
        profileUrl: `https://www.instagram.com/${r.eh}/`,
      });
    }
    foundByPlatform.instagram = rows.length;
  }

  const summary = { super_active: 0, regular: 0, occasional: 0, one_time: 0 };
  const engagers = [];
  for (const e of map.values()) {
    const total = Object.values(e.by_platform).reduce((s, v) => s + v, 0);
    const frequency = frequencyOf(total, totalPosts);
    const bucket = frequency === 'super-active' ? 'super_active' : frequency === 'one-time' ? 'one_time' : frequency;
    summary[bucket] += 1;
    engagers.push({
      handle: e.handle,
      name: e.name,
      avatar: e.avatar,
      verified: e.verified,
      user_id: e.user_id,
      platforms: Object.keys(e.by_platform),
      by_platform: e.by_platform,
      by_kind: e.by_kind,
      profile_urls: e.profile_urls,
      links: e.links,
      first_at: e.first_at,
      last_at: e.last_at,
      tweets_retweeted: total,
      total,
      frequency,
    });
  }

  engagers.sort((a, b) => {
    const d = (FREQ_ORDER[a.frequency] ?? 9) - (FREQ_ORDER[b.frequency] ?? 9);
    if (d !== 0) return d;
    if (b.total !== a.total) return b.total - a.total;
    return new Date(b.last_at || 0) - new Date(a.last_at || 0);
  });

  const first = accounts[0];
  return {
    profile_id: id,
    handle: displayHandle(accounts.map((a) => a.handle)),
    display_name: first.profile?.display_name || first.handle,
    avatar: pickAvatar(first.preview_data),
    analyzed_at: new Date().toISOString(),
    period_days: days,
    status: 'completed',
    tweets_analyzed: totalPosts,
    posts_by_platform: postsByPlatform,
    found_by_platform: foundByPlatform,
    unique_retweeters: engagers.length,
    summary,
    engagers,
    live: false,
    source: 'database',
    note:
      'Counts are the minimum observed: Facebook stores only top comments and Instagram only some likers. X shows only monitored accounts.',
  };
};

module.exports = { listProfiles, analyzeProfileFromDb };
