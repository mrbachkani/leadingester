# Lead Pipeline — Apollo-Level B2B Lead Generation

Autonomous overnight pipeline that scrapes Google Maps across India (85+ cities, 75 B2B categories, sub-localities for major metros), enriches company data with website crawling, and exports a clean CSV with 100,000+ leads.

## What It Does

1. **Google Maps Category Search** — Searches "IT companies in Mumbai", "law firms in Pune", etc.
2. **Deep Scrape** — Clicks each result to extract name, address, phone, website, rating, reviews, category
3. **Website Crawl** — Crawls company websites for emails, phones, contact forms, social links, team/leadership pages
4. **Lead Scoring** — Scores leads 0–100 based on data completeness
5. **CSV Export** — Clean Apollo-style CSV auto-saved after every city (zero data loss)

## Tech Stack

- **Playwright** — Headless browser for Google Maps scraping
- **PostgreSQL** — Lead database with deduplication
- **Redis + BullMQ** — Job queues for parallel processing
- **Docker Compose** — One-command setup
- **TypeScript** — Entire codebase

## Quick Start

```bash
# 1. Clone and configure
cp .env.example .env    # Edit with your values (or use defaults with Docker)

# 2. Start everything
docker-compose up -d

# 3. Run overnight lead builder
docker-compose run --rm app node dist/run/autoRunner.js
```

Or on Windows, just double-click `overnight.bat`.

## CSV Output Columns

The exported CSV (`data/exports/india_leads_latest.csv`) has 18 columns:

| Column | Description |
|:---|:---|
| Company Name | Business name from Google Maps |
| Category | Google Maps business category |
| City | City where the company is located |
| Search Category | What was searched (e.g. "IT companies") |
| Address | Full address |
| Phone | Primary phone number |
| Email | Primary email |
| Website | Company website URL |
| Rating | Google Maps rating (1-5) |
| Reviews | Number of Google reviews |
| Contact Person | Best contact name found on website |
| Contact Role | Their role/title |
| Contact Email | Their direct email |
| All Emails | All emails found (semicolon-separated) |
| All Phones | All phones found (semicolon-separated) |
| LinkedIn | LinkedIn profile URLs |
| Contact Forms | Contact form URLs |
| Lead Score | Quality score 0-100 |

## Usage

| Action | Command |
|:---|:---|
| Full overnight run (all India) | `overnight.bat` or `docker-compose run --rm app node dist/run/autoRunner.js` |
| Custom subset | `docker-compose run --rm app node dist/run/autoRunner.js --cities "Mumbai,Delhi" --categories "IT companies"` |
| Export CSV anytime | `export_all.bat` or `docker-compose run --rm app node dist/run/exportAll.js` |
| Interactive single search | `launch_search.bat` |

## Coverage

- **85+ cities** across India (all states)
- **8 major metros** with 10-15 sub-localities each (Mumbai, Delhi, Bangalore, Hyderabad, Chennai, Kolkata, Pune, Ahmedabad)
- **75 B2B categories** (IT, manufacturing, pharma, logistics, legal, finance, HR, solar, etc.)
- **~12,000 total searches**, each returning 50-200 results
- **Auto-resume** — if interrupted, picks up where it left off
- **Deduplication** — no duplicate companies in the database

## Project Structure

```
src/
  scraping/        # Google Maps scraper (Playwright)
  jobs/            # BullMQ workers (Maps scrape, crawl, seed, export)
  db/              # Database pool and migrations
  run/             # Entry points (autoRunner, exportAll, startWorkers)
  config/          # Environment config
migrations/        # PostgreSQL schema
data/exports/      # CSV output (gitignored)
```

## Notes

- The pipeline respects rate limits (70s between searches) to avoid Google blocks
- CSV is auto-saved after every city — no data loss if interrupted
- Contact person + role is best-effort from team/leadership pages
- Works worldwide — just change the cities and categories arrays
