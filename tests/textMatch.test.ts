import { describe, expect, it } from "vitest";
import { tokenize, tokenMatches } from "../src/textMatch.js";

describe("tokenize", () => {
  it("splits on non-alphanumeric characters", () => {
    expect(tokenize("markdown-it")).toEqual(["markdown", "it"]);
    expect(tokenize("@scope/pkg-name")).toEqual(["scope", "pkg", "name"]);
    expect(tokenize("hello world")).toEqual(["hello", "world"]);
  });

  it("lowercases input", () => {
    expect(tokenize("MarkdownParser")).toEqual(["markdownparser"]);
  });

  it("returns empty array for empty string", () => {
    expect(tokenize("")).toEqual([]);
  });

  it("handles special characters only", () => {
    expect(tokenize("---")).toEqual([]);
    expect(tokenize("@#$")).toEqual([]);
  });
});

describe("tokenMatches", () => {
  it("matches exact token", () => {
    expect(tokenMatches("markdown", ["markdown", "parser"])).toBe(true);
  });

  it("matches token prefix (slide → slides)", () => {
    expect(tokenMatches("slide", ["slides", "framework"])).toBe(true);
  });

  it("does NOT match substring (search → research)", () => {
    expect(tokenMatches("search", ["research"])).toBe(false);
  });

  it("does NOT match substring (css → scss)", () => {
    expect(tokenMatches("css", ["scss"])).toBe(false);
  });

  it("matches hyphenated package names (markdown → markdown-it)", () => {
    expect(tokenMatches("markdown", ["markdown", "it"])).toBe(true);
  });

  it("returns false for empty tokens", () => {
    expect(tokenMatches("markdown", [])).toBe(false);
  });
});
