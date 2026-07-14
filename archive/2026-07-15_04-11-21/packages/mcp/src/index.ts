/** CryptChat MCP — Main server entry point */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { CryptChatClient } from './sdk-client-full.js';
import { MCP_CONFIG } from './config.js';
import { CHAT_TOOLS } from './schema.js';
import { executeTool } from './tools/executor.js';

// ── Zod type mapping ──
function toZod(param: { type: string; description?: string }): any {
  let base: any;
  switch (param.type) {
    case 'string': base = z.string(); break;
    case 'number': base = z.number(); break;
    case 'boolean': base = z.boolean(); break;
    case 'array': base = z.array(z.string()); break;
    default: base = z.string();
  }
  if (param.description) base = base.describe(param.description);
  return base;
}

// ── Create MCP Server ──

const server = new McpServer({
  name: MCP_CONFIG.serverName,
  version: MCP_CONFIG.serverVersion,
  description: MCP_CONFIG.serverDescription,
});

// ── Register all 29 tools ──

for (const schema of CHAT_TOOLS) {
  const zodParams: Record<string, any> = {};
  const required: string[] = [];

  for (const [key, param] of Object.entries(schema.parameters)) {
    zodParams[key] = param.required ? toZod(param) : toZod(param).optional();
    if (param.required) required.push(key);
  }

  // Build params with required fields marked properly
  let inputSchema: any = undefined;
  if (Object.keys(zodParams).length > 0) {
    const obj = z.object(zodParams);
    inputSchema = required.length > 0
      ? (obj.required as any)(...required)
      : obj;
  }

  server.registerTool(
    schema.name,
    {
      description: schema.description,
      inputSchema,
    },
    async (args: any) => {
      console.error(`[MCP] Tool called: ${schema.name}`, JSON.stringify(args).slice(0, 200));
      const client = new CryptChatClient({
        apiBaseUrl: MCP_CONFIG.apiBaseUrl,
        token: MCP_CONFIG.apiKey,
      });

      const result = await executeTool(client, schema.name, args);
      if (!result.ok) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${result.error}` }],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result.data, null, 2),
          },
        ],
      };
    }
  );
}

// ── Start ──

async function main() {
  console.error(`[MCP] CryptChat MCP v${MCP_CONFIG.serverVersion} starting...`);
  console.error(`[MCP] API: ${MCP_CONFIG.apiBaseUrl}`);
  console.error(`[MCP] ${CHAT_TOOLS.length} tools registered`);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[MCP] Connected via stdio. Ready for agent calls.');
}

main().catch((err) => {
  console.error('[MCP] Fatal error:', err);
  process.exit(1);
});
