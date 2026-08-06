/**
 * Unit checks for E0 security helpers (no Jest harness on backend).
 * Run: node src/config/security.test.js
 */
const assert = require('assert');

const run = () => {
  const original = { ...process.env };

  try {
    delete process.env.JWT_SECRET;
    delete process.env.ALLOW_INSECURE_JWT_FALLBACK;
    process.env.NODE_ENV = 'production';

    // Fresh require each time — clear cache
    delete require.cache[require.resolve('./security')];
    let security = require('./security');
    assert.throws(() => security.getJwtSecret(), /JWT_SECRET is required/);

    process.env.JWT_SECRET = 'unit-test-secret';
    delete require.cache[require.resolve('./security')];
    security = require('./security');
    assert.strictEqual(security.getJwtSecret(), 'unit-test-secret');
    assert.strictEqual(security.shouldSeedDefaultAdmin(), false);

    process.env.ALLOW_DEFAULT_ADMIN = 'true';
    delete require.cache[require.resolve('./security')];
    security = require('./security');
    assert.strictEqual(security.shouldSeedDefaultAdmin(), true);

    delete process.env.JWT_SECRET;
    delete process.env.ALLOW_DEFAULT_ADMIN;
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_INSECURE_JWT_FALLBACK = 'true';
    delete require.cache[require.resolve('./security')];
    security = require('./security');
    assert.ok(security.getJwtSecret().length > 10);

    console.log('security.test.js: PASS');
  } finally {
    process.env = original;
  }
};

run();
