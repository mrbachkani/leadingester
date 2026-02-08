import { Worker } from "bullmq";
import IORedis from "ioredis";
import { env } from "../config/env.js";
import { ingestCsvJob } from "../jobs/ingestCsv.worker.js";
import { domainFindJob } from "../jobs/domainFind.worker.js";
import { domainVerifyJob } from "../jobs/domainVerify.worker.js";
import { crawlSiteJob } from "../jobs/crawlSite.worker.js";
import { seedLeadJob } from "../jobs/seedLead.worker.js";
import { googleMapsScrapeJob } from "../jobs/googleMapsScrape.worker.js";
import { exportCsvJob } from "../jobs/exportCsv.worker.js";

// Helper to create a dedicated connection for each worker
const createConnection = () => new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

new Worker("ingest_csv", ingestCsvJob, { connection: createConnection(), concurrency: 1 });
// new Worker("domain_find", domainFindJob, { connection: createConnection(), concurrency: 3 });
new Worker("google_maps_scrape", googleMapsScrapeJob, { connection: createConnection(), concurrency: 2 });
new Worker("domain_verify", domainVerifyJob, { connection: createConnection(), concurrency: 6 });
new Worker("crawl_site", crawlSiteJob, { connection: createConnection(), concurrency: 6 });
new Worker("seed_lead", seedLeadJob, { connection: createConnection(), concurrency: 8 });
new Worker("export_csv", exportCsvJob, { connection: createConnection(), concurrency: 1 });

console.log("Workers started.");
