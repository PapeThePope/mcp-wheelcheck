import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RegistryHub } from "../registries/index.js";
import type { PackageCandidate, Registry } from "../types.js";
import { extractKeywords } from "../keywordExtract.js";
import { filterByRelevance, filterNoise } from "../filters.js";
import { deduplicate, scoreAndRank, type ScoredCandidate } from "../ranking.js";

const SearchInput = {
  query: z
    .string()
    .describe("Free-text search query: keywords or a short feature description"),
  registries: z
    .array(z.enum(["npm", "crates", "github"]))
    .optional()
    .describe("Registries to search. Defaults to all three (npm, crates.io, GitHub). PyPI search is unavailable — use get_package_details for PyPI lookups."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Max candidates per registry. Defaults to 10."),
};

export function registerSearchTool(server: McpServer, hub: RegistryHub): void {
  server.registerTool(
    "search_ecosystem",
    {
      title: "Search Open-Source Ecosystem",
      description:
        "Search npm, crates.io, and GitHub for existing packages/repos matching a query. Filters out noise (awesome-lists etc.), deduplicates cross-registry results, and ranks by composite score (relevance + popularity + recency). Use this to check if a tool/feature already exists before building it yourself.",
      inputSchema: SearchInput,
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      const registries = (args.registries as Registry[] | undefined) ?? hub.listRegistries();
      const limit = args.limit ?? 10;

      const { candidates, errors } = await hub.searchAll(args.query, { registries, limit });

      const queryKeywords = extractKeywords(args.query, 10);
      const processed = postProcess(candidates, queryKeywords, limit * registries.length);

      const text = formatSearchResults(args.query, processed, errors);
      return { content: [{ type: "text", text }] };
    },
  );
}

export function postProcess(
  candidates: PackageCandidate[],
  queryKeywords: string[],
  maxResults: number,
): ScoredCandidate[] {
  const filtered = filterNoise(candidates);
  const relevant = filterByRelevance(filtered, queryKeywords);
  const deduped = deduplicate(relevant);
  return scoreAndRank(queryKeywords, deduped).slice(0, maxResults);
}

function formatSearchResults(
  query: string,
  scored: ScoredCandidate[],
  errors: Array<{ registry: Registry; error: string }>,
): string {
  const lines: string[] = [];
  lines.push(`# Search: "${query}"`);
  lines.push(`Found ${scored.length} candidates (after filtering, dedup, and ranking).`);
  if (errors.length > 0) {
    lines.push("");
    lines.push("## Errors");
    for (const e of errors) lines.push(`- ${e.registry}: ${e.error}`);
  }
  lines.push("");
  lines.push("## Candidates (ranked by composite score)");
  if (scored.length === 0) {
    lines.push("No candidates found. Try different keywords or the feature may be novel.");
  } else {
    for (const { candidate: c, score, breakdown } of scored) {
      const pop = formatPopularity(c);
      const scorePct = Math.round(score * 100);
      lines.push(
        `- **${c.name}** [${c.registry}] ${pop} — score: ${scorePct}% (rel ${Math.round(breakdown.relevance * 100)}%, pop ${Math.round(breakdown.popularity * 100)}%, rec ${Math.round(breakdown.recency * 100)}%)`,
      );
      if (c.description) lines.push(`  ${c.description}`);
      lines.push(`  ${c.url}`);
      if (c.keywords.length > 0) lines.push(`  keywords: ${c.keywords.slice(0, 8).join(", ")}`);
    }
  }
  return lines.join("\n");
}

function formatPopularity(c: PackageCandidate): string {
  if (c.stars != null) return `★ ${c.stars}`;
  if (c.downloads != null) return `↓ ${c.downloads}`;
  return "";
}
