const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWhere } = require('../src/modules/alerts/alert.utils');

// The dashboard's Threat Vector Radar counts alerts by when they were RAISED (created_at) in a rolling
// window. The Alerts list used to filter only by when the POST was published, so an alert raised this
// week about an older post was counted on the card but missing from the list it linked to.

test('createdFrom / createdTo filter on when the alert was raised, exactly', () => {
  const where = buildWhere({
    risk_level: 'high',
    status: 'active',
    createdFrom: '2026-11-13T12:39:30.263Z',
    createdTo: '2026-11-20T12:39:30.263Z',
  });
  assert.deepEqual(where.created_at, {
    gte: new Date('2026-11-13T12:39:30.263Z'),
    lte: new Date('2026-11-20T12:39:30.263Z'),
  });
  assert.equal(where.risk_level, 'high');
  assert.equal(where.status, 'active');
  assert.equal(where.posted_at, undefined, 'the post-date filter is not applied when only the raised window is asked for');
});

test('either end can be given alone', () => {
  assert.deepEqual(buildWhere({ createdFrom: '2026-11-13T00:00:00Z' }).created_at, { gte: new Date('2026-11-13T00:00:00Z') });
  assert.deepEqual(buildWhere({ createdTo: '2026-11-20T00:00:00Z' }).created_at, { lte: new Date('2026-11-20T00:00:00Z') });
});

test('without the new parameters nothing changes (the normal Alerts page is untouched)', () => {
  const where = buildWhere({ status: 'active', risk_level: 'high', startDate: '2026-11-14', endDate: '2026-11-20' });
  assert.equal(where.created_at, undefined);
  assert.deepEqual(where.posted_at, {
    gte: new Date('2026-11-14T00:00:00.000Z'),
    lte: new Date('2026-11-20T23:59:59.999Z'),
  });
});

test('a bad or empty value is ignored rather than breaking the list', () => {
  for (const bad of ['', '   ', 'not a date', undefined, null, 12345, {}]) {
    assert.equal(buildWhere({ createdFrom: bad, createdTo: bad }).created_at, undefined, `ignored: ${JSON.stringify(bad)}`);
  }
  // one good end survives a bad other end
  assert.deepEqual(buildWhere({ createdFrom: 'nope', createdTo: '2026-11-20T00:00:00Z' }).created_at, { lte: new Date('2026-11-20T00:00:00Z') });
});

test('it can be combined with the post-date filter, each applying to its own column', () => {
  const where = buildWhere({ startDate: '2026-11-01', createdFrom: '2026-11-13T00:00:00Z' });
  assert.ok(where.posted_at.gte instanceof Date);
  assert.ok(where.created_at.gte instanceof Date);
});
