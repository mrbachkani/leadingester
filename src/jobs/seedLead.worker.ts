import { pool } from "../db/pool.js";
import { isBlockedHost } from "../domain/blocklists.js";
import { registrableHost } from "../domain/normalize.js";

type JobData = { companyId: string; batchId?: string };

export async function seedLeadJob(job: { data: JobData }) {
  const { companyId } = job.data;
  let batchId = job.data.batchId;

  const dom = await pool.query("SELECT domain, confidence, status FROM company_domains WHERE company_id=$1", [companyId]);
  if (!dom.rowCount || dom.rows[0].status !== "verified") return;

  if (!batchId) {
    const b = await pool.query(
      "SELECT batch_id FROM company_sources WHERE company_id=$1 ORDER BY created_at DESC LIMIT 1",
      [companyId]
    );
    batchId = b.rows[0]?.batch_id as string | undefined;
  }
  if (!batchId) return;

  const contacts = await pool.query(
    "SELECT type, value, label FROM company_contacts WHERE company_id=$1",
    [companyId]
  );
  if (!contacts.rowCount) return;

  const rawEmails = contacts.rows.filter(r => r.type === "email").map(r => r.value as string);
  const phones = contacts.rows.filter(r => r.type === "phone").map(r => r.value as string);
  const forms = contacts.rows.filter(r => r.type === "contact_form").map(r => r.value as string);
  const socials = contacts.rows.filter(r => r.type === "social").map(r => r.value as string);

  const companyDomain = (dom.rows[0].domain as string) || "";
  const emails = rawEmails.filter((e) => {
    const emailHost = registrableHost((e.split("@")[1] || "").toLowerCase());
    if (!emailHost) return false;
    return !isBlockedHost(emailHost);
  });
  const isSameDomainEmail = (email: string) => {
    const h = (email.split("@")[1] || "").toLowerCase();
    if (!h || !companyDomain) return false;
    return h === companyDomain.toLowerCase() || h.endsWith("." + companyDomain.toLowerCase());
  };

  const sameDomainEmails = emails.filter(isSameDomainEmail);
  const pickEmail =
    sameDomainEmails.find(e => e.startsWith("sales@")) ||
    sameDomainEmails.find(e => e.startsWith("business@")) ||
    sameDomainEmails.find(e => e.startsWith("hello@")) ||
    sameDomainEmails.find(e => e.startsWith("info@")) ||
    emails.find(e => e.startsWith("sales@")) ||
    emails.find(e => e.startsWith("business@")) ||
    emails.find(e => e.startsWith("hello@")) ||
    emails.find(e => e.startsWith("info@")) ||
    emails[0];

  const primary =
    pickEmail ? { type: "email", value: pickEmail } :
    phones[0] ? { type: "phone", value: phones[0] } :
    forms[0] ? { type: "contact_form", value: forms[0] } :
    socials[0] ? { type: "social", value: socials[0] } : null;

  if (!primary) return;

  let score = 0;
  if (emails.length) score += 30;
  if (phones.length) score += 20;
  if (forms.length) score += 20;
  if (socials.length) score += 10;
  if ((dom.rows[0].confidence as number) >= 0.8) score += 10;
  if (pickEmail && isSameDomainEmail(pickEmail)) score += 10;

  await pool.query(
    `INSERT INTO leads(company_id,primary_domain,primary_contact_type,primary_contact_value,lead_score,source_batch_id)
     VALUES($1,$2,$3,$4,$5,$6)
     ON CONFLICT (company_id, source_batch_id)
     DO UPDATE SET
       primary_domain=EXCLUDED.primary_domain,
       primary_contact_type=EXCLUDED.primary_contact_type,
       primary_contact_value=EXCLUDED.primary_contact_value,
       lead_score=GREATEST(leads.lead_score, EXCLUDED.lead_score)
     WHERE EXCLUDED.lead_score >= leads.lead_score
        OR (leads.primary_contact_type <> 'email' AND EXCLUDED.primary_contact_type = 'email')`,
    [companyId, dom.rows[0].domain, primary.type, primary.value, score, batchId]
  );
}
