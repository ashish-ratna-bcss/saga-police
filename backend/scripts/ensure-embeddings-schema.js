/**
 * Ensure embeddings.documents / chunks / jobs exist in every tenant DB.
 * Idempotent — safe to re-run. Also runs automatically via ensureOpsSchema.
 *
 * Usage:
 *   node scripts/ensure-embeddings-schema.js           # dry run
 *   node scripts/ensure-embeddings-schema.js --apply   # create/repair
 */
require('dotenv').config();
const mainPrisma = require('../prisma/client');
const {
  listTenantDbNames,
  getTenantPrisma,
} = require('../src/lib/tenantDatabase.service');
const { ensureEmbeddingsSchema } = require('../prisma/ensureEmbeddingsSchema');

(async () => {
  const apply = process.argv.includes('--apply');
  const dbs = await listTenantDbNames();
  console.log(
    `${dbs.length} tenant DB(s)${apply ? '' : ' (dry run — pass --apply to create schema)'}`
  );

  let failed = 0;
  for (const dbName of dbs) {
    if (!apply) {
      console.log(`  ${dbName}`);
      continue;
    }
    const prisma = getTenantPrisma(dbName);
    try {
      const info = await ensureEmbeddingsSchema(prisma);
      console.log(`  ${dbName}  ✓ embeddings.* ready (vector ${info.dimensions})`);
    } catch (err) {
      failed += 1;
      console.error(`  ${dbName}  ✗ ${err.message}`);
    }
  }
  process.exitCode = failed ? 1 : 0;
})()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mainPrisma.$disconnect());
