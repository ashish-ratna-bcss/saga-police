const fs = require('fs');
const path = require('path');
const { getTenantPrisma, listTenantDbNames } = require('../src/lib/tenantDatabase.service');
const { generateReportPdf } = require('../src/modules/grievances/grievance.report.pdf');

async function migrate() {
  const dbs = await listTenantDbNames();
  const storageDir = path.join(__dirname, '..', 'storage');

  for (const dbName of dbs) {
    const p = getTenantPrisma(dbName);
    const reports = await p.social_media_grievance_reports.findMany();
    console.log(`[${dbName}] Found ${reports.length} reports`);

    for (const r of reports) {
      let base64 = r.pdf_base64;
      if (!base64 && r.report_pdf_url) {
        const match = r.report_pdf_url.match(/\/files\/(.+)$/);
        if (match) {
          const filePath = path.join(storageDir, match[1]);
          if (fs.existsSync(filePath)) {
            const buf = fs.readFileSync(filePath);
            base64 = buf.toString('base64');
            console.log(`[${dbName}] Read ${r.unique_code} from storage, bytes: ${buf.length}`);
          }
        }
      }

      if (!base64) {
        console.log(`[${dbName}] Generating fresh PDF into DB for ${r.unique_code}...`);
        try {
          await generateReportPdf(r.report_type, r.id, { db: p });
          console.log(`[${dbName}] Generated and saved into DB for ${r.unique_code}`);
        } catch (err) {
          console.error(`[${dbName}] Generation failed for ${r.unique_code}:`, err.message);
        }
      } else {
        await p.social_media_grievance_reports.update({
          where: { id: r.id },
          data: {
            pdf_base64: base64,
            report_pdf_url: `/api/reports/${r.id}/pdf`,
            meta: {
              ...(r.meta || {}),
              pdf_base64: base64,
              report_pdf_generated_at: new Date().toISOString(),
            },
          },
        });
        console.log(`[${dbName}] Successfully migrated ${r.unique_code} to DB table!`);
      }
    }
  }
}

migrate()
  .then(() => {
    console.log('Migration to DB table complete.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
