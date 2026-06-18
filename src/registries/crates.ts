import type { PackageCandidate } from "../types.js";
import type { RegistryClient } from "./types.js";
import { fetchWithTimeout } from "../fetchWithTimeout.js";

const CRATES_SEARCH_URL = "https://crates.io/api/v1/crates";
const USER_AGENT = "mcp-wheelcheck/1.0 (https://github.com/tobiaspape/mcp-wheelcheck)";

export class CratesClient implements RegistryClient {
  readonly registry = "crates" as const;

  private headers(): Record<string, string> {
    return { accept: "application/json", "user-agent": USER_AGENT };
  }

  async search(query: string, limit: number): Promise<PackageCandidate[]> {
    const url = new URL(CRATES_SEARCH_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("per_page", String(Math.min(limit, 100)));
    const res = await fetchWithTimeout(url, { headers: this.headers() });
    if (!res.ok) {
      throw new Error(`crates.io search failed: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as CratesSearchResponse;
    return data.crates.map((c) => ({
      name: c.name,
      registry: "crates" as const,
      description: c.description ?? null,
      url: `https://crates.io/crates/${c.id}`,
      homepage: c.homepage ?? null,
      repository: c.repository ?? null,
      downloads: c.downloads ?? null,
      version: c.max_version ?? null,
      language: "rust",
      keywords: (c.keywords ?? []).map((k) => (typeof k === "string" ? k : k.keyword)),
      updatedAt: c.updated_at ?? null,
    }));
  }

  async getDetails(name: string): Promise<PackageCandidate | null> {
    const url = `${CRATES_SEARCH_URL}/${encodeURIComponent(name)}`;
    const res = await fetchWithTimeout(url, { headers: this.headers() });
    if (!res.ok) return null;
    const data = (await res.json()) as CratesDetailsResponse;
    const c = data.crate;
    if (!c) return null;
    return {
      name: c.name,
      registry: "crates",
      description: c.description ?? null,
      url: `https://crates.io/crates/${c.id}`,
      homepage: c.homepage ?? null,
      repository: c.repository ?? null,
      downloads: c.downloads ?? null,
      version: c.max_version ?? null,
      language: "rust",
      keywords: (data.keywords ?? []).map((k) => k.keyword),
      updatedAt: c.updated_at ?? null,
    };
  }
}

interface CratesSearchResponse {
  meta: { total: number };
  crates: Array<{
    id: string;
    name: string;
    description?: string;
    homepage?: string;
    repository?: string;
    downloads?: number;
    max_version?: string;
    updated_at?: string;
    keywords?: Array<string | { id: string; keyword: string }>;
  }>;
}

interface CratesDetailsResponse {
  crate: {
    id: string;
    name: string;
    description?: string;
    homepage?: string;
    repository?: string;
    downloads?: number;
    max_version?: string;
    updated_at?: string;
  };
  keywords?: Array<{ id: string; keyword: string }>;
}
