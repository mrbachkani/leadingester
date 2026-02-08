import { chromium, Browser } from "playwright-core";

export type GoogleMapsResult = {
  title: string;
  category?: string;
  address?: string;
  phone?: string;
  website?: string;
  plusCode?: string;
  rating?: number;
  reviewsCount?: number;
  openStatus?: string;
  description?: string;
  emails?: string[];
};

export class GoogleMapsScraper {
  private browser: Browser | null = null;

  async init() {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
      });
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async search(query: string): Promise<GoogleMapsResult | null> {
    if (!this.browser) await this.init();
    const context = await this.browser!.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    });
    const page = await context.newPage();

    try {
      console.log(`[Maps] Navigating to Google Maps for: ${query}`);
      await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(query)}`, {
        waitUntil: "domcontentloaded",
        timeout: 45000
      });
      console.log(`[Maps] Page loaded, checking for cookies dialog`);

      // Handle "Accept Cookies" if it appears (usually not in headless/US IP, but good practice)
      try {
        const acceptBtn = await page.locator("button[aria-label='Accept all']");
        if (await acceptBtn.isVisible({ timeout: 2000 })) {
          console.log(`[Maps] Accepting cookies`);
          await acceptBtn.click();
          await page.waitForTimeout(1000);
        }
      } catch {}

      console.log(`[Maps] Waiting for results...`);
      // Take screenshot for debugging
      try {
        await page.screenshot({ path: '/tmp/maps-search.png' });
        console.log(`[Maps] Screenshot saved to /tmp/maps-search.png`);
      } catch (e) {
        console.log(`[Maps] Failed to save screenshot: ${e}`);
      }

      // Wait for results. Either a list or a direct place.
      try {
        console.log(`[Maps] Attempting to wait for H1...`);
        await page.waitForSelector("h1", { timeout: 15000 });
        console.log(`[Maps] ✓ Found H1, place page loaded`);
      } catch (e) {
        console.log(`[Maps] ✗ No H1 found after 15s, looking for result list`);
        // If no H1, maybe a list of results. Click the first one.
        const firstResult = page.locator("a[href^='https://www.google.com/maps/place']").first();
        const count = await firstResult.count();
        console.log(`[Maps] Found ${count} result links`);
        if (count > 0 && await firstResult.isVisible({ timeout: 2000 })) {
          console.log(`[Maps] Clicking first result`);
          await firstResult.click();
          console.log(`[Maps] Clicked, waiting for H1 again...`);
          await page.waitForSelector("h1", { timeout: 15000 });
          console.log(`[Maps] ✓ Place page loaded after click`);
        } else {
          console.log(`[Maps] ✗ No results found for query`);
          await page.screenshot({ path: '/tmp/maps-no-results.png' });
          return null; // Nothing found
        }
      }

      console.log(`[Maps] Extracting data from page...`);
      const result: GoogleMapsResult = {
        title: await page.locator("h1").innerText().catch(() => "")
      };
      console.log(`[Maps] Title: ${result.title}`);

      // Helper to safely get text or attribute
      const getText = async (selector: string) => page.locator(selector).innerText().catch(() => undefined);
      const getAttr = async (selector: string, attr: string) => page.locator(selector).getAttribute(attr).then(v => v || undefined).catch(() => undefined);

      // Category
      result.category = await getText("button[jsaction*='pane.rating.category']");

      // Address - look for button with data-item-id="address"
      result.address = await getAttr("button[data-item-id='address']", "aria-label")
        .then(l => l?.replace("Address: ", ""));

      // Phone - look for button with data-item-id="phone:..."
      const phoneSel = "button[data-item-id^='phone']";
      if (await page.locator(phoneSel).count() > 0) {
        result.phone = await getAttr(phoneSel, "aria-label")
          .then(l => l?.replace("Phone: ", ""));
      }

      // Website - look for button with data-item-id="authority"
      console.log(`[Maps] Looking for website link...`);
      const webSel = "a[data-item-id='authority']";
      const webCount = await page.locator(webSel).count();
      console.log(`[Maps] Found ${webCount} website elements`);
      if (webCount > 0) {
        let websiteUrl = await getAttr(webSel, "href");
        console.log(`[Maps] Raw website URL: ${websiteUrl}`);
        if (websiteUrl) {
          // Handle Google redirect URLs like /url?q=http://example.com/&opi=...
          if (websiteUrl.startsWith('/url?q=')) {
            console.log(`[Maps] Detected redirect URL, parsing...`);
            try {
              const urlParams = new URLSearchParams(websiteUrl.substring(5)); // Remove '/url?'
              const actualUrl = urlParams.get('q');
              if (actualUrl) {
                websiteUrl = actualUrl;
                console.log(`[Maps] ✓ Extracted URL from redirect: ${websiteUrl}`);
              }
            } catch (e) {
              console.log(`[Maps] ✗ Failed to parse redirect URL: ${websiteUrl}`);
            }
          }
          result.website = websiteUrl;
        } else {
          console.log(`[Maps] No website URL found`);
        }
      } else {
        console.log(`[Maps] No website element found on page`);
      }

      // Rating
      const stars = await getAttr("div[role='img'][aria-label*='stars']", "aria-label");
      if (stars) {
        const parts = stars.split(" ");
        result.rating = parseFloat(parts[0]);
        const countMatch = stars.match(/\(([\d,]+)\)/);
        if (countMatch) {
          result.reviewsCount = parseInt(countMatch[1].replace(/,/g, ""));
        }
      }

      // Emails from content
      const content = await page.locator("div[role='main']").innerText().catch(() => "");
      const emails = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
      if (emails) {
        result.emails = Array.from(new Set(emails));
      }

      console.log(`[Maps] ✓ Data extraction complete`);
      return result;

    } catch (error) {
      console.error(`[Maps] ✗ Error scraping Maps for ${query}:`, error);
      try {
        await page.screenshot({ path: '/tmp/maps-error.png' });
        console.log(`[Maps] Error screenshot saved to /tmp/maps-error.png`);
      } catch {}
      return null;
    } finally {
      await context.close();
    }
  }
}
