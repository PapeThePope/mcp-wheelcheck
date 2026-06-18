import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { RegistryHub } from "./registries/index.js";
import { registerSearchTool } from "./tools/search.js";
import { registerFindSimilarTool } from "./tools/findSimilar.js";
import { registerGetPackageTool } from "./tools/getPackage.js";

const SERVER_NAME = "mcp-wheelcheck";
const SERVER_VERSION = "1.0.0";

const server = new McpServer({
  name: SERVER_NAME,
  version: SERVER_VERSION,
});

const hub = new RegistryHub();

registerSearchTool(server, hub);
registerFindSimilarTool(server, hub);
registerGetPackageTool(server, hub);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Failed to start mcp-wheelcheck:", err);
  process.exit(1);
});
