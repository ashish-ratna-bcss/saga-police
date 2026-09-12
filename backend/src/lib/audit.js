const crypto = require('crypto');
const logger = require('./logger');
const { getTenantPrisma } = require('./tenantDatabase.service');

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'secret',
  'api_key',
  'blugate_client_key',
  'authorization',
  'cookie',
]);

const clientIp = (req) => {
  const xf = String(req?.headers?.['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  return xf || req?.ip || req?.socket?.remoteAddress || null;
};

const deviceLabelFromUa = (ua) => {
  const s = String(ua || '').trim();
  if (!s) return 'Unknown device';
  let browser = 'Browser';
  if (/Edg\//i.test(s)) browser = 'Edge';
  else if (/Chrome\//i.test(s) && !/Chromium/i.test(s)) browser = 'Chrome';
  else if (/Firefox\//i.test(s)) browser = 'Firefox';
  else if (/Safari\//i.test(s) && !/Chrome/i.test(s)) browser = 'Safari';

  let os = 'Unknown OS';
  if (/Windows/i.test(s)) os = 'Windows';
  else if (/Mac OS X|Macintosh/i.test(s)) os = 'macOS';
  else if (/Android/i.test(s)) os = 'Android';
  else if (/iPhone|iPad/i.test(s)) os = 'iOS';
  else if (/Linux/i.test(s)) os = 'Linux';

  return `${browser} on ${os}`;
};

const requestMeta = (req) => {
  const userAgent = req?.get?.('user-agent') || req?.headers?.['user-agent'] || null;
  const host = String(req?.get?.('x-forwarded-host') || req?.get?.('host') || '');
  const portMatch = host.match(/:(\d+)$/);
  return {
    ip: clientIp(req),
    user_agent: userAgent,
    device_label: deviceLabelFromUa(userAgent),
    frontend_port: portMatch ? Number(portMatch[1]) : null,
  };
};

const sanitizeValue = (value, depth = 0) => {
  if (value == null) return value;
  if (depth > 6) return '[truncated]';
  if (Buffer.isBuffer(value)) return `[bytes:${value.length}]`;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitizeValue(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(String(k).toLowerCase())) {
        out[k] = '[redacted]';
      } else {
        out[k] = sanitizeValue(v, depth + 1);
      }
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 4000) {
    return `${value.slice(0, 4000)}…`;
  }
  return value;
};

/**
 * Write application change log into the admin tenant DB.
 * Never throws into the request path.
 *
 * Supports both:
 *   createAuditLog({ req, user, action, ... })
 *   createAuditLog(user, action, resourceType, resourceId, details) // legacy
 */
const createAuditLog = async (...args) => {
  try {
    let payload;
    if (args.length === 1 && args[0] && typeof args[0] === 'object' && args[0].action) {
      payload = args[0];
    } else {
      const [user, action, resourceType, resourceId, details] = args;
      payload = {
        user,
        action,
        resourceType,
        resourceId,
        details,
        req: details?.req,
      };
    }

    const {
      req,
      user,
      action,
      resourceType = null,
      resourceId = null,
      oldData = null,
      newData = null,
      details = null,
      tenantPrisma: tenantPrismaArg = null,
    } = payload;

    if (!action) return null;

    const actor = user || req?.user || null;
    const dbName = actor?.db_name || req?.tenantDbName || null;
    const tenantPrisma = tenantPrismaArg || req?.tenantPrisma || (dbName ? getTenantPrisma(dbName) : null);
    if (!tenantPrisma?.audit_logs?.create) return null;

    const meta = requestMeta(req || {});
    const detailsObj =
      details && typeof details === 'object' && !Array.isArray(details)
        ? { ...details }
        : details != null
          ? { value: details }
          : null;
    if (detailsObj?.req) delete detailsObj.req;

    const row = await tenantPrisma.audit_logs.create({
      data: {
        id: crypto.randomUUID(),
        user_id: actor?.id ?? actor?.user_id ?? null,
        username: actor?.username || null,
        email: actor?.email || null,
        name: actor?.name || actor?.full_name || null,
        role_slug: actor?.role || actor?.role_slug || null,
        action: String(action),
        resource_type: resourceType != null ? String(resourceType) : null,
        resource_id: resourceId != null ? String(resourceId) : null,
        method: req?.method || null,
        path: req?.originalUrl || req?.path || null,
        old_data: oldData != null ? sanitizeValue(oldData) : undefined,
        new_data: newData != null ? sanitizeValue(newData) : undefined,
        details: detailsObj != null ? sanitizeValue(detailsObj) : undefined,
        ip: meta.ip,
        user_agent: meta.user_agent,
        device_label: meta.device_label,
      },
    });
    if (req) req.auditWritten = true;
    return row;
  } catch (error) {
    logger.warn('[audit] write failed:', error.message);
    return null;
  }
};

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// Only skip public/noise paths — never skip /api/me theme/settings mutations
const SKIP_PREFIXES = [
  '/api/branding',
  '/api/health',
  '/api/audit',
];

const shouldSkipAuditPath = (path) => {
  const p = String(path || '').split('?')[0];
  return SKIP_PREFIXES.some(
    (prefix) => p === prefix || p.startsWith(`${prefix}/`)
  );
};

/** Catch ALL mutating API writes (including /me/theme). Mount early; reads req.user on finish. */
const auditMutationMiddleware = (req, res, next) => {
  if (!MUTATING.has(String(req.method || '').toUpperCase())) return next();
  if (shouldSkipAuditPath(req.originalUrl || req.path)) return next();

  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    if (req.auditWritten) return; // controller already wrote structured old/new
    if (!req.user?.db_name && !req.tenantDbName) return;
    const action = String(req.method || 'POST').toLowerCase();
    const pathParts = String(req.originalUrl || req.path || '')
      .split('?')[0]
      .replace(/^\/api\/?/, '')
      .split('/')
      .filter(Boolean);
    const resourceType = pathParts[0] === 'me' && pathParts[1]
      ? `me_${pathParts[1]}`
      : pathParts[0] || 'api';
    createAuditLog({
      req,
      user: req.user,
      action,
      resourceType,
      resourceId: req.params?.id || null,
      newData: req.body && typeof req.body === 'object' ? req.body : null,
      details: { status: res.statusCode, path: req.originalUrl },
    });
  });
  return next();
};

module.exports = {
  createAuditLog,
  auditMutationMiddleware,
  requestMeta,
  sanitizeValue,
  clientIp,
  deviceLabelFromUa,
};
