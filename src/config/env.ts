import dotenv from "dotenv";
dotenv.config();

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const env = {
  DATABASE_URL: req("DATABASE_URL"),
  REDIS_URL: req("REDIS_URL"),
  // Optional: required only when using SerpApi (domain_find worker).
  SERPAPI_API_KEY: process.env.SERPAPI_API_KEY || "",

  DOMAIN_ACCEPT_THRESHOLD: parseFloat(process.env.DOMAIN_ACCEPT_THRESHOLD || "0.70"),
  MAX_SERP_QUERIES_PER_COMPANY: parseInt(process.env.MAX_SERP_QUERIES_PER_COMPANY || "2", 10),
  // Helps avoid SerpApi 429 throttling on low-tier plans.
  SERPAPI_MIN_DELAY_MS: parseInt(process.env.SERPAPI_MIN_DELAY_MS || "0", 10),
  CRAWL_MAX_PAGES: parseInt(process.env.CRAWL_MAX_PAGES || "8", 10),
  CRAWL_TIMEOUT_MS: parseInt(process.env.CRAWL_TIMEOUT_MS || "15000", 10),
  USER_AGENT: process.env.USER_AGENT || "LeadPipelineBot/1.0 (+contact@example.com)"
};
