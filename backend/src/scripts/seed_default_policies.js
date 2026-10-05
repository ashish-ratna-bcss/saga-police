const path = require('path');
const fs = require('fs');
const { PrismaClient: MainPrismaClient } = require('@prisma/client');
const { forEachTenant } = require('../lib/tenantDatabase.service');

const mainPrisma = new MainPrismaClient();

async function seed() {
  console.log('--- Seeding 12 Default Indian Law Enforcement AI OSINT Policies ---');
  const seedPath = path.join(__dirname, '../../prisma/default_policies_seed.json');
  
  if (!fs.existsSync(seedPath)) {
    console.error(`Seed file not found at ${seedPath}`);
    process.exit(1);
  }

  const policies = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  console.log(`Loaded ${policies.length} policies from seed JSON.`);

  // 1. Seed Main DB default_policies
  console.log('Seeding into Main Database default_policies table...');
  const categoryIds = policies.map((p) => p.category_id);
  // Delete legacy ones not in the seed list
  await mainPrisma.default_policies.deleteMany({
    where: {
      category_id: { notIn: categoryIds },
    },
  });

  for (const p of policies) {
    await mainPrisma.default_policies.upsert({
      where: { category_id: p.category_id },
      create: {
        category_id: p.category_id,
        definition: p.definition,
        severity_level: p.severity_level || 'Medium',
        keywords: Array.isArray(p.keywords) ? p.keywords : [],
        legal_sections: p.legal_sections || [],
        platform_policies: p.platform_policies || {},
        is_active: true,
      },
      update: {
        definition: p.definition,
        severity_level: p.severity_level || 'Medium',
        keywords: Array.isArray(p.keywords) ? p.keywords : [],
        legal_sections: p.legal_sections || [],
        platform_policies: p.platform_policies || {},
        is_active: true,
      },
    });
  }
  console.log('✓ Main Database default_policies seeded successfully.');

  // 2. Seed across all tenant databases
  console.log('Seeding into all Tenant Databases policy_mappings tables...');
  let tenantCount = 0;
  try {
    await forEachTenant(async (tenantPrisma, user) => {
      tenantCount++;
      const userTag = user?.email || user?.username || `User #${user?.id}`;
      console.log(` -> Seeding tenant for: ${userTag}`);
      for (const p of policies) {
        await tenantPrisma.policy_mappings.upsert({
          where: { category_id: p.category_id },
          create: {
            category_id: p.category_id,
            definition: p.definition,
            severity_level: p.severity_level || 'Medium',
            keywords: Array.isArray(p.keywords) ? p.keywords : [],
            legal_sections: p.legal_sections || [],
            platform_policies: p.platform_policies || {},
            is_active: true,
          },
          update: {
            definition: p.definition,
            severity_level: p.severity_level || 'Medium',
            keywords: Array.isArray(p.keywords) ? p.keywords : [],
            legal_sections: p.legal_sections || [],
            platform_policies: p.platform_policies || {},
            is_active: true,
          },
        });
      }
    });
    console.log(`✓ Seeded policies across ${tenantCount} tenant databases.`);
  } catch (err) {
    console.warn(`[Warning] Tenant database seeding encountered an issue:`, err.message);
  }

  console.log('--- All 12 Policies Successfully Seeded! ---');
  await mainPrisma.$disconnect();
}

seed().catch((err) => {
  console.error('Fatal seed error:', err);
  process.exit(1);
});
