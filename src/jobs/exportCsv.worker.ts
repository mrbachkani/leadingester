import fs from "fs";
import path from "path";
import { pool } from "../db/pool.js";

type JobData = { batchId: string };

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

export async function exportCsvJob(job: { data: JobData }) {
  const { batchId } = job.data;

  const exportDir = path.join("data", "exports", batchId);
  ensureDir(exportDir);

  const res = await pool.query(
    `SELECT
      c.legal_name,
      c.maps_category,
      c.search_city,
      c.search_category,
      c.address_raw,
      c.maps_rating,
      c.maps_reviews_count,
      cd.domain AS website_domain,
      cd.final_url AS website_url,
      COALESCE(l.lead_score, 0) AS lead_score,
      (SELECT string_agg(DISTINCT value, '; ') FROM company_contacts cc WHERE cc.company_id=c.company_id AND cc.type='email') AS emails,
      (SELECT string_agg(DISTINCT value, '; ') FROM company_contacts cc WHERE cc.company_id=c.company_id AND cc.type='phone') AS phones,
      (SELECT string_agg(DISTINCT value, '; ') FROM company_contacts cc WHERE cc.company_id=c.company_id AND cc.type='social') AS linkedin,
      (SELECT string_agg(DISTINCT value, '; ') FROM company_contacts cc WHERE cc.company_id=c.company_id AND cc.type='contact_form') AS contact_forms,
      (SELECT p.name FROM company_people p WHERE p.company_id=c.company_id ORDER BY p.confidence DESC, p.found_at DESC LIMIT 1) AS contact_person,
      (SELECT p.role FROM company_people p WHERE p.company_id=c.company_id ORDER BY p.confidence DESC, p.found_at DESC LIMIT 1) AS contact_role,
      (SELECT p.email FROM company_people p WHERE p.company_id=c.company_id AND p.email IS NOT NULL ORDER BY p.confidence DESC LIMIT 1) AS contact_email
     FROM companies c
     JOIN company_sources cs ON cs.company_id=c.company_id
     LEFT JOIN company_domains cd ON cd.company_id=c.company_id AND cd.status='verified'
     LEFT JOIN leads l ON l.company_id=c.company_id AND l.source_batch_id=cs.batch_id
     WHERE cs.batch_id=$1`,
    [batchId]
  );

  const outPath = path.join(exportDir, `leads_${batchId}.csv`);

  const headers = [
    "Company Name",
    "Category",
    "City",
    "Address",
    "Phone",
    "Email",
    "Website",
    "Rating",
    "Reviews",
    "Contact Person",
    "Contact Role",
    "Contact Email",
    "All Emails",
    "All Phones",
    "LinkedIn",
    "Contact Forms",
    "Lead Score"
  ];

  const lines: string[] = [headers.join(",")];

  for (const r of res.rows) {
    const primaryPhone = r.phones ? r.phones.split("; ")[0] : "";
    const primaryEmail = r.contact_email || (r.emails ? r.emails.split("; ")[0] : "");

    const row = [
      r.legal_name || "",
      r.maps_category || "",
      r.search_city || "",
      r.address_raw || "",
      primaryPhone,
      primaryEmail,
      r.website_url || r.website_domain || "",
      r.maps_rating != null ? String(r.maps_rating) : "",
      r.maps_reviews_count != null ? String(r.maps_reviews_count) : "",
      r.contact_person || "",
      r.contact_role || "",
      r.contact_email || "",
      r.emails || "",
      r.phones || "",
      r.linkedin || "",
      r.contact_forms || "",
      r.lead_score != null ? String(r.lead_score) : "0"
    ];

    const csvRow = row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
    lines.push(csvRow);
  }

  fs.writeFileSync(outPath, lines.join("\n"), "utf8");

  await pool.query("UPDATE import_batches SET status='completed', updated_at=now() WHERE batch_id=$1", [batchId]);

  console.log("Export written:", outPath);
}
