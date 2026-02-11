import { pool } from "../db/pool.js";

async function main() {
  const arg = process.argv[2];

  if (arg === "--all") {
    // Full reset: clear all progress so overnight run starts completely fresh
    const r = await pool.query("DELETE FROM search_progress");
    console.log(`✓ Cleared ALL search progress (${r.rowCount} rows deleted)`);
    console.log("  Next overnight run will start from scratch.");
  } else {
    const city = arg || "Mumbai";
    const r = await pool.query("DELETE FROM search_progress WHERE city=$1", [city]);
    console.log(`✓ Cleared progress for ${city} (${r.rowCount} rows deleted)`);
  }

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
