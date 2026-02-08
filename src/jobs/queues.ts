import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "../config/env.js";

export const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const qIngest = new Queue("ingest_csv", { connection });
export const qDomainFind = new Queue("domain_find", { connection });
export const qGoogleMaps = new Queue("google_maps_scrape", { connection });
export const qDomainVerify = new Queue("domain_verify", { connection });
export const qCrawl = new Queue("crawl_site", { connection });
export const qSeed = new Queue("seed_lead", { connection });
export const qExport = new Queue("export_csv", { connection });
