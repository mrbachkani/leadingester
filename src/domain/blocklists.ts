// Domains that are almost never a company's "official website" for lead-gen.
// Includes social networks, search engines, and common company directories/aggregators.
export const BLOCKED_HOSTS = new Set([
  // Social
  "facebook.com",
  "linkedin.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "youtube.com",

  // Search / maps
  "google.com",

  // India / business directories & aggregators
  "indiamart.com",
  "justdial.com",
  "tradeindia.com",
  "zaubacorp.com",
  "tofler.in",
  "thecompanycheck.com",
  "companyhouse.in",
  "falconebiz.com",
  "tracxn.com",
  "scribd.com",
  "all.biz",

  // Global aggregators
  "opencorporates.com",
  "crunchbase.com",

  // News / publisher domains that often host company profiles
  "indiatimes.com",
  "economictimes.com",
  "wikipedia.org"
]);

export function isBlockedHost(host: string): boolean {
  const h = (host || "").toLowerCase().replace(/\.$/, "");
  if (!h) return false;

  for (const blocked of BLOCKED_HOSTS) {
    if (h === blocked) return true;
    if (h.endsWith("." + blocked)) return true;
  }
  return false;
}
