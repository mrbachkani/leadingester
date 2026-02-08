import * as cheerio from "cheerio";

export function internalPathsFromHtml(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html || "");
  const links = $("a[href]").toArray().map(a => ($(a).attr("href") || "").trim()).filter(Boolean);
  const out: string[] = [];

  for (const href of links) {
    try {
      const u = new URL(href, baseUrl);
      out.push(u.pathname.toLowerCase());
    } catch {}
  }
  return out;
}

export function makePriorityUrls(baseUrl: string): string[] {
  const u = new URL(baseUrl);
  const origin = u.origin;
  const paths = [
    "/",
    "/contact",
    "/contact-us",
    "/contactus",
    "/contact_us",
    "/help/contact",
    "/help/contact-us",
    "/support/contact",
    "/customer-service",
    "/customer-support",
    "/get-in-touch",
    "/reach-us",
    "/about",
    "/about-us",
    "/team",
    "/leadership",
    "/management",
    "/our-team"
  ];
  return paths.map(p => new URL(p, origin).toString());
}

export function discoverContactPages(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html || "");
  const links = $("a[href]").toArray().map(a => ($(a).attr("href") || "").trim()).filter(Boolean);
  const contactPages: string[] = [];

  for (const href of links) {
    try {
      const u = new URL(href, baseUrl);
      if (u.pathname.toLowerCase().includes("contact")) {
        contactPages.push(u.toString());
      }
    } catch {}
  }
  return contactPages;
}
