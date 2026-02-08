import path from "path";
import fs from "fs";
import { pool } from "../db/pool.js";
import { qIngest } from "../jobs/queues.js";

function portableRelativePath(absPath: string): string {
  const rel = path.relative(process.cwd(), absPath);
  const isOutside = rel.startsWith("..") || path.isAbsolute(rel);
  return isOutside ? absPath : rel.split(path.sep).join("/");
}

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  const filePathArg = process.argv[2];
  if (!filePathArg) throw new Error("Usage: npm run kickoff -- <csvPath> --sampleSize 10000 --onlyActive true");

  const sampleSize = parseInt(argValue("--sampleSize") || "10000", 10);
  const onlyActive = (argValue("--onlyActive") || "true").toLowerCase() === "true";

  const absPath = path.resolve(filePathArg);
  if (!fs.existsSync(absPath)) throw new Error(`CSV not found: ${absPath}`);

  // Store a portable path so kickoff can run on Windows while workers run in Docker/Linux.
  // Prefer project-relative paths like `data/uploads/foo.csv`.
  const filePath = portableRelativePath(absPath);
  const filename = path.basename(absPath);

  const batch = await pool.query(
    "INSERT INTO import_batches(filename, local_path, jurisdiction, status) VALUES($1,$2,$3,'uploaded') RETURNING batch_id",
    [filename, filePath, "IN-GJ"]
  );
  const batchId = batch.rows[0].batch_id as string;

  await qIngest.add("ingest_csv", { batchId, filePath, sampleSize, onlyActive }, { attempts: 1 });
  console.log("Batch created:", batchId);
  console.log("Ingest enqueued. Start workers with: npm run workers");
}

main().catch(e => { console.error(e); process.exit(1); });
