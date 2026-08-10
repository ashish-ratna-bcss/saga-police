# Day-wise IST Log Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the backend's existing console logger to also write day-wise log files under `backend/logs/YYYY-MM-DD/`, with the date always computed in IST (Asia/Kolkata), regardless of server timezone.

**Architecture:** Backend has a single hand-rolled logger (`backend/src/utils/logger.js`, no Winston/Pino/Morgan/PM2 in use — confirmed via `package.json` and grep). It currently only writes to console. Add file-writing to the same module: on every log call, compute today's IST date string via `Intl.DateTimeFormat` (native, no new dependency), lazily open/reuse `fs.WriteStream`s for `application.log` (all levels) and `error.log` (error level only) under `backend/logs/<IST-date>/`, in append mode. When the computed IST date differs from the currently open one, close old streams and open new ones for the new date — this is checked on every write, so no restart is needed at midnight IST. Console output stays byte-for-byte identical to today.

**Tech Stack:** Node.js stdlib only — `fs`, `path`, `util`, `Intl.DateTimeFormat`. No new npm dependency.

## Global Constraints

- Log date MUST be computed via `Asia/Kolkata`, never server-local time — server already reports IST (`timedatectl` confirms `Asia/Kolkata`/`+0530`), but the computation must be explicit and TZ-independent so it stays correct if redeployed elsewhere.
- Do NOT change the server/system timezone.
- Do NOT create a parallel logging system — extend `backend/src/utils/logger.js`, the only logger used across the 73 call sites in `backend/src`.
- Preserve existing console format, log levels, and the `logger.error/warn/info/debug(...args)` public API used by all 73 call sites.
- Append, never overwrite, on same-IST-day restarts.
- Auto-create the date directory if missing.

---

### Task 1: File-backed day-wise IST logging in `backend/src/utils/logger.js`

**Files:**
- Modify: `backend/src/utils/logger.js` (full rewrite of the file, same public shape)
- Modify: `.gitignore` (repo root) — add `backend/logs/`
- Test: `backend/src/utils/logger.test.js` (new, plain-`assert` style matching `backend/src/config/security.test.js`, run via `node src/utils/logger.test.js`)

**Interfaces:**
- Produces: `logger.error/warn/info/debug(...args)` — unchanged signature, still logs to console exactly as before, now also appends to file.
- Produces (test-only named export, does not affect existing consumers who only destructure `error/warn/info/debug`): `getISTDateString(now = new Date())` → `'YYYY-MM-DD'` string computed in `Asia/Kolkata`.
- Consumes: nothing from other tasks (standalone).

- [ ] **Step 1: Write the failing test for the pure IST date-boundary function**

```javascript
// backend/src/utils/logger.test.js
/**
 * Unit checks for day-wise IST log storage (no Jest harness on backend).
 * Run: node src/utils/logger.test.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const run = () => {
  delete require.cache[require.resolve('./logger')];
  const logger = require('./logger');

  // 1. IST date boundary is computed correctly regardless of the Date's own UTC offset framing.
  //    18:29:59 UTC == 23:59:59 IST (same IST day); 18:30:01 UTC == 00:00:01 IST (next IST day).
  const beforeMidnightIST = new Date('2026-08-08T18:29:59.000Z');
  const afterMidnightIST = new Date('2026-08-08T18:30:01.000Z');
  assert.strictEqual(logger.getISTDateString(beforeMidnightIST), '2026-08-08');
  assert.strictEqual(logger.getISTDateString(afterMidnightIST), '2026-08-09');

  console.log('logger.test.js: PASS (date boundary)');
};

run();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node src/utils/logger.test.js`
Expected: FAIL — `logger.getISTDateString is not a function` (current `logger.js` has no such export).

- [ ] **Step 3: Rewrite `backend/src/utils/logger.js`**

```javascript
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
```

- [ ] **Step 4: Run test to verify the date-boundary check passes**

Run: `cd backend && node src/utils/logger.test.js`
Expected: `logger.test.js: PASS (date boundary)`

- [ ] **Step 5: Extend the test with file-append and directory-creation checks, then rerun**

```javascript
// append to backend/src/utils/logger.test.js, inside run(), after the date-boundary assertions:

  // 2. Writing creates backend/logs/<today-IST>/{application,error}.log and appends (no truncate) across calls.
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'logger-test-'));
  process.env.LOG_DIR = tmpRoot;
  delete require.cache[require.resolve('./logger')];
  const scopedLogger = require('./logger');

  scopedLogger.info('first line');
  scopedLogger.error('second line', 'boom');

  const today = scopedLogger.getISTDateString();
  const appLogPath = path.join(tmpRoot, today, 'application.log');
  const errLogPath = path.join(tmpRoot, today, 'error.log');

  // Streams are async; give them a tick to flush before asserting.
  setTimeout(() => {
    const appContents = fs.readFileSync(appLogPath, 'utf8').trim().split('\n');
    const errContents = fs.readFileSync(errLogPath, 'utf8').trim().split('\n');

    assert.strictEqual(appContents.length, 2, 'application.log should contain both lines');
    assert.ok(appContents[0].includes('first line'));
    assert.ok(appContents[1].includes('second line boom'));

    assert.strictEqual(errContents.length, 1, 'error.log should contain only the error line');
    assert.ok(errContents[0].includes('second line boom'));

    delete process.env.LOG_DIR;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    console.log('logger.test.js: PASS (file append + directory creation)');
  }, 100);
```

Run: `cd backend && node src/utils/logger.test.js`
Expected: both `PASS` lines print, no assertion errors.

- [ ] **Step 6: Add `backend/logs/` to the repo-root `.gitignore`**

```gitignore
# append to /home/ashish-ratna/sockeye/.gitignore
backend/logs/
```

- [ ] **Step 7: Manual verification — real startup, same-day restart, and IST enforcement**

```bash
cd backend
rm -rf logs  # clean slate for this verification only, nothing pre-existing
node -e "require('./src/utils/logger').info('startup 1')"
node -e "require('./src/utils/logger').info('startup 2 (simulated restart)')"
cat logs/$(TZ=Asia/Kolkata date +%F)/application.log
```

Expected: the file contains both `startup 1` and `startup 2 (simulated restart)` lines — proving append-not-overwrite across separate process runs (the real "restart" case, not just in-process calls). Directory name matches `TZ=Asia/Kolkata date +%F` regardless of the shell's own `date` output.

- [ ] **Step 8: Commit**

```bash
git add backend/src/utils/logger.js backend/src/utils/logger.test.js .gitignore
git commit -m "feat: day-wise IST log file storage in backend logger"
```
