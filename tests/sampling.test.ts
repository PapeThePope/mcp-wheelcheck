import { describe, expect, it, vi } from "vitest";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  generateLlmQueries,
  scoreWithLlm,
  formatLlmScoredResults,
  formatFallbackResults,
  type LlmScoredCandidate,
} from "../src/sampling.js";
import type { PackageCandidate } from "../src/types.js";

function makeMockServer(responseText: string): Server {
  return {
    createMessage: vi.fn().mockResolvedValue({
      content: { type: "text" as const, text: responseText },
      role: "assistant",
      model: "test-model",
    }),
  } as unknown as Server;
}

function makeRejectingServer(error: unknown): Server {
  return {
    createMessage: vi.fn().mockRejectedValue(error),
  } as unknown as Server;
}

function makeCandidate(overrides: Partial<PackageCandidate> = {}): PackageCandidate {
  return {
    name: "test-pkg",
    registry: "npm",
    description: "A test package",
    url: "https://example.com/test-pkg",
    keywords: [],
    ...overrides,
  };
}

describe("generateLlmQueries", () => {
  it("parses 3 queries from LLM response", async () => {
    const server = makeMockServer("markdown slides\npresentation tool\nslide generator");
    const queries = await generateLlmQueries(server, "convert markdown to slides");
    expect(queries).toEqual(["markdown slides", "presentation tool", "slide generator"]);
  });

  it("strips numbering and quotes from queries", async () => {
    const server = makeMockServer('1. "markdown slides"\n2. presentation tool\n3. slide generator');
    const queries = await generateLlmQueries(server, "convert markdown to slides");
    expect(queries).toEqual(["markdown slides", "presentation tool", "slide generator"]);
  });

  it("returns null for empty response", async () => {
    const server = makeMockServer("");
    const queries = await generateLlmQueries(server, "convert markdown to slides");
    expect(queries).toBeNull();
  });

  it("returns null when createMessage rejects", async () => {
    const server = makeRejectingServer(new Error("sampling not supported"));
    const queries = await generateLlmQueries(server, "convert markdown to slides");
    expect(queries).toBeNull();
  });

  it("returns null on non-text content", async () => {
    const server = {
      createMessage: vi.fn().mockResolvedValue({
        content: { type: "image", data: "..." },
      }),
    } as unknown as Server;
    const queries = await generateLlmQueries(server, "convert markdown to slides");
    expect(queries).toBeNull();
  });
});

describe("scoreWithLlm", () => {
  it("classifies candidates from LLM response", async () => {
    const candidates = [
      makeCandidate({ name: "slidev" }),
      makeCandidate({ name: "express" }),
      makeCandidate({ name: "react" }),
    ];
    const server = makeMockServer("1. EXACT_MATCH 95\n2. UNRELATED 10\n3. PARTIAL_MATCH 50");
    const scored = await scoreWithLlm(server, "markdown to slides", candidates);

    expect(scored).not.toBeNull();
    expect(scored).toHaveLength(3);
    expect(scored![0]!.classification).toBe("EXACT_MATCH");
    expect(scored![0]!.llmScore).toBe(95);
    expect(scored![1]!.classification).toBe("UNRELATED");
    expect(scored![2]!.classification).toBe("PARTIAL_MATCH");
  });

  it("returns [] for empty candidates", async () => {
    const server = makeMockServer("");
    const scored = await scoreWithLlm(server, "anything", []);
    expect(scored).toEqual([]);
  });

  it("returns null when LLM response is completely unparseable", async () => {
    const candidates = [makeCandidate({ name: "slidev" })];
    const server = makeMockServer("I think slidev is great!");
    const scored = await scoreWithLlm(server, "markdown to slides", candidates);
    expect(scored).toBeNull();
  });

  it("marks unparseable lines as UNRELATED", async () => {
    const candidates = [makeCandidate({ name: "slidev" }), makeCandidate({ name: "express" })];
    const server = makeMockServer("1. EXACT_MATCH 95\nsecond line is garbage");
    const scored = await scoreWithLlm(server, "markdown to slides", candidates);

    expect(scored).not.toBeNull();
    expect(scored).toHaveLength(2);
    expect(scored![0]!.classification).toBe("EXACT_MATCH");
    expect(scored![1]!.classification).toBe("UNRELATED");
    expect(scored![1]!.llmScore).toBe(0);
  });

  it("returns null when createMessage rejects", async () => {
    const server = makeRejectingServer(new Error("timeout"));
    const scored = await scoreWithLlm(server, "anything", [makeCandidate()]);
    expect(scored).toBeNull();
  });

  it("handles lowercase classifications", async () => {
    const candidates = [makeCandidate({ name: "slidev" })];
    const server = makeMockServer("1. exact_match 90");
    const scored = await scoreWithLlm(server, "markdown to slides", candidates);
    expect(scored).not.toBeNull();
    expect(scored![0]!.classification).toBe("EXACT_MATCH");
  });
});

describe("formatLlmScoredResults", () => {
  function makeScored(
    classification: LlmScoredCandidate["classification"],
    score: number,
    candidate: Partial<PackageCandidate> = {},
  ): LlmScoredCandidate {
    return {
      candidate: makeCandidate(candidate),
      classification,
      llmScore: score,
      algorithmicScore: 0,
    };
  }

  it("gives USE_EXISTING verdict for high-confidence exact match", () => {
    const text = formatLlmScoredResults(
      "desc",
      ["q1"],
      [makeScored("EXACT_MATCH", 85, { name: "slidev" })],
      true,
      [],
    );
    expect(text).toContain("USE_EXISTING");
    expect(text).toContain("slidev");
  });

  it("gives MIXED verdict for partial match", () => {
    const text = formatLlmScoredResults(
      "desc",
      ["q1"],
      [makeScored("PARTIAL_MATCH", 50)],
      true,
      [],
    );
    expect(text).toContain("MIXED");
  });

  it("gives BUILD_NEW verdict when all unrelated", () => {
    const text = formatLlmScoredResults("desc", ["q1"], [makeScored("UNRELATED", 10)], true, []);
    expect(text).toContain("BUILD_NEW");
  });

  it("filters out UNRELATED from relevant section", () => {
    const scored = [
      makeScored("EXACT_MATCH", 90, { name: "slidev" }),
      makeScored("UNRELATED", 5, { name: "express" }),
    ];
    const text = formatLlmScoredResults("desc", ["q1"], scored, true, []);
    expect(text).toContain("slidev");
    expect(text).toContain("express");
    expect(text.indexOf("slidev")).toBeLessThan(text.indexOf("express"));
  });

  it("includes errors section when errors present", () => {
    const text = formatLlmScoredResults("desc", ["q1"], [], true, [
      { registry: "github", error: "rate limit exceeded" },
    ]);
    expect(text).toContain("Errors");
    expect(text).toContain("github: rate limit exceeded");
  });
});

describe("formatFallbackResults", () => {
  it("shows 'LLM scoring unavailable' header", () => {
    const text = formatFallbackResults("desc", ["kw"], ["q1"], [], false, []);
    expect(text).toContain("LLM scoring unavailable");
  });

  it("notes when LLM queries were used", () => {
    const text = formatFallbackResults("desc", ["kw"], ["q1"], [], true, []);
    expect(text).toContain("LLM queries were used");
  });

  it("lists candidates with composite scores", () => {
    const scored = [
      {
        candidate: makeCandidate({ name: "slidev", description: "slides", stars: 36000 }),
        score: 0.8,
        breakdown: { relevance: 0.9, popularity: 0.7, recency: 1 },
      },
    ];
    const text = formatFallbackResults("desc", ["kw"], ["q1"], scored, false, []);
    expect(text).toContain("slidev");
    expect(text).toContain("80%");
  });

  it("does NOT include LLM instructions section", () => {
    const text = formatFallbackResults("desc", ["kw"], ["q1"], [], false, []);
    expect(text).not.toContain("LLM instructions");
    expect(text).not.toContain("EXACT_MATCH");
  });
});
