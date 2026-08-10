const fs = require('fs');
const path = require('path');
const util = require('util');

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.debug;

const IST_TZ = 'Asia/Kolkata';
const LOG_ROOT = process.env.LOG_DIR || path.join(__dirname, '../../logs');

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

// Re-checked on every write; single-threaded JS means no race between the
// check and the streams being used within the same write() call.
const ensureStreams = () => {
  const date = getISTDateString();
  if (date === currentDate && appStream && errStream) return;

  if (appStream) appStream.end();
  if (errStream) errStream.end();

  const dir = path.join(LOG_ROOT, date);
  fs.mkdirSync(dir, { recursive: true });

  appStream = fs.createWriteStream(path.join(dir, 'application.log'), { flags: 'a' });
  errStream = fs.createWriteStream(path.join(dir, 'error.log'), { flags: 'a' });
  currentDate = date;
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
