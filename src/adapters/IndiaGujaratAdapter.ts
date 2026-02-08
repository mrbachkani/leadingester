import { DatasetAdapter, RawRow, CompanyIdentity } from "./DatasetAdapter.js";

function clean(s?: any): string {
  return (s ?? "").toString().trim();
}

function extractCityTokens(address: string): string[] {
  const parts = address.split(",").map(p => p.trim()).filter(Boolean);
  // Often ends with: ... , City, Gujarat, PIN
  const tail = parts.slice(-4);
  // Keep 1-2 meaningful tokens (avoid pure PIN)
  const tokens = tail
    .filter(t => t.length >= 3 && !/^\d{5,6}$/.test(t))
    .slice(0, 2);
  return tokens;
}

function nameVariants(name: string): string[] {
  const n = name.replace(/\s+/g, " ").trim();
  const stripped = n
    .replace(/\b(PVT\.?|PRIVATE)\b/gi, "")
    .replace(/\b(LTD\.?|LIMITED)\b/gi, "")
    .replace(/\b(LLP)\b/gi, "")
    .replace(/\b(COMPANY|CO)\b/gi, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(new Set([n, stripped].filter(x => x.length >= 4)));
}

export class IndiaGujaratAdapter implements DatasetAdapter {
  jurisdictionLabel(): string { return "IN-GJ"; }

  parseRow(row: RawRow): CompanyIdentity | null {
    const cin = clean(row["CIN"]);
    const legal = clean(row["CompanyName"]);
    if (!cin || !legal) return null;

    return {
      jurisdiction: "IN",
      registry_id: cin,
      legal_name: legal,
      status: clean(row["CompanyStatus"]) || undefined,
      address_raw: clean(row["Registered_Office_Address"]) || undefined,
      state_code: clean(row["CompanyStateCode"]) || undefined,
      roc_code: clean(row["CompanyROCcode"]) || undefined,
      nic_code: clean(row["nic_code"]) || undefined,
      industry_label: clean(row["CompanyIndustrialClassification"]) || undefined,
      registered_on: clean(row["CompanyRegistrationdate_date"]) || undefined
    };
  }

  getQueryHints(company: CompanyIdentity) {
    const cityTokens = company.address_raw ? extractCityTokens(company.address_raw) : [];
    const variants = nameVariants(company.legal_name);
    return { stateToken: "Gujarat", cityTokens, nameVariants: variants };
  }
}
