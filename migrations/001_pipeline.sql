CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS import_batches (
  batch_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename        text NOT NULL,
  local_path      text NOT NULL,
  jurisdiction    text NOT NULL,
  status          text NOT NULL DEFAULT 'uploaded',
  meta            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS import_rows (
  batch_id        uuid NOT NULL REFERENCES import_batches(batch_id) ON DELETE CASCADE,
  row_no          int NOT NULL,
  row_hash        text NOT NULL,
  raw_json        jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (batch_id, row_no)
);

CREATE INDEX IF NOT EXISTS idx_import_rows_hash ON import_rows(row_hash);

CREATE TABLE IF NOT EXISTS companies (
  company_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction    text NOT NULL,
  registry_id     text NOT NULL,
  legal_name      text NOT NULL,
  status          text,
  address_raw     text,
  state_code      text,
  roc_code        text,
  nic_code        text,
  industry_label  text,
  registered_on   date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_company_registry UNIQUE (jurisdiction, registry_id)
);

CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status);
CREATE INDEX IF NOT EXISTS idx_companies_state ON companies(state_code);

CREATE TABLE IF NOT EXISTS company_sources (
  company_id      uuid NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
  batch_id        uuid NOT NULL REFERENCES import_batches(batch_id) ON DELETE CASCADE,
  raw_row_json    jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, batch_id)
);

CREATE TABLE IF NOT EXISTS domain_queries (
  query_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
  query_used      text NOT NULL,
  provider        text NOT NULL,
  run_id          text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_domain_queries_company ON domain_queries(company_id);

CREATE TABLE IF NOT EXISTS domain_candidates (
  candidate_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_id        uuid NOT NULL REFERENCES domain_queries(query_id) ON DELETE CASCADE,
  rank            int NOT NULL,
  url             text NOT NULL,
  domain          text NOT NULL,
  title           text,
  snippet         text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_domain_candidates_domain ON domain_candidates(domain);

CREATE TABLE IF NOT EXISTS company_domains (
  company_id      uuid NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
  domain          text,
  final_url       text,
  confidence      real NOT NULL DEFAULT 0,
  evidence_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
  status          text NOT NULL,
  verified_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id)
);

-- Allow status-only rows like 'not_found' / 'rejected' (domain may be unknown).
ALTER TABLE IF EXISTS company_domains
  ALTER COLUMN domain DROP NOT NULL;
ALTER TABLE IF EXISTS company_domains
  ALTER COLUMN confidence SET DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_company_domains_domain ON company_domains(domain);
CREATE INDEX IF NOT EXISTS idx_company_domains_status ON company_domains(status);

CREATE TABLE IF NOT EXISTS crawl_runs (
  crawl_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
  domain          text NOT NULL,
  status          text NOT NULL DEFAULT 'running',
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  pages_fetched   int NOT NULL DEFAULT 0,
  notes           text,
  meta            jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS crawl_pages (
  page_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crawl_id        uuid NOT NULL REFERENCES crawl_runs(crawl_id) ON DELETE CASCADE,
  url             text NOT NULL,
  http_status     int,
  content_hash    text,
  fetched_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS company_contacts (
  contact_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
  type            text NOT NULL,
  value           text NOT NULL,
  label           text NOT NULL DEFAULT 'unknown',
  source_url      text,
  confidence      real NOT NULL DEFAULT 0.7,
  found_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_contacts_company ON company_contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_company_contacts_type ON company_contacts(type);

CREATE TABLE IF NOT EXISTS company_people (
  person_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
  name            text NOT NULL,
  role            text,
  email           text,
  source_url      text,
  confidence      real NOT NULL DEFAULT 0.6,
  found_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leads (
  lead_id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              uuid NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
  primary_domain          text NOT NULL,
  primary_contact_type    text NOT NULL,
  primary_contact_value   text NOT NULL,
  lead_score              int NOT NULL DEFAULT 0,
  source_batch_id         uuid REFERENCES import_batches(batch_id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lead_quality (
  lead_id         uuid PRIMARY KEY REFERENCES leads(lead_id) ON DELETE CASCADE,
  flags_json      jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suppression_list (
  email_normalized text PRIMARY KEY,
  reason           text NOT NULL,
  scope            text NOT NULL DEFAULT 'global',
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Data hygiene / constraints (idempotent)
-- ---------------------------------------------------------------------------

-- Best-effort backfill of leads.source_batch_id (older runs inserted NULL).
UPDATE leads l
SET source_batch_id = cs.batch_id
FROM (
  SELECT DISTINCT ON (company_id) company_id, batch_id
  FROM company_sources
  ORDER BY company_id, created_at DESC
) cs
WHERE l.source_batch_id IS NULL
  AND l.company_id = cs.company_id;

-- Remove duplicate leads per company+batch (keep best score / newest).
WITH ranked AS (
  SELECT
    lead_id,
    row_number() OVER (
      PARTITION BY company_id, source_batch_id
      ORDER BY lead_score DESC, created_at DESC, lead_id DESC
    ) AS rn
  FROM leads
)
DELETE FROM leads l
USING ranked r
WHERE l.lead_id = r.lead_id
  AND r.rn > 1;

-- Enforce one lead per company per batch.
CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_company_batch ON leads(company_id, source_batch_id);

-- Remove duplicate contacts per company/type/value (keep newest).
WITH ranked AS (
  SELECT
    contact_id,
    row_number() OVER (
      PARTITION BY company_id, type, value
      ORDER BY found_at DESC, contact_id DESC
    ) AS rn
  FROM company_contacts
)
DELETE FROM company_contacts c
USING ranked r
WHERE c.contact_id = r.contact_id
  AND r.rn > 1;

-- Enforce uniqueness for contacts so reruns don't inflate exports.
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_contacts_company_type_value ON company_contacts(company_id, type, value);

-- ---------------------------------------------------------------------------
-- Auto-runner: search progress tracking for overnight runs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS search_progress (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country         text NOT NULL,
  city            text NOT NULL,
  category        text NOT NULL,
  status          text NOT NULL DEFAULT 'pending',
  results_found   int NOT NULL DEFAULT 0,
  batch_id        uuid REFERENCES import_batches(batch_id) ON DELETE SET NULL,
  error_message   text,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_search_progress_country_city_cat ON search_progress(country, city, category);

-- Add maps_category and maps_rating to companies for richer lead data
ALTER TABLE companies ADD COLUMN IF NOT EXISTS maps_category text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS maps_rating real;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS maps_reviews_count int;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS search_city text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS search_category text;
