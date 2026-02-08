import fs from "fs";
import path from "path";
import { pool } from "./pool.js";

async function main() {
  const sqlPath = path.resolve("migrations/001_pipeline.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  await pool.query(sql);
  console.log("Migration applied:", sqlPath);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
