import { pool } from "../db/pool.js";
import { GoogleMapsScraper, GoogleMapsResult } from "../scraping/GoogleMapsScraper.js";
import { qCrawl } from "./queues.js";
import { registrableHost, hostFromUrl } from "../domain/normalize.js";
import { isBlockedHost } from "../domain/blocklists.js";

type JobData = { companyId: string; batchId: string };

const scraper = new GoogleMapsScraper();
let scraperInitialized = false;

// Ensure we close the browser when the process exits
process.on("exit", () => scraper.close());
process.on("SIGINT", () => scraper.close());
process.on("SIGTERM", () => scraper.close());

export async function googleMapsScrapeJob(job: { data: JobData }) {
  const { companyId, batchId } = job.data;

  // Check existing
  const existing = await pool.query(
    "SELECT status, domain, final_url FROM company_domains WHERE company_id=$1",
    [companyId]
  );

  // If already verified and NOT blocked, skip
  if (existing.rowCount && existing.rows[0].status === "verified") {
    const d = existing.rows[0].domain;
    if (d && !isBlockedHost(d)) return;
  }

  // Get company details
  const cRes = await pool.query("SELECT legal_name, address_raw FROM companies WHERE company_id=$1", [companyId]);
  if (!cRes.rowCount) return;
  const { legal_name, address_raw } = cRes.rows[0];

  // Initialize scraper if needed (lazy init per worker process)
  if (!scraperInitialized) {
    await scraper.init();
    scraperInitialized = true;
  }

  // Construct query: "{Name} {City}"
  // Try to extract city from address if possible, or just append address
  const cityMatch = address_raw?.match(/([a-zA-Z]+)\s*-\s*\d{6}/); // Simple Indian pincode match often preceded by city
  const city = cityMatch ? cityMatch[1] : "";
  const query = `${legal_name} ${city || address_raw || ""}`.trim();
  console.log(`[Maps] Searching for: "${query}" (Company: ${legal_name})`);

  // Search
  const result = await scraper.search(query);

  if (!result) {
    console.log(`[Maps] No result found for: "${query}"`);
    // Mark as not found so we don't loop forever
    await pool.query(
      `INSERT INTO company_domains(company_id, status, verified_at, updated_at)
       VALUES($1, 'not_found', now(), now())
       ON CONFLICT (company_id) DO UPDATE SET status='not_found', updated_at=now()`,
      [companyId]
    );
    return;
  }

  // Save partial data (Phone, Address, etc.) even if no website
  // We can store this in a "company_maps_data" table or directly update companies/contacts.
  // For now, let's update companies address if better, and insert contacts.

  // Update company with enriched Maps data
  const updateParts: string[] = [];
  const updateVals: any[] = [];
  let paramIdx = 1;

  if (result.address) {
    updateParts.push(`address_raw = COALESCE(NULLIF(address_raw, ''), $${paramIdx})`);
    updateVals.push(result.address);
    paramIdx++;
  }
  if (result.category) {
    updateParts.push(`maps_category = COALESCE(maps_category, $${paramIdx})`);
    updateVals.push(result.category);
    paramIdx++;
  }
  if (result.rating != null) {
    updateParts.push(`maps_rating = COALESCE(maps_rating, $${paramIdx})`);
    updateVals.push(result.rating);
    paramIdx++;
  }
  if (result.reviewsCount != null) {
    updateParts.push(`maps_reviews_count = COALESCE(maps_reviews_count, $${paramIdx})`);
    updateVals.push(result.reviewsCount);
    paramIdx++;
  }

  if (updateParts.length > 0) {
    updateVals.push(companyId);
    await pool.query(
      `UPDATE companies SET ${updateParts.join(", ")} WHERE company_id=$${paramIdx}`,
      updateVals
    );
  }

  // Insert Phone
  if (result.phone) {
    await pool.query(
      "INSERT INTO company_contacts(company_id,type,value,label,source_url,confidence) VALUES($1,'phone',$2,'google_maps','maps',0.95) ON CONFLICT DO NOTHING",
      [companyId, result.phone]
    );
  }

  // Insert Emails from Maps description
  if (result.emails && result.emails.length) {
    for (const email of result.emails) {
      await pool.query(
        "INSERT INTO company_contacts(company_id,type,value,label,source_url,confidence) VALUES($1,'email',$2,'google_maps','maps',0.90) ON CONFLICT DO NOTHING",
        [companyId, email]
      );
    }
  }

  // Handle Website - Updated: 2026-02-05
  if (result.website) {
    let cleanUrl = result.website;
    
    // Handle Google redirect URLs like /url?q=http://example.com/&opi=...
    if (cleanUrl.startsWith('/url?q=')) {
      try {
        const urlParams = new URLSearchParams(cleanUrl.substring(5)); // Remove '/url?'
        const actualUrl = urlParams.get('q');
        if (actualUrl) {
          cleanUrl = actualUrl;
          console.log(`[Maps] Extracted URL from redirect: ${cleanUrl}`);
        }
      } catch (e) {
        console.log(`[Maps] Failed to parse redirect URL: ${cleanUrl}`);
      }
    }
    
    const host = registrableHost(hostFromUrl(cleanUrl));
    console.log(`[Maps] Verified domain: ${host} (URL: ${cleanUrl})`);
      
    if (host && !isBlockedHost(host)) {
      // It's a good domain!
      await pool.query(
        `INSERT INTO company_domains(company_id, domain, final_url, confidence, status, verified_at, updated_at)
         VALUES($1, $2, $3, 0.95, 'verified', now(), now())
         ON CONFLICT (company_id) DO UPDATE 
         SET domain=EXCLUDED.domain, final_url=EXCLUDED.final_url, confidence=0.95, status='verified', verified_at=now(), updated_at=now()`,
        [companyId, host, result.website]
      );

      // Trigger Crawl
      await qCrawl.add(
        "crawl_site",
        { companyId, batchId, domain: host, baseUrl: result.website },
        { removeOnComplete: true, attempts: 2, jobId: `crawl_site:${companyId}:${batchId}` }
      );
    } else {
      console.log(`[Maps] Blocked/Invalid host found: ${host}`);
      // Blocked host found on maps (e.g. they listed their facebook page)
       await pool.query(
        `INSERT INTO company_domains(company_id, status, verified_at) VALUES($1, 'rejected', now())
         ON CONFLICT (company_id) DO UPDATE SET status='rejected'`,
        [companyId]
      );
    }
  } else {
     await pool.query(
      `INSERT INTO company_domains(company_id, status, verified_at) VALUES($1, 'not_found', now())
       ON CONFLICT (company_id) DO UPDATE SET status='not_found'`,
      [companyId]
    );
  }
}
