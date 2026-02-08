import * as cheerio from "cheerio";

export type PersonResult = {
  name: string;
  role?: string;
  email?: string;
  confidence: number;
};

export function extractPeople(html: string): Array<PersonResult> {
  const $ = cheerio.load(html || "");
  const people: Array<PersonResult> = [];

  // 1. Look for structured cards (team members)
  const cards = $("[class*='team'],[class*='member'],[class*='leader'],[class*='management'],[class*='profile'],[class*='card']").toArray();

  for (const card of cards.slice(0, 100)) {
    const el = $(card);
    const text = el.text().replace(/\s+/g, " ").trim();
    if (text.length < 10 || text.length > 500) continue;

    // Check for email inside this card
    let email: string | undefined;
    const mailto = el.find("a[href^='mailto:']").attr("href");
    if (mailto) {
      email = mailto.replace(/^mailto:/i, "").split("?")[0].trim();
    } else {
      // Try finding text email
      const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (match) email = match[0];
    }

    if (email) email = email.toLowerCase();

    // Heuristic extraction of Name/Role from text lines
    // Split by newlines or common separators
    const rawHtml = el.html() || "";
    const parts = rawHtml
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<[^>]+>/g, "|") // Replace tags with separator
      .split(/[\n|]/)
      .map(x => x.trim()) // Decode entities if needed (cheerio text() handles it usually, but we are parsing raw for structure)
      .filter(x => x.length > 2);
    
    // We need a name. Heuristic: First "Name-like" string.
    let name: string | undefined;
    let role: string | undefined;

    for (const p of parts) {
      // Clean string
      const s = p.replace(/&[a-z]+;/g, " ").trim();
      if (!s) continue;

      if (!name) {
        // Name validation: 2-4 words, starts with capital, no numbers
        if (/^[A-Z][a-z]+(\s[A-Z][a-z]+){1,3}$/.test(s)) {
          name = s;
        }
      } else if (!role) {
        // Role validation: specific keywords or length check
        if (/manager|director|ceo|founder|head|lead|chief|president|vp|executive|owner|partner/i.test(s) || (s.length > 3 && s.length < 40)) {
          role = s;
        }
      }
    }

    if (name) {
      people.push({ name, role, email, confidence: email ? 0.8 : 0.6 });
    }
  }

  // 2. Fallback: List items that look like "Name - Role"
  if (people.length === 0) {
      $("li, p, div").each((_, elem) => {
        if (people.length >= 20) return;
        const txt = $(elem).text().trim();
        if (txt.length > 100 || txt.length < 10) return;
        
        // "John Doe - CEO"
        const split = txt.split(/\s+[-–|]\s+/);
        if (split.length === 2) {
             const n = split[0].trim();
             const r = split[1].trim();
             if (/^[A-Z][a-z]+(\s[A-Z][a-z]+){1,3}$/.test(n) && r.length < 50) {
                 people.push({ name: n, role: r, confidence: 0.5 });
             }
        }
      });
  }

  // Dedupe
  const uniq = new Map<string, PersonResult>();
  for (const p of people) {
      const key = `${p.name}|${p.role || ""}`;
      if (!uniq.has(key) || (p.email && !uniq.get(key)?.email)) {
          uniq.set(key, p);
      }
  }

  return Array.from(uniq.values());
}
