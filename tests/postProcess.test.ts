import { describe, expect, it } from "vitest";
import { postProcess } from "../src/tools/search.js";
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

describe("postProcess pipeline", () => {
  it("filters noise, deduplicates, ranks, and slices to maxResults", () => {
    const candidates = [
      makeCandidate({ name: "sindresorhus/awesome", registry: "github", stars: 100000 }),
      makeCandidate({
        name: "slidev",
        description: "Presentation slides for developers",
        stars: 36000,
      }),
      makeCandidate({
        name: "slidev",
        description: "Presentation slides for developers",
        stars: 35000,
      }),
      makeCandidate({ name: "express", description: "Web framework", stars: 50000 }),
    ];
    const scored = postProcess(candidates, ["presentation", "slides"], 10);
    const names = scored.map((s) => s.candidate.name);
    expect(names).toContain("slidev");
    expect(names).not.toContain("sindresorhus/awesome");
    expect(names.filter((n) => n === "slidev")).toHaveLength(1);
  });

  it("returns empty array when all candidates are noise", () => {
    const candidates = [
      makeCandidate({ name: "sindresorhus/awesome", registry: "github" }),
      makeCandidate({ name: "codecrafters-io/build-your-own-x", registry: "github" }),
    ];
    const scored = postProcess(candidates, ["anything"], 10);
    expect(scored).toHaveLength(0);
  });

  it("drops candidates with zero relevance to the query keywords", () => {
    const candidates = [
      makeCandidate({ name: "markdown-it", description: "markdown parser", stars: 1000 }),
      makeCandidate({ name: "express", description: "web framework", stars: 50000 }),
    ];
    const scored = postProcess(candidates, ["markdown", "parser"], 10);
    expect(scored).toHaveLength(1);
    expect(scored[0]!.candidate.name).toBe("markdown-it");
  });

  it("respects the maxResults cap", () => {
    const candidates = Array.from({ length: 20 }, (_, i) =>
      makeCandidate({ name: `pkg-${i}`, description: "markdown parser", stars: 1000 - i }),
    );
    const scored = postProcess(candidates, ["markdown", "parser"], 5);
    expect(scored.length).toBeLessThanOrEqual(5);
  });

  it("includes score breakdown on every result", () => {
    const scored = postProcess(
      [makeCandidate({ name: "markdown-it", description: "markdown parser" })],
      ["markdown", "parser"],
      10,
    );
    expect(scored[0]!.breakdown).toHaveProperty("relevance");
    expect(scored[0]!.breakdown).toHaveProperty("popularity");
    expect(scored[0]!.breakdown).toHaveProperty("recency");
  });
});
