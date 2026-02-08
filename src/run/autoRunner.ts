import { CategorySearchScraper } from "../scraping/CategorySearchScraper.js";
import { pool } from "../db/pool.js";
import { qGoogleMaps } from "../jobs/queues.js";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// India: Cities + sub-localities for major metros to maximize coverage
// ---------------------------------------------------------------------------
type CityEntry = { name: string; localities?: string[] };

const INDIA_LOCATIONS: CityEntry[] = [
  // Tier 1 - Metro cities with sub-localities
  { name: "Mumbai", localities: ["Andheri", "Bandra", "Powai", "Goregaon", "Malad", "Borivali", "Lower Parel", "BKC Mumbai", "Worli", "Dadar", "Thane", "Navi Mumbai", "Vashi", "Airoli", "Belapur"] },
  { name: "Delhi", localities: ["Connaught Place Delhi", "Nehru Place Delhi", "Okhla Delhi", "Dwarka Delhi", "Saket Delhi", "Lajpat Nagar Delhi", "Karol Bagh Delhi", "Rohini Delhi", "Pitampura Delhi", "Janakpuri Delhi", "Noida", "Gurgaon", "Faridabad", "Ghaziabad", "Greater Noida"] },
  { name: "Bangalore", localities: ["Whitefield Bangalore", "Electronic City Bangalore", "Koramangala Bangalore", "Indiranagar Bangalore", "HSR Layout Bangalore", "Marathahalli Bangalore", "JP Nagar Bangalore", "Bannerghatta Road Bangalore", "Hebbal Bangalore", "Yelahanka Bangalore", "Peenya Bangalore", "Rajajinagar Bangalore"] },
  { name: "Hyderabad", localities: ["HITEC City Hyderabad", "Gachibowli Hyderabad", "Madhapur Hyderabad", "Kukatpally Hyderabad", "Ameerpet Hyderabad", "Secunderabad", "Begumpet Hyderabad", "Jubilee Hills Hyderabad", "Banjara Hills Hyderabad", "LB Nagar Hyderabad"] },
  { name: "Chennai", localities: ["T Nagar Chennai", "Anna Nagar Chennai", "Adyar Chennai", "Velachery Chennai", "OMR Chennai", "Guindy Chennai", "Nungambakkam Chennai", "Porur Chennai", "Ambattur Chennai", "Tambaram Chennai"] },
  { name: "Kolkata", localities: ["Salt Lake Kolkata", "Park Street Kolkata", "Rajarhat Kolkata", "New Town Kolkata", "Howrah", "Dum Dum Kolkata", "Behala Kolkata", "Gariahat Kolkata", "Esplanade Kolkata"] },
  { name: "Pune", localities: ["Hinjewadi Pune", "Kharadi Pune", "Baner Pune", "Viman Nagar Pune", "Wakad Pune", "Hadapsar Pune", "Koregaon Park Pune", "Pimpri-Chinchwad", "Shivajinagar Pune", "Kothrud Pune"] },
  { name: "Ahmedabad", localities: ["SG Highway Ahmedabad", "CG Road Ahmedabad", "Prahlad Nagar Ahmedabad", "Satellite Ahmedabad", "Navrangpura Ahmedabad", "Maninagar Ahmedabad", "Bopal Ahmedabad", "Gandhinagar"] },
  // Tier 2 - Major cities (no sub-localities needed, city itself is specific enough)
  { name: "Surat" }, { name: "Jaipur" }, { name: "Lucknow" }, { name: "Kanpur" },
  { name: "Nagpur" }, { name: "Indore" }, { name: "Bhopal" }, { name: "Visakhapatnam" },
  { name: "Patna" }, { name: "Vadodara" }, { name: "Ludhiana" }, { name: "Agra" },
  { name: "Nashik" }, { name: "Meerut" }, { name: "Rajkot" }, { name: "Varanasi" },
  { name: "Srinagar" }, { name: "Aurangabad" }, { name: "Dhanbad" }, { name: "Amritsar" },
  { name: "Allahabad" }, { name: "Ranchi" }, { name: "Coimbatore" }, { name: "Jabalpur" },
  { name: "Gwalior" }, { name: "Vijayawada" }, { name: "Jodhpur" }, { name: "Madurai" },
  { name: "Raipur" }, { name: "Kota" }, { name: "Chandigarh" }, { name: "Guwahati" },
  { name: "Solapur" }, { name: "Hubli" }, { name: "Mysore" }, { name: "Tiruchirappalli" },
  { name: "Bareilly" }, { name: "Aligarh" }, { name: "Tiruppur" }, { name: "Moradabad" },
  { name: "Jalandhar" }, { name: "Bhubaneswar" }, { name: "Salem" }, { name: "Warangal" },
  { name: "Thiruvananthapuram" }, { name: "Gorakhpur" }, { name: "Bikaner" },
  { name: "Jamshedpur" }, { name: "Bhilai" }, { name: "Cuttack" }, { name: "Kochi" },
  { name: "Bhavnagar" }, { name: "Dehradun" }, { name: "Durgapur" }, { name: "Asansol" },
  { name: "Rourkela" }, { name: "Kolhapur" }, { name: "Ajmer" }, { name: "Gulbarga" },
  { name: "Jamnagar" }, { name: "Ujjain" }, { name: "Siliguri" }, { name: "Mangalore" },
  { name: "Erode" }, { name: "Belgaum" }, { name: "Tirunelveli" }, { name: "Udaipur" },
  { name: "Jalgaon" }, { name: "Gaya" }, { name: "Nanded" },
];

// ---------------------------------------------------------------------------
// B2B categories — broad + specific to maximize unique leads
// ---------------------------------------------------------------------------
const B2B_CATEGORIES: string[] = [
  // Tech & Digital
  "IT companies",
  "software companies",
  "web development companies",
  "mobile app development companies",
  "digital marketing agencies",
  "SEO agencies",
  "cloud computing companies",
  "cybersecurity companies",
  "data analytics companies",
  // Professional Services
  "consulting firms",
  "management consulting firms",
  "accounting firms",
  "CA firms",
  "law firms",
  "architecture firms",
  "interior design companies",
  "HR consulting firms",
  "staffing agencies",
  "recruitment agencies",
  // Manufacturing & Industry
  "manufacturing companies",
  "engineering companies",
  "chemical companies",
  "pharmaceutical companies",
  "textile companies",
  "packaging companies",
  "plastic manufacturing companies",
  "steel companies",
  "auto parts manufacturers",
  // Trade & Commerce
  "export companies",
  "import export companies",
  "trading companies",
  "wholesale distributors",
  "B2B suppliers",
  // Real Estate & Construction
  "real estate companies",
  "construction companies",
  "builders and developers",
  "property management companies",
  // Logistics & Transport
  "logistics companies",
  "freight forwarding companies",
  "courier companies",
  "warehousing companies",
  // Finance & Insurance
  "financial services companies",
  "insurance companies",
  "fintech companies",
  "investment companies",
  // Marketing & Media
  "advertising agencies",
  "PR agencies",
  "event management companies",
  "printing companies",
  // Education & Training
  "corporate training companies",
  "ed-tech companies",
  "coaching institutes",
  // Healthcare
  "healthcare companies",
  "medical equipment suppliers",
  "diagnostic centers",
  // Food & Hospitality
  "catering companies",
  "food processing companies",
  "hotel management companies",
  // Energy & Environment
  "solar energy companies",
  "renewable energy companies",
  "waste management companies",
  // Misc B2B
  "cleaning services companies",
  "security services companies",
  "pest control companies",
  "telecom companies"
];

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const COUNTRY = "India";
const MAX_RESULTS_PER_SEARCH = 200;      // No artificial cap — get everything Maps shows
const DELAY_BETWEEN_SEARCHES_MS = 70000; // 70 seconds between searches
const DELAY_BETWEEN_CITIES_MS = 30000;   // 30 seconds extra between cities
const MAX_RETRIES = 2;
const CSV_PATH = path.join("data", "exports", "india_leads_latest.csv");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function logProgress(msg: string) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}`;
  console.log(line);
  // Also append to a log file for overnight monitoring
  fs.appendFileSync(path.join("data", "auto_runner.log"), line + "\n", "utf8");
}

// ---------------------------------------------------------------------------
// Dedup check: does this company already exist in DB?
// ---------------------------------------------------------------------------
async function companyExists(name: string, city: string): Promise<string | null> {
  const res = await pool.query(
    `SELECT company_id FROM companies 
     WHERE LOWER(legal_name) = LOWER($1) 
       AND (LOWER(jurisdiction) = LOWER($2) OR LOWER(search_city) = LOWER($2))
     LIMIT 1`,
    [name.trim(), city.trim()]
  );
  return res.rowCount ? res.rows[0].company_id : null;
}

// ---------------------------------------------------------------------------
// Get or create search progress entry
// ---------------------------------------------------------------------------
async function getSearchStatus(city: string, category: string): Promise<string> {
  const res = await pool.query(
    `SELECT status FROM search_progress WHERE country=$1 AND city=$2 AND category=$3`,
    [COUNTRY, city, category]
  );
  return res.rowCount ? res.rows[0].status : "not_started";
}

async function markSearchStarted(city: string, category: string, batchId: string) {
  await pool.query(
    `INSERT INTO search_progress(country, city, category, status, batch_id, started_at)
     VALUES($1, $2, $3, 'running', $4, now())
     ON CONFLICT (country, city, category) 
     DO UPDATE SET status='running', batch_id=$4, started_at=now(), error_message=NULL`,
    [COUNTRY, city, category, batchId]
  );
}

async function markSearchCompleted(city: string, category: string, resultsFound: number) {
  await pool.query(
    `UPDATE search_progress 
     SET status='completed', results_found=$3, completed_at=now() 
     WHERE country=$1 AND city=$2 AND category=$4`,
    [COUNTRY, city, resultsFound, category]
  );
}

async function markSearchFailed(city: string, category: string, error: string) {
  await pool.query(
    `UPDATE search_progress 
     SET status='failed', error_message=$3, completed_at=now() 
     WHERE country=$1 AND city=$2 AND category=$4`,
    [COUNTRY, city, error, category]
  );
}

// ---------------------------------------------------------------------------
// Process a single search: category × city
// ---------------------------------------------------------------------------
async function processSearch(
  scraper: CategorySearchScraper,
  category: string,
  city: string,
  searchIndex: number,
  totalSearches: number
): Promise<number> {
  const searchLabel = `"${category}" in "${city}"`;
  logProgress(`[${searchIndex}/${totalSearches}] Starting search: ${searchLabel}`);

  // Check if already completed (for resume capability)
  const status = await getSearchStatus(city, category);
  if (status === "completed") {
    logProgress(`[${searchIndex}/${totalSearches}] SKIP (already completed): ${searchLabel}`);
    return 0;
  }

  // Create batch for this search
  const batchId = uuidv4();
  const batchName = `Auto: ${category} in ${city}`;
  await pool.query(
    "INSERT INTO import_batches(batch_id, filename, local_path, jurisdiction) VALUES($1, $2, $3, $4)",
    [batchId, batchName, "auto-runner", city]
  );

  await markSearchStarted(city, category, batchId);

  let results;
  let retries = 0;
  while (retries <= MAX_RETRIES) {
    try {
      results = await scraper.searchCategory(category, city, MAX_RESULTS_PER_SEARCH);
      break;
    } catch (err: any) {
      retries++;
      if (retries > MAX_RETRIES) {
        logProgress(`[${searchIndex}/${totalSearches}] FAILED after ${MAX_RETRIES} retries: ${searchLabel} — ${err.message}`);
        await markSearchFailed(city, category, err.message);
        return 0;
      }
      logProgress(`[${searchIndex}/${totalSearches}] Retry ${retries}/${MAX_RETRIES}: ${searchLabel}`);
      await sleep(10000);
    }
  }

  if (!results || results.length === 0) {
    logProgress(`[${searchIndex}/${totalSearches}] No results: ${searchLabel}`);
    await markSearchCompleted(city, category, 0);
    return 0;
  }

  let inserted = 0;
  for (const r of results) {
    if (!r.name || r.name === "Unknown") continue;

    // Dedup check
    const existingId = await companyExists(r.name, city);
    if (existingId) {
        continue; // dedup — already in DB
    }

    const companyId = uuidv4();
    const registryId = `MAPS_${uuidv4().substring(0, 8)}`;

    // Insert company with enriched fields
    await pool.query(
      `INSERT INTO companies(company_id, jurisdiction, registry_id, legal_name, address_raw, 
        maps_category, maps_rating, maps_reviews_count, search_city, search_category) 
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [companyId, city, registryId, r.name, r.address || null,
       r.category || null, r.rating || null, r.reviewsCount || null, city, category]
    );

    // Link to batch
    await pool.query(
      "INSERT INTO company_sources(company_id, batch_id) VALUES($1, $2)",
      [companyId, batchId]
    );

    // Store phone from Maps directly as a contact
    if (r.phone) {
      await pool.query(
        `INSERT INTO company_contacts(company_id, type, value, label, source_url, confidence) 
         VALUES($1, 'phone', $2, 'google_maps', 'maps', 0.95) ON CONFLICT DO NOTHING`,
        [companyId, r.phone]
      );
    }

    // Enqueue for deep research (Maps detail scrape → website crawl → seed lead)
    await qGoogleMaps.add("google_maps_scrape", {
      companyId,
      batchId
    }, {
      removeOnComplete: true,
      attempts: 2,
      jobId: `maps_auto_${companyId}`
    });

    inserted++;
  }

  const dupes = results.length - inserted;
  logProgress(`[${searchIndex}/${totalSearches}] DONE: ${searchLabel} — ${results.length} found, ${inserted} new, ${dupes} dupes`);
  await markSearchCompleted(city, category, inserted);
  return inserted;
}

// ---------------------------------------------------------------------------
// Master CSV Export: export ALL leads from the database
// ---------------------------------------------------------------------------
async function exportMasterCsv(): Promise<string> {
  const exportDir = path.join("data", "exports");
  fs.mkdirSync(exportDir, { recursive: true });

  // Write to a snapshot file (NOT the live real-time CSV which is managed by seedLead worker)
  const outPath = path.join(exportDir, "india_leads_snapshot.csv");
  // Also write a dated copy
  const dateStr = new Date().toISOString().split("T")[0];
  const datedPath = path.join(exportDir, `india_leads_${dateStr}.csv`);

  const res = await pool.query(
    `SELECT
      c.legal_name,
      c.maps_category,
      c.search_city,
      c.search_category,
      c.address_raw,
      c.maps_rating,
      c.maps_reviews_count,
      cd.domain AS website_domain,
      cd.final_url AS website_url,
      COALESCE(l.lead_score, 0) AS lead_score,
      (SELECT string_agg(DISTINCT value, '; ') FROM company_contacts cc WHERE cc.company_id=c.company_id AND cc.type='email') AS emails,
      (SELECT string_agg(DISTINCT value, '; ') FROM company_contacts cc WHERE cc.company_id=c.company_id AND cc.type='phone') AS phones,
      (SELECT string_agg(DISTINCT value, '; ') FROM company_contacts cc WHERE cc.company_id=c.company_id AND cc.type='social') AS linkedin,
      (SELECT string_agg(DISTINCT value, '; ') FROM company_contacts cc WHERE cc.company_id=c.company_id AND cc.type='contact_form') AS contact_forms,
      (SELECT p.name FROM company_people p WHERE p.company_id=c.company_id ORDER BY p.confidence DESC, p.found_at DESC LIMIT 1) AS contact_person,
      (SELECT p.role FROM company_people p WHERE p.company_id=c.company_id ORDER BY p.confidence DESC, p.found_at DESC LIMIT 1) AS contact_role,
      (SELECT p.email FROM company_people p WHERE p.company_id=c.company_id AND p.email IS NOT NULL ORDER BY p.confidence DESC LIMIT 1) AS contact_email
     FROM companies c
     LEFT JOIN company_domains cd ON cd.company_id=c.company_id AND cd.status='verified'
     LEFT JOIN leads l ON l.company_id=c.company_id
     WHERE c.search_city IS NOT NULL
     ORDER BY c.search_city, c.search_category, c.legal_name`
  );

  // Clean CSV headers
  const headers = [
    "Company Name",
    "Category",
    "City",
    "Search Category",
    "Address",
    "Phone",
    "Email",
    "Website",
    "Rating",
    "Reviews",
    "Contact Person",
    "Contact Role",
    "Contact Email",
    "All Emails",
    "All Phones",
    "LinkedIn",
    "Contact Forms",
    "Lead Score"
  ];

  const csvLines: string[] = [headers.join(",")];

  for (const r of res.rows) {
    // Pick best phone: from contacts first, else from Maps
    const primaryPhone = r.phones ? r.phones.split("; ")[0] : "";
    // Pick best email: contact person email > first email
    const primaryEmail = r.contact_email || (r.emails ? r.emails.split("; ")[0] : "");

    const row = [
      r.legal_name || "",
      r.maps_category || "",
      r.search_city || "",
      r.search_category || "",
      r.address_raw || "",
      primaryPhone,
      primaryEmail,
      r.website_url || r.website_domain || "",
      r.maps_rating != null ? String(r.maps_rating) : "",
      r.maps_reviews_count != null ? String(r.maps_reviews_count) : "",
      r.contact_person || "",
      r.contact_role || "",
      r.contact_email || "",
      r.emails || "",
      r.phones || "",
      r.linkedin || "",
      r.contact_forms || "",
      r.lead_score != null ? String(r.lead_score) : "0"
    ];

    // Proper CSV escaping: wrap each field in quotes, escape internal quotes
    const csvRow = row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
    csvLines.push(csvRow);
  }

  const csvContent = csvLines.join("\n");
  fs.writeFileSync(outPath, csvContent, "utf8");
  fs.writeFileSync(datedPath, csvContent, "utf8");
  logProgress(`CSV saved: ${res.rows.length} leads → ${outPath}`);
  return outPath;
}

// ---------------------------------------------------------------------------
// Build the full search plan: each city/locality × category
// ---------------------------------------------------------------------------
function buildSearchPlan(cities: CityEntry[], categories: string[]): { location: string; parentCity: string; category: string }[] {
  const plan: { location: string; parentCity: string; category: string }[] = [];
  for (const city of cities) {
    // First search the city itself for each category
    for (const cat of categories) {
      plan.push({ location: city.name, parentCity: city.name, category: cat });
    }
    // Then search each sub-locality
    if (city.localities) {
      for (const loc of city.localities) {
        for (const cat of categories) {
          plan.push({ location: loc, parentCity: city.name, category: cat });
        }
      }
    }
  }
  return plan;
}

// ---------------------------------------------------------------------------
// Main: The overnight auto-runner
// ---------------------------------------------------------------------------
async function main() {
  // Parse optional CLI arguments
  const args = process.argv.slice(2);
  let citiesToUse = INDIA_LOCATIONS;
  let categoriesToUse = B2B_CATEGORIES;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--cities" && args[i + 1]) {
      const names = args[i + 1].split(",").map(s => s.trim());
      citiesToUse = INDIA_LOCATIONS.filter(c => names.includes(c.name));
      // If not found in INDIA_LOCATIONS, create simple entries
      for (const n of names) {
        if (!citiesToUse.find(c => c.name === n)) {
          citiesToUse.push({ name: n });
        }
      }
      i++;
    }
    if (args[i] === "--categories" && args[i + 1]) {
      categoriesToUse = args[i + 1].split(",").map(s => s.trim());
      i++;
    }
  }

  const searchPlan = buildSearchPlan(citiesToUse, categoriesToUse);
  const totalSearches = searchPlan.length;

  // Ensure directories exist
  fs.mkdirSync("data/exports", { recursive: true });

  logProgress("═".repeat(80));
  logProgress(`OVERNIGHT AUTO-RUNNER STARTED`);
  logProgress(`Country: ${COUNTRY}`);
  logProgress(`Cities: ${citiesToUse.length} (+ ${citiesToUse.reduce((n, c) => n + (c.localities?.length || 0), 0)} sub-localities)`);
  logProgress(`Categories: ${categoriesToUse.length}`);
  logProgress(`Total searches: ${totalSearches}`);
  logProgress(`Results per search: ALL available (no cap)`);
  logProgress(`Delay between searches: ${DELAY_BETWEEN_SEARCHES_MS / 1000}s`);
  logProgress(`Estimated time: ~${Math.round(totalSearches * (DELAY_BETWEEN_SEARCHES_MS + 30000) / 1000 / 3600 * 10) / 10} hours`);
  logProgress(`CSV auto-saved after each city to: ${CSV_PATH}`);
  logProgress("═".repeat(80));

  const scraper = new CategorySearchScraper();
  let totalLeads = 0;
  let searchIndex = 0;
  let completedSearches = 0;
  let failedSearches = 0;
  let currentCityLeads = 0;
  let lastCity = "";
  const startTime = Date.now();

  try {
    for (const search of searchPlan) {
      searchIndex++;

      // When we move to a new parent city, export CSV and log city summary
      if (search.parentCity !== lastCity && lastCity !== "") {
        logProgress(`\n*** CITY COMPLETE: ${lastCity} — ${currentCityLeads} leads ***`);
        logProgress(`Saving CSV snapshot...`);
        try {
          await exportMasterCsv();
          logProgress(`CSV updated: ${CSV_PATH}`);
        } catch (err: any) {
          logProgress(`CSV save error: ${err.message}`);
        }
        currentCityLeads = 0;
        // Extra delay between cities
        await sleep(DELAY_BETWEEN_CITIES_MS);
      }
      lastCity = search.parentCity;

      try {
        const leads = await processSearch(scraper, search.category, search.location, searchIndex, totalSearches);
        totalLeads += leads;
        currentCityLeads += leads;
        completedSearches++;
      } catch (err: any) {
        failedSearches++;
        logProgress(`[${searchIndex}/${totalSearches}] UNEXPECTED ERROR: ${err.message}`);
      }

      // Progress summary every 10 searches
      if (searchIndex % 10 === 0) {
        const elapsed = (Date.now() - startTime) / 1000 / 3600;
        const rate = totalLeads / Math.max(elapsed, 0.01);
        logProgress(`--- PROGRESS: ${searchIndex}/${totalSearches} | ${totalLeads} leads | ${Math.round(elapsed * 10) / 10}h | ${Math.round(rate)} leads/hr ---`);
      }

      // Delay between searches
      if (searchIndex < totalSearches) {
        await sleep(DELAY_BETWEEN_SEARCHES_MS);
      }
    }
  } catch (err: any) {
    logProgress(`FATAL ERROR: ${err.message}`);
  }

  // Final city export
  if (lastCity) {
    logProgress(`\n*** CITY COMPLETE: ${lastCity} — ${currentCityLeads} leads ***`);
  }

  // Final summary
  const totalTime = (Date.now() - startTime) / 1000 / 3600;
  logProgress("═".repeat(80));
  logProgress(`OVERNIGHT RUN COMPLETE`);
  logProgress(`Total searches: ${completedSearches} completed, ${failedSearches} failed, ${totalSearches - completedSearches - failedSearches} skipped`);
  logProgress(`Total new leads: ${totalLeads}`);
  logProgress(`Total time: ${Math.round(totalTime * 10) / 10} hours`);
  logProgress("═".repeat(80));

  // Final CSV export
  logProgress("Final CSV export...");
  try {
    const csvPath = await exportMasterCsv();
    logProgress(`Master CSV: ${csvPath}`);
  } catch (err: any) {
    logProgress(`CSV export error: ${err.message}`);
  }

  logProgress("Auto-runner finished.");
  await scraper.close();
  setTimeout(() => process.exit(0), 3000);
}

main();
