export type SerpOrganicResult = {
  link: string;
  title?: string;
  snippet?: string;
};

export interface SerpProvider {
  search(query: string, params?: Record<string, string | number | boolean>): Promise<SerpOrganicResult[]>;
}
