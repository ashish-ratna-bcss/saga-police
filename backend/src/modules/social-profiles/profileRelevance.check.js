// Verifies profileRelevance.service.js against the spec's formula test cases,
// then a live per-account/tenant-DB isolation check against real Postgres rows.
// Run: node src/modules/social-profiles/profileRelevance.check.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

const {
  calculateRiskRelevance,
  calculateViralityRelevance,
  calculateProfileRelevance,
  computeProfileRelevance,
  attachProfileRelevanceToAccounts,
} = require('./profileRelevance.service');

let failures = 0;

const assertEqual = (label, actual, expected) => {
  if (actual !== expected) {
    console.error(`FAIL: ${label} — expected ${expected}, got ${actual}`);
    failures++;
  } else {
    console.log(`PASS: ${label} (${actual})`);
  }
};

// ── Test 1: Basic risk ──
assertEqual(
  'Test 1 — basic risk (2 medium + 3 high / 10)',
  calculateRiskRelevance({ totalPosts: 10, mediumRiskPosts: 2, highRiskPosts: 3 }),
  80
);

// ── Test 2: Two high risk ──
assertEqual(
  'Test 2 — two high risk / 10',
  calculateRiskRelevance({ totalPosts: 10, mediumRiskPosts: 0, highRiskPosts: 2 }),
  40
);

// ── Test 3: Basic virality ──
assertEqual(
  'Test 3 — basic virality (1 medium + 2 high / 10)',
  calculateViralityRelevance({ totalPosts: 10, mediumViralityPosts: 1, highViralityPosts: 2 }),
  50
);

// ── Test 4: Combined ──
assertEqual('Test 4 — combined (80 + 50) / 2', calculateProfileRelevance(80, 50), 65);

// ── Test 5: Zero virality ──
{
  const result = computeProfileRelevance({
    totalPosts: 10,
    mediumRiskPosts: 2,
    highRiskPosts: 3,
    mediumViralityPosts: 0,
    highViralityPosts: 0,
  });
  assertEqual('Test 5 — risk_relevance_score', result.risk_relevance_score, 80);
  assertEqual('Test 5 — virality_relevance_score', result.virality_relevance_score, 0);
  assertEqual('Test 5 — profile_relevance_score', result.profile_relevance_score, 40);
}

// ── Test 6: Zero posts ──
{
  const result = computeProfileRelevance({
    totalPosts: 0,
    mediumRiskPosts: 0,
    highRiskPosts: 0,
    mediumViralityPosts: 0,
    highViralityPosts: 0,
  });
  assertEqual('Test 6 — zero posts risk', result.risk_relevance_score, 0);
  assertEqual('Test 6 — zero posts virality', result.virality_relevance_score, 0);
  assertEqual('Test 6 — zero posts profile', result.profile_relevance_score, 0);
}

// ── Test 7: All high risk (must cap at 100, not 200) ──
assertEqual(
  'Test 7 — all high risk caps at 100',
  calculateRiskRelevance({ totalPosts: 10, mediumRiskPosts: 0, highRiskPosts: 10 }),
  100
);

// ── Test 8: All high virality (must cap at 100, not 200) ──
assertEqual(
  'Test 8 — all high virality caps at 100',
  calculateViralityRelevance({ totalPosts: 10, mediumViralityPosts: 0, highViralityPosts: 10 }),
  100
);

// ── Test 9: No medium/high risk ──
assertEqual(
  'Test 9 — no medium/high risk',
  calculateRiskRelevance({ totalPosts: 100, mediumRiskPosts: 0, highRiskPosts: 0 }),
  0
);

// ── Test 10: No medium/high virality ──
assertEqual(
  'Test 10 — no medium/high virality',
  calculateViralityRelevance({ totalPosts: 100, mediumViralityPosts: 0, highViralityPosts: 0 }),
  0
);

// ── Test 11: Same post contributes to both risk and virality independently ──
{
  // One post that is High Risk AND High Virality out of 1 total post.
  const risk = calculateRiskRelevance({ totalPosts: 1, mediumRiskPosts: 0, highRiskPosts: 1 });
  const virality = calculateViralityRelevance({ totalPosts: 1, mediumViralityPosts: 0, highViralityPosts: 1 });
  assertEqual('Test 11 — high risk contributes independently', risk, 100);
  assertEqual('Test 11 — high virality contributes independently', virality, 100);
}

// ── Test 13/14: live per-account isolation + platform coverage, against any real tenant DB ──
(async () => {
  const { getTenantPrisma } = require('../../lib/tenantDatabase.service');
  const mainPrisma = require('../../../prisma/client');

  // No tenant hardcoded: discover a real, currently-provisioned tenant dynamically
  // from the main auth DB (any user row with a non-null db_name), or accept an
  // explicit override via env var. Falls back to the caller's own choice, never ours.
  const TENANT_DB_NAME =
    process.env.PROFILE_RELEVANCE_CHECK_TENANT_DB ||
    (await mainPrisma.users.findFirst({
      where: { db_name: { not: null } },
      select: { db_name: true },
      orderBy: { id: 'asc' },
    }))?.db_name;

  if (!TENANT_DB_NAME) {
    console.error('FAIL: no tenant database found — no user has a db_name set, and PROFILE_RELEVANCE_CHECK_TENANT_DB is not set.');
    process.exitCode = 1;
    return;
  }

  const prisma = getTenantPrisma(TENANT_DB_NAME);
  if (!prisma) {
    console.error(`FAIL: could not resolve tenant DB "${TENANT_DB_NAME}".`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n(using tenant db: ${TENANT_DB_NAME})\n`);

  // Real platform slugs, used only as fixture LABELS below — the check never reads or
  // writes the tenant's actual `platforms` catalog rows (that data belongs to the tenant
  // admin via Settings, not to this test). Each fixture gets its own throwaway platform
  // row instead, uniquely named so it can never collide with or masquerade as real data.
  const REAL_PLATFORM_SLUGS = ['x', 'facebook', 'youtube', 'instagram', 'telegram'];
  const runTag = Date.now();
  const createdAccountIds = [];
  const createdProfileIds = [];
  const createdPlatformIds = [];

  try {
    // One profile + one account per platform, each with a distinct risk/virality mix,
    // to prove isolation (no cross-account leakage) and platform coverage in one pass.
    const fixtures = [
      { slug: 'x', mediumRisk: 2, highRisk: 3, mediumViral: 1, highViral: 2 }, // expect risk=80, virality=50, profile=65
      { slug: 'facebook', mediumRisk: 0, highRisk: 2, mediumViral: 0, highViral: 0 }, // expect risk=40, virality=0, profile=20
      { slug: 'youtube', mediumRisk: 0, highRisk: 0, mediumViral: 0, highViral: 0 }, // expect all 0
      { slug: 'instagram', mediumRisk: 10, highRisk: 0, mediumViral: 0, highViral: 10 }, // expect risk=100(cap? 10*1/10*100=100), virality=100
      { slug: 'telegram', mediumRisk: 1, highRisk: 1, mediumViral: 1, highViral: 1 }, // expect risk=30, virality=30, profile=30
    ];

    assertEqual(
      'Test 14 — fixtures cover exactly the 5 real supported platforms',
      JSON.stringify(fixtures.map((f) => f.slug).sort()),
      JSON.stringify([...REAL_PLATFORM_SLUGS].sort())
    );

    const accounts = [];
    for (const fx of fixtures) {
      // Throwaway platform row for this fixture only — never touches/reuses a real slug.
      const testSlug = `__check_${fx.slug}_${runTag}`;
      const testPlatform = await prisma.platforms.create({
        data: { name: `__check__ ${fx.slug}`, slug: testSlug, is_active: true },
      });
      createdPlatformIds.push(testPlatform.id);

      const profile = await prisma.social_media_profiles.create({
        data: { display_name: `__check__ ${fx.slug}` },
      });
      createdProfileIds.push(profile.id);

      const account = await prisma.social_media_accounts.create({
        data: {
          profile_id: profile.id,
          platform_id: testPlatform.id,
          handle: `__check_handle_${fx.slug}_${runTag}`,
        },
      });
      createdAccountIds.push(account.id);
      accounts.push({ id: account.id, profile_id: profile.id, fixture: fx });

      let seq = 0;
      const makePost = async (riskLevel, engagement) => {
        seq += 1;
        await prisma.social_media_posts.create({
          data: {
            account_id: account.id,
            platform: testSlug,
            external_id: `__check__${account.id}_${seq}`,
            analysis_result: riskLevel ? { risk_level: riskLevel } : {},
            engagement,
          },
        });
      };

      for (let i = 0; i < fx.mediumRisk; i++) await makePost('medium', {});
      for (let i = 0; i < fx.highRisk; i++) await makePost('high', {});
      const totalRiskPosts = fx.mediumRisk + fx.highRisk;
      const totalPosts = totalRiskPosts + fx.mediumViral + fx.highViral;
      // Pad with plain (no-risk) posts carrying virality-triggering engagement,
      // so risk and virality denominators can be tested independently per fixture.
      for (let i = 0; i < fx.mediumViral; i++) await makePost(null, { likes: 600 }); // >=medium_threshold(500), <high_threshold(1000) -> medium
      for (let i = 0; i < fx.highViral; i++) await makePost(null, { likes: 1500 }); // >=1000 -> high

      fx._expectedTotalPosts = totalRiskPosts + fx.mediumViral + fx.highViral;
    }

    const flattened = await attachProfileRelevanceToAccounts(accounts, { db: prisma });

    for (const row of flattened) {
      const fx = row.fixture;
      const pr = row.profile_relevance;
      assertEqual(`Test 13/14 [${fx.slug}] total_posts isolated to own account`, pr.total_posts, fx._expectedTotalPosts);
      assertEqual(`Test 13/14 [${fx.slug}] medium_risk_posts`, pr.medium_risk_posts, fx.mediumRisk);
      assertEqual(`Test 13/14 [${fx.slug}] high_risk_posts`, pr.high_risk_posts, fx.highRisk);
      assertEqual(`Test 13/14 [${fx.slug}] medium_virality_posts`, pr.medium_virality_posts, fx.mediumViral);
      assertEqual(`Test 13/14 [${fx.slug}] high_virality_posts`, pr.high_virality_posts, fx.highViral);
    }
  } catch (err) {
    console.error('FAIL: live integration check threw:', err.message);
    failures++;
  } finally {
    // Cleanup — cascade deletes posts via onDelete: Cascade on account_id FK.
    // Every row this script creates is deleted here, including the throwaway
    // platform rows — this check must never leave anything behind in the
    // tenant's real, live data (platforms catalog included).
    if (createdAccountIds.length) {
      await prisma.social_media_accounts.deleteMany({ where: { id: { in: createdAccountIds } } });
    }
    if (createdProfileIds.length) {
      await prisma.social_media_profiles.deleteMany({ where: { id: { in: createdProfileIds } } });
    }
    if (createdPlatformIds.length) {
      await prisma.platforms.deleteMany({ where: { id: { in: createdPlatformIds } } });
    }

    console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
    process.exitCode = failures === 0 ? 0 : 1;
  }
})();
