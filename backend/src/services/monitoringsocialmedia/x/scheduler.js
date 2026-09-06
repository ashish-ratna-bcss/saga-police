const prisma = require('../../../../prisma/client');
const { runXProfile } = require('./runProfile');

const TICK_MS = Number(process.env.X_MONITOR_TICK_MS) || 60_000;

let timer = null;
let ticking = false;
const inFlight = new Set();

const loadDueXAccounts = async () => {
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
    const due = await loadDueXAccounts();
    for (const row of due) {
      if (inFlight.has(row.id)) continue;
      inFlight.add(row.id);
      try {
        await runXProfile(row.id, { force: false });
      } finally {
        inFlight.delete(row.id);
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
  console.log('[monitoringsocialmedia/x] scheduler started');
  timer = setInterval(tick, TICK_MS);
  setTimeout(tick, 5_000);
};

const stopScheduler = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
};

const markInFlight = (id) => inFlight.add(id);
const clearInFlight = (id) => inFlight.delete(id);
const isInFlight = (id) => inFlight.has(id);

module.exports = {
  startScheduler,
  stopScheduler,
  tick,
  markInFlight,
  clearInFlight,
  isInFlight,
};
