/**
 * Canonical social platforms — used when Admin enables platforms in Settings.
 * Rows are upserted into the tenant `platforms` table (not seeded on DB create).
 */

const PLATFORM_CATALOG_DEFS = [
  {
    slug: 'x',
    name: 'X (Twitter)',
    icon: 'twitter',
    color: '#1DA1F2',
    fields: [
      {
        key: 'username',
        label: 'Username',
        type: 'text',
        required: true,
        placeholder: 'e.g. narendramodi',
      },
    ],
  },
  {
    slug: 'facebook',
    name: 'Facebook',
    icon: 'facebook',
    color: '#1877F2',
    fields: [
      {
        key: 'url',
        label: 'Page URL',
        type: 'url',
        required: true,
        placeholder: 'https://facebook.com/...',
      },
      {
        key: 'page_id',
        label: 'Page ID',
        type: 'text',
        required: false,
        placeholder: 'optional numeric id',
      },
    ],
  },
  {
    slug: 'youtube',
    name: 'YouTube',
    icon: 'youtube',
    color: '#FF0000',
    fields: [
      {
        key: 'channel_url',
        label: 'Channel URL',
        type: 'url',
        required: true,
        placeholder: 'https://youtube.com/@...',
      },
      {
        key: 'channel_id',
        label: 'Channel ID',
        type: 'text',
        required: false,
        placeholder: 'UCxxxxxxxx',
      },
    ],
  },
  {
    slug: 'instagram',
    name: 'Instagram',
    icon: 'instagram',
    color: '#E4405F',
    fields: [
      {
        key: 'username',
        label: 'Username',
        type: 'text',
        required: true,
        placeholder: 'e.g. narendramodi',
      },
    ],
  },
  {
    slug: 'telegram',
    name: 'Telegram',
    icon: 'telegram',
    color: '#229ED9',
    fields: [
      {
        key: 'username',
        label: 'Username',
        type: 'text',
        required: false,
        placeholder: 'e.g. somchannel',
      },
      {
        key: 'url',
        label: 't.me URL',
        type: 'url',
        required: false,
        placeholder: 'https://t.me/...',
      },
      {
        key: 'channel_id',
        label: 'Channel ID',
        type: 'text',
        required: false,
        placeholder: 'numeric id',
      },
    ],
  },
  {
    slug: 'reddit',
    name: 'Reddit',
    icon: 'reddit',
    color: '#FF4500',
    fields: [],
  },
];

const PLATFORM_SLUGS = PLATFORM_CATALOG_DEFS.map((p) => p.slug);

/**
 * Upsert selected platforms into tenant DB; deactivate ones not selected
 * (does not delete rows that may have linked accounts).
 */
async function syncTenantPlatforms(tenantPrisma, allowedSlugs = []) {
  if (!tenantPrisma) return;
  const wanted = new Set(
    (Array.isArray(allowedSlugs) ? allowedSlugs : [])
      .map((s) => String(s).toLowerCase().trim())
      .filter((s) => PLATFORM_SLUGS.includes(s))
  );

  for (const def of PLATFORM_CATALOG_DEFS) {
    const active = wanted.has(def.slug);
    const existing = await tenantPrisma.platforms.findUnique({ where: { slug: def.slug } });
    if (existing) {
      await tenantPrisma.platforms.update({
        where: { id: existing.id },
        data: {
          is_active: active,
          name: def.name,
          icon: def.icon,
          color: def.color,
          ...(Array.isArray(existing.fields) && existing.fields.length
            ? {}
            : { fields: def.fields }),
        },
      });
    } else if (active) {
      await tenantPrisma.platforms.create({
        data: {
          name: def.name,
          slug: def.slug,
          icon: def.icon,
          color: def.color,
          fields: def.fields,
          is_active: true,
        },
      });
    }
  }
}

module.exports = {
  PLATFORM_CATALOG_DEFS,
  PLATFORM_SLUGS,
  syncTenantPlatforms,
};
