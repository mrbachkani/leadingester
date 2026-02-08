export function hostFromUrl(u: string): string {
  try {
    // hostname excludes port; keep it this way so normalization/blocklists work reliably.
    return new URL(u).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return "";
  }
}

export function registrableHost(host: string): string {
  const h = (host || "").toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  if (!h) return "";
  if (h === "localhost") return h;
  if (h.includes(":")) return h; // IPv6
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return h; // IPv4

  const parts = h.split(".").filter(Boolean);
  if (parts.length <= 2) return h;

  // Common multi-part public suffixes (not exhaustive; tuned for IN + common global cases)
  const suffix2 = parts.slice(-2).join(".");
  const suffix3 = parts.slice(-3).join(".");

  const multipart2 = new Set([
    "co.in", "org.in", "net.in", "gov.in", "ac.in", "edu.in",
    "co.uk", "org.uk", "ac.uk", "gov.uk",
    "com.au", "net.au", "org.au", "edu.au", "gov.au"
  ]);

  const multipart3 = new Set([
    "co.jp", "ne.jp", "or.jp"
  ]);

  if (multipart3.has(suffix3) && parts.length >= 4) return parts.slice(-4).join(".");
  if (multipart2.has(suffix2) && parts.length >= 3) return parts.slice(-3).join(".");

  // Default: eTLD+1 approximation
  return parts.slice(-2).join(".");
}

export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(pvt|private|ltd|limited|llp|company|co)\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function looksParked(text: string): boolean {
  const t = (text || "").toLowerCase();
  return (
    t.includes("domain for sale") ||
    t.includes("buy this domain") ||
    t.includes("this domain is for sale") ||
    t.includes("sedo") ||
    (t.includes("godaddy") && t.includes("domain"))
  );
}
