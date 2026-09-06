/**
 * Alert config (risk bands) + viral thresholds + templates + policies — Postgres / Prisma.
 */
const prisma = require('../../../prisma/client');

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

const ensureAlertConfig = async () => {
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

const getSettingsDoc = async () => {
  if (_settingsCache && Date.now() - _settingsCacheTime < SETTINGS_CACHE_TTL) {
    return _settingsCache;
  }
  const row = await ensureAlertConfig();
  const doc = toSettingsDoc(row);
  _settingsCache = doc;
  _settingsCacheTime = Date.now();
  return doc;
};

const updateSettingsDoc = async (body = {}) => {
  await ensureAlertConfig();

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

const DEFAULT_THRESHOLDS = [
  { platform: 'youtube', low_threshold: 100, medium_threshold: 500, high_threshold: 1000, time_window_minutes: 60 },
  { platform: 'x', low_threshold: 100, medium_threshold: 500, high_threshold: 1000, time_window_minutes: 60 },
  { platform: 'instagram', low_threshold: 100, medium_threshold: 500, high_threshold: 1000, time_window_minutes: 60 },
  { platform: 'facebook', low_threshold: 100, medium_threshold: 500, high_threshold: 1000, time_window_minutes: 60 },
];

const ensureDefaultThresholds = async () => {
  const existing = await prisma.alert_thresholds.findMany();
  if (existing.length >= 4) return existing;
  const have = new Set(existing.map((t) => t.platform));
  for (const row of DEFAULT_THRESHOLDS) {
    if (have.has(row.platform)) continue;
    await prisma.alert_thresholds.create({ data: row });
  }
  return prisma.alert_thresholds.findMany({ orderBy: { platform: 'asc' } });
};

const listThresholds = async (platform) => {
  await ensureDefaultThresholds();
  return prisma.alert_thresholds.findMany({
    where: platform ? { platform } : undefined,
    orderBy: { platform: 'asc' },
  });
};

const upsertThreshold = async (platform, patch = {}) => {
  const data = {
    low_threshold: Number(patch.low_threshold) || 100,
    medium_threshold: Number(patch.medium_threshold) || 500,
    high_threshold: Number(patch.high_threshold) || 1000,
    time_window_minutes: Number(patch.time_window_minutes) || 60,
    is_active: patch.is_active !== false,
  };
  return prisma.alert_thresholds.upsert({
    where: { platform },
    create: { platform, ...data },
    update: data,
  });
};

const bulkUpsertThresholds = async (thresholds = []) => {
  const out = [];
  for (const t of thresholds) {
    if (!t?.platform) continue;
    out.push(await upsertThreshold(t.platform, t));
  }
  return out;
};

const listTemplates = async () =>
  prisma.report_templates.findMany({ orderBy: { created_at: 'desc' } });

const getTemplate = async (id) =>
  prisma.report_templates.findUnique({ where: { id: String(id) } });

const createTemplate = async ({ name, platform = 'all', html_content, is_default = false, created_by }) => {
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

const updateTemplateContent = async (id, html_content) =>
  prisma.report_templates.update({
    where: { id: String(id) },
    data: { html_content },
  });

const setDefaultTemplate = async (id) => {
  const template = await getTemplate(id);
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

const deleteTemplate = async (id) => {
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

const listPolicies = async () => {
  const rows = await prisma.policy_mappings.findMany({ orderBy: { category_id: 'asc' } });
  return rows.map(hydratePolicy);
};

const getPolicy = async (id) => {
  const row = await prisma.policy_mappings.findUnique({ where: { id: String(id) } });
  return hydratePolicy(row);
};

const createPolicy = async (body = {}) => {
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

const updatePolicy = async (id, body = {}) => {
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
  const row = await prisma.policy_mappings.update({ where: { id: String(id) }, data });
  return hydratePolicy(row);
};

const deletePolicy = async (id) => {
  try {
    await prisma.policy_mappings.delete({ where: { id: String(id) } });
    return true;
  } catch {
    return false;
  }
};

const listActivePolicies = async () => {
  const rows = await prisma.policy_mappings.findMany({
    where: { is_active: true },
    orderBy: { category_id: 'asc' },
  });
  return rows.map(hydratePolicy);
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
