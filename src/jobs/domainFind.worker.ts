import { pool } from "../db/pool.js";
import { IndiaGujaratAdapter } from "../adapters/IndiaGujaratAdapter.js";
import { SerpApiProvider } from "../serp/SerpApiProvider.js";
import { hostFromUrl, registrableHost } from "../domain/normalize.js";
import { isBlockedHost } from "../domain/blocklists.js";
import { qCrawl, qDomainVerify } from "./queues.js";
import { env } from "../config/env.js";

type JobData = { companyId: string; batchId: string };

export async function domainFindJob(job: { data: JobData }) {
  const { companyId, batchId } = job.data;

  const existing = await pool.query(
    "SELECT status, domain, final_url FROM company_domains WHERE company_id=$1",
    [companyId]
  );
  if (existing.rowCount) {
    // If a previously verified domain is now considered low-quality (directory/aggregator),
    // clear it and rerun SERP to find the real company site.
    if (existing.rows[0].status === "verified" && existing.rows[0].domain && isBlockedHost(existing.rows[0].domain as string)) {
      await pool.query("DELETE FROM company_domains WHERE company_id=$1", [companyId]);
    } else {
    // If a domain is already verified, skip SERP and proceed to crawl/seed for this batch.
    if (existing.rows[0].status === "verified" && existing.rows[0].domain) {
      const domain = existing.rows[0].domain as string;
      const baseUrl = (existing.rows[0].final_url as string | null) || `https://${domain}`;
      await qCrawl.add(
        "crawl_site",
        { companyId, batchId, domain, baseUrl },
        { removeOnComplete: true, attempts: 2, jobId: `crawl_site:${companyId}:${batchId}` }
      );
    }
    return;
    }
  }

  const cRes = await pool.query("SELECT legal_name, address_raw FROM companies WHERE company_id=$1", [companyId]);
  if (!cRes.rowCount) return;

  const legalName = cRes.rows[0].legal_name as string;
  const addressRaw = (cRes.rows[0].address_raw || "") as string;

  const adapter = new IndiaGujaratAdapter();
  const hints = adapter.getQueryHints({
    jurisdiction: "IN",
    registry_id: "",
    legal_name: legalName,
    address_raw: addressRaw
  } as any);

  const serp = new SerpApiProvider();
  const runId = `run_${Date.now()}`;

  const queries: string[] = [];
  const state = hints.stateToken || "Gujarat";
  const city = hints.cityTokens?.[0];

  // Reduce directory/aggregator results; still allow official sites to win.
  const exclude =
    " -tracxn -tofler -companyhouse -thecompanycheck -falconebiz -economictimes -indiatimes -scribd" +
    " -zaubacorp -indiamart -justdial -tradeindia";

  queries.push(`"${legalName}" ${state} official website${exclude}`);
  if (city) queries.push(`"${legalName}" "${city}" website${exclude}`);
  queries.push(`"${legalName}" contact${exclude}`);

  let used = 0;
  let inserted = 0;

  for (const q of queries) {
    if (used >= env.MAX_SERP_QUERIES_PER_COMPANY) break;
    used++;

    const results = await serp.search(q, { hl: "en", gl: "in" });

    const qRow = await pool.query(
      "INSERT INTO domain_queries(company_id,query_used,provider,run_id) VALUES($1,$2,$3,$4) RETURNING query_id",
      [companyId, q, "serpapi", runId]
    );
    const queryId = qRow.rows[0].query_id as string;

    const top = results.slice(0, 5);
    let rank = 0;

    for (const r of top) {
      rank++;
      const host = registrableHost(hostFromUrl(r.link));
      if (!host) continue;
      if (isBlockedHost(host)) continue;
      await pool.query(
        "INSERT INTO domain_candidates(query_id,rank,url,domain,title,snippet) VALUES($1,$2,$3,$4,$5,$6)",
        [queryId, rank, r.link, host, r.title || null, r.snippet || null]
      );
      inserted++;
    }
  }

  if (inserted) {
    await qDomainVerify.add(
      "domain_verify",
      { companyId, batchId },
      { removeOnComplete: true, attempts: 2, jobId: `domain_verify:${companyId}:${batchId}` }
    );
  }
}
