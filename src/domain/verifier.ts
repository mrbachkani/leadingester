import { isBlockedHost } from "./blocklists.js";
import { normalizeCompanyName, looksParked, hostFromUrl, registrableHost } from "./normalize.js";

export type VerificationEvidence = {
  matchedName?: boolean;
  matchedHost?: boolean;
  matchedCity?: boolean;
  hasContactLink?: boolean;
  hasIdentifiers?: boolean;
  hasSameDomainEmail?: boolean;
  parked?: boolean;
  notes?: string[];
};

export function scoreDomain(params: {
  companyName: string;
  cityTokens: string[];
  candidateUrl: string;
  homepageText: string;
  homepageHtml: string;
  discoveredPaths: string[];
}): { score: number; evidence: VerificationEvidence; host: string } {

  const host = registrableHost(hostFromUrl(params.candidateUrl));
  const evidence: VerificationEvidence = { notes: [] };

  if (!host) return { score: 0, evidence: { notes: ["no_host"] }, host };
  if (isBlockedHost(host)) {
    return { score: 0, evidence: { notes: ["blocked_host"] }, host };
  }

  const text = (params.homepageText || "").toLowerCase();
  const html = (params.homepageHtml || "").toLowerCase();

  if (looksParked(text) || looksParked(html)) {
    evidence.parked = true;
    return { score: 0.05, evidence, host };
  }

  // Name match (fuzzy-ish)
  const cn = normalizeCompanyName(params.companyName);
  const cnTokens = cn.split(" ").filter(Boolean);
  const tokenHit = cnTokens.length ? cnTokens.filter(t => t.length >= 4 && text.includes(t)).length : 0;
  const nameHit = tokenHit >= Math.min(2, cnTokens.length); // require at least 2 tokens if possible
  if (nameHit) evidence.matchedName = true;

  // Host match (very common for real company sites; rare for directories once blocked)
  const hostStem = host
    .replace(/\.(co\.in|org\.in|net\.in|gov\.in|ac\.in|edu\.in|co\.uk|org\.uk|ac\.uk|gov\.uk|com\.au|net\.au|org\.au|edu\.au|gov\.au)$/i, "")
    .replace(/\.[a-z]{2,24}$/i, "")
    .replace(/[-_.]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const hostTokenHit = cnTokens.filter(t => t.length >= 4 && hostStem.includes(t)).length;
  if (hostTokenHit >= 1) evidence.matchedHost = true;

  const cityHit = params.cityTokens
    .map(t => t.toLowerCase())
    .some(t => t.length >= 3 && (text.includes(t) || html.includes(t)));
  if (cityHit) evidence.matchedCity = true;

  const hasContact = params.discoveredPaths.some(p => /\/contact|contact-us|contacts/i.test(p));
  if (hasContact) evidence.hasContactLink = true;

  const idHit = /gstin|cin\s*[:#]|corporate identification/i.test(text + " " + html);
  if (idHit) evidence.hasIdentifiers = true;

  // Same-domain email present on homepage/about/contact is a strong signal.
  // Match any email ending with the current host (including subdomains of it).
  const escapedHost = host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sameDomainEmail = new RegExp(`@[a-z0-9.-]*${escapedHost}\\b`, "i").test(text + " " + html);
  if (sameDomainEmail) evidence.hasSameDomainEmail = true;

  let score = 0;
  score += evidence.matchedName ? 0.35 : 0;
  score += evidence.matchedHost ? 0.25 : 0;
  score += evidence.hasSameDomainEmail ? 0.25 : 0;
  score += evidence.hasContactLink ? 0.15 : 0;
  score += evidence.matchedCity ? 0.10 : 0;
  score += evidence.hasIdentifiers ? 0.10 : 0;

  if (score === 0) score = 0.10;
  score = Math.max(0, Math.min(1, score));

  return { score, evidence, host };
}
