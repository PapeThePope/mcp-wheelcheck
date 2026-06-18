export type Registry = "npm" | "pypi" | "crates" | "github";

export interface PackageCandidate {
  name: string;
  registry: Registry;
  description: string | null;
  url: string;
  homepage?: string | null;
  repository?: string | null;
  stars?: number | null;
  downloads?: number | null;
  version?: string | null;
  language?: string | null;
  keywords: string[];
  updatedAt?: string | null;
  score?: number;
  matchedQueryCount?: number;
}

export interface SearchResponse {
  query: string;
  registriesSearched: Registry[];
  total: number;
  candidates: PackageCandidate[];
}

export interface RegistryError {
  registry: Registry;
  error: string;
}
