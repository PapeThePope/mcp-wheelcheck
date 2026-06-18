import type { PackageCandidate } from "./types.js";
import { tokenMatches, tokenize } from "./textMatch.js";

export function relevanceScore(queryKeywords: string[], candidate: PackageCandidate): number {
  if (queryKeywords.length === 0) return 0;

  const queryTerms = new Set(
    queryKeywords
      .join(" ")
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length >= 3),
  );

  if (queryTerms.size === 0) return 0;

  const nameTokens = tokenize(candidate.name.toLowerCase());
  const descTokens = tokenize((candidate.description ?? "").toLowerCase());
  const keywordTokens = tokenize(candidate.keywords.map((k) => k.toLowerCase()).join(" "));

  let hits = 0;
  let total = 0;
  for (const term of queryTerms) {
    total++;
    if (tokenMatches(term, nameTokens)) hits += 2;
    else if (tokenMatches(term, keywordTokens)) hits += 1.5;
    else if (tokenMatches(term, descTokens)) hits += 1;
  }

  if (total === 0) return 0;
  const base = Math.min(hits / (total * 2), 1);

  const matchCount = candidate.matchedQueryCount ?? 1;
  if (matchCount > 1 && base > 0) {
    return Math.min(base * (1 + 0.1 * Math.min(matchCount - 1, 4)), 1);
  }
  return base;
}

export function popularityScore(candidate: PackageCandidate): number {
  const raw = candidate.stars ?? candidate.downloads ?? 0;
  if (raw <= 0) return 0;
  return Math.min(Math.log10(raw + 1) / Math.log10(100000 + 1), 1);
}

export function recencyScore(candidate: PackageCandidate): number {
  if (!candidate.updatedAt) return 0.5;
  const updated = new Date(candidate.updatedAt).getTime();
  if (Number.isNaN(updated)) return 0.5;
  const daysSince = (Date.now() - updated) / (1000 * 60 * 60 * 24);
  if (daysSince <= 30) return 1;
  if (daysSince <= 90) return 0.8;
  if (daysSince <= 180) return 0.6;
  if (daysSince <= 365) return 0.4;
  if (daysSince <= 730) return 0.2;
  return 0.1;
}

export interface CompositeScoreWeights {
  relevance: number;
  popularity: number;
  recency: number;
}

const DEFAULT_WEIGHTS: CompositeScoreWeights = {
  relevance: 0.5,
  popularity: 0.3,
  recency: 0.2,
};

export function compositeScore(
  queryKeywords: string[],
  candidate: PackageCandidate,
  weights: CompositeScoreWeights = DEFAULT_WEIGHTS,
): number {
  const rel = relevanceScore(queryKeywords, candidate);
  const pop = popularityScore(candidate);
  const rec = recencyScore(candidate);
  return rel * weights.relevance + pop * weights.popularity + rec * weights.recency;
}

export interface ScoredCandidate {
  candidate: PackageCandidate;
  score: number;
  breakdown: { relevance: number; popularity: number; recency: number };
}

export function scoreAndRank(
  queryKeywords: string[],
  candidates: PackageCandidate[],
  weights?: CompositeScoreWeights,
): ScoredCandidate[] {
  const w = weights ?? DEFAULT_WEIGHTS;
  return candidates
    .map((candidate) => {
      const relevance = relevanceScore(queryKeywords, candidate);
      const popularity = popularityScore(candidate);
      const recency = recencyScore(candidate);
      const score = relevance * w.relevance + popularity * w.popularity + recency * w.recency;
      return { candidate, score, breakdown: { relevance, popularity, recency } };
    })
    .sort((a, b) => b.score - a.score);
}

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^@[^/]+\//, "")
    .replace(/[^a-z0-9]/g, "");
}

export function deduplicate(candidates: PackageCandidate[]): PackageCandidate[] {
  const keyToIndex = new Map<string, number>();
  const result: PackageCandidate[] = [];

  for (const c of candidates) {
    const normName = normalizeName(c.name);

    const repoUrl = c.repository?.toLowerCase() ?? "";
    const repoKey = repoUrl
      .replace(/^https?:\/\/github\.com\//, "")
      .replace(/\.git$/, "")
      .replace(/\/$/, "");

    const keys = [`${c.registry}:${normName}`];
    if (repoKey) keys.push(`repo:${repoKey}`);
    if (c.registry !== "github" && normName) keys.push(`name:${normName}`);

    let existingIndex = -1;
    for (const key of keys) {
      const idx = keyToIndex.get(key);
      if (idx !== undefined) {
        existingIndex = idx;
        break;
      }
    }

    if (existingIndex >= 0) {
      const existing = result[existingIndex]!;
      const existingPop = existing.stars ?? existing.downloads ?? 0;
      const newPop = c.stars ?? c.downloads ?? 0;
      if (newPop > existingPop) {
        result[existingIndex] = c;
      } else if (
        c.matchedQueryCount &&
        (!existing.matchedQueryCount || c.matchedQueryCount > existing.matchedQueryCount)
      ) {
        result[existingIndex] = { ...existing, matchedQueryCount: c.matchedQueryCount };
      }
    } else {
      const newIndex = result.length;
      result.push(c);
      for (const key of keys) keyToIndex.set(key, newIndex);
    }
  }

  return result;
}
