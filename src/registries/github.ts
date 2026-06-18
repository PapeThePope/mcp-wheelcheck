import type { PackageCandidate } from "../types.js";
import type { RegistryClient } from "./types.js";
import { fetchWithTimeout } from "../fetchWithTimeout.js";

const GITHUB_SEARCH_URL = "https://api.github.com/search/repositories";
const GITHUB_REPO_URL = "https://api.github.com/repos";
const USER_AGENT = "mcp-wheelcheck/1.0 (https://github.com/tobiaspape/mcp-wheelcheck)";

export class GithubClient implements RegistryClient {
  readonly registry = "github" as const;
  private readonly token?: string;

  constructor(token?: string) {
    this.token = token ?? process.env.GITHUB_TOKEN ?? undefined;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "user-agent": USER_AGENT,
    };
    if (this.token) h.authorization = `Bearer ${this.token}`;
    return h;
  }

  async search(query: string, limit: number): Promise<PackageCandidate[]> {
    const url = new URL(GITHUB_SEARCH_URL);
    url.searchParams.set("q", `${query} in:name,description,readme`);
    url.searchParams.set("sort", "stars");
    url.searchParams.set("order", "desc");
    url.searchParams.set("per_page", String(Math.min(limit, 100)));
    const res = await fetchWithTimeout(url, { headers: this.headers() });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`github search failed: ${res.status} ${res.statusText} ${body}`);
    }
    const data = (await res.json()) as GithubSearchResponse;
    return data.items.map((i) => ({
      name: i.full_name,
      registry: "github" as const,
      description: i.description ?? null,
      url: i.html_url,
      homepage: i.homepage ?? null,
      repository: i.html_url,
      stars: i.stargazers_count ?? null,
      version: null,
      language: i.language ?? null,
      keywords: i.topics ?? [],
      updatedAt: i.updated_at ?? null,
    }));
  }

  async getDetails(name: string): Promise<PackageCandidate | null> {
    const segs = name
      .split("/")
      .map((s) => encodeURIComponent(s))
      .join("/");
    const url = `${GITHUB_REPO_URL}/${segs}`;
    const res = await fetchWithTimeout(url, { headers: this.headers() });
    if (!res.ok) return null;
    const i = (await res.json()) as GithubRepo;
    return {
      name: i.full_name,
      registry: "github",
      description: i.description ?? null,
      url: i.html_url,
      homepage: i.homepage ?? null,
      repository: i.html_url,
      stars: i.stargazers_count ?? null,
      version: null,
      language: i.language ?? null,
      keywords: i.topics ?? [],
      updatedAt: i.updated_at ?? null,
    };
  }
}

interface GithubSearchResponse {
  total_count: number;
  items: GithubRepo[];
}

interface GithubRepo {
  id: number;
  name: string;
  full_name: string;
  description?: string;
  html_url: string;
  homepage?: string;
  stargazers_count?: number;
  forks_count?: number;
  open_issues_count?: number;
  language?: string;
  topics?: string[];
  updated_at?: string;
  license?: { spdx_id?: string };
}
