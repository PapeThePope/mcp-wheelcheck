import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { PackageCandidate, Registry } from "./types.js";
import type { ScoredCandidate } from "./ranking.js";

const SAMPLING_TIMEOUT_MS = 60000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Sampling timed out after ${ms}ms`)), ms),
    ),
  ]);
}

export interface LlmScoredCandidate {
  candidate: PackageCandidate;
  classification: "EXACT_MATCH" | "PARTIAL_MATCH" | "UNRELATED";
  llmScore: number;
  algorithmicScore: number;
}

export async function generateLlmQueries(
  server: Server,
  featureDescription: string,
): Promise<string[] | null> {
  try {
    const response = await withTimeout(
      server.createMessage({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `You are a search query generator for software package registries (npm, crates.io, GitHub).

Given a feature description, generate exactly 3 short search queries (2-4 words each) that would find existing open-source packages implementing this feature. Think about what keywords developers would use to name such a package.

Return ONLY the 3 queries, one per line. No numbering, no explanation, no quotes.

Feature description: ${featureDescription}

Queries:`,
            },
          },
        ],
        maxTokens: 2000,
      }),
      SAMPLING_TIMEOUT_MS,
    );

    if (response.content.type !== "text") return null;
    const text = response.content.text;
    const queries = response.content.text
      .split("\n")
      .map((l) => l.trim().replace(/^["'\d.\s]+|["']/g, ""))
      .filter((l) => l.length > 0 && l.length < 100)
      .slice(0, 3);

    return queries.length > 0 ? queries : null;
  } catch {
    return null;
  }
}

export async function scoreWithLlm(
  server: Server,
  featureDescription: string,
  candidates: PackageCandidate[],
): Promise<LlmScoredCandidate[] | null> {
  if (candidates.length === 0) return [];

  try {
    const candidateList = candidates
      .map((c, i) => `${i + 1}. ${c.name} [${c.registry}] - ${c.description ?? "(no description)"}`)
      .join("\n");

    const response = await withTimeout(
      server.createMessage({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `You are a search result evaluator. Given a feature description and a list of candidates, classify each as EXACT_MATCH, PARTIAL_MATCH, or UNRELATED, and give a relevance score (0-100).

Feature description: ${featureDescription}

Candidates:
${candidateList}

Return one line per candidate in the exact format: N. CLASSIFICATION SCORE
Example: 1. EXACT_MATCH 95

Do not include any other text.`,
            },
          },
        ],
        maxTokens: Math.min(candidates.length * 600 + 4000, 16000),
      }),
      SAMPLING_TIMEOUT_MS,
    );

    if (response.content.type !== "text") return null;

    const lines = response.content.text.split("\n");
    const scores = new Map<number, { classification: string; score: number }>();

    for (const line of lines) {
      const m = line.trim().match(/^(\d+)\.\s*(EXACT_MATCH|PARTIAL_MATCH|UNRELATED)\s+(\d+)/i);
      if (m) {
        const idx = parseInt(m[1]!, 10) - 1;
        const classification = m[2]!.toUpperCase();
        const score = parseInt(m[3]!, 10);
        scores.set(idx, { classification, score });
      }
    }

    if (scores.size === 0) return null;

    return candidates.map((c, i) => {
      const llmResult = scores.get(i);
      return {
        candidate: c,
        classification:
          (llmResult?.classification as LlmScoredCandidate["classification"]) ?? "UNRELATED",
        llmScore: llmResult?.score ?? 0,
        algorithmicScore: 0,
      };
    });
  } catch {
    return null;
  }
}

export function formatFallbackResults(
  featureDescription: string,
  keywords: string[],
  queries: string[],
  scored: ScoredCandidate[],
  llmQueriesUsed: boolean,
  errors: Array<{ registry: Registry; error: string }>,
): string {
  const lines: string[] = [];
  lines.push("# Find Similar Existing Tools");
  lines.push(
    `## LLM scoring unavailable — showing algorithmically ranked candidates${llmQueriesUsed ? " (LLM queries were used)" : ""}`,
  );
  lines.push("");
  lines.push("## Your feature description");
  lines.push(`> ${featureDescription}`);
  lines.push("");
  lines.push("## Extracted keywords");
  lines.push(keywords.join(", "));
  lines.push(`(search queries: ${queries.map((q) => `"${q}"`).join(", ")})`);
  lines.push("");
  lines.push("## Candidates (ranked by composite score)");
  if (scored.length === 0) {
    lines.push("No candidates found. This feature may be novel, or refine your description.");
  } else {
    for (const { candidate: c, score, breakdown } of scored) {
      const pop = c.stars != null ? `★ ${c.stars}` : c.downloads != null ? `↓ ${c.downloads}` : "";
      const scorePct = Math.round(score * 100);
      lines.push(
        `- **${c.name}** [${c.registry}] ${pop} — score: ${scorePct}% (rel ${Math.round(breakdown.relevance * 100)}%, pop ${Math.round(breakdown.popularity * 100)}%, rec ${Math.round(breakdown.recency * 100)}%)`,
      );
      if (c.description) lines.push(`  ${c.description}`);
      lines.push(`  ${c.url}`);
      if (c.keywords.length > 0) lines.push(`  keywords: ${c.keywords.slice(0, 8).join(", ")}`);
    }
  }
  if (errors.length > 0) {
    lines.push("");
    lines.push("## Errors");
    for (const e of errors) lines.push(`- ${e.registry}: ${e.error}`);
  }
  return lines.join("\n");
}

export function formatLlmScoredResults(
  featureDescription: string,
  queries: string[],
  scored: LlmScoredCandidate[],
  llmUsed: boolean,
  errors: Array<{ registry: Registry; error: string }>,
): string {
  const lines: string[] = [];
  lines.push("# Find Similar Existing Tools");
  lines.push(`## LLM-assisted: ${llmUsed ? "yes" : "no (fell back to algorithmic)"}`);
  lines.push("");
  lines.push("## Your feature description");
  lines.push(`> ${featureDescription}`);
  lines.push("");
  lines.push("## Search queries used");
  lines.push(queries.map((q) => `"${q}"`).join(", "));
  lines.push("");

  const relevant = scored
    .filter((s) => s.classification !== "UNRELATED")
    .sort((a, b) => b.llmScore - a.llmScore);

  const unrelated = scored.filter((s) => s.classification === "UNRELATED");

  lines.push("## Relevant candidates (LLM-scored)");
  if (relevant.length === 0) {
    lines.push("No relevant candidates found. This feature may be novel.");
  } else {
    for (const { candidate: c, classification, llmScore } of relevant) {
      const pop = c.stars != null ? `★ ${c.stars}` : c.downloads != null ? `↓ ${c.downloads}` : "";
      lines.push(`- **${c.name}** [${c.registry}] ${pop} — ${classification} (${llmScore}/100)`);
      if (c.description) lines.push(`  ${c.description}`);
      lines.push(`  ${c.url}`);
      if (c.keywords.length > 0) lines.push(`  keywords: ${c.keywords.slice(0, 8).join(", ")}`);
    }
  }

  if (unrelated.length > 0 && unrelated.length <= 10) {
    lines.push("");
    lines.push("## Unrelated (filtered out by LLM)");
    for (const { candidate: c } of unrelated) {
      lines.push(`- ${c.name} [${c.registry}]`);
    }
  }

  if (errors.length > 0) {
    lines.push("");
    lines.push("## Errors");
    for (const e of errors) lines.push(`- ${e.registry}: ${e.error}`);
  }

  lines.push("");
  lines.push("## Verdict");
  if (relevant.some((s) => s.classification === "EXACT_MATCH" && s.llmScore >= 70)) {
    lines.push("USE_EXISTING — high-confidence exact matches found. Do not build from scratch.");
  } else if (
    relevant.some((s) => s.classification === "EXACT_MATCH" || s.classification === "PARTIAL_MATCH")
  ) {
    lines.push(
      "MIXED — existing tools partially cover the feature. Consider using as dependency + building a wrapper.",
    );
  } else {
    lines.push("BUILD_NEW — no existing tools match. Proceed with building.");
  }
  return lines.join("\n");
}
