import { pool } from "../db/pool.js";
import { qGoogleMaps } from "../jobs/queues.js";

async function main() {
  const batchId = process.argv[2];
  if (!batchId) {
    console.error("Usage: node dist/run/test5.js <batchId>");
    process.exit(1);
  }

  console.log(`Selecting 5 companies from batch: ${batchId}`);

  // Get 5 companies that haven't been successfully verified yet (or just any 5)
  const res = await pool.query(
    `SELECT cs.company_id, c.legal_name 
     FROM company_sources cs
     JOIN companies c ON cs.company_id = c.company_id
     WHERE cs.batch_id=$1
     LIMIT 5`, 
    [batchId]
  );

  console.log(`Found ${res.rowCount} companies.`);

  for (const row of res.rows) {
    console.log(`Enqueuing: ${row.legal_name} (${row.company_id})`);
    await qGoogleMaps.add(
      "google_maps_scrape",
      { companyId: row.company_id, batchId },
      { removeOnComplete: true, attempts: 1, jobId: `google_maps_scrape_test:${row.company_id}:${Date.now()}` }
    );
  }

  console.log("Done enqueuing test jobs.");
  process.exit(0);
}

main();
