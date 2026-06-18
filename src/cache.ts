interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

export const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
export const DEFAULT_CACHE_MAX_SIZE = 200;

export class TTLCache<V> {
  private entries = new Map<string, CacheEntry<V>>();

  constructor(
    private readonly ttlMs: number = DEFAULT_CACHE_TTL_MS,
    private readonly maxSize: number = DEFAULT_CACHE_MAX_SIZE,
  ) {}

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V): void {
    if (!this.entries.has(key) && this.entries.size >= this.maxSize) {
      const oldest = this.entries.keys().next();
      if (oldest.done === false) this.entries.delete(oldest.value);
    }
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}
