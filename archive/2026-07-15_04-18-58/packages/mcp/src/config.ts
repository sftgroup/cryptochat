/**
 * CryptChat MCP — Configuration
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

export const MCP_CONFIG = {
  /** CryptChat backend API base URL */
  apiBaseUrl: process.env.CRYPTCHAT_API_URL || 'https://chat.team3.0xai.net',
  /** API Key for agent authentication */
  apiKey: process.env.CRYPTCHAT_API_KEY || '',
  /** MCP server name */
  serverName: 'cryptchat-mcp',
  /** MCP server version */
  serverVersion: '0.1.0',
  /** MCP server description */
  serverDescription:
    'CryptChat MCP — Web3 encrypted messaging for AI agents. Send/receive messages, manage groups, post moments, send red packets.',
} as const;
