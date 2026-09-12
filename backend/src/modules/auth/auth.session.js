const crypto = require('crypto');
const prisma = require('../../../prisma/client');
const { requestMeta } = require('../../lib/audit');

const toPublicSession = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    device_label: row.device_label || 'Unknown device',
    ip: row.ip || null,
    user_agent: row.user_agent || null,
    frontend_port: row.frontend_port ?? null,
    created_at: row.created_at,
    last_seen_at: row.last_seen_at,
  };
};

const findActiveSession = async (userId) =>
  prisma.auth_sessions.findFirst({
    where: { user_id: userId, revoked_at: null },
    orderBy: { created_at: 'desc' },
  });

const createSession = async (userId, req) => {
  const meta = requestMeta(req);
  return prisma.auth_sessions.create({
    data: {
      id: crypto.randomUUID(),
      user_id: userId,
      ip: meta.ip,
      user_agent: meta.user_agent,
      device_label: meta.device_label,
      frontend_port: meta.frontend_port,
    },
  });
};

const revokeSession = async (sessionId) => {
  if (!sessionId) return;
  await prisma.auth_sessions.updateMany({
    where: { id: sessionId, revoked_at: null },
    data: { revoked_at: new Date() },
  });
};

const revokeOtherSessions = async (userId, keepSessionId = null) => {
  await prisma.auth_sessions.updateMany({
    where: {
      user_id: userId,
      revoked_at: null,
      ...(keepSessionId ? { id: { not: keepSessionId } } : {}),
    },
    data: { revoked_at: new Date() },
  });
};

const revokeAllSessions = async (userId) => revokeOtherSessions(userId, null);

const getSessionById = async (sessionId) => {
  if (!sessionId) return null;
  return prisma.auth_sessions.findUnique({ where: { id: sessionId } });
};

const touchSession = async (sessionId) => {
  if (!sessionId) return;
  try {
    await prisma.auth_sessions.updateMany({
      where: { id: sessionId, revoked_at: null },
      data: { last_seen_at: new Date() },
    });
  } catch {
    // ignore
  }
};

module.exports = {
  toPublicSession,
  findActiveSession,
  createSession,
  revokeSession,
  revokeOtherSessions,
  revokeAllSessions,
  getSessionById,
  touchSession,
};
