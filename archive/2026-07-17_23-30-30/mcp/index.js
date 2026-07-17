var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ../sdk/dist/client.js
var CryptChatClient = class {
  static {
    __name(this, "CryptChatClient");
  }
  baseUrl;
  token;
  refreshToken;
  constructor(options) {
    this.baseUrl = options.apiBaseUrl.replace(/\/$/, "");
    this.token = options.token || null;
    this.refreshToken = null;
  }
  // ── Auth ────────────────────────────────────────────
  headers() {
    const h = { "Content-Type": "application/json" };
    if (this.token)
      h["Authorization"] = `Bearer ${this.token}`;
    return h;
  }
  async request(path, init) {
    const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;
    const res = await fetch(url, { ...init, headers: { ...this.headers(), ...init?.headers } });
    const data = await res.json();
    if (!res.ok)
      throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }
  /**
   * Get a nonce for wallet signing (EIP-712 style).
   * The caller signs the nonce off-chain, then calls login().
   */
  async getNonce(address) {
    const data = await this.request(`/api/auth/nonce?address=${encodeURIComponent(address)}`);
    return { nonce: data.nonce, address, timestamp: data.timestamp };
  }
  /**
   * Login with wallet address + signed nonce.
   * Returns JWT tokens + user profile.
   */
  async login(address, signature) {
    const data = await this.request("/api/auth/login", { method: "POST", body: JSON.stringify({ address, signature }) });
    this.token = data.token;
    this.refreshToken = data.refreshToken;
    return data;
  }
  /**
   * Refresh the access token.
   */
  async refresh() {
    if (!this.refreshToken)
      throw new Error("No refresh token");
    const data = await this.request("/api/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken: this.refreshToken })
    });
    this.token = data.token;
    return data;
  }
  /** Set an existing token (e.g. from persisted storage) */
  setToken(token) {
    this.token = token;
  }
  /** Set refresh token */
  setRefreshToken(token) {
    this.refreshToken = token;
  }
  // ── Profile ─────────────────────────────────────────
  /** Get own profile */
  async getProfile() {
    const data = await this.request("/api/profile");
    return data.user;
  }
  /** Get profile by address */
  async getProfileByAddress(address) {
    const data = await this.request(`/api/profile/${encodeURIComponent(address)}`);
    return data.user;
  }
  /** Update profile */
  async updateProfile(updates) {
    const data = await this.request("/api/profile", {
      method: "PATCH",
      body: JSON.stringify(updates)
    });
    return data.user;
  }
  /** Search users */
  async searchUsers(query) {
    const data = await this.request(`/api/user/search?q=${encodeURIComponent(query)}`);
    return data.users;
  }
  // ── Friends ─────────────────────────────────────────
  /** Get friend list */
  async getFriends() {
    const data = await this.request("/api/friends");
    return data.friends;
  }
  /** Get friend requests */
  async getFriendRequests() {
    const data = await this.request("/api/friends/requests");
    return data.requests;
  }
  /** Send friend request */
  async sendFriendRequest(address) {
    return this.request("/api/friends/request", {
      method: "POST",
      body: JSON.stringify({ address })
    });
  }
  /** Accept friend request */
  async acceptFriendRequest(requestId) {
    return this.request("/api/friends/accept", {
      method: "POST",
      body: JSON.stringify({ requestId })
    });
  }
  /** Remove friend */
  async removeFriend(address) {
    return this.request(`/api/friends/${encodeURIComponent(address)}`, {
      method: "DELETE"
    });
  }
  /** Check friend status */
  async getFriendStatus(address) {
    return this.request(`/api/friends/status/${encodeURIComponent(address)}`);
  }
  // ── DM ──────────────────────────────────────────────
  /** Get DM inbox */
  async getInbox() {
    const data = await this.request("/api/dm/inbox");
    return data.inbox;
  }
  /** Get DM messages with a user */
  async getDMMessages(userId, options) {
    const params = new URLSearchParams();
    if (options?.limit)
      params.set("limit", String(options.limit));
    if (options?.before)
      params.set("before", String(options.before));
    const qs = params.toString();
    const data = await this.request(`/api/dm/${userId}/messages${qs ? `?${qs}` : ""}`);
    return data.messages;
  }
  /** Send DM */
  async sendDM(userId, content) {
    const data = await this.request(`/api/dm/${userId}/messages`, { method: "POST", body: JSON.stringify({ content }) });
    return data.message;
  }
  // ── Groups ──────────────────────────────────────────
  /** Get all groups */
  async getGroups() {
    const data = await this.request("/api/groups");
    return data.groups;
  }
  /** Get group detail */
  async getGroup(groupId) {
    const data = await this.request(`/api/groups/${groupId}`);
    return data.group;
  }
  /** Create group */
  async createGroup(name) {
    const data = await this.request("/api/groups", {
      method: "POST",
      body: JSON.stringify({ name })
    });
    return data.group;
  }
  /** Join group by invite code */
  async joinGroupByCode(code) {
    return this.request("/api/groups/join-by-code", {
      method: "POST",
      body: JSON.stringify({ code })
    });
  }
  /** Invite user to group */
  async inviteToGroup(groupId, userId) {
    return this.request(`/api/groups/${groupId}/invite`, {
      method: "POST",
      body: JSON.stringify({ userId })
    });
  }
  /** Get group invite code */
  async getGroupInviteCode(groupId) {
    return this.request(`/api/groups/${groupId}/invite-code`, {
      method: "POST"
    });
  }
  /** Get group messages */
  async getGroupMessages(groupId, options) {
    const params = new URLSearchParams();
    if (options?.limit)
      params.set("limit", String(options.limit));
    if (options?.before)
      params.set("before", String(options.before));
    const qs = params.toString();
    const data = await this.request(`/api/groups/${groupId}/messages${qs ? `?${qs}` : ""}`);
    return data.messages;
  }
  /** Send group message */
  async sendGroupMessage(groupId, content) {
    const data = await this.request(`/api/groups/${groupId}/messages`, { method: "POST", body: JSON.stringify({ content }) });
    return data.message;
  }
  /** Leave group */
  async leaveGroup(groupId) {
    return this.request(`/api/groups/${groupId}/leave`, { method: "POST" });
  }
  /** Update group info (owner only) */
  async updateGroup(groupId, updates) {
    const data = await this.request(`/api/groups/${groupId}`, {
      method: "PUT",
      body: JSON.stringify(updates)
    });
    return data.group;
  }
  /** Kick member (owner only) */
  async kickMember(groupId, userId) {
    return this.request(`/api/groups/${groupId}/kick/${userId}`, { method: "POST" });
  }
  /** Transfer group ownership */
  async transferGroupOwner(groupId, newOwnerId) {
    return this.request(`/api/groups/${groupId}/transfer`, {
      method: "POST",
      body: JSON.stringify({ newOwnerId })
    });
  }
  // ── Moments ─────────────────────────────────────────
  /** Get moments feed */
  async getMoments(options) {
    const params = options?.limit ? `?limit=${options.limit}` : "";
    const data = await this.request(`/api/moments${params}`);
    return data.moments;
  }
  /** Post a moment */
  async postMoment(content) {
    const data = await this.request("/api/moments", {
      method: "POST",
      body: JSON.stringify({ content })
    });
    return data.moment;
  }
  /** Delete a moment */
  async deleteMoment(momentId) {
    return this.request(`/api/moments/${momentId}`, { method: "DELETE" });
  }
  /** Toggle like on moment */
  async toggleMomentLike(momentId) {
    return this.request(`/api/moments/${momentId}/like`, { method: "POST" });
  }
  /** Comment on moment */
  async commentOnMoment(momentId, content) {
    const data = await this.request(`/api/moments/${momentId}/comment`, { method: "POST", body: JSON.stringify({ content }) });
    return data.comment;
  }
  // ── Red Packets ─────────────────────────────────────
  /** Get red packets for a chat */
  async getRedPackets(scope, scopeId) {
    const data = await this.request(`/api/redpacket?scope=${scope}&scopeId=${scopeId}`);
    return data.packets;
  }
  /** Get red packet detail */
  async getRedPacket(packetId) {
    const data = await this.request(`/api/redpacket/${packetId}`);
    return data.packet;
  }
  /** Create a red packet */
  async createRedPacket(params) {
    const data = await this.request("/api/redpacket", {
      method: "POST",
      body: JSON.stringify(params)
    });
    return data.packet;
  }
  /** Claim a red packet */
  async claimRedPacket(packetId) {
    const data = await this.request(`/api/redpacket/${packetId}/claim`, { method: "POST" });
    return data.claim;
  }
  // ── Transactions ────────────────────────────────────
  /** Estimate gas for a transaction */
  async estimateTx(type, params) {
    return this.request("/api/tx/estimate", {
      method: "POST",
      body: JSON.stringify({ type, params })
    });
  }
  /** Prepare a transaction (returns calldata, caller signs + sends) */
  async prepareTx(request) {
    return this.request("/api/tx/prepare", {
      method: "POST",
      body: JSON.stringify(request)
    });
  }
  /** Get supported chains */
  async getSupportedChains() {
    const data = await this.request("/api/tx/chains");
    return data.chains;
  }
  // ── IPFS ────────────────────────────────────────────
  /** Upload a file to IPFS */
  async uploadFile(file) {
    return this.request("/api/ipfs/upload", {
      method: "POST",
      body: JSON.stringify(file)
    });
  }
  /** Get file from IPFS */
  async getFile(cid) {
    const url = `${this.baseUrl}/api/ipfs/file/${cid}`;
    const res = await fetch(url);
    if (!res.ok)
      throw new Error(`IPFS fetch failed: ${res.status}`);
    return res.blob();
  }
  // ── ECDH Encryption ─────────────────────────────────
  /** Get user's public key for E2E encryption */
  async getUserPubkey(address) {
    const data = await this.request(`/api/user/pubkey/${encodeURIComponent(address)}`);
    return data;
  }
  /** Register own ECDH public key */
  async registerPubkey(pubkey) {
    return this.request("/api/user/pubkey", {
      method: "POST",
      body: JSON.stringify({ pubkey })
    });
  }
  // ── Discover ────────────────────────────────────────
  /** Search users by name or address */
  async discoverSearch(query) {
    const data = await this.request(`/api/discover/search?q=${encodeURIComponent(query)}`);
    return data.results;
  }
};

// src/config.ts
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
var __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });
var MCP_CONFIG = {
  /** CryptChat backend API base URL */
  apiBaseUrl: process.env.CRYPTCHAT_API_URL || "https://chat.team3.0xai.net",
  /** API Key for agent authentication */
  apiKey: process.env.CRYPTCHAT_API_KEY || "",
  /** MCP server name */
  serverName: "cryptchat-mcp",
  /** MCP server version */
  serverVersion: "0.1.0",
  /** MCP server description */
  serverDescription: "CryptChat MCP \u2014 Web3 encrypted messaging for AI agents. Send/receive messages, manage groups, post moments, send red packets."
};

// src/schema.ts
var CHAT_TOOLS = [
  // ── Profile ──
  {
    name: "cryptchat_get_profile",
    description: "Get own user profile (display name, address, avatar, bio)",
    parameters: {}
  },
  {
    name: "cryptchat_search_users",
    description: "Search users by name or address",
    parameters: {
      query: { type: "string", description: "Search query", required: true }
    }
  },
  // ── Friends ──
  {
    name: "cryptchat_list_friends",
    description: "List all friends with their online/offline status",
    parameters: {}
  },
  {
    name: "cryptchat_get_friend_requests",
    description: "Get pending friend requests",
    parameters: {}
  },
  {
    name: "cryptchat_send_friend_request",
    description: "Send a friend request to an address",
    parameters: {
      address: { type: "string", description: "Wallet address", required: true }
    }
  },
  {
    name: "cryptchat_accept_friend_request",
    description: "Accept a pending friend request",
    parameters: {
      requestId: { type: "string", description: "Request ID", required: true }
    }
  },
  // ── DM / Inbox ──
  {
    name: "cryptchat_get_inbox",
    description: "Get DM inbox \u2014 list all conversations with unread counts and last message preview",
    parameters: {}
  },
  {
    name: "cryptchat_get_dm_messages",
    description: "Get DM messages with a specific user",
    parameters: {
      userId: { type: "string", description: "User ID to get messages with", required: true },
      limit: { type: "number", description: "Max messages (default 50)" }
    }
  },
  {
    name: "cryptchat_send_dm",
    description: "Send a direct message to a user",
    parameters: {
      userId: { type: "string", description: "Recipient user ID", required: true },
      content: { type: "string", description: "Message text", required: true }
    }
  },
  // ── Groups ──
  {
    name: "cryptchat_list_groups",
    description: "List all groups the agent is a member of",
    parameters: {}
  },
  {
    name: "cryptchat_get_group",
    description: "Get group details including member list",
    parameters: {
      groupId: { type: "string", description: "Group ID", required: true }
    }
  },
  {
    name: "cryptchat_create_group",
    description: "Create a new group chat",
    parameters: {
      name: { type: "string", description: "Group name", required: true }
    }
  },
  {
    name: "cryptchat_get_group_messages",
    description: "Get messages from a group chat",
    parameters: {
      groupId: { type: "string", description: "Group ID", required: true },
      limit: { type: "number", description: "Max messages (default 50)" }
    }
  },
  {
    name: "cryptchat_send_group_message",
    description: "Send a message to a group chat. Supports @mentions.",
    parameters: {
      groupId: { type: "string", description: "Group ID", required: true },
      content: { type: "string", description: "Message text (use @name to mention)", required: true }
    }
  },
  {
    name: "cryptchat_invite_to_group",
    description: "Invite a user to a group",
    parameters: {
      groupId: { type: "string", description: "Group ID", required: true },
      userId: { type: "string", description: "User ID to invite", required: true }
    }
  },
  {
    name: "cryptchat_leave_group",
    description: "Leave a group chat",
    parameters: {
      groupId: { type: "string", description: "Group ID", required: true }
    }
  },
  // ── Moments ──
  {
    name: "cryptchat_get_moments",
    description: "Get moments feed (friends' posts)",
    parameters: {
      limit: { type: "number", description: "Max moments (default 20)" }
    }
  },
  {
    name: "cryptchat_post_moment",
    description: "Post a moment to the feed",
    parameters: {
      content: { type: "string", description: "Moment text (max 280 chars)", required: true }
    }
  },
  {
    name: "cryptchat_delete_moment",
    description: "Delete own moment",
    parameters: {
      momentId: { type: "string", description: "Moment ID", required: true }
    }
  },
  {
    name: "cryptchat_like_moment",
    description: "Toggle like on a moment",
    parameters: {
      momentId: { type: "string", description: "Moment ID", required: true }
    }
  },
  {
    name: "cryptchat_comment_moment",
    description: "Comment on a moment",
    parameters: {
      momentId: { type: "string", description: "Moment ID", required: true },
      content: { type: "string", description: "Comment text", required: true }
    }
  },
  // ── Red Packets ──
  {
    name: "cryptchat_get_red_packets",
    description: "Get red packets for a chat",
    parameters: {
      scope: { type: "string", description: "dm or group", required: true },
      scopeId: { type: "string", description: "User ID or Group ID", required: true }
    }
  },
  {
    name: "cryptchat_create_red_packet",
    description: "Create a red packet (lucky money) in a chat",
    parameters: {
      scope: { type: "string", description: "dm or group", required: true },
      scopeId: { type: "string", description: "User ID or Group ID", required: true },
      amount: { type: "string", description: "Total amount in token units", required: true },
      token: { type: "string", description: "Token symbol (e.g. ETH)", required: true },
      count: { type: "number", description: "Number of recipients", required: true },
      message: { type: "string", description: "Optional message with the red packet" }
    }
  },
  {
    name: "cryptchat_claim_red_packet",
    description: "Claim a red packet",
    parameters: {
      packetId: { type: "string", description: "Red packet ID", required: true }
    }
  },
  // ── Transfer ──
  {
    name: "cryptchat_prepare_transfer",
    description: "Prepare a token transfer (estimate gas + generate calldata). Caller signs and submits the transaction with their wallet.",
    parameters: {
      to: { type: "string", description: "Recipient address", required: true },
      amount: { type: "string", description: "Amount in ETH/token units", required: true },
      chainId: { type: "number", description: "Chain ID (1=ETH, 56=BSC, 137=Polygon, 43114=Avalanche)", required: true },
      tokenAddress: { type: "string", description: "ERC-20 token contract address (omit for native token)" }
    }
  },
  {
    name: "cryptchat_supported_chains",
    description: "Get list of supported chains for transfers",
    parameters: {}
  },
  // ── IPFS ──
  {
    name: "cryptchat_upload_file",
    description: "Upload a file to IPFS for sharing in chats",
    parameters: {
      fileName: { type: "string", description: "File name", required: true },
      data: { type: "string", description: "Base64-encoded file data", required: true },
      mimeType: { type: "string", description: "MIME type", required: true }
    }
  }
];

// src/tools/executor.ts
async function executeTool(client, toolName, args) {
  try {
    switch (toolName) {
      // ── Profile ──
      case "cryptchat_get_profile":
        return { ok: true, data: await client.getProfile() };
      case "cryptchat_search_users":
        return { ok: true, data: await client.searchUsers(args.query) };
      // ── Friends ──
      case "cryptchat_list_friends":
        return { ok: true, data: await client.getFriends() };
      case "cryptchat_get_friend_requests":
        return { ok: true, data: await client.getFriendRequests() };
      case "cryptchat_send_friend_request":
        return { ok: true, data: await client.sendFriendRequest(args.address) };
      case "cryptchat_accept_friend_request":
        return { ok: true, data: await client.acceptFriendRequest(args.requestId) };
      // ── DM ──
      case "cryptchat_get_inbox":
        return { ok: true, data: await client.getInbox() };
      case "cryptchat_get_dm_messages":
        return {
          ok: true,
          data: await client.getDMMessages(args.userId, {
            limit: args.limit
          })
        };
      case "cryptchat_send_dm":
        return {
          ok: true,
          data: await client.sendDM(args.userId, args.content)
        };
      // ── Groups ──
      case "cryptchat_list_groups":
        return { ok: true, data: await client.getGroups() };
      case "cryptchat_get_group":
        return { ok: true, data: await client.getGroup(args.groupId) };
      case "cryptchat_create_group":
        return { ok: true, data: await client.createGroup(args.name) };
      case "cryptchat_get_group_messages":
        return {
          ok: true,
          data: await client.getGroupMessages(args.groupId, {
            limit: args.limit
          })
        };
      case "cryptchat_send_group_message":
        return {
          ok: true,
          data: await client.sendGroupMessage(args.groupId, args.content)
        };
      case "cryptchat_invite_to_group":
        return {
          ok: true,
          data: await client.inviteToGroup(args.groupId, args.userId)
        };
      case "cryptchat_leave_group":
        return { ok: true, data: await client.leaveGroup(args.groupId) };
      // ── Moments ──
      case "cryptchat_get_moments":
        return {
          ok: true,
          data: await client.getMoments({ limit: args.limit })
        };
      case "cryptchat_post_moment":
        return { ok: true, data: await client.postMoment(args.content) };
      case "cryptchat_delete_moment":
        return { ok: true, data: await client.deleteMoment(args.momentId) };
      case "cryptchat_like_moment":
        return { ok: true, data: await client.toggleMomentLike(args.momentId) };
      case "cryptchat_comment_moment":
        return {
          ok: true,
          data: await client.commentOnMoment(
            args.momentId,
            args.content
          )
        };
      // ── Red Packets ──
      case "cryptchat_get_red_packets":
        return {
          ok: true,
          data: await client.getRedPackets(
            args.scope,
            args.scopeId
          )
        };
      case "cryptchat_create_red_packet":
        return {
          ok: true,
          data: await client.createRedPacket({
            scope: args.scope,
            scopeId: args.scopeId,
            amount: args.amount,
            token: args.token,
            count: args.count,
            message: args.message
          })
        };
      case "cryptchat_claim_red_packet":
        return {
          ok: true,
          data: await client.claimRedPacket(args.packetId)
        };
      // ── Transfer ──
      case "cryptchat_prepare_transfer": {
        const [estimate, prepare] = await Promise.all([
          client.estimateTx("transfer", { to: args.to, value: args.amount, chainId: args.chainId, tokenAddress: args.tokenAddress }),
          client.prepareTx({ chainId: args.chainId, type: "transfer", params: { to: args.to, value: args.amount, tokenAddress: args.tokenAddress } })
        ]);
        return { ok: true, data: { estimate, prepare } };
      }
      case "cryptchat_supported_chains":
        return { ok: true, data: await client.getSupportedChains() };
      case "cryptchat_upload_file":
        return {
          ok: true,
          data: await client.uploadFile({
            fileName: args.fileName,
            data: args.data,
            mimeType: args.mimeType
          })
        };
      default:
        return { ok: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
__name(executeTool, "executeTool");

// src/index.ts
function toZod(param) {
  let base;
  switch (param.type) {
    case "string":
      base = z.string();
      break;
    case "number":
      base = z.number();
      break;
    case "boolean":
      base = z.boolean();
      break;
    case "array":
      base = z.array(z.string());
      break;
    default:
      base = z.string();
  }
  if (param.description) base = base.describe(param.description);
  return base;
}
__name(toZod, "toZod");
var server = new McpServer({
  name: MCP_CONFIG.serverName,
  version: MCP_CONFIG.serverVersion,
  description: MCP_CONFIG.serverDescription
});
for (const schema of CHAT_TOOLS) {
  const zodParams = {};
  const required = [];
  for (const [key, param] of Object.entries(schema.parameters)) {
    zodParams[key] = param.required ? toZod(param) : toZod(param).optional();
    if (param.required) required.push(key);
  }
  let inputSchema = void 0;
  if (Object.keys(zodParams).length > 0) {
    const obj = z.object(zodParams);
    inputSchema = required.length > 0 ? obj.required(...required) : obj;
  }
  server.registerTool(
    schema.name,
    {
      description: schema.description,
      inputSchema
    },
    async (args) => {
      console.error(`[MCP] Tool called: ${schema.name}`, JSON.stringify(args).slice(0, 200));
      const client = new CryptChatClient({
        apiBaseUrl: MCP_CONFIG.apiBaseUrl,
        token: MCP_CONFIG.apiKey
      });
      const result = await executeTool(client, schema.name, args);
      if (!result.ok) {
        return {
          content: [{ type: "text", text: `Error: ${result.error}` }],
          isError: true
        };
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result.data, null, 2)
          }
        ]
      };
    }
  );
}
async function main() {
  console.error(`[MCP] CryptChat MCP v${MCP_CONFIG.serverVersion} starting...`);
  console.error(`[MCP] API: ${MCP_CONFIG.apiBaseUrl}`);
  console.error(`[MCP] ${CHAT_TOOLS.length} tools registered`);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[MCP] Connected via stdio. Ready for agent calls.");
}
__name(main, "main");
main().catch((err) => {
  console.error("[MCP] Fatal error:", err);
  process.exit(1);
});
