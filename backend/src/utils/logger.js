const fs = require('fs');
const path = require('path');
const util = require('util');

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

// Production defaults to `info`. Defaulting to `debug` everywhere is what turned
// one day's application.log into 467 MB. LOG_LEVEL still overrides both ways.
const DEFAULT_LEVEL = process.env.NODE_ENV === 'production' ? LEVELS.info : LEVELS.debug;
const currentLevel = LEVELS[process.env.LOG_LEVEL] ?? DEFAULT_LEVEL;

const IST_TZ = 'Asia/Kolkata';
const LOG_ROOT = process.env.LOG_DIR || path.join(__dirname, '../../logs');
const RETENTION_DAYS = Math.max(1, Number(process.env.LOG_RETENTION_DAYS || 14));

// en-CA locale formats as YYYY-MM-DD, which is exactly the folder name we need.
const istDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: IST_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

const getISTDateString = (now = new Date()) => istDateFormatter.format(now);

let currentDate = null;
let appStream = null;
let errStream = null;

// A stream error (ENOSPC, EACCES, a rotated-away fd) is emitted asynchronously,
// so the try/catch around write() cannot see it. Unhandled, it takes the process
// down. Log once to the console and drop the stream so the next write re-opens it.
const attachStreamGuard = (stream, label) => {
  stream.on('error', (err) => {
    console.error(`[${new Date().toISOString()}] [ERROR] [Logger] ${label} stream error:`, err.message);
    if (stream === appStream || stream === errStream) {
      appStream = null;
      errStream = null;
      currentDate = null;
    }
  });
  return stream;
};

// Drop day directories older than the retention window. Runs only on rollover,
// so it is at most once per day per process.
const pruneOldLogDirs = () => {
  try {
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    for (const entry of fs.readdirSync(LOG_ROOT, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^\d{4}-\d{2}-\d{2}$/.test(entry.name)) continue;
      const dayMs = Date.parse(`${entry.name}T00:00:00Z`);
      if (Number.isNaN(dayMs) || dayMs >= cutoff) continue;
      fs.rmSync(path.join(LOG_ROOT, entry.name), { recursive: true, force: true });
    }
  } catch (_) {
    // Retention is best-effort; never let cleanup break logging.
  }
};

// Re-checked on every write; single-threaded JS means no race between the
// check and the streams being used within the same write() call.
const ensureStreams = () => {
  const date = getISTDateString();
  if (date === currentDate && appStream && errStream) return;

  // Create and verify the NEW streams before retiring the old ones. Ending first
  // meant a failed mkdir left both streams closed while currentDate still pointed
  // at the old day, so every subsequent write hit an ended stream.
  const dir = path.join(LOG_ROOT, date);
  fs.mkdirSync(dir, { recursive: true });

  const nextApp = attachStreamGuard(
    fs.createWriteStream(path.join(dir, 'application.log'), { flags: 'a' }),
    'application.log'
  );
  const nextErr = attachStreamGuard(
    fs.createWriteStream(path.join(dir, 'error.log'), { flags: 'a' }),
    'error.log'
  );

  const previousApp = appStream;
  const previousErr = errStream;

  appStream = nextApp;
  errStream = nextErr;
  currentDate = date;

  if (previousApp) previousApp.end();
  if (previousErr) previousErr.end();

  pruneOldLogDirs();
};

const write = (level, args) => {
  if (LEVELS[level] > currentLevel) return;
  const stamp = new Date().toISOString();
  const method = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  method(`[${stamp}] [${level.toUpperCase()}]`, ...args);

  try {
    ensureStreams();
    const line = `[${stamp}] [${level.toUpperCase()}] ${util.format(...args)}\n`;
    appStream.write(line);
    if (level === 'error') errStream.write(line);
  } catch (fileErr) {
    console.error(`[${stamp}] [ERROR] [Logger] Failed to write log file:`, fileErr.message);
  }
};

const logger = {
  error: (...args) => write('error', args),
  warn: (...args) => write('warn', args),
  info: (...args) => write('info', args),
  debug: (...args) => write('debug', args),
  getISTDateString
};

module.exports = logger;
