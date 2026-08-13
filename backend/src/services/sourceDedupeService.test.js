/**
 * Self-check for source identity dedupe (alias + stable id matching).
 * Run: node src/services/sourceDedupeService.test.js
 */
const assert = require('assert');
const {
  extractStableUserId,
  collectLocalAliases,
  buildDuplicateQuery,
  isOlderSource,
  isYouTubeChannelId
} = require('./sourceDedupeService');

const run = () => {
  // ── Stable ids from identifier shapes (0 API) ──────────────────────────
  assert.strictEqual(
    extractStableUserId('youtube', 'UCabcdefghijklmnopqrstuv'),
    'UCabcdefghijklmnopqrstuv',
    'YouTube UC id is stable'
  );
  assert.strictEqual(
    extractStableUserId('youtube', 'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv'),
    'UCabcdefghijklmnopqrstuv',
    'YouTube channel URL extracts UC id'
  );
  assert.strictEqual(
    extractStableUserId('youtube', '@mkbhd'),
    '',
    'YouTube handle has no local stable id'
  );
  assert.strictEqual(
    extractStableUserId('facebook', 'https://www.facebook.com/profile.php?id=1234567890'),
    '1234567890',
    'Facebook profile.php?id is stable'
  );
  assert.strictEqual(
    extractStableUserId('facebook', 'https://www.facebook.com/people/Jane-Doe/987654321'),
    '987654321',
    'Facebook /people/name/id is stable'
  );
  assert.strictEqual(
    extractStableUserId('x', '44196397'),
    '44196397',
    'X numeric rest_id is stable'
  );
  assert.strictEqual(
    extractStableUserId('x', '@elonmusk'),
    '',
    'X handle has no local stable id'
  );
  assert.strictEqual(
    extractStableUserId('instagram', 'https://www.instagram.com/p/NOTAUSER/'),
    '',
    'Instagram non-numeric path is not a pk'
  );
  assert.strictEqual(
    extractStableUserId('instagram', '17841400000000000'),
    '17841400000000000',
    'Instagram numeric pk is stable'
  );

  assert.ok(isYouTubeChannelId('UCabcdefghijklmnopqrstuv'));
  assert.ok(!isYouTubeChannelId('@mkbhd'));

  // ── Aliases cover URL / @ / bare handle ────────────────────────────────
  const xAliases = collectLocalAliases('x', '@ElonMusk').map((v) => v.toLowerCase());
  assert.ok(xAliases.includes('elonmusk'));
  assert.ok(xAliases.includes('@elonmusk'));
  assert.ok(xAliases.includes('https://x.com/elonmusk'));

  const xUrlAliases = collectLocalAliases('x', 'https://twitter.com/elonmusk').map((v) => v.toLowerCase());
  assert.ok(xUrlAliases.includes('elonmusk'));

  const igAliases = collectLocalAliases('instagram', 'https://www.instagram.com/nasa/').map((v) => v.toLowerCase());
  assert.ok(igAliases.includes('nasa'));
  assert.ok(igAliases.includes('@nasa'));

  const ytAliases = collectLocalAliases('youtube', '@mkbhd').map((v) => v.toLowerCase());
  assert.ok(ytAliases.includes('mkbhd'));
  assert.ok(ytAliases.includes('https://www.youtube.com/@mkbhd'));

  const ytIdAliases = collectLocalAliases('youtube', 'UCabcdefghijklmnopqrstuv');
  assert.ok(ytIdAliases.includes('https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv'));

  const fbAliases = collectLocalAliases('facebook', 'https://www.facebook.com/MyHyderabadCity').map((v) => v.toLowerCase());
  assert.ok(fbAliases.includes('myhyderabadcity'));
  assert.ok(fbAliases.includes('https://www.facebook.com/myhyderabadcity'));

  const fbIdAliases = collectLocalAliases('facebook', 'https://www.facebook.com/profile.php?id=555');
  assert.ok(fbIdAliases.includes('555'));
  assert.ok(fbIdAliases.includes('https://www.facebook.com/profile.php?id=555'));

  // ── Query matches identifier aliases OR platform_user_id ───────────────
  const byHandle = buildDuplicateQuery('x', {
    identifier: 'elonmusk',
    aliases: collectLocalAliases('x', '@elonmusk')
  });
  assert.strictEqual(byHandle.platform, 'x');
  assert.ok(Array.isArray(byHandle.$or) && byHandle.$or.length >= 2);
  assert.ok(byHandle.$or.some((c) => c.identifier && c.identifier.$options === 'i'));
  assert.ok(byHandle.$or.some((c) => c.old_identifiers));

  const byUserId = buildDuplicateQuery('instagram', {
    identifier: 'nasa',
    platformUserId: '17841400000000000',
    aliases: collectLocalAliases('instagram', 'nasa')
  });
  assert.ok(byUserId.$or.some((c) => c.platform_user_id === '17841400000000000'));

  const ytQuery = buildDuplicateQuery('youtube', {
    identifier: 'UCabcdefghijklmnopqrstuv',
    platformUserId: 'UCabcdefghijklmnopqrstuv'
  });
  assert.ok(ytQuery.$or.some((c) => c.identifier === 'UCabcdefghijklmnopqrstuv'));
  assert.ok(ytQuery.$or.some((c) => c.platform_user_id === 'UCabcdefghijklmnopqrstuv'));

  const excluded = buildDuplicateQuery('facebook', {
    identifier: 'https://www.facebook.com/mypage',
    excludeId: 'src-1'
  });
  assert.deepStrictEqual(excluded.id, { $ne: 'src-1' });

  assert.strictEqual(buildDuplicateQuery('', { identifier: 'x' }), null);
  assert.strictEqual(buildDuplicateQuery('x', {}), null);

  // ── Keep oldest source as canonical ────────────────────────────────────
  const older = { id: 'a', created_at: new Date('2024-01-01') };
  const newer = { id: 'b', created_at: new Date('2024-06-01') };
  assert.strictEqual(isOlderSource(older, newer), true);
  assert.strictEqual(isOlderSource(newer, older), false);
  assert.strictEqual(
    isOlderSource({ id: 'aaa', created_at: new Date('2024-01-01') }, { id: 'bbb', created_at: new Date('2024-01-01') }),
    true,
    'same timestamp: smaller id wins'
  );

  console.log('sourceDedupeService.selfcheck: PASS');
};

run();
