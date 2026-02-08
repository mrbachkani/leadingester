export type RawRow = Record<string, any>;

export type CompanyIdentity = {
  jurisdiction: "IN";
  registry_id: string; // CIN
  legal_name: string;
  status?: string;
  address_raw?: string;
  state_code?: string;
  roc_code?: string;
  nic_code?: string;
  industry_label?: string;
  registered_on?: string; // ISO date
};

export interface DatasetAdapter {
  jurisdictionLabel(): string; // e.g., IN-GJ
  parseRow(row: RawRow): CompanyIdentity | null;
  getQueryHints(company: CompanyIdentity): { stateToken?: string; cityTokens: string[]; nameVariants: string[] };
}
