import type { PackageCandidate, Registry } from "../types.js";

export interface RegistryClient {
  readonly registry: Registry;
  search(query: string, limit: number): Promise<PackageCandidate[]>;
  getDetails?(name: string): Promise<PackageCandidate | null>;
}
