import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RegistryHub } from "../registries/index.js";
import type { PackageCandidate, Registry } from "../types.js";
import { buildSearchQueries, extractKeywords } from "../keywordExtract.js";
import { filterNoise } from "../filters.js";
import { deduplicate, normalizeName, scoreAndRank, type ScoredCandidate } from "../ranking.js";
import {
  formatLlmScoredResults,
  formatFallbackResults,
  generateLlmQueries,
  scoreWithLlm,
} from "../sampling.js";

const FindSimilarInput = {
  feature_description: z
    .string()
    .describe(
      "Natural-language description of the feature/tool you want to build. Example: 'convert markdown files into presentation slides with live code execution'",
    ),
  languages: z
    .array(z.string())
    .optional()
    .describe(
      "Preferred languages (e.g. ['typescript', 'python']). Influences which registries are queried.",
    ),
  registries: z
    .array(z.enum(["npm", "crates", "github"]))
    .optional()
    .describe(
      "Registries to search. If omitted, inferred from languages or defaults to npm + crates + GitHub. PyPI search is unavailable — use get_package_details for PyPI lookups.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe(
      "Max results to return. Defaults to 10. Also controls search breadth per registry per query.",
    ),
};

const LLM_CANDIDATE_CAP = 10;

export function registerFindSimilarTool(server: McpServer, hub: RegistryHub): void {
  server.registerTool(
    "find_similar",
    {
      title: "Find Similar Existing Tools",
      description:
        "Given a feature description in natural language, searches npm, crates.io, and GitHub for existing tools that already do what you want. Uses LLM-assisted query generation and semantic result scoring via MCP sampling. Use this BEFORE writing code to avoid reinventing the wheel.",
      inputSchema: FindSimilarInput,
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      let registries = args.registries as Registry[] | undefined;
      if (!registries) {
        const langs = (args.languages ?? []).map((l) => l.toLowerCase());
        const inferred = new Set<Registry>();
        if (langs.includes("typescript") || langs.includes("javascript") || langs.includes("node"))
          inferred.add("npm");
        if (langs.includes("rust")) inferred.add("crates");
        if (inferred.size === 0) {
          registries = hub.listRegistries();
        } else {
          inferred.add("github");
          registries = [...inferred];
        }
      }

      const limit = args.limit ?? 10;
      const keywords = extractKeywords(args.feature_description, 10);

      const llmQueries = await generateLlmQueries(server.server, args.feature_description);
      const queries = llmQueries ? [...new Set(llmQueries)] : buildSearchQueries(keywords);

      const queryResults = await Promise.all(
        queries.map(async (query) => {
          const result = await hub.searchAll(query, { registries, limit });
          return { query, ...result };
        }),
      );

      const rawCandidates: PackageCandidate[] = [];
      const errors: Array<{ registry: Registry; error: string }> = [];

      for (const { candidates, errors: qErrors } of queryResults) {
        rawCandidates.push(...candidates);
        for (const e of qErrors) {
          if (!errors.some((existing) => existing.registry === e.registry)) {
            errors.push(e);
          }
        }
      }

      const matchCounts = new Map<string, number>();
      for (const c of rawCandidates) {
        const key = normalizeName(c.name);
        matchCounts.set(key, (matchCounts.get(key) ?? 0) + 1);
      }
      const allCandidates = rawCandidates.map((c) => ({
        ...c,
        matchedQueryCount: matchCounts.get(normalizeName(c.name)) ?? 1,
      }));

      const filtered = filterNoise(allCandidates);
      const deduped = deduplicate(filtered);
      const algorithmicScored = scoreAndRank(keywords, deduped);

      const topCandidates = algorithmicScored
        .slice(0, Math.min(LLM_CANDIDATE_CAP, limit))
        .map((s) => s.candidate);

      const llmScored = await scoreWithLlm(server.server, args.feature_description, topCandidates);

      if (llmScored) {
        const trimmed = llmScored.filter((s) => s.classification !== "UNRELATED").slice(0, limit);
        const text = formatLlmScoredResults(
          args.feature_description,
          queries,
          trimmed.length > 0 ? trimmed : llmScored.slice(0, limit),
          true,
          errors,
        );
        return { content: [{ type: "text", text }] };
      }

      const scored = algorithmicScored.filter((s) => s.breakdown.relevance > 0).slice(0, limit);
      const text = formatFallbackResults(
        args.feature_description,
        keywords,
        queries,
        scored,
        llmQueries !== null,
        errors,
      );
      return { content: [{ type: "text", text }] };
    },
  );
}
