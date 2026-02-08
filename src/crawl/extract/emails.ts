export function extractEmails(text: string): string[] {
  const t = text || "";
  const out = new Set<string>();

  const re = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

  const BAD_TLDS = new Set([
    "png", "jpg", "jpeg", "webp", "gif", "svg", "ico",
    "css", "js", "mjs", "cjs", "json", "xml",
    "pdf", "zip", "rar", "7z", "gz",
    "mp3", "mp4", "wav", "m4a",
    "woff", "woff2", "ttf", "eot"
  ]);

  function cleanEmail(raw: string): string {
    return (raw || "")
      .trim()
      .replace(/^mailto:/i, "")
      .split("?")[0]
      .replace(/[)\],.;:]+$/g, "")
      .toLowerCase();
  }

  function looksLikeAssetEmail(email: string): boolean {
    const at = email.lastIndexOf("@");
    if (at === -1) return true;
    const domain = email.slice(at + 1);
    const tld = domain.split(".").pop() || "";
    return BAD_TLDS.has(tld);
  }

  // Prefer explicit mailto links (avoid "foo@2x.hash.png" matches in scripts/assets)
  const mailtoRe = /mailto:([^\s"'<>]+)/gi;
  for (const m of t.matchAll(mailtoRe)) {
    const raw = m[1] || "";
    const decoded = (() => {
      try { return decodeURIComponent(raw); } catch { return raw; }
    })();
    for (const p of decoded.split(/[;,]/g)) {
      const email = cleanEmail(p);
      if (!email) continue;
      if (!email.match(re)) continue;
      if (looksLikeAssetEmail(email)) continue;
      out.add(email);
    }
  }

  (t.match(re) || [])
    .map(cleanEmail)
    .filter(Boolean)
    .filter(e => !looksLikeAssetEmail(e))
    .forEach(e => out.add(e));

  const ob = t
    .replace(/\s*\[\s*at\s*\]\s*/gi, "@")
    .replace(/\s*\(\s*at\s*\)\s*/gi, "@")
    .replace(/\s+at\s+/gi, "@")
    .replace(/\s*\[\s*dot\s*\]\s*/gi, ".")
    .replace(/\s*\(\s*dot\s*\)\s*/gi, ".")
    .replace(/\s+dot\s+/gi, ".");

  (ob.match(re) || [])
    .map(cleanEmail)
    .filter(Boolean)
    .filter(e => !looksLikeAssetEmail(e))
    .forEach(e => out.add(e));
  return Array.from(out).slice(0, 20);
}
