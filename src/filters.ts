import type { PackageCandidate } from "./types.js";
import { tokenMatches, tokenize } from "./textMatch.js";

const NOISE_NAME_PATTERNS = [
  /^awesome[-/]/i,
  /^build-your-own/i,
  /^public-apis/i,
  /^free-for-dev/i,
  /^awesome-list/i,
  /awesome-list/i,
];

const NOISE_FULL_NAMES = new Set([
  "sindresorhus/awesome",
  "codecrafters-io/build-your-own-x",
  "public-apis/public-apis",
  "ripienaar/free-for-dev",
  "github/gitignore",
  "kamranahmedse/developer-roadmap",
  "jwasham/coding-interview-university",
  "donnemartin/system-design-primer",
  "vinta/awesome-python",
  "vuejs/awesome-vue",
  "enaqx/awesome-react",
  "sindresorhus/awesome-nodejs",
]);

const NOISE_DESCRIPTION_KEYWORDS = [
  "awesome list",
  "awesome lists",
  "curated list",
  "curated collection",
  "collection of",
  "list of free",
  "list of resources",
  "roadmap",
  "interview questions",
  "learning resources",
];

export function isNoise(candidate: PackageCandidate): boolean {
  const name = candidate.name.toLowerCase();

  if (NOISE_FULL_NAMES.has(name)) return true;

  for (const pattern of NOISE_NAME_PATTERNS) {
    if (pattern.test(candidate.name)) return true;
  }

  const desc = (candidate.description ?? "").toLowerCase();
  for (const kw of NOISE_DESCRIPTION_KEYWORDS) {
    if (desc.includes(kw)) return true;
  }

  if (candidate.registry === "github") {
    const topics = candidate.keywords.map((k) => k.toLowerCase());
    if (topics.includes("awesome-list") || topics.includes("awesome")) return true;
  }

  return false;
}

export function filterNoise(candidates: PackageCandidate[]): PackageCandidate[] {
  return candidates.filter((c) => !isNoise(c));
}

export function filterByRelevance(
  candidates: PackageCandidate[],
  queryKeywords: string[],
): PackageCandidate[] {
  if (queryKeywords.length === 0) return candidates;

  const queryTerms = queryKeywords
    .join(" ")
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 3);

  if (queryTerms.length === 0) return candidates;

  return candidates.filter((c) => {
    const tokens = tokenize([c.name, c.description ?? "", c.keywords.join(" ")].join(" "));
    return queryTerms.some((term) => tokenMatches(term, tokens));
  });
}
