import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TTLCache } from "../src/cache.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TTLCache", () => {
  it("stores and retrieves values", () => {
    const cache = new TTLCache<string>(60000);
    cache.set("key1", "value1");
    expect(cache.get("key1")).toBe("value1");
  });

  it("returns undefined for missing keys", () => {
    const cache = new TTLCache<string>(60000);
    expect(cache.get("nope")).toBeUndefined();
  });

  it("expires entries after TTL", () => {
    const cache = new TTLCache<string>(5000);
    cache.set("key1", "value1");
    expect(cache.get("key1")).toBe("value1");

    vi.advanceTimersByTime(4999);
    expect(cache.get("key1")).toBe("value1");

    vi.advanceTimersByTime(2);
    expect(cache.get("key1")).toBeUndefined();
  });

  it("evicts the oldest entry when maxSize is reached (LRU)", () => {
    const cache = new TTLCache<number>(60000, 3);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    expect(cache.size).toBe(3);

    cache.set("d", 4);
    expect(cache.size).toBe(3);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
    expect(cache.get("d")).toBe(4);
  });

  it("refreshes LRU position on get", () => {
    const cache = new TTLCache<number>(60000, 3);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    cache.get("a");

    cache.set("d", 4);
    expect(cache.get("a")).toBe(1);
    expect(cache.get("b")).toBeUndefined();
  });

  it("overwrites existing keys without growing size", () => {
    const cache = new TTLCache<string>(60000, 2);
    cache.set("a", "1");
    cache.set("a", "2");
    expect(cache.size).toBe(1);
    expect(cache.get("a")).toBe("2");
  });

  it("clears all entries", () => {
    const cache = new TTLCache<string>(60000);
    cache.set("a", "1");
    cache.set("b", "2");
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get("a")).toBeUndefined();
  });
});
