export function extractPhones(text: string): string[] {
  const t = text || "";
  const out = new Set<string>();

  const re = /(\+?\d[\d\s().-]{8,}\d)/g;
  (t.match(re) || [])
    .map(x => x.replace(/[^\d+]/g, ""))
    .filter(x => x.length >= 10 && x.length <= 15)
    .forEach(x => out.add(x));

  return Array.from(out).slice(0, 20);
}
