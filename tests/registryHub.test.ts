import { describe, expect, it, vi } from "vitest";
import { RegistryHub } from "../src/registries/index.js";
import type { RegistryClient } from "../src/registries/types.js";
import type { PackageCandidate, Registry } from "../src/types.js";

function makeMockClient(
  registry: Registry,
  searchFn: (query: string, limit: number) => Promise<PackageCandidate[]>,
): RegistryClient {
  return {
    registry,
    search: vi.fn(searchFn),
    getDetails: vi.fn(async (_name: string) => null),
  };
}

function makeCandidate(name: string, registry: Registry): PackageCandidate {
  return {
    name,
    registry,
    description: "test",
    url: `https://example.com/${name}`,
    keywords: [],
  };
}

describe("RegistryHub caching", () => {
  it("caches search results and avoids redundant calls", async () => {
    const npmSearch = vi.fn(async (query: string) => [makeCandidate(`pkg-${query}`, "npm")]);
    const hub = new RegistryHub({
      npm: makeMockClient("npm", npmSearch),
    });

    const r1 = await hub.searchAll("test-query", { registries: ["npm"], limit: 10 });
    const r2 = await hub.searchAll("test-query", { registries: ["npm"], limit: 10 });

    expect(npmSearch).toHaveBeenCalledTimes(1);
    expect(r1.candidates).toEqual(r2.candidates);
  });

  it("distinguishes cache entries by query and limit", async () => {
    const npmSearch = vi.fn(async (query: string) => [makeCandidate(`pkg-${query}`, "npm")]);
    const hub = new RegistryHub({
      npm: makeMockClient("npm", npmSearch),
    });

    await hub.searchAll("alpha", { registries: ["npm"], limit: 10 });
    await hub.searchAll("beta", { registries: ["npm"], limit: 10 });
    await hub.searchAll("alpha", { registries: ["npm"], limit: 20 });

    expect(npmSearch).toHaveBeenCalledTimes(3);
  });

  it("caches getDetails results including null (not-found)", async () => {
    const getDetails = vi.fn(async (_name: string) => null);
    const hub = new RegistryHub({
      npm: { registry: "npm", search: vi.fn(), getDetails } as unknown as RegistryClient,
    });

    const r1 = await hub.getDetails("npm", "nonexistent");
    const r2 = await hub.getDetails("npm", "nonexistent");

    expect(getDetails).toHaveBeenCalledTimes(1);
    expect(r1).toBeNull();
    expect(r2).toBeNull();
  });

  it("caches across multiple find_similar queries (cross-query reuse)", async () => {
    const npmSearch = vi.fn(async (query: string) => [makeCandidate(`pkg-${query}`, "npm")]);
    const hub = new RegistryHub({
      npm: makeMockClient("npm", npmSearch),
    });

    await hub.searchAll("shared-query", { registries: ["npm"], limit: 10 });
    await hub.searchAll("other-query", { registries: ["npm"], limit: 10 });
    await hub.searchAll("shared-query", { registries: ["npm"], limit: 10 });

    expect(npmSearch).toHaveBeenCalledTimes(2);
  });
});

describe("RegistryHub retry on rate limit", () => {
  it("retries on 429 and succeeds on second attempt", async () => {
    let callCount = 0;
    const npmSearch = vi.fn(async (_query: string) => {
      callCount++;
      if (callCount === 1) throw new Error("npm search failed: 429 Too Many Requests");
      return [makeCandidate("pkg", "npm")];
    });
    const hub = new RegistryHub({
      npm: makeMockClient("npm", npmSearch),
    });

    const result = await hub.searchAll("test", { registries: ["npm"], limit: 10 });

    expect(npmSearch).toHaveBeenCalledTimes(2);
    expect(result.candidates).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });

  it("retries on 403 rate limit and succeeds on second attempt", async () => {
    let callCount = 0;
    const npmSearch = vi.fn(async (_query: string) => {
      callCount++;
      if (callCount === 1) throw new Error("github search failed: 403 rate limit exceeded");
      return [makeCandidate("pkg", "npm")];
    });
    const hub = new RegistryHub({
      npm: makeMockClient("npm", npmSearch),
    });

    const result = await hub.searchAll("test", { registries: ["npm"], limit: 10 });

    expect(npmSearch).toHaveBeenCalledTimes(2);
    expect(result.candidates).toHaveLength(1);
  });

  it("does NOT retry on non-rate-limit errors (e.g. 400)", async () => {
    const npmSearch = vi.fn(async () => {
      throw new Error("npm search failed: 400 Bad Request");
    });
    const hub = new RegistryHub({
      npm: makeMockClient("npm", npmSearch),
    });

    const result = await hub.searchAll("test", { registries: ["npm"], limit: 10 });

    expect(npmSearch).toHaveBeenCalledTimes(1);
    expect(result.candidates).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.error).toContain("400");
  });

  it("gives up after max retries and reports the error", async () => {
    const npmSearch = vi.fn(async () => {
      throw new Error("github search failed: 429 rate limit exceeded");
    });
    const hub = new RegistryHub({
      npm: makeMockClient("npm", npmSearch),
    });

    const result = await hub.searchAll("test", { registries: ["npm"], limit: 10 });

    expect(npmSearch).toHaveBeenCalledTimes(2);
    expect(result.candidates).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });
});
