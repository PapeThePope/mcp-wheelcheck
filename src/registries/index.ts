import type { PackageCandidate, Registry, RegistryError } from "../types.js";
import type { RegistryClient } from "./types.js";
import { NpmClient } from "./npm.js";
import { CratesClient } from "./crates.js";
import { GithubClient } from "./github.js";
import { PyPiClient } from "./pypi.js";
import { TTLCache, DEFAULT_CACHE_TTL_MS, DEFAULT_CACHE_MAX_SIZE } from "../cache.js";

export type { RegistryClient } from "./types.js";

const ALL_REGISTRIES: Registry[] = ["npm", "crates", "github"];

const MAX_RETRIES = 1;
const RETRY_BASE_DELAY_MS = 500;

function isRetryableError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /\b(429|403)\b|rate limit/i.test(msg);
}

async function withRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries > 0 && isRetryableError(error)) {
      const delay = RETRY_BASE_DELAY_MS * (MAX_RETRIES - retries + 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1);
    }
    throw error;
  }
}

export interface SearchAllResult {
  candidates: PackageCandidate[];
  registriesSearched: Registry[];
  errors: RegistryError[];
}

export interface RegistryHubOptions {
  cacheTtlMs?: number;
  cacheMaxSize?: number;
}

export class RegistryHub {
  private clients: Record<Registry, RegistryClient>;
  private searchCache: TTLCache<PackageCandidate[]>;
  private detailsCache: TTLCache<PackageCandidate | null>;

  constructor(clients?: Partial<Record<Registry, RegistryClient>>, options?: RegistryHubOptions) {
    this.clients = {
      npm: clients?.npm ?? new NpmClient(),
      pypi: clients?.pypi ?? new PyPiClient(),
      crates: clients?.crates ?? new CratesClient(),
      github: clients?.github ?? new GithubClient(),
    };
    const ttlMs = options?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    const maxSize = options?.cacheMaxSize ?? DEFAULT_CACHE_MAX_SIZE;
    this.searchCache = new TTLCache<PackageCandidate[]>(ttlMs, maxSize);
    this.detailsCache = new TTLCache<PackageCandidate | null>(ttlMs, maxSize);
  }

  listRegistries(): Registry[] {
    return [...ALL_REGISTRIES];
  }

  async searchAll(
    query: string,
    options: { registries?: Registry[]; limit?: number } = {},
  ): Promise<SearchAllResult> {
    const registries = options.registries ?? ALL_REGISTRIES;
    const limit = options.limit ?? 10;
    const errors: RegistryError[] = [];

    const results = await Promise.allSettled(
      registries.map(async (r) => {
        const client = this.clients[r];
        const cacheKey = `search:${r}:${query}:${limit}`;
        const cached = this.searchCache.get(cacheKey);
        if (cached) return { registry: r, candidates: cached };
        const candidates = await withRetry(() => client.search(query, limit));
        this.searchCache.set(cacheKey, candidates);
        return { registry: r, candidates };
      }),
    );

    const candidates: PackageCandidate[] = [];
    results.forEach((result, idx) => {
      const registry = registries[idx];
      if (!registry) return;
      if (result.status === "fulfilled") {
        candidates.push(...result.value.candidates);
      } else {
        errors.push({
          registry,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    });

    return { candidates, registriesSearched: registries, errors };
  }

  async getDetails(registry: Registry, name: string): Promise<PackageCandidate | null> {
    const cacheKey = `details:${registry}:${name}`;
    const cached = this.detailsCache.get(cacheKey);
    if (cached !== undefined) return cached;
    const client = this.clients[registry];
    if (!client.getDetails) return null;
    const result = await withRetry(() => client.getDetails!(name));
    this.detailsCache.set(cacheKey, result);
    return result;
  }
}
