const MIN_GAP_MS = Number(process.env.INSTAGRAM_MONITOR_GAP_MS) || 1500;

let lastCallAt = 0;
let backoffUntil = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForSlot = async () => {
  const now = Date.now();
  const earliest = Math.max(lastCallAt + MIN_GAP_MS, backoffUntil);
  if (earliest > now) await sleep(earliest - now);
  lastCallAt = Date.now();
};

const noteRateLimit = (ms = 60_000) => {
  backoffUntil = Date.now() + ms;
};

module.exports = { waitForSlot, noteRateLimit, MIN_GAP_MS };
