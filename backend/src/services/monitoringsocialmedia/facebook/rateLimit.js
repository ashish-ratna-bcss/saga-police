const MIN_GAP_MS = Number(process.env.FACEBOOK_MONITOR_GAP_MS) || 2500;

let lastCallAt = 0;
let backoffUntil = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Wait until min gap since last Facebook Blugate call (and any backoff). */
const waitForSlot = async () => {
  const now = Date.now();
  const earliest = Math.max(lastCallAt + MIN_GAP_MS, backoffUntil);
  if (earliest > now) {
    await sleep(earliest - now);
  }
  lastCallAt = Date.now();
};

/** After a 429 / rate error, pause further Facebook calls briefly. */
const noteRateLimit = (ms = 60_000) => {
  backoffUntil = Date.now() + ms;
};

module.exports = {
  waitForSlot,
  noteRateLimit,
  MIN_GAP_MS,
};
