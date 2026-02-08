import * as cheerio from "cheerio";

export function extractSocialLinks(html: string): { linkedin?: string; others: string[] } {
  const $ = cheerio.load(html || "");
  const links = $("a[href]").toArray().map(a => ($(a).attr("href") || "").trim()).filter(Boolean);
  const abs = links.filter(h => /^https?:\/\//i.test(h));
  const linkedin = abs.find(h => /linkedin\.com\/company\//i.test(h));
  const others = abs.filter(h => !/linkedin\.com/i.test(h)).slice(0, 20);
  return { linkedin, others };
}
