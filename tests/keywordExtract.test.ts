import { describe, expect, it } from "vitest";
import { buildSearchQueries, buildSearchQuery, extractKeywords } from "../src/keywordExtract.js";

describe("extractKeywords", () => {
  it("extracts meaningful tokens from a feature description", () => {
    const kws = extractKeywords(
      "convert markdown files into presentation slides with live code execution",
      8,
    );
    expect(kws).toContain("markdown");
    expect(kws).toContain("presentation");
    expect(kws).toContain("slides");
    expect(kws).toContain("code");
    expect(kws).toContain("execution");
  });

  it("drops stopwords and short tokens", () => {
    const kws = extractKeywords("a tool to make the thing that lets you do stuff", 20);
    expect(kws).not.toContain("a");
    expect(kws).not.toContain("to");
    expect(kws).not.toContain("the");
    expect(kws).not.toContain("tool");
    expect(kws).not.toContain("thing");
    expect(kws).not.toContain("stuff");
  });

  it("produces bigrams with a boost", () => {
    const kws = extractKeywords("convert markdown files into presentation slides", 10);
    expect(kws.some((k) => k.includes(" "))).toBe(true);
  });

  it("handles empty input", () => {
    expect(extractKeywords("", 8)).toEqual([]);
    expect(extractKeywords("the a an of to", 8)).toEqual([]);
  });

  it("respects the limit", () => {
    const kws = extractKeywords("alpha beta gamma delta epsilon zeta eta theta", 3);
    expect(kws.length).toBeLessThanOrEqual(3);
  });

  it("boosts intent verbs over dim framework nouns for protocol-adjacent descriptions", () => {
    const kws = extractKeywords(
      "An MCP server that checks whether a feature already exists in the open-source ecosystem (npm, PyPI, crates.io) and GitHub in parallel and returns ranked candidates with descriptions, stars, downloads, and links.",
      10,
    );
    const head = kws.slice(0, 3);
    expect(head).toContain("checks");
    expect(head).toContain("exists");
    expect(head).not.toEqual(["mcp", "server", "github"]);
  });

  it("demotes dim words (server/client/protocol) below normal nouns", () => {
    const kws = extractKeywords("a server that validates markdown links and checks anchors", 8);
    const validateIdx = kws.indexOf("validates");
    const serverIdx = kws.indexOf("server");
    expect(validateIdx).toBeGreaterThanOrEqual(0);
    expect(serverIdx).toBeGreaterThanOrEqual(0);
    expect(validateIdx).toBeLessThan(serverIdx);
  });

  it("still includes dim words when needed (not removed, only demoted)", () => {
    const kws = extractKeywords("an http server with json middleware", 8);
    expect(kws).toContain("server");
    expect(kws).toContain("http");
    expect(kws).toContain("json");
    expect(kws).toContain("middleware");
  });
});

describe("buildSearchQuery", () => {
  it("joins the top 3 keywords with spaces", () => {
    expect(buildSearchQuery(["alpha", "beta", "gamma", "delta"])).toBe("alpha beta gamma");
  });

  it("handles fewer than 3 keywords", () => {
    expect(buildSearchQuery(["alpha"])).toBe("alpha");
    expect(buildSearchQuery([])).toBe("");
  });
});

describe("buildSearchQueries", () => {
  it("generates multiple queries from enough keywords", () => {
    const kws = extractKeywords(
      "convert markdown files into presentation slides with live code execution",
      10,
    );
    const queries = buildSearchQueries(kws);
    expect(queries.length).toBeGreaterThanOrEqual(2);
    expect(queries.length).toBeLessThanOrEqual(3);
    expect(queries[0]).toBeTruthy();
  });

  it("generates at least one query from few keywords", () => {
    const queries = buildSearchQueries(["markdown", "parser"]);
    expect(queries.length).toBeGreaterThanOrEqual(1);
  });

  it("returns empty array for no keywords", () => {
    expect(buildSearchQueries([])).toEqual([]);
  });

  it("includes bigrams in queries when available", () => {
    const kws = ["markdown", "parser", "html", "markdown parser", "parser html"];
    const queries = buildSearchQueries(kws);
    expect(queries.some((q) => q.includes("markdown parser"))).toBe(true);
  });

  it("does not emit dim-only queries (avoids registry 400 on stopword-heavy input)", () => {
    const queries = buildSearchQueries(["mcp", "server", "model", "context", "protocol"]);
    expect(queries).toHaveLength(0);
  });

  it("skips a dim-only query but keeps mixed queries", () => {
    const queries = buildSearchQueries(["mcp", "server", "search", "find"]);
    expect(queries.length).toBeGreaterThanOrEqual(1);
    for (const q of queries) {
      expect(q.split(" ")).toContain("search");
    }
  });

  it("never produces duplicate queries", () => {
    const kws = extractKeywords(
      "convert markdown files into presentation slides with live code execution",
      10,
    );
    const queries = buildSearchQueries(kws);
    const unique = new Set(queries);
    expect(queries.length).toBe(unique.size);
  });

  it("produces diverse queries from the markdown-slides description", () => {
    const kws = extractKeywords(
      "convert markdown files into presentation slides with live code execution",
      10,
    );
    const queries = buildSearchQueries(kws);
    expect(queries.length).toBeGreaterThanOrEqual(2);
    const termSets = queries.map((q) => new Set(q.split(" ")));
    for (let i = 0; i < termSets.length; i++) {
      for (let j = i + 1; j < termSets.length; j++) {
        const overlap = [...termSets[i]!].filter((t) => termSets[j]!.has(t));
        expect(overlap.length).toBeLessThan(termSets[i]!.size);
      }
    }
  });
});
