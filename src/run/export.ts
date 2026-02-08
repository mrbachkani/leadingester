import { qExport } from "../jobs/queues.js";

async function main() {
  const batchId = process.argv[2];
  if (!batchId) throw new Error("Usage: npm run export -- <batchId>");

  await qExport.add("export_csv", { batchId }, { attempts: 1 });
  console.log("Export enqueued for batch:", batchId);
}

main().catch(e => { console.error(e); process.exit(1); });
