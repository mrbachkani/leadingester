import { chromium, Browser, Page } from "playwright-core";

export type CategorySearchResult = {
  name: string;
  address?: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviewsCount?: number;
  category?: string;
};

export class CategorySearchScraper {
  private browser: Browser | null = null;

  async init() {
    this.browser = await chromium.launch({ headless: true });
  }

  async close() {
    if (this.browser) await this.browser.close();
  }

  async searchCategory(category: string, location: string, maxResults: number = 200): Promise<CategorySearchResult[]> {
    if (!this.browser) await this.init();
    
    const context = await this.browser!.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    });
    const page = await context.newPage();
    const results: CategorySearchResult[] = [];

    try {
      const searchQuery = `${category} in ${location}`;
      console.log(`[CategorySearch] Searching for: "${searchQuery}"`);
      
      await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`, {
        waitUntil: "domcontentloaded",
        timeout: 45000
      });
      
      console.log(`[CategorySearch] Page loaded, waiting for results...`);
      await page.waitForTimeout(5000); // Wait for results to load

      // Wait for the results feed to appear
      await page.waitForSelector('div[role="feed"]', { timeout: 15000 });
      
      // Scroll aggressively to load ALL available results
      console.log(`[CategorySearch] Scrolling to load all results (target: ${maxResults})...`);
      let previousCount = 0;
      let currentCount = 0;
      let scrollAttempts = 0;
      const maxScrollAttempts = 40;
      let reachedEnd = false;

      while (!reachedEnd && scrollAttempts < maxScrollAttempts) {
        // Scroll the feed element
        await page.evaluate(() => {
          const feed = document.querySelector('div[role="feed"]');
          if (feed) {
            feed.scrollTop = feed.scrollHeight;
          }
        });
        
        await page.waitForTimeout(1500);
        
        // Check if we hit the "end of list" marker
        try {
          const endMarker = await page.locator('span.HlvSq').count();
          if (endMarker > 0) {
            reachedEnd = true;
          }
        } catch {}
        
        currentCount = await page.locator('div[role="feed"] a[aria-label]').count();
        
        if (currentCount === previousCount) {
          scrollAttempts++;
        } else {
          scrollAttempts = 0;
          if (currentCount % 20 === 0) {
            console.log(`[CategorySearch] Loaded ${currentCount} cards...`);
          }
        }
        previousCount = currentCount;
        
        // If we have enough, stop scrolling
        if (currentCount >= maxResults * 2) break;
      }
      console.log(`[CategorySearch] Scroll done: ${currentCount} total cards (end=${reachedEnd})`);

      // Find all business result cards - they have aria-label attribute
      const resultCards = page.locator('div[role="feed"] a[aria-label]');
      const totalFound = await resultCards.count();
      console.log(`[CategorySearch] Final count: ${totalFound} result cards`);

      const limit = maxResults;
      let processedCount = 0;
      let cardIndex = 0;
      
      while (processedCount < limit && cardIndex < totalFound) {
        try {
          const card = resultCards.nth(cardIndex);
          cardIndex++;
          
          // Extract name from aria-label before clicking
          const ariaLabel = await card.getAttribute("aria-label") || "";
          let businessName = ariaLabel.split("\n")[0].trim() || "Unknown";
          
          // Skip cards that are just "Visit website" or similar
          if (businessName.toLowerCase().startsWith('visit ') && businessName.toLowerCase().endsWith("'s website")) {
            continue;
          }

          // Click on the card to load details
          await card.click({ timeout: 10000 });
          await page.waitForTimeout(2500);
          
          // Wait for details panel to load
          await page.waitForSelector("h1", { timeout: 10000 });
          
          const result: CategorySearchResult = {
            name: businessName
          };
          
          processedCount++;

          // Extract category
          const categoryBtn = page.locator("button[jsaction*='pane.rating.category']").first();
          if (await categoryBtn.count() > 0) {
            result.category = await categoryBtn.innerText().catch(() => undefined);
          }

          // Extract address
          const addressBtn = page.locator("button[data-item-id='address']").first();
          if (await addressBtn.count() > 0) {
            const ariaLabel = await addressBtn.getAttribute("aria-label");
            if (ariaLabel) {
              result.address = ariaLabel.replace("Address: ", "");
            }
          }

          // Extract phone
          const phoneBtn = page.locator("button[data-item-id^='phone']").first();
          if (await phoneBtn.count() > 0) {
            const ariaLabel = await phoneBtn.getAttribute("aria-label");
            if (ariaLabel) {
              result.phone = ariaLabel.replace("Phone: ", "");
            }
          }

          // Extract website
          const websiteLink = page.locator("a[data-item-id='authority']").first();
          if (await websiteLink.count() > 0) {
            let websiteUrl = await websiteLink.getAttribute("href");
            if (websiteUrl) {
              // Handle Google redirect URLs
              if (websiteUrl.startsWith('/url?q=')) {
                try {
                  const urlParams = new URLSearchParams(websiteUrl.substring(5));
                  const actualUrl = urlParams.get('q');
                  if (actualUrl) {
                    websiteUrl = actualUrl;
                  }
                } catch {}
              }
              result.website = websiteUrl;
            }
          }

          // Extract rating
          const ratingDiv = page.locator("div[role='img'][aria-label*='stars']").first();
          if (await ratingDiv.count() > 0) {
            const ariaLabel = await ratingDiv.getAttribute("aria-label");
            if (ariaLabel) {
              const parts = ariaLabel.split(" ");
              result.rating = parseFloat(parts[0]);
              const countMatch = ariaLabel.match(/\(([\d,]+)\)/);
              if (countMatch) {
                result.reviewsCount = parseInt(countMatch[1].replace(/,/g, ""));
              }
            }
          }
          results.push(result);
          if (processedCount % 10 === 0) {
            console.log(`[CategorySearch] Progress: ${processedCount}/${limit} extracted`);
          }
          
        } catch (error) {
          console.error(`[CategorySearch] Error extracting result at index ${cardIndex - 1}:`, error);
        }
      }

      return results;

    } catch (error) {
      console.error(`[CategorySearch] Error searching category:`, error);
      return results;
    } finally {
      await context.close();
    }
  }
}
