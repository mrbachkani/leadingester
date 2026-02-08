import { pool } from "../db/pool.js";
import { fetchHtml } from "../crawl/fetch.js";
import * as cheerio from "cheerio";
import { internalPathsFromHtml } from "../crawl/utils.js";
import { scoreDomain } from "../domain/verifier.js";
import { hostFromUrl, registrableHost } from "../domain/normalize.js";
import { isBlockedHost } from "../domain/blocklists.js";
import { env } from "../config/env.js";
import { qCrawl } from "./queues.js";

type JobData = { companyId: string; batchId?: string };

function pathLooksLikeDirectory(url: string): boolean {
  try {
    const p = new URL(url).pathname.toLowerCase();
    return (
      p.includes("/legal-entities/") ||
      p.includes("/company-profile") ||
      p.includes("/company/") ||
      p.includes("/companies/") ||
      p.includes("/directory/") ||
      p.includes("/profile/") ||
      p.includes("/d/legal-entities/")
    );
  } catch {
    return false;
  }
}

export async function domainVerifyJob(job: { data: JobData }) {
  const { companyId, batchId } = job.data;

  const existing = await pool.query("SELECT status FROM company_domains WHERE company_id=$1", [companyId]);
  if (existing.rowCount && existing.rows[0].status === "verified") return;

  const comp = await pool.query("SELECT legal_name, address_raw FROM companies WHERE company_id=$1", [companyId]);
  if (!comp.rowCount) return;

  const companyName = comp.rows[0].legal_name as string;
  const addr = (comp.rows[0].address_raw || "").toString();

  const cityTokens = addr.split(",").map((x: string) => x.trim()).filter(Boolean).slice(-4).filter((x: string) => x.length >= 3);

  const candidates = await pool.query(
    `SELECT dc.domain, dc.url
     FROM domain_candidates dc
     JOIN domain_queries dq ON dq.query_id = dc.query_id
     WHERE dq.company_id = $1
     ORDER BY dq.created_at DESC, dc.rank ASC
     LIMIT 25`,
    [companyId]
  );

  if (!candidates.rowCount) {
    await pool.query(
      `INSERT INTO company_domains(company_id,domain,confidence,evidence_json,status,verified_at)
       VALUES($1,'',0,'{"reason":"no_candidates"}','not_found',now())
       ON CONFLICT (company_id) DO NOTHING`,
      [companyId]
    );
    return;
  }

  let best: { domain: string; finalUrl: string; score: number; evidence: any } | null = null;

  const seen = new Set<string>();
  const unique = candidates.rows.filter((r: any) => {
    const d = (r.domain || "").toString();
    if (!d || seen.has(d)) return false;
    seen.add(d);
    return true;
  });

  for (const c of unique.slice(0, 8)) {
    const testUrl = c.url?.startsWith("http") ? c.url : `https://${c.domain}`;
    const landing = await fetchHtml(testUrl);
    if (landing.status >= 400 || !landing.html) continue;

    const landingHost = registrableHost(hostFromUrl(landing.finalUrl));
    if (!landingHost || isBlockedHost(landingHost)) continue;

    // Prefer scoring the homepage instead of a deep SERP result path (common for directories).
    let homepage = landing;
    try {
      const homeUrl = new URL(landing.finalUrl).origin + "/";
      if (homeUrl !== landing.finalUrl) {
        const h = await fetchHtml(homeUrl);
        if (h.status < 400 && h.html) homepage = h;
      }
    } catch {}

    const text = cheerio.load(homepage.html).text().replace(/\s+/g, " ").trim();
    const paths = internalPathsFromHtml(homepage.html, homepage.finalUrl);

    const { score, evidence } = scoreDomain({
      companyName,
      cityTokens,
      candidateUrl: homepage.finalUrl,
      homepageText: text,
      homepageHtml: homepage.html,
      discoveredPaths: paths
    });

    // Penalize results that look like directory/profile paths even if the host isn't blocked.
    const adjusted = Math.max(0, score - (pathLooksLikeDirectory(landing.finalUrl) ? 0.25 : 0));
    if (pathLooksLikeDirectory(landing.finalUrl)) {
      evidence.notes = Array.isArray(evidence.notes) ? evidence.notes : [];
      evidence.notes.push("directory_path_penalty");
    }

    if (!best || adjusted > best.score) best = { domain: landingHost, finalUrl: homepage.finalUrl, score: adjusted, evidence };
    if (adjusted >= 0.85) break;
  }

  if (!best) {
    await pool.query(
      `INSERT INTO company_domains(company_id,domain,final_url,confidence,evidence_json,status,verified_at)
       VALUES($1,$2,$3,$4,$5,'not_found',now())
       ON CONFLICT (company_id)
       DO UPDATE SET domain=EXCLUDED.domain, final_url=EXCLUDED.final_url, confidence=EXCLUDED.confidence,
                     evidence_json=EXCLUDED.evidence_json, status='not_found', verified_at=now(), updated_at=now()`,
      [companyId, "", null, 0, { reason: "all_candidates_failed" }]
    );
    return;
  }

  if (best.score < env.DOMAIN_ACCEPT_THRESHOLD) {
    await pool.query(
      `INSERT INTO company_domains(company_id,domain,final_url,confidence,evidence_json,status,verified_at)
       VALUES($1,$2,$3,$4,$5,'rejected',now())
       ON CONFLICT (company_id)
       DO UPDATE SET domain=EXCLUDED.domain, final_url=EXCLUDED.final_url, confidence=EXCLUDED.confidence,
                     evidence_json=EXCLUDED.evidence_json, status='rejected', verified_at=now(), updated_at=now()`,
      [companyId, best.domain || "", best.finalUrl || null, best.score || 0, best.evidence || { reason: "low_confidence" }]
    );
    return;
  }

  await pool.query(
    `INSERT INTO company_domains(company_id,domain,final_url,confidence,evidence_json,status,verified_at)
     VALUES($1,$2,$3,$4,$5,'verified',now())
     ON CONFLICT (company_id)
     DO UPDATE SET domain=EXCLUDED.domain, final_url=EXCLUDED.final_url, confidence=EXCLUDED.confidence,
                   evidence_json=EXCLUDED.evidence_json, status='verified', verified_at=now(), updated_at=now()`,
    [companyId, best.domain, best.finalUrl, best.score, best.evidence]
  );

  await qCrawl.add(
    "crawl_site",
    { companyId, batchId, domain: best.domain, baseUrl: best.finalUrl },
    { removeOnComplete: true, attempts: 2, jobId: `crawl_site:${companyId}:${batchId || "latest"}` }
  );
}
