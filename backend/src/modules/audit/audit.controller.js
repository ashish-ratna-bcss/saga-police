const prisma = require('../../../prisma/client');
const { ensureOpsSchema } = require('../../../prisma/ensureOpsSchema');
const { getTenantPrisma } = require('../../lib/tenantDatabase.service');
const logger = require('../../lib/logger');

const shapeLog = (row, tenantMeta = null) => ({
  id: row.id,
  _id: row.id,
  user_id: row.user_id,
  user_name: row.name || row.username,
  user_email: row.email,
  username: row.username,
  action: row.action,
  resource_type: row.resource_type,
  resource_id: row.resource_id,
  method: row.method,
  path: row.path,
  old_data: row.old_data,
  new_data: row.new_data,
  details: row.details,
  ip: row.ip,
  user_agent: row.user_agent,
  device_label: row.device_label,
  timestamp: row.created_at,
  created_at: row.created_at,
  tenant_db: tenantMeta?.db_name || null,
  tenant_label: tenantMeta?.label || null,
});

const buildDateWhere = (query = {}) => {
  const where = {};
  const { start_date, end_date, action, resource_type } = query;

  if (start_date || end_date) {
    where.created_at = {};
    if (start_date) where.created_at.gte = new Date(`${start_date}T00:00:00.000Z`);
    if (end_date) where.created_at.lte = new Date(`${end_date}T23:59:59.999Z`);
  }
  if (action && action !== 'all') where.action = String(action);
  if (resource_type && resource_type !== 'all') where.resource_type = String(resource_type);
  return where;
};

const fetchTenantLogs = async (tenantPrisma, where, take = 1000) => {
  if (!tenantPrisma?.audit_logs?.findMany) return [];
  await ensureOpsSchema(tenantPrisma);
  return tenantPrisma.audit_logs.findMany({
    where,
    orderBy: { created_at: 'desc' },
    take,
  });
};

/** Distinct tenant DBs (prefer admin name as label for superadmin aggregate view). */
const listAdminTenants = async () => {
  const users = await prisma.users.findMany({
    where: { db_name: { not: null } },
    select: {
      id: true,
      name: true,
      username: true,
      db_name: true,
      roles: { select: { slug: true } },
    },
    orderBy: { id: 'asc' },
  });

  const byDb = new Map();
  for (const user of users) {
    const db = String(user.db_name || '').trim();
    if (!db) continue;
    const isAdmin = user.roles?.slug === 'admin';
    const existing = byDb.get(db);
    if (!existing) {
      byDb.set(db, {
        db_name: db,
        label: user.name || user.username || db,
        admin_id: isAdmin ? user.id : null,
      });
      continue;
    }
    // Prefer an admin row for the display label
    if (isAdmin && !existing.admin_id) {
      byDb.set(db, {
        db_name: db,
        label: user.name || user.username || db,
        admin_id: user.id,
      });
    }
  }
  return [...byDb.values()];
};

const listAuditLogs = async (req, res) => {
  try {
    const role = req.user?.role;
    const baseWhere = buildDateWhere(req.query || {});
    const { user_id, tenant: tenantFilter } = req.query || {};

    // Superadmin: aggregate every admin tenant (optional ?tenant=db_name filter)
    if (role === 'superadmin') {
      const tenants = await listAdminTenants();
      const selected = tenantFilter && tenantFilter !== 'all'
        ? tenants.filter((t) => t.db_name === String(tenantFilter))
        : tenants;

      if (!selected.length) {
        return res.json([]);
      }

      const perTenant = Math.min(1000, Math.max(100, Math.floor(2000 / selected.length)));
      const chunks = await Promise.all(
        selected.map(async (tenant) => {
          try {
            const tenantPrisma = getTenantPrisma(tenant.db_name);
            if (!tenantPrisma) return [];
            const where = { ...baseWhere };
            if (user_id) where.user_id = Number(user_id);
            const rows = await fetchTenantLogs(tenantPrisma, where, perTenant);
            return rows.map((row) => shapeLog(row, tenant));
          } catch (err) {
            logger.warn(`[audit] skip tenant ${tenant.db_name}:`, err.message);
            return [];
          }
        })
      );

      const merged = chunks.flat().sort((a, b) => {
        const ta = new Date(a.created_at).getTime();
        const tb = new Date(b.created_at).getTime();
        return tb - ta;
      });

      return res.json(merged.slice(0, 2000));
    }

    const tenantPrisma = req.tenantPrisma;
    if (!tenantPrisma || !req.tenantDbName) {
      return res.status(400).json({ message: 'No tenant database for this account' });
    }

    const where = { ...baseWhere };

    // Admin: own + child users; user: own only
    if (role === 'user') {
      where.user_id = req.user.id;
    } else if (role === 'admin') {
      const children = await prisma.users.findMany({
        where: { created_by: req.user.id },
        select: { id: true },
      });
      const ids = [req.user.id, ...children.map((c) => c.id)];
      if (user_id && ids.includes(Number(user_id))) {
        where.user_id = Number(user_id);
      } else {
        where.user_id = { in: ids };
      }
    } else if (user_id) {
      where.user_id = Number(user_id);
    }

    const logs = await fetchTenantLogs(tenantPrisma, where, 1000);
    return res.json(
      logs.map((row) =>
        shapeLog(row, {
          db_name: req.tenantDbName,
          label: req.user?.name || req.user?.username || req.tenantDbName,
        })
      )
    );
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Failed to load audit logs' });
  }
};

module.exports = { listAuditLogs };
