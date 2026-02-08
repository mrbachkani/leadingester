import { pool } from "../db/pool.js";
import { fetchHtml } from "../crawl/fetch.js";
import * as cheerio from "cheerio";
import crypto from "crypto";
import { env } from "../config/env.js";
import { makePriorityUrls, discoverContactPages } from "../crawl/utils.js";
import { extractEmails } from "../crawl/extract/emails.js";
import { extractPhones } from "../crawl/extract/phones.js";
import { extractContactForms } from "../crawl/extract/forms.js";
import { extractSocialLinks } from "../crawl/extract/social.js";
import { extractPeople } from "../crawl/extract/people.js";
import { isBlockedHost } from "../domain/blocklists.js";
import { registrableHost } from "../domain/normalize.js";
import { qSeed } from "./queues.js";

type JobData = { companyId: string; batchId?: string; domain: string; baseUrl: string };

export async function crawlSiteJob(job: { data: JobData }) {
  const { companyId, batchId, domain, baseUrl } = job.data;

  const crawl = await pool.query(
    "INSERT INTO crawl_runs(company_id,domain,status) VALUES($1,$2,'running') RETURNING crawl_id",
    [companyId, domain]
  );
  const crawlId = crawl.rows[0].crawl_id as string;

  const visited = new Set<string>();
  const queue = makePriorityUrls(baseUrl);
  let fetched = 0;
  let triedTeamish = 0;
  let triedContactPage = 0;

  const found = {
    emails: new Set<string>(),
    phones: new Set<string>(),
    forms: new Set<string>(),
    socials: new Set<string>()
  };

  while (queue.length && fetched < env.CRAWL_MAX_PAGES) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);

    const { status, html, finalUrl } = await fetchHtml(url);
    fetched++;

    const hash = crypto.createHash("sha1").update(html || "").digest("hex");
    await pool.query(
      "INSERT INTO crawl_pages(crawl_id,url,http_status,content_hash) VALUES($1,$2,$3,$4)",
      [crawlId, finalUrl, status, hash]
    );

    if (status >= 400 || !html) continue;

    // If this is the homepage, discover contact page links and add them to queue
    if (fetched === 1) {
      const discoveredContactPages = discoverContactPages(html, baseUrl);
      for (const contactUrl of discoveredContactPages) {
        if (!visited.has(contactUrl) && !queue.includes(contactUrl)) {
          queue.unshift(contactUrl); // Add to front of queue for priority
        }
      }
    }

    const text = cheerio.load(html).text();

    for (const e of extractEmails(text + " " + html)) {
      const emailHost = registrableHost((e.split("@")[1] || "").toLowerCase());
      if (!emailHost) continue;
      if (isBlockedHost(emailHost)) continue;
      found.emails.add(e);
    }
    extractPhones(text + " " + html).forEach(p => found.phones.add(p));
    extractContactForms(html, finalUrl).forEach(f => found.forms.add(f));

    const social = extractSocialLinks(html);
    if (social.linkedin) found.socials.add(social.linkedin);

    // Check if this is a contact page for enhanced extraction
    const isContactPage = /contact|help\/contact|support\/contact|customer-service|get-in-touch/i.test(finalUrl);
    if (isContactPage) {
      triedContactPage++;
      console.log(`[Crawler] Found contact page: ${finalUrl}`);
      // Contact pages often have more structured contact info, so extract more aggressively
    }

    const isTeamish = /team|leadership|management|our-team/i.test(finalUrl);
    if (isTeamish) {
      triedTeamish++;
      const people = extractPeople(html);
      for (const p of people) {
        await pool.query(
          "INSERT INTO company_people(company_id,name,role,email,source_url,confidence) VALUES($1,$2,$3,$4,$5,$6)",
          [companyId, p.name, p.role || null, p.email || null, finalUrl, p.confidence]
        );
        
        // Also add to found.emails if valid
        if (p.email) {
             const emailHost = registrableHost((p.email.split("@")[1] || "").toLowerCase());
             if (emailHost && !isBlockedHost(emailHost)) {
                 found.emails.add(p.email);
             }
        }
      }
    }

    // Stop once we have usable contact info AND we have visited contact/team pages
    const hasEmail = found.emails.size > 0;
    const hasAnyContact = hasEmail || found.phones.size > 0 || found.forms.size > 0;
    
    // Prefer visiting at least one contact page before stopping
    if (hasEmail && triedContactPage > 0 && (triedTeamish > 0 || fetched >= 4)) break;
    if (hasEmail && !triedContactPage && fetched >= 6) break;
    if (!hasEmail && hasAnyContact && fetched >= 8) break;
  }

  // Store contacts (dedupe by value via app-level set; DB will store duplicates if rerun—acceptable for MVP)
  for (const e of Array.from(found.emails).slice(0, 10)) {
    const label =
      e.startsWith("sales@") ? "sales" :
      e.startsWith("business@") ? "sales" :
      e.startsWith("hello@") ? "sales" :
      e.startsWith("support@") ? "support" :
      e.startsWith("careers@") ? "careers" :
      e.startsWith("hr@") ? "careers" :
      e.startsWith("info@") ? "info" : "unknown";

    await pool.query(
      "INSERT INTO company_contacts(company_id,type,value,label,source_url,confidence) VALUES($1,'email',$2,$3,$4,0.8) ON CONFLICT (company_id,type,value) DO NOTHING",
      [companyId, e, label, baseUrl]
    );
  }

  for (const p of Array.from(found.phones).slice(0, 5)) {
    await pool.query(
      "INSERT INTO company_contacts(company_id,type,value,label,source_url,confidence) VALUES($1,'phone',$2,'unknown',$3,0.75) ON CONFLICT (company_id,type,value) DO NOTHING",
      [companyId, p, baseUrl]
    );
  }

  for (const f of Array.from(found.forms).slice(0, 3)) {
    await pool.query(
      "INSERT INTO company_contacts(company_id,type,value,label,source_url,confidence) VALUES($1,'contact_form',$2,'unknown',$3,0.7) ON CONFLICT (company_id,type,value) DO NOTHING",
      [companyId, f, baseUrl]
    );
  }

  for (const s of Array.from(found.socials).slice(0, 2)) {
    await pool.query(
      "INSERT INTO company_contacts(company_id,type,value,label,source_url,confidence) VALUES($1,'social',$2,'unknown',$3,0.7) ON CONFLICT (company_id,type,value) DO NOTHING",
      [companyId, s, baseUrl]
    );
  }

  await pool.query(
    "UPDATE crawl_runs SET status='completed', finished_at=now(), pages_fetched=$2 WHERE crawl_id=$1",
    [crawlId, fetched]
  );

  await qSeed.add(
    "seed_lead",
    { companyId, batchId },
    { removeOnComplete: true, attempts: 2, jobId: `seed_lead:${companyId}:${batchId || "latest"}` }
  );
}
