const dbOf = require('../../lib/dbOf');
const { PLATFORM_CATALOG_DEFS } = require('../../lib/platformCatalog');
const { encryptPlatformSecret } = require('../../lib/platformSecrets');
const {
  callGlobalApi,
  resolveGlobalAuth,
} = require('../../services/blugate/global/blugate.global.api_client');
const { decryptPlatformSecret } = require('../../lib/platformSecrets');
const { syncAdminAllowedPlatforms } = require('../social-profiles/socialProfile.controller');

const fail = (res, error) =>
  res.status(error.status || 500).json({ error: error.message || 'Request failed' });

const ensureSchema = async (prisma) => {
  const { ensureOpsSchema } = require('../../../prisma/ensureOpsSchema');
  await ensureOpsSchema(prisma);
};

/* ───────────────────────── BluGate (one set of keys for every platform) ───────────────────────── */

const SLUG_ALIASES = { twitter: 'x', x: 'twitter' };
const catalogSlugs = new Set(PLATFORM_CATALOG_DEFS.map((p) => p.slug));
const GLOBAL_META = '_global';

/** Map a slug reported by BluGate to a catalog slug (twitter → x, reddit-provider → reddit). */
const toCatalogSlug = (raw) => {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return null;
  const canonical = s === 'twitter' ? 'x' : s;
  if (catalogSlugs.has(canonical)) return canonical;
  const head = canonical.split(/[-_ ]/)[0];
  const headCanonical = head === 'twitter' ? 'x' : head;
  return catalogSlugs.has(headCanonical) ? headCanonical : null;
};

const NO_ACCESS_FLAGS = ['accessGranted', 'access_granted', 'has_access', 'access', 'allowed', 'enabled', 'accessible', 'authorized', 'subscribed', 'granted'];
const URL_FIELDS = ['gatewayUrl', 'gateway_url', 'base_url', 'baseUrl', 'url', 'endpoint', 'host', 'gatewayBaseUrl'];
const GLOBAL_HEALTH_FIELDS = ['status', 'timestamp'];

/** BluGate /health → { client, system, platforms:[…] }. Platforms carry accessGranted, health, version, endpointCount. */
const extractPlatforms = (health) => {
  const root = health && typeof health === 'object' ? health : {};
  const list = Array.isArray(root.platforms)
    ? root.platforms
    : Array.isArray(root.data?.platforms)
      ? root.data.platforms
      : [];
  const found = [];
  for (const value of list) {
    if (typeof value === 'string') {
      found.push({ raw: value, name: value, accessible: true, url: null, health: null, version: null, endpointCount: null, blugateId: null });
      continue;
    }
    if (!value || typeof value !== 'object') continue;
    const slug = value.slug || value.platform || value.name || value.id;
    if (!slug) continue;
    const flags = NO_ACCESS_FLAGS.filter((f) => typeof value[f] === 'boolean');
    found.push({
      raw: String(slug).toLowerCase(),
      name: String(value.name || slug),
      accessible: flags.length ? flags.every((f) => value[f]) : true,
      url: URL_FIELDS.map((f) => value[f]).find((v) => typeof v === 'string' && v.trim()) || null,
      health: value.health || value.status || null,
      version: value.version || null,
      endpointCount: Number.isFinite(Number(value.endpointCount)) ? Number(value.endpointCount) : null,
      blugateId: value.id || null,
    });
  }
  return found;
};

const extractClient = (health) => {
  const c = health?.client;
  if (!c || typeof c !== 'object') return null;
  return {
    id: c.id || null,
    name: c.name || c.organization || null,
    code: c.clientCode || c.client_code || null,
    organization: c.organization || null,
    application: c.application || null,
    email: c.email || null,
    status: c.status || null,
    environment: c.environment || null,
    accessible_count: c.accessiblePlatformsCount ?? null,
    total_count: c.totalPlatformsCount ?? null,
  };
};

const extractSystem = (health) => {
  const sys = health?.system;
  if (!sys && !health?.status) return null;
  return {
    status: sys?.status || null,
    version: sys?.version || null,
    environment: sys?.environment || null,
    gateway: sys?.gateway || null,
    database: sys?.database || null,
    health: health?.status || null,
    checked_at: health?.timestamp || null,
  };
};

/** BluGate /billing → usage totals and a per-platform map keyed by BluGate slug. */
const extractBilling = (billing) => {
  if (!billing || typeof billing !== 'object') return null;
  const usage = {};
  for (const p of Array.isArray(billing.platformUsage) ? billing.platformUsage : []) {
    const slug = String(p.slug || '').toLowerCase();
    if (!slug) continue;
    usage[slug] = {
      today: p.consumed?.today ?? 0,
      month: p.consumed?.month ?? 0,
      all_time: p.consumed?.allTime ?? 0,
      limits: {
        per_minute: p.rateLimits?.perMinute ?? null,
        daily: p.rateLimits?.daily ?? null,
        weekly: p.rateLimits?.weekly ?? null,
        monthly: p.rateLimits?.monthly ?? null,
      },
      quota: {
        monthly_limit: p.quota?.monthlyLimit ?? null,
        remaining: p.quota?.remaining ?? null,
        percent: p.quota?.percentConsumed ?? null,
        status: p.quota?.status || null,
      },
    };
  }
  const o = billing.overallUsage || {};
  return {
    active_api_keys: billing.client?.activeApiKeys ?? null,
    period: {
      month: billing.billingPeriod?.currentMonth || null,
      start: billing.billingPeriod?.periodStart || null,
      end: billing.billingPeriod?.periodEnd || null,
    },
    overall: {
      total: o.totalRequestsAllTime ?? null,
      month: o.requestsThisMonth ?? null,
      today: o.requestsToday ?? null,
      success_rate: o.successRate ?? null,
      avg_latency_ms: o.averageLatencyMs ?? null,
    },
    usage,
  };
};

const overviewOf = (health, billing) => ({
  client: extractClient(health),
  system: extractSystem(health),
  billing: extractBilling(billing),
});

const BILLING_META = '_billing';
const saveSnapshot = (prisma, slug, raw) =>
  prisma.$executeRawUnsafe(
    `INSERT INTO blugate_platform_meta (slug, status, last_seen_at, raw, updated_at)
     VALUES ($1, 'available', NOW(), $2::jsonb, NOW())
     ON CONFLICT (slug) DO UPDATE SET last_seen_at = NOW(), raw = EXCLUDED.raw, updated_at = NOW()`,
    slug, JSON.stringify(raw)
  );

/** BluGate doesn't send URLs: <global base with /global swapped for the platform slug>. */
const derivedGatewayUrl = (rawSlug) => {
  try {
    const base = require('../../services/blugate/global/blugate.global.env').getGlobalBaseUrl();
    if (!base) return null;
    return /\/global\/?$/i.test(base)
      ? base.replace(/\/global\/?$/i, `/${String(rawSlug).toLowerCase()}`)
      : null;
  } catch {
    return null;
  }
};

const findRowForSlug = (rows, slug) =>
  rows.find((r) => r.slug === slug) ||
  (SLUG_ALIASES[slug] ? rows.find((r) => r.slug === SLUG_ALIASES[slug]) : null) ||
  null;

const listMeta = (prisma) =>
  prisma.$queryRawUnsafe(
    `SELECT slug, app_slug, name, blugate_id, version, health, endpoint_count, base_url, status, change, first_seen_at, last_seen_at
       FROM blugate_platform_meta WHERE slug NOT IN ($1, '_billing') ORDER BY name NULLS LAST, slug`,
    GLOBAL_META
  );

const saveMeta = (prisma, m) =>
  prisma.$executeRawUnsafe(
    `INSERT INTO blugate_platform_meta
       (slug, app_slug, name, blugate_id, version, health, endpoint_count, base_url, status, change, first_seen_at, last_seen_at, raw, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::int, $8, $9::text, $10, NOW(), CASE WHEN $9::text = 'removed' THEN NULL ELSE NOW() END, $11::jsonb, NOW())
     ON CONFLICT (slug) DO UPDATE SET
       app_slug = EXCLUDED.app_slug,
       name = COALESCE(EXCLUDED.name, blugate_platform_meta.name),
       blugate_id = COALESCE(EXCLUDED.blugate_id, blugate_platform_meta.blugate_id),
       version = COALESCE(EXCLUDED.version, blugate_platform_meta.version),
       health = COALESCE(EXCLUDED.health, blugate_platform_meta.health),
       endpoint_count = COALESCE(EXCLUDED.endpoint_count, blugate_platform_meta.endpoint_count),
       base_url = COALESCE(EXCLUDED.base_url, blugate_platform_meta.base_url),
       status = EXCLUDED.status,
       change = EXCLUDED.change,
       first_seen_at = COALESCE(blugate_platform_meta.first_seen_at, EXCLUDED.first_seen_at),
       last_seen_at = CASE WHEN EXCLUDED.status = 'removed' THEN blugate_platform_meta.last_seen_at ELSE NOW() END,
       raw = COALESCE(EXCLUDED.raw, blugate_platform_meta.raw),
       updated_at = NOW()`,
    m.slug, m.appSlug || null, m.name || null, m.blugateId || null, m.version || null, m.health || null,
    m.endpointCount ?? null, m.baseUrl || null, m.status, m.change || null,
    m.raw ? JSON.stringify(m.raw) : null
  );

const getBlugate = async (req, res) => {
  try {
    const prisma = dbOf(req.tenantPrisma);
    await ensureSchema(prisma);
    const rows = await prisma.platforms.findMany({
      select: { id: true, slug: true, is_active: true, api_key: true, blugate_client_key: true },
    });
    const withKeys = rows.filter((r) => r.api_key && r.blugate_client_key);
    const snaps = await prisma.$queryRawUnsafe(
      'SELECT slug, raw, last_seen_at FROM blugate_platform_meta WHERE slug IN ($1, $2)', GLOBAL_META, BILLING_META
    );
    const health = snaps.find((r) => r.slug === GLOBAL_META);
    const billing = snaps.find((r) => r.slug === BILLING_META);
    res.json({
      configured: withKeys.length > 0,
      platforms_total: rows.length,
      last_fetched_at: health?.last_seen_at || null,
      ...overviewOf(health?.raw, billing?.raw),
      meta: await listMeta(prisma),
    });
  } catch (error) {
    fail(res, error);
  }
};

/**
 * Fetch the platforms from BluGate and save them.
 *  - With api_key + blugate_client_key in the body: verify, save the keys, fetch.
 *  - With no body: fetch again using the saved keys.
 * Access granted + supported here → saved (new ones start Active, existing keep Active/Stopped).
 * Every fetch records what changed since the previous one: new, access_granted, access_lost, removed.
 */
const fetchBlugate = async (req, res) => {
  try {
    const prisma = dbOf(req.tenantPrisma);
    await ensureSchema(prisma);

    const apiKey = String(req.body?.api_key || '').trim();
    const clientKey = String(req.body?.blugate_client_key || '').trim();
    if (Boolean(apiKey) !== Boolean(clientKey)) {
      return res.status(400).json({ error: 'Enter both the client key and the API key, or leave both empty to use the saved keys' });
    }

    let auth;
    let encrypted;
    if (apiKey) {
      auth = { accessKey: apiKey, clientId: clientKey };
      encrypted = { api_key: encryptPlatformSecret(apiKey), blugate_client_key: encryptPlatformSecret(clientKey) };
    } else {
      auth = await resolveGlobalAuth(prisma);
      if (!auth) return res.status(400).json({ error: 'No BluGate keys saved yet. Enter them first.' });
      const row = await prisma.platforms.findFirst({
        where: { api_key: { not: null }, blugate_client_key: { not: null } },
      });
      encrypted = { api_key: row.api_key, blugate_client_key: row.blugate_client_key };
    }

    let health;
    try {
      health = await callGlobalApi('HEALTH', {}, auth);
    } catch (error) {
      return res.status(400).json({ error: `Could not fetch from BluGate: ${error.message}` });
    }

    let billing = null;
    try {
      billing = await callGlobalApi('BILLING', {}, auth);
    } catch { /* usage is optional; platforms still save */ }

    const discovered = extractPlatforms(health);
    if (!discovered.length) {
      return res.status(400).json({ error: 'BluGate answered but listed no platforms. Nothing was changed.', raw: health });
    }

    const rows = await prisma.platforms.findMany();
    const before = new Map((await listMeta(prisma)).map((m) => [m.slug, m]));
    const seen = new Set();
    const changes = { added: [], access_granted: [], access_lost: [], removed: [] };

    for (const item of discovered) {
      seen.add(item.raw);
      const appSlug = toCatalogSlug(item.raw);
      const prev = before.get(item.raw);
      const url = item.url || derivedGatewayUrl(item.raw);
      let rowSlug = null;
      let change = null;

      if (appSlug && item.accessible) {
        const existing = findRowForSlug(rows, appSlug);
        if (existing) {
          rowSlug = existing.slug;
          await prisma.platforms.update({ where: { id: existing.id }, data: encrypted });
        } else {
          const def = PLATFORM_CATALOG_DEFS.find((p) => p.slug === appSlug);
          await prisma.platforms.create({
            data: { name: def.name, slug: appSlug, icon: def.icon, color: def.color, fields: def.fields, is_active: true, ...encrypted },
          });
          rowSlug = appSlug;
          changes.added.push(item.name);
          change = 'new';
        }
      } else if (appSlug) {
        rowSlug = (findRowForSlug(rows, appSlug) || {}).slug || null;
      }

      const status = item.accessible ? 'available' : 'no_access';
      if (!change && !prev) change = 'new';
      if (!change && prev) {
        if (prev.status === 'no_access' && status === 'available') { change = 'access_granted'; changes.access_granted.push(item.name); }
        else if (prev.status === 'available' && status === 'no_access') { change = 'access_lost'; changes.access_lost.push(item.name); }
        else if (prev.status === 'removed') { change = 'new'; changes.added.push(item.name); }
      } else if (change === 'new' && !changes.added.includes(item.name)) {
        changes.added.push(item.name);
      }

      await saveMeta(prisma, {
        slug: item.raw, appSlug: rowSlug || appSlug, name: item.name, blugateId: item.blugateId, version: item.version,
        health: item.health, endpointCount: item.endpointCount, baseUrl: url, status, change,
      });
    }

    for (const [slug, m] of before) {
      if (seen.has(slug) || m.status === 'removed') continue;
      changes.removed.push(m.name || slug);
      await saveMeta(prisma, { slug, appSlug: m.app_slug, name: m.name, status: 'removed', change: 'removed' });
    }

    if (apiKey) await prisma.platforms.updateMany({ data: encrypted });
    await saveSnapshot(prisma, GLOBAL_META, health);
    if (billing) await saveSnapshot(prisma, BILLING_META, billing);
    await syncAdminAllowedPlatforms(req);

    res.json({
      ok: true,
      found: discovered.length,
      changes,
      ...overviewOf(health, billing),
      meta: await listMeta(prisma),
      raw: { health, billing },
    });
  } catch (error) {
    fail(res, error);
  }
};

/* ───────────────────────── Custom third-party endpoints ───────────────────────── */

const publicEndpoint = (row) => ({
  id: row.id,
  name: row.name,
  base_url: row.base_url,
  auth_header: row.auth_header,
  auth_scheme: row.auth_scheme,
  notes: row.notes,
  is_active: row.is_active,
  has_key: Boolean(row.api_key),
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const cleanUrl = (raw) => {
  const value = String(raw || '').trim();
  if (!value) return { error: 'API URL is required' };
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return { error: 'API URL is not a valid URL' };
  }
  if (!['http:', 'https:'].includes(url.protocol)) return { error: 'API URL must start with http or https' };
  return { value: url.toString().replace(/\/$/, '') };
};

const HEADER_RE = /^[A-Za-z0-9-]{1,80}$/;

const listCustomEndpoints = async (req, res) => {
  try {
    const prisma = dbOf(req.tenantPrisma);
    await ensureSchema(prisma);
    const rows = await prisma.$queryRawUnsafe('SELECT * FROM custom_endpoints ORDER BY id ASC');
    res.json(rows.map(publicEndpoint));
  } catch (error) {
    fail(res, error);
  }
};

const createCustomEndpoint = async (req, res) => {
  try {
    const prisma = dbOf(req.tenantPrisma);
    await ensureSchema(prisma);
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const url = cleanUrl(req.body?.base_url);
    if (url.error) return res.status(400).json({ error: url.error });
    const header = String(req.body?.auth_header || 'Authorization').trim();
    if (!HEADER_RE.test(header)) return res.status(400).json({ error: 'Header name is not valid' });
    const scheme = String(req.body?.auth_scheme ?? 'Bearer').trim().slice(0, 40);
    const key = String(req.body?.api_key || '').trim();

    const rows = await prisma.$queryRawUnsafe(
      `INSERT INTO custom_endpoints (name, base_url, api_key, auth_header, auth_scheme, notes, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      name,
      url.value,
      key ? encryptPlatformSecret(key) : null,
      header,
      scheme,
      String(req.body?.notes || '').trim() || null,
      req.body?.is_active !== false
    );
    res.status(201).json(publicEndpoint(rows[0]));
  } catch (error) {
    fail(res, error);
  }
};

const updateCustomEndpoint = async (req, res) => {
  try {
    const prisma = dbOf(req.tenantPrisma);
    await ensureSchema(prisma);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });
    const current = (await prisma.$queryRawUnsafe('SELECT * FROM custom_endpoints WHERE id = $1', id))[0];
    if (!current) return res.status(404).json({ error: 'Endpoint not found' });

    const b = req.body || {};
    const name = b.name !== undefined ? String(b.name).trim() : current.name;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    let baseUrl = current.base_url;
    if (b.base_url !== undefined) {
      const url = cleanUrl(b.base_url);
      if (url.error) return res.status(400).json({ error: url.error });
      baseUrl = url.value;
    }
    const header = b.auth_header !== undefined ? String(b.auth_header).trim() : current.auth_header;
    if (!HEADER_RE.test(header)) return res.status(400).json({ error: 'Header name is not valid' });
    const scheme = b.auth_scheme !== undefined ? String(b.auth_scheme).trim().slice(0, 40) : current.auth_scheme;
    // Blank key = keep the saved one. Send clear_key to remove it.
    let apiKey = current.api_key;
    if (b.clear_key === true) apiKey = null;
    else if (b.api_key !== undefined && String(b.api_key).trim()) apiKey = encryptPlatformSecret(String(b.api_key).trim());

    const rows = await prisma.$queryRawUnsafe(
      `UPDATE custom_endpoints
         SET name = $1, base_url = $2, api_key = $3, auth_header = $4, auth_scheme = $5,
             notes = $6, is_active = $7, updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      name,
      baseUrl,
      apiKey,
      header,
      scheme,
      b.notes !== undefined ? String(b.notes).trim() || null : current.notes,
      b.is_active !== undefined ? Boolean(b.is_active) : current.is_active,
      id
    );
    res.json(publicEndpoint(rows[0]));
  } catch (error) {
    fail(res, error);
  }
};

const deleteCustomEndpoint = async (req, res) => {
  try {
    const prisma = dbOf(req.tenantPrisma);
    await ensureSchema(prisma);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });
    await prisma.$executeRawUnsafe('DELETE FROM custom_endpoints WHERE id = $1', id);
    res.json({ ok: true });
  } catch (error) {
    fail(res, error);
  }
};

module.exports = {
  getBlugate,
  fetchBlugate,
  listCustomEndpoints,
  createCustomEndpoint,
  updateCustomEndpoint,
  deleteCustomEndpoint,
  // exported for tests
  extractPlatforms,
  toCatalogSlug,
  _internals: { saveMeta, listMeta, overviewOf },
};
