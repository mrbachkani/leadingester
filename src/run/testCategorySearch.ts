import { CategorySearchScraper } from "../scraping/CategorySearchScraper.js";
import { pool } from "../db/pool.js";
import { qGoogleMaps } from "../jobs/queues.js";
import { v4 as uuidv4 } from "uuid";
import * as readline from "readline";

function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

async function main() {
  let category = process.argv[2];
  let location = process.argv[3];
  let maxResultsStr = process.argv[4];

  if (!category || !location) {
    console.log("\n--- Interactive Category Search Mode ---\n");
    if (!category) {
      category = await askQuestion("Enter category (e.g., 'tech companies', 'restaurants'): ");
    }
    if (!location) {
      location = await askQuestion("Enter location (e.g., 'Surat', 'Mumbai'): ");
    }
    if (!maxResultsStr) {
      const ans = await askQuestion("Enter max results (default 20): ");
      if (ans.trim()) maxResultsStr = ans.trim();
    }
  }

  // Defaults if still empty (though prompts should handle it, but good fallback)
  category = category || "tech companies";
  location = location || "Surat";
  const maxResults = parseInt(maxResultsStr || "20");

  console.log(`\n${"=".repeat(80)}`);
  console.log(`CATEGORY SEARCH: "${category}" in "${location}"`);
  console.log(`${"=".repeat(80)}\n`);

  const scraper = new CategorySearchScraper();
  
  try {
    const results = await scraper.searchCategory(category, location, maxResults);
    
    console.log(`\n${"=".repeat(80)}`);
    console.log(`RESULTS: Found ${results.length} companies`);
    console.log(`${"=".repeat(80)}\n`);

    if (results.length === 0) {
      console.log("No results found.");
      return;
    }

    // Create a batch for this search
    const batchId = uuidv4();
    const batchName = `Search: ${category} in ${location}`;
    await pool.query(
      "INSERT INTO import_batches(batch_id, filename, local_path, jurisdiction) VALUES($1, $2, $3, $4)",
      [batchId, batchName, "google-maps-search", location]
    );
    console.log(`[Database] Created batch: ${batchId}`);

    for (const r of results) {
      const companyId = uuidv4();
      // Since category search doesn't provide a registry ID, we generate a unique one
      const registryId = `MAPS_${uuidv4().substring(0, 8)}`;
      
      // Insert company with enriched fields
      await pool.query(
        `INSERT INTO companies(company_id, jurisdiction, registry_id, legal_name, address_raw, 
          maps_category, maps_rating, maps_reviews_count, search_city, search_category) 
         VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [companyId, location, registryId, r.name, r.address || null,
         r.category || null, r.rating || null, r.reviewsCount || null, location, category]
      );

      // Link to batch
      await pool.query(
        "INSERT INTO company_sources(company_id, batch_id) VALUES($1, $2)",
        [companyId, batchId]
      );

      // Add to Google Maps queue for deep extraction and website crawl trigger
      await qGoogleMaps.add("google_maps_scrape", {
        companyId,
        batchId
      }, {
        removeOnComplete: true,
        attempts: 2,
        jobId: `maps_search_${companyId}`
      });
      
      console.log(`[Pipeline] Enqueued: ${r.name}`);
    }

    console.log(`\n[Status] Successfully enqueued ${results.length} companies for processing.`);
    console.log(`[Status] Run 'docker exec lead-pipeline-app node dist/run/export.js ${batchId}' once processed.`);

    // Display results in table format
    console.table(results.map((r, i) => ({
      "#": i + 1,
      "Company Name": r.name || "N/A",
      "Category": r.category || "N/A",
      "Phone": r.phone || "N/A",
      "Website": r.website || "N/A",
      "Rating": r.rating ? `${r.rating} (${r.reviewsCount || 0} reviews)` : "N/A"
    })));

  } catch (error) {
    console.error("Error in category search pipeline:", error);
  } finally {
    await scraper.close();
    // Give BullMQ a moment to send the commands
    setTimeout(() => {
      process.exit(0);
    }, 2000);
  }
}

main();
