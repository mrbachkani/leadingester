import pg from "pg";
import { env } from "../config/env.js";

function normalizeDbUrl(url: string): string {
  try {
    const u = new URL(url);
    // On some Windows setups, `localhost` may resolve in a way that causes ECONNRESET with pg.
    // Force IPv4 loopback for local dev.
    if (u.hostname === "localhost") u.hostname = "127.0.0.1";
    return u.toString();
  } catch {
    return url;
  }
}

export const pool = new pg.Pool({
  connectionString: normalizeDbUrl(env.DATABASE_URL),
  max: 10,
  idleTimeoutMillis: 30000
});
