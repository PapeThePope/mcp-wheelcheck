import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RegistryHub } from "../registries/index.js";
import type { PackageCandidate, Registry } from "../types.js";

const GetPackageInput = {
  registry: z.enum(["npm", "pypi", "crates", "github"]).describe("Which registry the package lives in"),
  name: z
    .string()
    .describe("Package name. For github, use 'owner/repo' format."),
};

export function registerGetPackageTool(server: McpServer, hub: RegistryHub): void {
  server.registerTool(
    "get_package_details",
    {
      title: "Get Package Details",
      description:
        "Fetch detailed metadata for a specific package or repository: description, homepage, repository URL, version, last update, keywords. Use this after search_ecosystem/find_similar to inspect a promising candidate in detail before deciding use-vs-build.",
      inputSchema: GetPackageInput,
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      const registry = args.registry as Registry;
      const details = await hub.getDetails(registry, args.name);
      if (!details) {
        return {
          content: [{ type: "text", text: `Package "${args.name}" not found in ${registry}.` }],
          isError: true,
        };
      }
      const text = formatDetails(details);
      return { content: [{ type: "text", text }] };
    },
  );
}

function formatDetails(d: PackageCandidate): string {
  const lines: string[] = [];
  lines.push(`# ${d.name} [${d.registry}]`);
  if (d.description) lines.push(`\n${d.description}`);
  lines.push("");
  lines.push(`- URL: ${d.url}`);
  if (d.homepage) lines.push(`- Homepage: ${d.homepage}`);
  if (d.repository) lines.push(`- Repository: ${d.repository}`);
  if (d.version) lines.push(`- Version: ${d.version}`);
  if (d.language) lines.push(`- Language: ${d.language}`);
  if (d.stars != null) lines.push(`- Stars: ${d.stars}`);
  if (d.downloads != null) lines.push(`- Downloads: ${d.downloads}`);
  if (d.updatedAt) lines.push(`- Last updated: ${d.updatedAt}`);
  if (d.keywords.length > 0) lines.push(`- Keywords: ${d.keywords.join(", ")}`);
  return lines.join("\n");
}
