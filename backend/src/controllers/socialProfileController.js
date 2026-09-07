const prisma = require('../../prisma/client');
const monitoringSocialMedia = require('../services/monitoringsocialmedia');
const { previewProfile } = require('../services/monitoringsocialmedia/previewProfile');
const { attachRelevanceToAccounts } = require('../services/catalogProfileRelevanceService');

const FIELD_TYPES = new Set(['text', 'url']);
const MIN_POLL_MINUTES = 1;
const MAX_POLL_MINUTES = 10080; // 7 days

const parsePollInterval = (value, { required = false } = {}) => {
  if (value === undefined || value === null || value === '') {
    return required ? null : undefined;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < MIN_POLL_MINUTES || n > MAX_POLL_MINUTES) {
    return null;
  }
  return n;
};

const resolvePlatform = async (slug, { activeOnly = true } = {}) => {
  if (!slug) return null;
  return prisma.platforms.findFirst({
    where: { slug, ...(activeOnly ? { is_active: true } : {}) },
  });
};

const normalizeFields = (raw) => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((f) => {
      const key = String(f?.key || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');
      if (!key) return null;
      return {
        key,
        label: String(f?.label || key).trim() || key,
        type: FIELD_TYPES.has(f?.type) ? f.type : 'text',
        required: Boolean(f?.required),
        placeholder: f?.placeholder ? String(f.placeholder) : '',
      };
    })
    .filter(Boolean);
};

const RESOLVED_ID_KEYS = ['page_id', 'user_id', 'channel_id'];

const normalizeData = (raw, fieldDefs) => {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const data = {};
  for (const field of fieldDefs) {
    const value = input[field.key];
    data[field.key] = value == null ? '' : String(value).trim();
  }
  for (const key of RESOLVED_ID_KEYS) {
    if (input[key] != null && String(input[key]).trim()) {
      data[key] = String(input[key]).trim();
    }
  }
  return data;
};

const validateData = (data, fieldDefs) => {
  for (const field of fieldDefs) {
    if (field.required && !data[field.key]) {
      return `${field.label} is required`;
    }
  }
  return null;
};

/** Prefer username-like keys, else first required, else first non-empty value */
const deriveHandle = (data, fieldDefs) => {
  const preferred = ['username', 'handle', 'url', 'channel_url', 'page_id', 'channel_id'];
  for (const key of preferred) {
    if (data[key]) return data[key];
  }
  for (const field of fieldDefs) {
    if (field.required && data[field.key]) return data[field.key];
  }
  for (const field of fieldDefs) {
    if (data[field.key]) return data[field.key];
  }
  return '';
};

/** Flatten account + parent profile for list/UI (one row per platform account). */
const flattenAccount = (row) => {
  const { platforms, platform_id, profile, profile_id, _count, ...rest } = row;
  return {
    ...rest,
    id: row.id,
    profile_id,
    entity_id: profile_id != null ? String(profile_id) : null,
    display_name: profile?.display_name ?? rest.display_name ?? null,
    notes: profile?.notes ?? rest.notes ?? null,
    platform: platforms?.slug || null,
    platform_name: platforms?.name || null,
    platform_fields: platforms?.fields || [],
    posts_stored: _count?.posts ?? rest.posts_stored ?? 0,
  };
};

const accountInclude = {
  platforms: { select: { slug: true, name: true, icon: true, fields: true } },
  profile: { select: { id: true, display_name: true, notes: true, is_active: true } },
  _count: { select: { posts: true } },
};

const listPlatforms = async (req, res) => {
  try {
    const includeInactive = req.query.all === '1' || req.query.all === 'true';
    const platforms = await prisma.platforms.findMany({
      where: includeInactive ? undefined : { is_active: true },
      orderBy: { id: 'asc' },
    });
    res.json(platforms);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const normalizeSlug = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '');

const createPlatform = async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const slug = normalizeSlug(req.body.slug || name);
    const icon = String(req.body.icon || 'Globe2').trim() || 'Globe2';
    const color = req.body.color ? String(req.body.color).trim() : null;
    const fields = normalizeFields(req.body.fields);

    if (!name || !slug) {
      return res.status(400).json({ error: 'name and slug are required' });
    }
    if (fields.length === 0) {
      return res.status(400).json({ error: 'Add at least one field (e.g. username or url)' });
    }

    const existing = await prisma.platforms.findUnique({ where: { slug } });
    if (existing) {
      return res.status(409).json({ error: 'A platform with this slug already exists' });
    }

    const platform = await prisma.platforms.create({
      data: {
        name,
        slug,
        icon,
        color,
        fields,
        is_active: req.body.is_active !== false,
      },
    });
    res.status(201).json(platform);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updatePlatform = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });

    const data = {};
    if (req.body.name !== undefined) data.name = String(req.body.name).trim();
    if (req.body.slug !== undefined) data.slug = normalizeSlug(req.body.slug);
    if (req.body.icon !== undefined) data.icon = String(req.body.icon || 'Globe2').trim() || 'Globe2';
    if (req.body.color !== undefined) data.color = req.body.color ? String(req.body.color).trim() : null;
    if (req.body.is_active !== undefined) data.is_active = !!req.body.is_active;
    if (req.body.fields !== undefined) {
      data.fields = normalizeFields(req.body.fields);
      if (data.fields.length === 0) {
        return res.status(400).json({ error: 'Add at least one field (e.g. username or url)' });
      }
    }

    if (data.slug) {
      const clash = await prisma.platforms.findFirst({
        where: { slug: data.slug, NOT: { id } },
      });
      if (clash) {
        return res.status(409).json({ error: 'A platform with this slug already exists' });
      }
    }
    if (data.name !== undefined && !data.name) {
      return res.status(400).json({ error: 'name cannot be empty' });
    }

    const platform = await prisma.platforms.update({ where: { id }, data });
    res.json(platform);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'platform not found' });
    res.status(500).json({ error: error.message });
  }
};

const deletePlatform = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });

    const linked = await prisma.social_media_accounts.count({ where: { platform_id: id } });
    if (linked > 0) {
      return res.status(400).json({
        error: `Cannot delete: ${linked} account(s) still use this platform. Pause or reassign them first.`,
      });
    }

    await prisma.platforms.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'platform not found' });
    res.status(500).json({ error: error.message });
  }
};

const listProfiles = async (req, res) => {
  try {
    const { platform, status, search } = req.query;
    const where = {};

    if (platform) {
      const platformRow = await resolvePlatform(platform);
      where.platform_id = platformRow ? platformRow.id : -1;
    }
    if (status === 'active') where.is_active = true;
    if (status === 'paused') where.is_active = false;
    if (search) {
      where.OR = [
        { handle: { contains: search, mode: 'insensitive' } },
        { profile: { display_name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [allPlatforms, accounts, counts] = await Promise.all([
      prisma.platforms.findMany({ where: { is_active: true }, orderBy: { id: 'asc' } }),
      prisma.social_media_accounts.findMany({
        where,
        include: accountInclude,
        orderBy: { created_at: 'desc' },
      }),
      prisma.social_media_accounts.groupBy({ by: ['platform_id'], _count: { _all: true } }),
    ]);

    const countsById = counts.reduce((acc, c) => ({ ...acc, [c.platform_id]: c._count._all }), {});
    const byPlatform = allPlatforms.reduce((acc, p) => ({ ...acc, [p.slug]: countsById[p.id] || 0 }), {});
    const flattened = await attachRelevanceToAccounts(accounts.map(flattenAccount));

    res.json({
      profiles: flattened,
      stats: {
        total: flattened.length,
        active: flattened.filter((p) => p.is_active).length,
        paused: flattened.filter((p) => !p.is_active).length,
        byPlatform,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const assertFetchedPreview = (preview_data, data) => {
  if (!preview_data || typeof preview_data !== 'object' || Array.isArray(preview_data)) {
    return 'Fetch details first — preview is required before save';
  }
  if (!preview_data.fetched_at || !preview_data.summary) {
    return 'Fetch details first — preview is required before save';
  }
  const hasId =
    (data && (data.page_id || data.user_id || data.channel_id)) ||
    preview_data.summary.page_id ||
    preview_data.summary.user_id ||
    preview_data.summary.channel_id;
  if (!hasId) {
    return 'Fetch details first — could not resolve page_id / user_id / channel_id';
  }
  return null;
};

const prepareAccountFields = ({ platformRow, data, preview_data }) => {
  const fieldDefs = normalizeFields(platformRow.fields);
  if (fieldDefs.length === 0) {
    const err = new Error(`Platform ${platformRow.slug} has no fields configured`);
    err.status = 400;
    throw err;
  }

  const normalized = normalizeData(data, fieldDefs);
  const dataError = validateData(normalized, fieldDefs);
  if (dataError) {
    const err = new Error(dataError);
    err.status = 400;
    throw err;
  }

  const previewError = assertFetchedPreview(preview_data, normalized);
  if (previewError) {
    const err = new Error(previewError);
    err.status = 400;
    throw err;
  }

  const handle = deriveHandle(normalized, fieldDefs);
  if (!handle) {
    const err = new Error('At least one identity field is required');
    err.status = 400;
    throw err;
  }

  return { normalized, handle };
};

const createOneAccount = async ({
  platformRow,
  data,
  display_name,
  notes,
  pollInterval,
  preview_data,
  profile_id,
}) => {
  const { normalized, handle } = prepareAccountFields({
    platformRow,
    data,
    preview_data,
  });

  let profileId = profile_id ? Number(profile_id) : null;
  if (profileId) {
    const parent = await prisma.social_media_profiles.findUnique({ where: { id: profileId } });
    if (!parent) {
      const err = new Error('parent profile not found');
      err.status = 404;
      throw err;
    }
    if (display_name !== undefined || notes !== undefined) {
      await prisma.social_media_profiles.update({
        where: { id: profileId },
        data: {
          ...(display_name !== undefined
            ? { display_name: display_name || preview_data?.summary?.name || null }
            : {}),
          ...(notes !== undefined ? { notes: notes || null } : {}),
        },
      });
    }
  } else {
    const profile = await prisma.social_media_profiles.create({
      data: {
        display_name: display_name || preview_data?.summary?.name || null,
        notes: notes || null,
      },
    });
    profileId = profile.id;
  }

  return prisma.social_media_accounts.create({
    data: {
      profile_id: profileId,
      platform_id: platformRow.id,
      handle,
      data: normalized,
      preview_data,
      poll_interval_minutes: pollInterval ?? 30,
    },
    include: accountInclude,
  });
};

const createProfile = async (req, res) => {
  try {
    const { platform, display_name, notes, profile_id, entity_id } = req.body;
    const platformRow = await resolvePlatform(platform);
    if (!platformRow) {
      return res.status(400).json({ error: 'platform is invalid or not active' });
    }

    const pollInterval = parsePollInterval(req.body.poll_interval_minutes);
    if (req.body.poll_interval_minutes !== undefined && pollInterval === null) {
      return res.status(400).json({
        error: `poll_interval_minutes must be an integer between ${MIN_POLL_MINUTES} and ${MAX_POLL_MINUTES}`,
      });
    }

    const parentId = profile_id || entity_id || null;
    const account = await createOneAccount({
      platformRow,
      data: req.body.data,
      display_name,
      notes,
      pollInterval: pollInterval ?? 30,
      preview_data: req.body.preview_data,
      profile_id: parentId,
    });

    res.status(201).json(flattenAccount(account));
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'An account with this handle already exists on this platform' });
    }
    res.status(error.status || 500).json({ error: error.message });
  }
};

/** Create several platform accounts under one profile. */
const createProfilesBatch = async (req, res) => {
  try {
    const { display_name, notes, accounts } = req.body || {};
    if (!Array.isArray(accounts) || accounts.length === 0) {
      return res.status(400).json({ error: 'accounts array is required' });
    }

    const pollInterval = parsePollInterval(req.body.poll_interval_minutes);
    if (req.body.poll_interval_minutes !== undefined && pollInterval === null) {
      return res.status(400).json({
        error: `poll_interval_minutes must be an integer between ${MIN_POLL_MINUTES} and ${MAX_POLL_MINUTES}`,
      });
    }

    const profile = await prisma.social_media_profiles.create({
      data: {
        display_name: display_name || null,
        notes: notes || null,
      },
    });

    const created = [];
    for (const account of accounts) {
      const platformRow = await resolvePlatform(account.platform);
      if (!platformRow) {
        return res.status(400).json({ error: `platform is invalid: ${account.platform}` });
      }
      const row = await createOneAccount({
        platformRow,
        data: account.data,
        display_name,
        notes,
        pollInterval: pollInterval ?? 30,
        preview_data: account.preview_data,
        profile_id: profile.id,
      });
      created.push(flattenAccount(row));
    }

    // Backfill display_name from first preview if empty
    if (!profile.display_name && created[0]?.display_name) {
      await prisma.social_media_profiles.update({
        where: { id: profile.id },
        data: { display_name: created[0].display_name },
      });
    }

    res.status(201).json({
      entity_id: String(profile.id),
      profile_id: profile.id,
      profiles: created,
    });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'An account with this handle already exists on this platform' });
    }
    res.status(error.status || 500).json({ error: error.message });
  }
};

/** Update one account (and optionally parent profile display_name / notes). */
const updateProfile = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });

    const existing = await prisma.social_media_accounts.findUnique({
      where: { id },
      include: { platforms: true, profile: true },
    });
    if (!existing) return res.status(404).json({ error: 'profile not found' });

    const data = {};
    let platformRow = existing.platforms;

    if (req.body.platform !== undefined) {
      platformRow = await resolvePlatform(req.body.platform);
      if (!platformRow) return res.status(400).json({ error: 'platform is invalid or not active' });
      data.platform_id = platformRow.id;
    }

    if (req.body.data !== undefined || req.body.platform !== undefined) {
      const fieldDefs = normalizeFields(platformRow.fields);
      const mergedData = normalizeData(
        { ...(existing.data || {}), ...(req.body.data || {}) },
        fieldDefs
      );
      const dataError = validateData(mergedData, fieldDefs);
      if (dataError) return res.status(400).json({ error: dataError });

      const nextPreview =
        req.body.preview_data !== undefined ? req.body.preview_data : existing.preview_data;
      const previewError = assertFetchedPreview(nextPreview, mergedData);
      if (previewError) return res.status(400).json({ error: previewError });

      data.data = mergedData;
      data.handle = deriveHandle(mergedData, fieldDefs);
      if (req.body.preview_data !== undefined) {
        data.preview_data = nextPreview;
      }
    }

    if (req.body.poll_interval_minutes !== undefined) {
      const pollInterval = parsePollInterval(req.body.poll_interval_minutes, { required: true });
      if (pollInterval === null) {
        return res.status(400).json({
          error: `poll_interval_minutes must be an integer between ${MIN_POLL_MINUTES} and ${MAX_POLL_MINUTES}`,
        });
      }
      data.poll_interval_minutes = pollInterval;
    }
    if (req.body.is_active !== undefined) data.is_active = !!req.body.is_active;
    if (req.body.preview_data !== undefined && req.body.data === undefined) {
      const previewError = assertFetchedPreview(
        req.body.preview_data,
        data.data || existing.data || {}
      );
      if (previewError) return res.status(400).json({ error: previewError });
      data.preview_data = req.body.preview_data;
    }

    const profilePatch = {};
    if (req.body.display_name !== undefined) {
      profilePatch.display_name = req.body.display_name || null;
    }
    if (req.body.notes !== undefined) {
      profilePatch.notes = req.body.notes || null;
    }
    if (Object.keys(profilePatch).length) {
      await prisma.social_media_profiles.update({
        where: { id: existing.profile_id },
        data: profilePatch,
      });
    }

    const account = await prisma.social_media_accounts.update({
      where: { id },
      data,
      include: accountInclude,
    });
    res.json(flattenAccount(account));
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'profile not found' });
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'An account with this handle already exists on this platform' });
    }
    res.status(500).json({ error: error.message });
  }
};

const deleteProfile = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });

    const existing = await prisma.social_media_accounts.findUnique({
      where: { id },
      select: { id: true, profile_id: true },
    });
    if (!existing) return res.status(404).json({ error: 'profile not found' });

    await prisma.social_media_accounts.delete({ where: { id } });

    const remaining = await prisma.social_media_accounts.count({
      where: { profile_id: existing.profile_id },
    });
    if (remaining === 0) {
      await prisma.social_media_profiles.delete({ where: { id: existing.profile_id } }).catch(() => {});
    }

    res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'profile not found' });
    res.status(500).json({ error: error.message });
  }
};

const appendMonitoringLog = (existingLogs, entry) => {
  const logs = Array.isArray(existingLogs) ? existingLogs : [];
  return [...logs, entry].slice(-200);
};

/** Start or stop monitoring for one platform account. */
const toggleMonitoring = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });

    const existing = await prisma.social_media_accounts.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'profile not found' });

    const nextStatus = existing.monitoring_status === 'started' ? 'stopped' : 'started';
    const now = new Date().toISOString();
    const logEntry =
      nextStatus === 'started'
        ? {
            at: now,
            action: 'start',
            status: 'running',
            message: 'Monitoring session started',
          }
        : {
            at: now,
            action: 'stop',
            status: 'stopped',
            message: 'Monitoring session stopped',
          };

    const account = await prisma.social_media_accounts.update({
      where: { id },
      data: {
        monitoring_status: nextStatus,
        monitoring_logs: appendMonitoringLog(existing.monitoring_logs, logEntry),
      },
      include: accountInclude,
    });

    if (nextStatus === 'started') {
      monitoringSocialMedia.startProfile(account.id).catch((err) => {
        console.error('[toggleMonitoring] startProfile:', err.message);
      });
    } else {
      monitoringSocialMedia.stopProfile(account.id).catch((err) => {
        console.error('[toggleMonitoring] stopProfile:', err.message);
      });
    }

    res.json(flattenAccount(account));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/** Start monitoring on every account that is not already started. */
const startAllMonitoring = async (req, res) => {
  try {
    const platformFilter = req.body?.platform || req.query?.platform;
    const where = { monitoring_status: { not: 'started' } };
    if (platformFilter) {
      const platformRow = await resolvePlatform(platformFilter);
      where.platform_id = platformRow ? platformRow.id : -1;
    }

    const accounts = await prisma.social_media_accounts.findMany({ where });
    if (accounts.length === 0) {
      return res.json({ started: 0, message: 'All services already running' });
    }

    const now = new Date().toISOString();
    const logEntry = {
      at: now,
      action: 'start',
      status: 'running',
      message: 'Monitoring session started (start all services)',
    };

    let started = 0;
    for (const existing of accounts) {
      await prisma.social_media_accounts.update({
        where: { id: existing.id },
        data: {
          is_active: true,
          monitoring_status: 'started',
          monitoring_logs: appendMonitoringLog(existing.monitoring_logs, logEntry),
        },
      });
      monitoringSocialMedia.startProfile(existing.id).catch((err) => {
        console.error('[startAllMonitoring] startProfile:', err.message);
      });
      started += 1;
    }

    res.json({ started, message: `Started monitoring on ${started} profile(s)` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/** Stop monitoring on every account that is currently started. */
const stopAllMonitoring = async (req, res) => {
  try {
    const platformFilter = req.body?.platform || req.query?.platform;
    const where = { monitoring_status: 'started' };
    if (platformFilter) {
      const platformRow = await resolvePlatform(platformFilter);
      where.platform_id = platformRow ? platformRow.id : -1;
    }

    const accounts = await prisma.social_media_accounts.findMany({ where });
    if (accounts.length === 0) {
      return res.json({ stopped: 0, message: 'No services are running' });
    }

    const now = new Date().toISOString();
    const logEntry = {
      at: now,
      action: 'stop',
      status: 'stopped',
      message: 'Monitoring session stopped (stop all services)',
    };

    let stopped = 0;
    for (const existing of accounts) {
      await prisma.social_media_accounts.update({
        where: { id: existing.id },
        data: {
          monitoring_status: 'stopped',
          monitoring_logs: appendMonitoringLog(existing.monitoring_logs, logEntry),
        },
      });
      monitoringSocialMedia.stopProfile(existing.id).catch((err) => {
        console.error('[stopAllMonitoring] stopProfile:', err.message);
      });
      stopped += 1;
    }

    res.json({ stopped, message: `Stopped monitoring on ${stopped} profile(s)` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const bulkToggleStatus = async (req, res) => {
  try {
    const { platform, is_active } = req.body;
    if (typeof is_active !== 'boolean') return res.status(400).json({ error: 'is_active must be a boolean' });

    const where = {};
    if (platform) {
      const platformRow = await resolvePlatform(platform);
      where.platform_id = platformRow ? platformRow.id : -1;
    }

    const result = await prisma.social_media_accounts.updateMany({ where, data: { is_active } });
    res.json({ updated: result.count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/** Resolve identity + preview for Add/Edit form (does not save posts). */
const previewProfileIdentity = async (req, res) => {
  try {
    const { platform, data } = req.body || {};
    if (!platform) return res.status(400).json({ error: 'platform is required' });

    const platformRow = await resolvePlatform(platform);
    if (!platformRow) {
      return res.status(400).json({ error: 'platform is invalid or not active' });
    }

    const result = await previewProfile(platformRow.slug, data || {});
    res.json(result);
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ error: error.message });
  }
};

module.exports = {
  listPlatforms,
  createPlatform,
  updatePlatform,
  deletePlatform,
  listProfiles,
  createProfile,
  createProfilesBatch,
  updateProfile,
  deleteProfile,
  toggleMonitoring,
  startAllMonitoring,
  stopAllMonitoring,
  bulkToggleStatus,
  previewProfileIdentity,
};
