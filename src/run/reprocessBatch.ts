import { pool } from "../db/pool.js";
import { qGoogleMaps } from "../jobs/queues.js";

async function main() {
  const batchId = process.argv[2];
  if (!batchId) {
    console.error("Usage: node dist/run/reprocessBatch.js <batchId>");
    process.exit(1);
  }

  console.log(`Reprocessing batch: ${batchId}`);

  // Get all companies in this batch
  const res = await pool.query("SELECT company_id FROM company_sources WHERE batch_id=$1", [batchId]);
  console.log(`Found ${res.rowCount} companies.`);

  let count = 0;
  for (const row of res.rows) {
    await qGoogleMaps.add(
      "google_maps_scrape",
      { companyId: row.company_id, batchId },
      { removeOnComplete: true, attempts: 3, jobId: `google_maps_scrape:${row.company_id}:${batchId}` }
    );
    count++;
    if (count % 100 === 0) console.log(`Enqueued ${count}...`);
  }

  console.log(`Done. Enqueued ${count} jobs to google_maps_scrape.`);
  process.exit(0);
}

main();
