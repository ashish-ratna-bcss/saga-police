/**
 * Alert config (risk bands) + viral thresholds + templates + policies — Postgres / Prisma.
 */
const dbOf = require('../../lib/dbOf');
const mainPrisma = require('../../../prisma/client');

const CONFIG_ID = 'default';

const toSettingsDoc = (row) => {
  const high = row?.risk_threshold_high ?? 70;
  const medium = row?.risk_threshold_medium ?? 40;
  return {
    id: 'global_settings',
    risk_threshold_high: high,
    risk_threshold_medium: medium,
    high_risk_threshold: high,
    medium_risk_threshold: medium,
    velocity_alerts_enabled: row?.velocity_alerts_enabled !== false,
    updated_at: row?.updated_at ?? null,
  };
};

let _settingsCache = null;
let _settingsCacheTime = 0;
const SETTINGS_CACHE_TTL = 30_000;

const invalidateSettingsCache = () => {
  _settingsCache = null;
  _settingsCacheTime = 0;
};

const ensureAlertConfig = async ({ db } = {}) => {
  const prisma = dbOf(db);
  let row = await prisma.alert_config.findUnique({ where: { id: CONFIG_ID } });
  if (!row) {
    row = await prisma.alert_config.create({
      data: {
        id: CONFIG_ID,
        risk_threshold_high: 70,
        risk_threshold_medium: 40,
        velocity_alerts_enabled: true,
      },
    });
  }
  return row;
};

const getSettingsDoc = async ({ db } = {}) => {
  const prisma = dbOf(db);
  // Module cache is for main DB only
  if (!db && _settingsCache && Date.now() - _settingsCacheTime < SETTINGS_CACHE_TTL) {
    return _settingsCache;
  }
  const row = await ensureAlertConfig({ db: prisma });
  const doc = toSettingsDoc(row);
  if (!db) {
    _settingsCache = doc;
    _settingsCacheTime = Date.now();
  }
  return doc;
};

const updateSettingsDoc = async (body = {}, { db } = {}) => {
  const prisma = dbOf(db);
  await ensureAlertConfig({ db: prisma });

  const high =
    body.risk_threshold_high !== undefined
      ? Number(body.risk_threshold_high)
      : body.high_risk_threshold !== undefined
        ? Number(body.high_risk_threshold)
        : undefined;
  const medium =
    body.risk_threshold_medium !== undefined
      ? Number(body.risk_threshold_medium)
      : body.medium_risk_threshold !== undefined
        ? Number(body.medium_risk_threshold)
        : undefined;

  const data = {};
  if (high !== undefined && !Number.isNaN(high)) data.risk_threshold_high = high;
  if (medium !== undefined && !Number.isNaN(medium)) data.risk_threshold_medium = medium;
  if (body.velocity_alerts_enabled !== undefined) {
    data.velocity_alerts_enabled = Boolean(body.velocity_alerts_enabled);
  }

  const row = await prisma.alert_config.update({
    where: { id: CONFIG_ID },
    data,
  });

  invalidateSettingsCache();
  return toSettingsDoc(row);
};

/** Map platforms row → legacy alert-threshold API shape (platform = slug). */
const toThresholdRow = (p) => ({
  id: String(p.id),
  platform: p.slug,
  name: p.name,
  low_threshold: p.low_threshold ?? 100,
  medium_threshold: p.medium_threshold ?? 500,
  high_threshold: p.high_threshold ?? 1000,
  time_window_minutes: p.time_window_minutes ?? 60,
  is_active: p.is_active !== false,
  created_at: p.created_at,
});

const listThresholds = async (platform, { db } = {}) => {
  const prisma = dbOf(db);
  const rows = await prisma.platforms.findMany({
    where: platform ? { slug: String(platform) } : undefined,
    orderBy: { slug: 'asc' },
  });
  return rows.map(toThresholdRow);
};

const upsertThreshold = async (platformSlug, patch = {}, { db } = {}) => {
  const prisma = dbOf(db);
  const slug = String(platformSlug || '').trim().toLowerCase();
  if (!slug) throw new Error('platform is required');

  const existing = await prisma.platforms.findUnique({ where: { slug } });
  if (!existing) {
    throw Object.assign(
      new Error(`Platform "${slug}" not found — add it under Settings → Platforms`),
      { status: 404 }
    );
  }

  const data = {
    low_threshold:
      patch.low_threshold !== undefined ? Number(patch.low_threshold) || 0 : existing.low_threshold,
    medium_threshold:
      patch.medium_threshold !== undefined
        ? Number(patch.medium_threshold) || 0
        : existing.medium_threshold,
    high_threshold:
      patch.high_threshold !== undefined ? Number(patch.high_threshold) || 0 : existing.high_threshold,
    time_window_minutes:
      patch.time_window_minutes !== undefined
        ? Number(patch.time_window_minutes) || 0
        : existing.time_window_minutes,
  };
  if (patch.is_active !== undefined) data.is_active = Boolean(patch.is_active);

  const updated = await prisma.platforms.update({ where: { slug }, data });
  return toThresholdRow(updated);
};

const bulkUpsertThresholds = async (thresholds = [], { db } = {}) => {
  const out = [];
  for (const t of thresholds) {
    if (!t?.platform) continue;
    out.push(await upsertThreshold(t.platform, t, { db }));
  }
  return out;
};

const listTemplates = async ({ db } = {}) => {
  const prisma = dbOf(db);
  return prisma.report_templates.findMany({ orderBy: { created_at: 'desc' } });
};

const getTemplate = async (id, { db } = {}) => {
  const prisma = dbOf(db);
  return prisma.report_templates.findUnique({ where: { id: String(id) } });
};

const createTemplate = async ({ name, platform = 'all', html_content, is_default = false, created_by, db }) => {
  const prisma = dbOf(db);
  if (is_default) {
    await prisma.report_templates.updateMany({
      where: { platform },
      data: { is_default: false },
    });
  }
  return prisma.report_templates.create({
    data: {
      name: String(name).trim(),
      platform,
      html_content,
      is_default: Boolean(is_default),
      created_by: created_by != null ? String(created_by) : null,
    },
  });
};

const updateTemplateContent = async (id, html_content, { db } = {}) => {
  const prisma = dbOf(db);
  return prisma.report_templates.update({
    where: { id: String(id) },
    data: { html_content },
  });
};

const setDefaultTemplate = async (id, { db } = {}) => {
  const prisma = dbOf(db);
  const template = await getTemplate(id, { db: prisma });
  if (!template) return null;
  await prisma.report_templates.updateMany({
    where: { platform: template.platform },
    data: { is_default: false },
  });
  return prisma.report_templates.update({
    where: { id: template.id },
    data: { is_default: true },
  });
};

const deleteTemplate = async (id, { db } = {}) => {
  const prisma = dbOf(db);
  try {
    await prisma.report_templates.delete({ where: { id: String(id) } });
    return true;
  } catch {
    return false;
  }
};

const hydratePolicy = (row) => {
  if (!row) return null;
  return {
    ...row,
    _id: row.id,
    legal_sections: Array.isArray(row.legal_sections) ? row.legal_sections : [],
    platform_policies:
      row.platform_policies && typeof row.platform_policies === 'object'
        ? row.platform_policies
        : {},
    keywords: Array.isArray(row.keywords) ? row.keywords : [],
  };
};

const listPolicies = async ({ db } = {}) => {
  const prisma = dbOf(db);
  const tenantRows = await prisma.policy_mappings.findMany({ orderBy: { category_id: 'asc' } });
  const globalRows = await mainPrisma.default_policies.findMany({ orderBy: { category_id: 'asc' } });
  
  const mappedTenant = tenantRows.map(hydratePolicy);
  const mappedGlobal = globalRows.map(r => ({ ...hydratePolicy(r), is_global: true }));
  
  return [...mappedGlobal, ...mappedTenant];
};

const getPolicy = async (id, { db } = {}) => {
  const prisma = dbOf(db);
  const row = await prisma.policy_mappings.findUnique({ where: { id: String(id) } });
  if (row) return hydratePolicy(row);

  const globalRow = await mainPrisma.default_policies.findUnique({ where: { id: String(id) } });
  if (globalRow) return { ...hydratePolicy(globalRow), is_global: true };

  return null;
};

const createPolicy = async (body = {}, { db } = {}) => {
  const prisma = dbOf(db);
  const row = await prisma.policy_mappings.create({
    data: {
      category_id: String(body.category_id || '').trim(),
      definition: String(body.definition || ''),
      legal_sections: Array.isArray(body.legal_sections) ? body.legal_sections : [],
      platform_policies:
        body.platform_policies && typeof body.platform_policies === 'object'
          ? body.platform_policies
          : {},
      keywords: Array.isArray(body.keywords) ? body.keywords.map(String) : [],
      severity_level: body.severity_level || 'Medium',
      is_active: body.is_active !== false,
    },
  });
  return hydratePolicy(row);
};

const updatePolicy = async (id, body = {}, { db } = {}) => {
  const data = {};
  if (body.category_id !== undefined) data.category_id = String(body.category_id).trim();
  if (body.definition !== undefined) data.definition = String(body.definition);
  if (body.legal_sections !== undefined) data.legal_sections = body.legal_sections;
  if (body.platform_policies !== undefined) data.platform_policies = body.platform_policies;
  if (body.keywords !== undefined) {
    data.keywords = Array.isArray(body.keywords) ? body.keywords.map(String) : [];
  }
  if (body.severity_level !== undefined) data.severity_level = body.severity_level;
  if (body.is_active !== undefined) data.is_active = Boolean(body.is_active);

  // Global defaults live in main DB; tenant overrides in policy_mappings.
  const globalRow = await mainPrisma.default_policies.findUnique({ where: { id: String(id) } });
  if (globalRow) {
    const row = await mainPrisma.default_policies.update({ where: { id: String(id) }, data });
    return { ...hydratePolicy(row), is_global: true };
  }

  const prisma = dbOf(db);
  const row = await prisma.policy_mappings.update({ where: { id: String(id) }, data });
  return hydratePolicy(row);
};

const deletePolicy = async (id, { db } = {}) => {
  const globalRow = await mainPrisma.default_policies.findUnique({ where: { id: String(id) } });
  if (globalRow) {
    return false; // Or throw error, but returning false gives 404 in controller
  }
  const prisma = dbOf(db);
  try {
    await prisma.policy_mappings.delete({ where: { id: String(id) } });
    return true;
  } catch {
    return false;
  }
};

const listActivePolicies = async ({ db } = {}) => {
  const prisma = dbOf(db);
  const tenantRows = await prisma.policy_mappings.findMany({
    where: { is_active: true },
    orderBy: { category_id: 'asc' },
  });
  const globalRows = await mainPrisma.default_policies.findMany({
    where: { is_active: true },
    orderBy: { category_id: 'asc' },
  });
  
  const mappedTenant = tenantRows.map(hydratePolicy);
  const mappedGlobal = globalRows.map(r => ({ ...hydratePolicy(r), is_global: true }));
  
  return [...mappedGlobal, ...mappedTenant];
};

module.exports = {
  invalidateSettingsCache,
  getSettingsDoc,
  updateSettingsDoc,
  listThresholds,
  upsertThreshold,
  bulkUpsertThresholds,
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplateContent,
  setDefaultTemplate,
  deleteTemplate,
  listPolicies,
  getPolicy,
  createPolicy,
  updatePolicy,
  deletePolicy,
  listActivePolicies,
};
