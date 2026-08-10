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

  // 2. Writing creates <LOG_DIR>/<today-IST>/{application,error}.log and appends (no truncate) across calls.
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
};

run();
