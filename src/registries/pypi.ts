import type { PackageCandidate } from "../types.js";
import type { RegistryClient } from "./types.js";
import { fetchWithTimeout } from "../fetchWithTimeout.js";

const PYPI_PACKAGE_URL = "https://pypi.org/pypi";
const USER_AGENT = "mcp-wheelcheck/1.0 (https://github.com/tobiaspape/mcp-wheelcheck)";

export class PyPiClient implements RegistryClient {
  readonly registry = "pypi" as const;

  async search(_query: string, _limit: number): Promise<PackageCandidate[]> {
    throw new Error(
      "PyPI search is unavailable: pypi.org/search is behind a JS client-challenge and XML-RPC search was removed. Use get_package_details with a known package name instead.",
    );
  }

  async getDetails(name: string): Promise<PackageCandidate | null> {
    const url = `${PYPI_PACKAGE_URL}/${encodeURIComponent(name)}/json`;
    const res = await fetchWithTimeout(url, {
      headers: { accept: "application/json", "user-agent": USER_AGENT },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as PyPiPackageResponse;
    const info = data.info;
    const keywords = info.keywords
      ? info.keywords
          .split(/[\s,;]+/)
          .map((k) => k.trim())
          .filter((k) => k.length > 0)
      : [];
    return {
      name: info.name,
      registry: "pypi",
      description: info.summary ?? (info.description ? info.description.slice(0, 500) : null),
      url: `https://pypi.org/project/${info.name}/`,
      homepage: info.home_page ?? info.project_urls?.Homepage ?? null,
      repository:
        info.project_urls?.Source ??
        info.project_urls?.Repository ??
        info.project_urls?.GitHub ??
        null,
      version: info.version ?? null,
      language: "python",
      keywords,
      updatedAt: data.urls?.[0]?.upload_time ?? null,
    };
  }
}

interface PyPiPackageResponse {
  info: {
    name: string;
    version?: string;
    summary?: string;
    description?: string;
    home_page?: string;
    keywords?: string;
    project_urls?: Record<string, string>;
  };
  urls?: Array<{ upload_time?: string }>;
}
