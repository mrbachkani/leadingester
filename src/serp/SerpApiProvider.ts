import { SerpProvider, SerpOrganicResult } from "./SerpProvider.js";
import { env } from "../config/env.js";

type SerpApiResponse = {
  organic_results?: Array<{ link: string; title?: string; snippet?: string }>;
};

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

let serpQueue: Promise<unknown> = Promise.resolve();
let lastSerpRequestAt = 0;

function enqueueSerp<T>(fn: () => Promise<T>): Promise<T> {
  const next = serpQueue.then(fn, fn);
  serpQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

export class SerpApiProvider implements SerpProvider {
  async search(query: string, params: Record<string, string | number | boolean> = {}): Promise<SerpOrganicResult[]> {
    return enqueueSerp(async () => {
      if (!env.SERPAPI_API_KEY) {
        throw new Error("SERPAPI_API_KEY is missing (required for domain_find / SerpApi lookups).");
      }

      const minDelay = Math.max(0, env.SERPAPI_MIN_DELAY_MS || 0);
      if (minDelay) {
        const waitMs = Math.max(0, lastSerpRequestAt + minDelay - Date.now());
        if (waitMs) await sleep(waitMs);
      }

      const url = new URL("https://serpapi.com/search");
      url.searchParams.set("engine", "google");
      url.searchParams.set("q", query);
      url.searchParams.set("api_key", env.SERPAPI_API_KEY);
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

      const res = await fetch(url.toString(), { method: "GET" });
      lastSerpRequestAt = Date.now();

      if (!res.ok) throw new Error(`SerpApi ${res.status}: ${await res.text()}`);

      const json = (await res.json()) as SerpApiResponse;
      const organic = json.organic_results || [];
      return organic.slice(0, 10).map((r) => ({ link: r.link, title: r.title, snippet: r.snippet }));
    });
  }
}
