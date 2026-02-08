import * as cheerio from "cheerio";

export function extractContactForms(html: string, pageUrl: string): string[] {
  const $ = cheerio.load(html || "");
  const forms = $("form").toArray();
  if (!forms.length) return [];
  return [pageUrl]; // record page URL only; do not submit forms
}
