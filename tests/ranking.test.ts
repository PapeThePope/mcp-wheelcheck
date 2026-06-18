import { describe, expect, it } from "vitest";
import { filterNoise, filterByRelevance, isNoise } from "../src/filters.js";
import {
  compositeScore,
  deduplicate,
  popularityScore,
  relevanceScore,
  scoreAndRank,
} from "../src/ranking.js";
import type { PackageCandidate } from "../src/types.js";

function makeCandidate(overrides: Partial<PackageCandidate> = {}): PackageCandidate {
  return {
    name: "test-pkg",
    registry: "npm",
    description: "A test package",
    url: "https://www.npmjs.com/package/test-pkg",
    keywords: [],
    ...overrides,
  };
}

describe("isNoise / filterNoise", () => {
  it("flags awesome-list repos", () => {
    expect(isNoise(makeCandidate({ name: "sindresorhus/awesome", registry: "github" }))).toBe(true);
    expect(isNoise(makeCandidate({ name: "vinta/awesome-python", registry: "github" }))).toBe(true);
    expect(isNoise(makeCandidate({ name: "awesome-react", registry: "github" }))).toBe(true);
  });

  it("flags build-your-own repos", () => {
    expect(
      isNoise(makeCandidate({ name: "codecrafters-io/build-your-own-x", registry: "github" })),
    ).toBe(true);
  });

  it("flags repos with awesome-list description keywords", () => {
    expect(
      isNoise(
        makeCandidate({
          name: "some/repo",
          registry: "github",
          description: "A curated list of resources for developers",
        }),
      ),
    ).toBe(true);
  });

  it("does not flag legitimate packages", () => {
    expect(
      isNoise(makeCandidate({ name: "slidev", description: "Presentation slides for developers" })),
    ).toBe(false);
    expect(
      isNoise(makeCandidate({ name: "express", description: "Fast web framework for Node.js" })),
    ).toBe(false);
  });

  it("filterNoise removes all noise from a list", () => {
    const candidates = [
      makeCandidate({ name: "sindresorhus/awesome", registry: "github" }),
      makeCandidate({ name: "slidev", description: "Presentation slides" }),
      makeCandidate({ name: "codecrafters-io/build-your-own-x", registry: "github" }),
      makeCandidate({ name: "express", description: "Web framework" }),
    ];
    const filtered = filterNoise(candidates);
    expect(filtered).toHaveLength(2);
    expect(filtered[0]!.name).toBe("slidev");
    expect(filtered[1]!.name).toBe("express");
  });
});

describe("filterByRelevance", () => {
  it("keeps candidates that match at least one query keyword", () => {
    const candidates = [
      makeCandidate({ name: "markdown-it", description: "Markdown parser" }),
      makeCandidate({ name: "express", description: "Web framework" }),
    ];
    const filtered = filterByRelevance(candidates, ["markdown", "parser"]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.name).toBe("markdown-it");
  });

  it("returns all candidates when no keywords provided", () => {
    const candidates = [makeCandidate(), makeCandidate({ name: "other" })];
    expect(filterByRelevance(candidates, [])).toHaveLength(2);
  });

  it("does NOT match substrings (search should not match research)", () => {
    const candidates = [
      makeCandidate({ name: "research-tool", description: "Academic research framework" }),
      makeCandidate({ name: "search-engine", description: "Full-text search" }),
    ];
    const filtered = filterByRelevance(candidates, ["search"]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.name).toBe("search-engine");
  });

  it("does NOT match substrings (css should not match scss)", () => {
    const candidates = [
      makeCandidate({ name: "scss-compiler", description: "SCSS compilation tool" }),
      makeCandidate({ name: "css-minifier", description: "CSS minification" }),
    ];
    const filtered = filterByRelevance(candidates, ["css"]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.name).toBe("css-minifier");
  });

  it("matches token prefixes (slide matches slides)", () => {
    const candidates = [
      makeCandidate({ name: "slides-framework", description: "Presentation slides" }),
    ];
    const filtered = filterByRelevance(candidates, ["slide"]);
    expect(filtered).toHaveLength(1);
  });
});

describe("relevanceScore", () => {
  it("scores higher when keywords appear in name", () => {
    const inName = relevanceScore(["markdown"], makeCandidate({ name: "markdown-it" }));
    const inDesc = relevanceScore(
      ["markdown"],
      makeCandidate({ name: "other", description: "markdown parser" }),
    );
    expect(inName).toBeGreaterThan(inDesc);
  });

  it("scores keywords[] higher than description (own tier)", () => {
    const inKeywords = relevanceScore(
      ["markdown"],
      makeCandidate({ name: "other", keywords: ["markdown", "parser"] }),
    );
    const inDesc = relevanceScore(
      ["markdown"],
      makeCandidate({ name: "other", description: "markdown parser" }),
    );
    expect(inKeywords).toBeGreaterThan(inDesc);
  });

  it("does NOT score substring matches (search should not match research)", () => {
    expect(relevanceScore(["search"], makeCandidate({ name: "research-tool" }))).toBe(0);
  });

  it("scores 0 when no keywords match", () => {
    expect(
      relevanceScore(
        ["markdown"],
        makeCandidate({ name: "express", description: "web framework" }),
      ),
    ).toBe(0);
  });

  it("boosts candidates that matched multiple queries", () => {
    const single = makeCandidate({ name: "markdown-it", description: "markdown parser" });
    const multi = makeCandidate({
      name: "markdown-it",
      description: "markdown parser",
      matchedQueryCount: 3,
    });
    expect(relevanceScore(["markdown", "parser"], multi)).toBeGreaterThan(
      relevanceScore(["markdown", "parser"], single),
    );
  });

  it("does not boost when base relevance is 0", () => {
    const c = makeCandidate({
      name: "express",
      description: "web framework",
      matchedQueryCount: 5,
    });
    expect(relevanceScore(["markdown"], c)).toBe(0);
  });

  it("caps the boost at 5 matches", () => {
    const five = makeCandidate({
      name: "markdown-it",
      description: "markdown parser",
      matchedQueryCount: 5,
    });
    const ten = makeCandidate({
      name: "markdown-it",
      description: "markdown parser",
      matchedQueryCount: 10,
    });
    expect(relevanceScore(["markdown", "parser"], five)).toBe(
      relevanceScore(["markdown", "parser"], ten),
    );
  });
});

describe("popularityScore", () => {
  it("returns 0 for no stars/downloads", () => {
    expect(popularityScore(makeCandidate())).toBe(0);
  });

  it("scales logarithmically", () => {
    const low = popularityScore(makeCandidate({ stars: 10 }));
    const high = popularityScore(makeCandidate({ stars: 50000 }));
    expect(high).toBeGreaterThan(low);
    expect(high).toBeLessThanOrEqual(1);
  });
});

describe("compositeScore", () => {
  it("weights relevance above popularity", () => {
    const relevant = makeCandidate({
      name: "markdown-parser",
      description: "markdown parser",
      stars: 5,
    });
    const popular = makeCandidate({ name: "express", description: "web framework", stars: 50000 });
    const keywords = ["markdown", "parser"];
    expect(compositeScore(keywords, relevant)).toBeGreaterThan(compositeScore(keywords, popular));
  });
});

describe("scoreAndRank", () => {
  it("sorts by composite score descending", () => {
    const candidates = [
      makeCandidate({ name: "express", description: "web framework", stars: 50000 }),
      makeCandidate({ name: "markdown-it", description: "markdown parser", stars: 1000 }),
    ];
    const ranked = scoreAndRank(["markdown", "parser"], candidates);
    expect(ranked[0]!.candidate.name).toBe("markdown-it");
  });

  it("includes score breakdown", () => {
    const ranked = scoreAndRank(["markdown"], [makeCandidate({ name: "markdown-it" })]);
    expect(ranked[0]!.breakdown).toHaveProperty("relevance");
    expect(ranked[0]!.breakdown).toHaveProperty("popularity");
    expect(ranked[0]!.breakdown).toHaveProperty("recency");
  });
});

describe("deduplicate", () => {
  it("removes same-name duplicates within a registry", () => {
    const candidates = [
      makeCandidate({ name: "express", stars: 50000 }),
      makeCandidate({ name: "express", stars: 60000 }),
    ];
    expect(deduplicate(candidates)).toHaveLength(1);
  });

  it("keeps the higher-popularity duplicate", () => {
    const candidates = [
      makeCandidate({ name: "express", stars: 50000 }),
      makeCandidate({ name: "express", stars: 60000 }),
    ];
    const deduped = deduplicate(candidates);
    expect(deduped[0]!.stars).toBe(60000);
  });

  it("deduplicates npm package and github repo by repository URL", () => {
    const candidates = [
      makeCandidate({
        name: "slidev",
        registry: "npm",
        repository: "https://github.com/slidevjs/slidev",
        stars: undefined,
        downloads: 1000,
      }),
      makeCandidate({
        name: "slidevjs/slidev",
        registry: "github",
        repository: "https://github.com/slidevjs/slidev",
        stars: 36000,
      }),
    ];
    const deduped = deduplicate(candidates);
    expect(deduped).toHaveLength(1);
  });

  it("keeps different packages separate", () => {
    const candidates = [makeCandidate({ name: "express" }), makeCandidate({ name: "koa" })];
    expect(deduplicate(candidates)).toHaveLength(2);
  });

  it("preserves matchedQueryCount when keeping the higher-popularity duplicate", () => {
    const candidates = [
      makeCandidate({ name: "express", stars: 60000, matchedQueryCount: 3 }),
      makeCandidate({ name: "express", stars: 50000, matchedQueryCount: 1 }),
    ];
    const deduped = deduplicate(candidates);
    expect(deduped[0]!.stars).toBe(60000);
    expect(deduped[0]!.matchedQueryCount).toBe(3);
  });

  it("preserves the higher matchedQueryCount even when keeping the lower-popularity duplicate", () => {
    const candidates = [
      makeCandidate({ name: "express", stars: 60000, matchedQueryCount: 1 }),
      makeCandidate({ name: "express", stars: 50000, matchedQueryCount: 3 }),
    ];
    const deduped = deduplicate(candidates);
    expect(deduped[0]!.stars).toBe(60000);
    expect(deduped[0]!.matchedQueryCount).toBe(3);
  });
});
