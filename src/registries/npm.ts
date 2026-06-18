import type { PackageCandidate } from "../types.js";
import type { RegistryClient } from "./types.js";
import { fetchWithTimeout } from "../fetchWithTimeout.js";

const NPM_SEARCH_URL = "https://registry.npmjs.org/-/v1/search";
const NPM_PACKAGE_URL = "https://registry.npmjs.org";
const USER_AGENT = "mcp-wheelcheck/1.0 (https://github.com/tobiaspape/mcp-wheelcheck)";

export class NpmClient implements RegistryClient {
  readonly registry = "npm" as const;

  async search(query: string, limit: number): Promise<PackageCandidate[]> {
    const url = new URL(NPM_SEARCH_URL);
    url.searchParams.set("text", query);
    url.searchParams.set("size", String(Math.min(limit, 250)));
    const res = await fetchWithTimeout(url, {
      headers: { accept: "application/json", "user-agent": USER_AGENT },
    });
    if (!res.ok) {
      throw new Error(`npm search failed: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as NpmSearchResponse;
    return data.objects.map((o) => {
      const popularity = o.score?.detail?.popularity ?? 0;
      return {
        name: o.package.name,
        registry: "npm" as const,
        description: o.package.description ?? null,
        url: o.package.links?.npm ?? `https://www.npmjs.com/package/${o.package.name}`,
        homepage: o.package.links?.homepage ?? null,
        repository: o.package.links?.repository ?? null,
        version: o.package.version ?? null,
        keywords: o.package.keywords ?? [],
        updatedAt: o.package.date ?? null,
        score: o.score?.final,
        downloads: Math.round(popularity * 100000),
      };
    });
  }

  async getDetails(name: string): Promise<PackageCandidate | null> {
    const segs = name
      .split("/")
      .map((s) => encodeURIComponent(s))
      .join("/");
    const url = `${NPM_PACKAGE_URL}/${segs}`;
    const res = await fetchWithTimeout(url, {
      headers: { accept: "application/json", "user-agent": USER_AGENT },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as NpmPackageResponse;
    const latest = data["dist-tags"]?.latest;
    const versionMeta = latest ? data.versions?.[latest] : undefined;
    const repo = versionMeta?.repository;
    const repoUrl = typeof repo === "string" ? repo : (repo?.url ?? null);
    return {
      name: data.name,
      registry: "npm",
      description: versionMeta?.description ?? null,
      url: `https://www.npmjs.com/package/${data.name}`,
      homepage: versionMeta?.homepage ?? null,
      repository: repoUrl,
      version: latest ?? null,
      keywords: versionMeta?.keywords ?? [],
      updatedAt: data.time?.[latest ?? ""] ?? null,
    };
  }
}

interface NpmSearchResponse {
  objects: Array<{
    package: {
      name: string;
      version?: string;
      description?: string;
      keywords?: string[];
      date?: string;
      links?: { npm?: string; homepage?: string; repository?: string };
    };
    score?: {
      final?: number;
      detail?: { quality?: number; popularity?: number; maintenance?: number };
    };
  }>;
  total: number;
}

interface NpmPackageResponse {
  name: string;
  "dist-tags"?: { latest?: string };
  versions?: Record<
    string,
    {
      version?: string;
      description?: string;
      homepage?: string;
      repository?: string | { url?: string };
      keywords?: string[];
    }
  >;
  time?: Record<string, string>;
}
