const { listTenantDbNames, getTenantPrisma } = require('../../../lib/tenantDatabase.service');
const { runXProfile } = require('./runProfile');

const TICK_MS = Number(process.env.X_MONITOR_TICK_MS) || 60_000;

let timer = null;
let ticking = false;
const inFlight = new Set();

const flightKey = (dbName, id) => `${dbName || ''}:${id}`;

const loadDueXAccounts = async (prisma) => {
  const rows = await prisma.social_media_accounts.findMany({
    where: {
      monitoring_status: 'started',
      is_active: true,
      platforms: { slug: 'x' },
    },
    include: { platforms: { select: { slug: true } } },
    orderBy: { id: 'asc' },
  });

  const now = Date.now();
  return rows.filter((row) => {
    if (!row.last_fetched_at) return true;
    const intervalMs = Math.max(1, Number(row.poll_interval_minutes) || 30) * 60_000;
    return now - new Date(row.last_fetched_at).getTime() >= intervalMs;
  });
};

const tick = async () => {
  if (ticking) return;
  ticking = true;
  try {
    const dbNames = await listTenantDbNames();
    for (const dbName of dbNames) {
      const tenantPrisma = getTenantPrisma(dbName);
      try {
        const due = await loadDueXAccounts(tenantPrisma);
        for (const row of due) {
          const key = flightKey(dbName, row.id);
          if (inFlight.has(key)) continue;
          inFlight.add(key);
          try {
            await runXProfile(row.id, {
              force: false,
              db: tenantPrisma,
              dbName,
            });
          } finally {
            inFlight.delete(key);
          }
        }
      } catch (error) {
        console.error(`[monitoringsocialmedia/x] scheduler tenant=${dbName}:`, error.message);
      }
    }
  } catch (error) {
    console.error('[monitoringsocialmedia/x] scheduler tick:', error.message);
  } finally {
    ticking = false;
  }
};

const startScheduler = () => {
  if (timer) return;
  timer = setInterval(tick, TICK_MS);
  setTimeout(tick, 5_000);
};

const stopScheduler = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
};

const markInFlight = (id, dbName = null) => inFlight.add(flightKey(dbName, id));
const clearInFlight = (id, dbName = null) => inFlight.delete(flightKey(dbName, id));
const isInFlight = (id, dbName = null) => inFlight.has(flightKey(dbName, id));

module.exports = {
  startScheduler,
  stopScheduler,
  tick,
  markInFlight,
  clearInFlight,
  isInFlight,
};
