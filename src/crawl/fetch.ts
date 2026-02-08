import { env } from "../config/env.js";

export async function fetchHtml(url: string): Promise<{ status: number; html: string; finalUrl: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), env.CRAWL_TIMEOUT_MS);

  try {
    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: {
          "User-Agent": env.USER_AGENT,
          "Accept": "text/html,application/xhtml+xml,*/*"
        },
        signal: ctrl.signal
      });

      const ct = (res.headers.get("content-type") || "").toLowerCase();
      const isHtml =
        !ct ||
        ct.includes("text/html") ||
        ct.includes("application/xhtml+xml") ||
        ct.startsWith("text/");

      const html = isHtml ? await res.text() : "";
      return { status: res.status, html, finalUrl: res.url };
    } catch {
      return { status: 0, html: "", finalUrl: url };
    }
  } finally {
    clearTimeout(t);
  }
}
