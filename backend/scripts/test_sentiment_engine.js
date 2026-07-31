/**
 * Self-check for the sentiment engine factory (backend/src/services/sentimentEngineService.js).
 * Verifies SENTIMENT_ANALYSIS routes to the right engine — no network calls, no models loaded.
 * Run: node backend/scripts/test_sentiment_engine.js
 */
const assert = require('assert');
const path = require('path');

const { getEngineName } = require(path.resolve(__dirname, '../src/services/sentimentEngineService'));

function withEnv(value, fn) {
  const prev = process.env.SENTIMENT_ANALYSIS;
  if (value === undefined) delete process.env.SENTIMENT_ANALYSIS;
  else process.env.SENTIMENT_ANALYSIS = value;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env.SENTIMENT_ANALYSIS;
    else process.env.SENTIMENT_ANALYSIS = prev;
  }
}

withEnv('LLM', () => assert.strictEqual(getEngineName(), 'LLM'));
withEnv('CUSTOM', () => assert.strictEqual(getEngineName(), 'CUSTOM'));
withEnv('custom', () => assert.strictEqual(getEngineName(), 'CUSTOM')); // case-insensitive
withEnv(undefined, () => assert.strictEqual(getEngineName(), 'LLM'));   // unset -> default
withEnv('bogus', () => assert.strictEqual(getEngineName(), 'LLM'));     // invalid -> default

console.log('sentimentEngineService: all engine-routing checks passed.');

// llmService.js (required transitively) opens a background Mongo connection
// via mappingService.js on import — force exit so this stays a quick, standalone check.
process.exit(0);
