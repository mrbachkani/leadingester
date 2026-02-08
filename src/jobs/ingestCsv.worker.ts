import fs from "fs";
import path from "path";
import crypto from "crypto";
import csv from "csv-parser";
import { pool } from "../db/pool.js";
import { IndiaGujaratAdapter } from "../adapters/IndiaGujaratAdapter.js";
import { qGoogleMaps } from "./queues.js";

type JobData = {
  batchId: string;
  filePath: string;
  sampleSize?: number;
  onlyActive?: boolean;
};

export async function ingestCsvJob(job: { data: JobData }) {
  const { batchId, filePath, sampleSize = 10000, onlyActive = true } = job.data;
  const adapter = new IndiaGujaratAdapter();

  let rowNo = 0;
  let accepted = 0;

  await pool.query("UPDATE import_batches SET status='ingesting', updated_at=now() WHERE batch_id=$1", [batchId]);

  await new Promise<void>((resolve, reject) => {
    const resolvedPath = path.resolve(filePath);
    const stream = fs.createReadStream(resolvedPath).pipe(csv());

    stream.on("data", async (row) => {
      stream.pause();
      rowNo++;

      try {
        const company = adapter.parseRow(row);
        if (!company) { stream.resume(); return; }
        if (onlyActive && (company.status || "").toLowerCase() !== "active") { stream.resume(); return; }

        const rowHash = crypto.createHash("sha1").update(JSON.stringify(row)).digest("hex");

        await pool.query(
          "INSERT INTO import_rows(batch_id,row_no,row_hash,raw_json) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
          [batchId, rowNo, rowHash, row]
        );

        const res = await pool.query(
          `INSERT INTO companies (jurisdiction, registry_id, legal_name, status, address_raw, state_code, roc_code, nic_code, industry_label, registered_on)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date)
           ON CONFLICT (jurisdiction, registry_id)
           DO UPDATE SET
             legal_name=EXCLUDED.legal_name,
             status=EXCLUDED.status,
             address_raw=EXCLUDED.address_raw,
             state_code=EXCLUDED.state_code,
             roc_code=EXCLUDED.roc_code,
             nic_code=EXCLUDED.nic_code,
             industry_label=EXCLUDED.industry_label,
             registered_on=EXCLUDED.registered_on,
             updated_at=now()
           RETURNING company_id`,
          [
            company.jurisdiction,
            company.registry_id,
            company.legal_name,
            company.status || null,
            company.address_raw || null,
            company.state_code || null,
            company.roc_code || null,
            company.nic_code || null,
            company.industry_label || null,
            company.registered_on || null
          ]
        );

        const companyId = res.rows[0]?.company_id;
        if (companyId) {
          await pool.query(
            "INSERT INTO company_sources(company_id,batch_id,raw_row_json) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
            [companyId, batchId, row]
          );
          try {
            await qGoogleMaps.add(
              "google_maps_scrape",
              { companyId, batchId },
              { removeOnComplete: true, attempts: 3, jobId: `google_maps_scrape:${companyId}:${batchId}` }
            );
          } catch {
            // Ignore duplicate job enqueue (BullMQ jobId already exists)
          }
          accepted++;
        }

        if (accepted >= sampleSize) {
          stream.destroy();
          resolve();
          return;
        }

        stream.resume();
      } catch {
        stream.resume();
      }
    });

    stream.on("end", () => resolve());
    stream.on("error", (err) => reject(err));
  });

  await pool.query("UPDATE import_batches SET status='enriching', updated_at=now() WHERE batch_id=$1", [batchId]);
}
