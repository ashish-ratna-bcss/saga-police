const test = require('node:test');
const assert = require('node:assert');
const intel = require('../src/modules/ai-assistant/intel.service');

const TZ = 'Asia/Kolkata';
const NOW = new Date('2026-11-23T08:00:00Z'); // Mon 23 Nov, 13:30 in India
const PROFILE = { label: 'Jharkhand', state: 'Jharkhand', country: null, tz: TZ, hasPlaces: true };

const item = (over) => ({
  kind: 'post', table: 'social_media_posts', id: '1', title: '', text: '', url: null, platform: 'x', author: '@a',
  at: new Date(NOW.getTime() - 3600000), start: null, end: null, location: null, riskLevel: null, riskScore: null,
  engagement: 0, stateTag: null, grievanceStatus: null, ...over,
});

test('local midnight is used for "today", not UTC midnight', () => {
  const start = intel.startOfDay(NOW, TZ);
  assert.strictEqual(start.toISOString(), '2026-11-22T18:30:00.000Z');
});

test('time words become exact windows', () => {
  const today = intel.parseWindow('what is happening today', NOW, TZ);
  assert.strictEqual(today.from.toISOString(), '2026-11-22T18:30:00.000Z');
  assert.strictEqual(today.to.toISOString(), '2026-11-23T18:30:00.000Z');
  const tomorrow = intel.parseWindow('protests planned for tomorrow', NOW, TZ);
  assert.strictEqual(tomorrow.from.toISOString(), '2026-11-23T18:30:00.000Z');
  const named = intel.parseWindow('any rally on 25 November', NOW, TZ);
  assert.strictEqual(named.from.toISOString(), '2026-11-24T18:30:00.000Z');
  assert.strictEqual(intel.parseWindow('show protests', NOW, TZ), null);
});

test('dates written in the text are found', () => {
  assert.strictEqual(intel.findDateMention('dharna on 25th Nov at Morabadi', NOW, TZ).toISOString(), '2026-11-24T18:30:00.000Z');
  assert.strictEqual(intel.findDateMention('no date here', NOW, TZ), null);
});

test('intent: protest, brief, threat; ordinary questions are left alone', () => {
  assert.strictEqual(intel.detectIntent('What protests are happening today?'), 'protest');
  assert.strictEqual(intel.detectIntent('Show Bharat Bandh or strike-related discussions'), 'protest');
  assert.strictEqual(intel.detectIntent('बंद का आह्वान किया गया'), 'protest');
  assert.strictEqual(intel.detectIntent("Give me today's Intelligence Brief"), 'brief');
  assert.strictEqual(intel.detectIntent("Show today's top 10 high-severity alerts"), 'threat');
  assert.strictEqual(intel.detectIntent('how many posts today'), null);
  assert.strictEqual(intel.detectIntent('talk about sambandh with the minister'), null);
});

test('a follow-up inherits the earlier period and place', () => {
  const prior = [{ role: 'user', content: 'What protests are planned for tomorrow?' }];
  const u = intel.understand('What about Ranchi?', prior, PROFILE, NOW);
  assert.strictEqual(u.intent, 'protest');
  assert.strictEqual(u.status, 'planned');
  assert.ok(u.window && /tomorrow/.test(u.window.label));
  assert.strictEqual(u.followUp, true);
  const count = intel.understand('how many posts today', prior, PROFILE, NOW);
  assert.strictEqual(count.intent, null);
});

test('events are classified by their dates', () => {
  const day = 86400000;
  const running = item({ kind: 'event', start: new Date(NOW - 2 * day), end: new Date(NOW.getTime() + 5 * day) });
  const future = item({ kind: 'event', start: new Date(NOW.getTime() + 2 * day), end: new Date(NOW.getTime() + 3 * day) });
  const over = item({ kind: 'event', start: new Date(NOW - 9 * day), end: new Date(NOW - 5 * day) });
  assert.strictEqual(intel.classify(running, NOW, TZ, PROFILE).status, 'active');
  assert.strictEqual(intel.classify(future, NOW, TZ, PROFILE).status, 'planned');
  assert.strictEqual(intel.classify(over, NOW, TZ, PROFILE).status, 'past');
});

test('a post is a planned protest only with evidence of a date', () => {
  const planned = item({ text: 'Workers will hold a dharna at Morabadi, Ranchi tomorrow. Everyone to gather at 10 am.' });
  assert.strictEqual(intel.classify(planned, NOW, TZ, PROFILE).status, 'planned');
  const anger = item({ text: 'Justice for the victim! The government must act. This protest is needed.' });
  assert.strictEqual(intel.classify(anger, NOW, TZ, PROFILE).status, 'discussion');
  const old = item({ text: 'Protest at Ranchi', at: new Date(NOW.getTime() - 10 * 86400000) });
  assert.strictEqual(intel.classify(old, NOW, TZ, PROFILE).status, 'past');
});

test('scores are kept apart and the platform risk level is respected', () => {
  const low = item({ kind: 'alert', table: 'social_media_alerts', riskLevel: 'low', text: 'Report on a protest in Ranchi. Join us to gather and march tomorrow.' });
  const s = intel.scoreItem(low, NOW, TZ, PROFILE, 'Ranchi');
  assert.ok(s.risk <= 45, `risk ${s.risk}`);
  assert.strictEqual(s.relevance, 100);
  assert.notStrictEqual(intel.priorityOf(s).code, 'P0');
  const deadly = item({ kind: 'alert', table: 'social_media_alerts', riskLevel: 'high', text: 'Two killed in a clash during a protest in Ranchi' });
  const d = intel.scoreItem(deadly, NOW, TZ, PROFILE, 'Ranchi');
  assert.ok(d.severity >= 90);
  assert.strictEqual(intel.priorityOf(d).code, 'P0');
});

test('news about somewhere else is not local intelligence', () => {
  const far = item({ text: 'France Protest: thousands on the streets of Paris for a sixth weekend' });
  const s = intel.scoreItem(far, NOW, TZ, PROFILE, null);
  assert.ok(s.relevance < 30, `relevance ${s.relevance}`);
  assert.strictEqual(intel.priorityOf(s).code, 'P4');
});

test('reposts merge and unrelated posts stay apart', () => {
  const a = item({ id: '1', text: 'Villagers block the highway near Dumka over the coal block survey, police rushed in' });
  const b = item({ id: '2', platform: 'facebook', text: 'Villagers block the highway near Dumka over the coal block survey, police rushed in!' });
  const c = item({ id: '3', text: 'Ranchi marathon registrations open for the winter season' });
  const groups = intel.cluster([a, b, c]);
  assert.strictEqual(groups.length, 2);
  assert.strictEqual(groups.find((g) => g.length === 2).length, 2);
});
