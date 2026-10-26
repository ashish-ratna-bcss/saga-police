const prisma = require('../../../prisma/client');
const { ensureOpsSchema } = require('../../../prisma/ensureOpsSchema');

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

const listAuditLogs = async (req, res) => {
  try {
    const role = req.user?.role;
    const baseWhere = buildDateWhere(req.query || {});
    const { user_id } = req.query || {};

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
