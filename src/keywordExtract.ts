const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "must",
  "can",
  "shall",
  "to",
  "of",
  "in",
  "on",
  "at",
  "by",
  "for",
  "with",
  "about",
  "as",
  "into",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "from",
  "up",
  "down",
  "out",
  "off",
  "over",
  "under",
  "again",
  "further",
  "then",
  "once",
  "here",
  "there",
  "when",
  "where",
  "why",
  "how",
  "all",
  "each",
  "every",
  "both",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "no",
  "not",
  "only",
  "own",
  "same",
  "so",
  "than",
  "too",
  "very",
  "s",
  "t",
  "just",
  "i",
  "me",
  "my",
  "we",
  "our",
  "you",
  "your",
  "he",
  "she",
  "it",
  "they",
  "them",
  "their",
  "what",
  "which",
  "who",
  "whom",
  "this",
  "that",
  "these",
  "those",
  "build",
  "tool",
  "create",
  "make",
  "want",
  "need",
  "like",
  "something",
  "thing",
  "stuff",
  "able",
  "get",
  "got",
  "use",
  "using",
  "used",
  "via",
  "etc",
  "also",
  "one",
  "two",
  "three",
  "new",
  "old",
  "good",
  "bad",
  "lets",
  "allow",
  "allows",
  "help",
  "helps",
  "give",
  "gives",
]);

// Generic tech-context nouns that describe the *delivery mechanism* (server,
// client, protocol, sdk, ...) rather than the *capability*. These are NOT
// removed — they can still be useful — but they are sorted after intent and
// normal words so they don't crowd out the distinguishing terms. This fixes
// protocol-adjacent queries like "an MCP server that checks ..." where the
// old extractor latched onto "mcp model context" and missed "checks/exists".
const DIM_WORDS = new Set([
  "server",
  "client",
  "protocol",
  "model",
  "context",
  "api",
  "http",
  "https",
  "json",
  "yaml",
  "xml",
  "rpc",
  "rest",
  "graphql",
  "sdk",
  "plugin",
  "module",
  "library",
  "framework",
  "package",
  "app",
  "application",
  "system",
  "service",
  "endpoint",
  "daemon",
  "cli",
  "binary",
  "runtime",
  "engine",
  "wrapper",
  "adapter",
  "connector",
  "handler",
  "controller",
  "manager",
  "provider",
  "mcp",
  "grpc",
  "websocket",
  "stdio",
  "transport",
  "config",
  "configuration",
  "github",
  "npm",
  "pypi",
  "crates",
  "cargo",
  "repo",
  "repository",
  "source",
  "open",
  "opensource",
  "ecosystem",
  "registry",
  "agent",
  "assistant",
  "bot",
]);

// Action/intent verbs that signal what a tool *does*. Boosted to the front of
// the keyword list so generated search queries describe the capability rather
// than the container it ships in.
const INTENT_WORDS = new Set([
  "search",
  "find",
  "check",
  "detect",
  "convert",
  "recommend",
  "rank",
  "suggest",
  "prevent",
  "avoid",
  "monitor",
  "track",
  "scan",
  "parse",
  "generate",
  "transform",
  "sync",
  "synchronize",
  "migrate",
  "validate",
  "lint",
  "format",
  "analyze",
  "compare",
  "match",
  "discover",
  "explore",
  "fetch",
  "query",
  "inspect",
  "exists",
  "detects",
  "checks",
  "searches",
  "finds",
  "returns",
  "ranks",
  "scores",
  "filters",
  "deduplicate",
  "autocomplete",
  "complete",
  "translate",
  "transpile",
  "compile",
  "render",
  "export",
  "import",
  "download",
  "upload",
  "backup",
  "restore",
]);

function tokenTier(word: string): 0 | 1 | 2 {
  if (INTENT_WORDS.has(word)) return 0;
  if (DIM_WORDS.has(word)) return 2;
  return 1;
}

export function extractKeywords(text: string, limit = 8): string[] {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));

  const unigramFreq = new Map<string, number>();
  for (const t of tokens) unigramFreq.set(t, (unigramFreq.get(t) ?? 0) + 1);

  const bigramFreq = new Map<string, number>();
  for (let i = 0; i < tokens.length - 1; i++) {
    const bg = `${tokens[i]} ${tokens[i + 1]}`;
    bigramFreq.set(bg, (bigramFreq.get(bg) ?? 0) + 1);
  }

  const topUnigrams = [...unigramFreq.entries()]
    .sort((a, b) => {
      const ta = tokenTier(a[0]);
      const tb = tokenTier(b[0]);
      if (ta !== tb) return ta - tb;
      return b[1] - a[1];
    })
    .map(([k]) => k);

  const topBigrams = [...bigramFreq.entries()]
    .sort((a, b) => {
      const [a1, a2] = a[0].split(" ");
      const [b1, b2] = b[0].split(" ");
      const ta = Math.min(tokenTier(a1 ?? ""), tokenTier(a2 ?? ""));
      const tb = Math.min(tokenTier(b1 ?? ""), tokenTier(b2 ?? ""));
      if (ta !== tb) return ta - tb;
      return b[1] - a[1];
    })
    .map(([k]) => k);

  const result: string[] = [];
  for (const u of topUnigrams) {
    if (result.length >= limit) break;
    result.push(u);
  }
  for (const b of topBigrams) {
    if (result.length >= limit) break;
    result.push(b);
  }
  return result;
}

export function buildSearchQuery(keywords: string[]): string {
  return keywords.slice(0, 3).join(" ");
}

export function buildSearchQueries(keywords: string[]): string[] {
  const unigrams = keywords.filter((k) => !k.includes(" "));
  const bigrams = keywords.filter((k) => k.includes(" "));

  const isDimOnly = (terms: string[]): boolean =>
    terms.length > 0 && terms.every((t) => tokenTier(t) === 2);

  const candidateQueries: string[] = [];

  if (unigrams.length >= 3) {
    candidateQueries.push(unigrams.slice(0, 3).join(" "));
  } else if (unigrams.length > 0) {
    candidateQueries.push(unigrams.join(" "));
  }

  if (unigrams.length >= 5) {
    candidateQueries.push(unigrams.slice(2, 5).join(" "));
  }

  if (unigrams.length >= 7) {
    candidateQueries.push(unigrams.slice(4, 7).join(" "));
  }

  const topBigram = bigrams[0];
  const topUnigram = unigrams.find((u) => topBigram && !topBigram.includes(u));
  if (topBigram && topUnigram) {
    candidateQueries.push(`${topBigram} ${topUnigram}`);
  } else if (topBigram) {
    candidateQueries.push(topBigram);
  }

  for (const bg of bigrams.slice(1)) {
    candidateQueries.push(bg);
  }

  if (candidateQueries.length === 0 && keywords.length > 0) {
    candidateQueries.push(keywords.slice(0, 3).join(" "));
  }

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const q of candidateQueries) {
    const terms = q.split(" ");
    if (terms.length === 0 || isDimOnly(terms)) continue;
    if (seen.has(q)) continue;
    seen.add(q);
    unique.push(q);
    if (unique.length >= 3) break;
  }

  return unique;
}
