# CryptChat MCP 使用文档

> **@cryptchat/mcp v0.1.0** — 26 个 AI Agent 工具, 标准 MCP stdio 协议

---

## 目录

1. [概述](#1-概述)
2. [安装](#2-安装)
3. [配置](#3-配置)
4. [工具列表](#4-工具列表)
5. [Agent 场景](#5-agent-场景)
6. [错误处理](#6-错误处理)
7. [开发](#7-开发)

---

## 1. 概述

CryptChat MCP 是一个标准的 **Model Context Protocol Server**，让任何 AI Agent（OpenClaw / Claude / Cursor / 自定义 Agent）获得完整的 CryptChat 聊天能力。

**适用场景**：
- 🤖 **AI 群管 Bot** — 自动管理群聊、欢迎新人、踢违规成员
- 💬 **AI 助手集成** — Agent 帮你收发消息、管理好友
- 🔔 **消息监控** — Agent 定时检查收件箱、提醒重要消息
- 🧧 **红包机器人** — 自动发红包、抢红包通知
- 📱 **社交管理** — 批量查看动态、自动点赞评论

**特点**：
- 🚀 26 个工具 — 覆盖全场景
- 🔌 即插即用 — 标准 MCP stdio 协议
- 🔑 API Key 认证 — 不依赖钱包签名
- 📦 单文件部署 — 所有代码内联编译

---

## 2. 安装

### 2.1 从源码构建

```bash
cd packages/mcp
npm install
npx tsc
# 产物 → dist/index.js
```

### 2.2 验证

```bash
# 手动测试（非 stdio 模式 — 发送 MCP 请求）
echo '{"jsonrpc":"2.0","method":"list_tools","id":1}' | node dist/index.js
```

---

## 3. 配置

### 3.1 环境变量

| 变量 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `CRYPTCHAT_API_URL` | 是 | — | CryptChat 后端地址 |
| `CRYPTCHAT_API_KEY` | 是 | — | 用户 JWT Token |

### 3.2 获取 API Key

MCP 使用 JWT Token 认证，通过 SDK 获取：

```ts
import { CryptChatClient } from '@cryptchat/sdk';

const client = new CryptChatClient({ apiBaseUrl: 'https://chat.team3.0xai.net' });
const challenge = await client.getNonce(walletAddress);
const signature = await wallet.signMessage(challenge.nonce);
const auth = await client.login(walletAddress, signature);

console.log(auth.token); // ← 这个就是 CRYPTCHAT_API_KEY
```

### 3.3 OpenClaw 配置

```json
{
  "mcpServers": {
    "cryptchat": {
      "command": "node",
      "args": ["/home/ubuntu/workspace/cryptochat/packages/mcp/dist/index.js"],
      "env": {
        "CRYPTCHAT_API_URL": "https://chat.team3.0xai.net",
        "CRYPTCHAT_API_KEY": "ctk_live_xxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

### 3.4 Claude Desktop 配置

编辑 `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cryptchat": {
      "command": "node",
      "args": ["/home/ubuntu/workspace/cryptochat/packages/mcp/dist/index.js"],
      "env": {
        "CRYPTCHAT_API_URL": "https://chat.team3.0xai.net",
        "CRYPTCHAT_API_KEY": "ctk_live_xxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

### 3.5 Cursor 配置

`.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "cryptchat": {
      "command": "node",
      "args": ["/home/ubuntu/workspace/cryptochat/packages/mcp/dist/index.js"],
      "env": {
        "CRYPTCHAT_API_URL": "https://chat.team3.0xai.net",
        "CRYPTCHAT_API_KEY": "ctk_live_xxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

---

## 4. 工具列表

### 4.1 Profile（个人资料）

| 工具 | 参数 | 返回 |
|------|------|------|
| `cryptchat_get_profile` | — | `{ id, address, displayName, avatarUrl, bio }` |
| `cryptchat_search_users` | `query: string` | `[{ id, address, displayName }]` |

### 4.2 Friends（好友）

| 工具 | 参数 | 返回 |
|------|------|------|
| `cryptchat_list_friends` | — | `[{ id, address, displayName, status }]` |
| `cryptchat_get_friend_requests` | — | `[{ id, address, displayName, createdAt }]` |
| `cryptchat_send_friend_request` | `address: string` | `{ status, requestId }` |
| `cryptchat_accept_friend_request` | `requestId: string` | `{ status }` |

### 4.3 DM（私聊）

| 工具 | 参数 | 返回 |
|------|------|------|
| `cryptchat_get_inbox` | — | `[{ friend, unread, lastMessage }]` |
| `cryptchat_get_dm_messages` | `userId, limit?` | `[{ id, content, senderId, read, createdAt }]` |
| `cryptchat_send_dm` | `userId, content` | `{ id, content, createdAt }` |

### 4.4 Groups（群聊）

| 工具 | 参数 | 返回 |
|------|------|------|
| `cryptchat_list_groups` | — | `[{ id, name, members, createdAt }]` |
| `cryptchat_get_group` | `groupId` | `{ id, name, members, createdAt }` |
| `cryptchat_create_group` | `name` | `{ id, name, inviteCode }` |
| `cryptchat_get_group_messages` | `groupId, limit?` | `[{ id, content, senderId, createdAt }]` |
| `cryptchat_send_group_message` | `groupId, content` | `{ id, content, createdAt }` |
| `cryptchat_invite_to_group` | `groupId, userId` | `{ status }` |
| `cryptchat_leave_group` | `groupId` | `{ status }` |

### 4.5 Moments（朋友圈）

| 工具 | 参数 | 返回 |
|------|------|------|
| `cryptchat_get_moments` | `limit?` | `[{ id, content, authorName, time }]` |
| `cryptchat_post_moment` | `content` | `{ id, content, time }` |
| `cryptchat_delete_moment` | `momentId` | `{ status }` |
| `cryptchat_like_moment` | `momentId` | `{ liked }` |
| `cryptchat_comment_moment` | `momentId, content` | `{ id, content, createdAt }` |

### 4.6 Red Packets（红包）

| 工具 | 参数 | 返回 |
|------|------|------|
| `cryptchat_get_red_packets` | `scope, scopeId` | `[{ id, amount, remaining, message }]` |
| `cryptchat_create_red_packet` | `scope, scopeId, amount, token, count, message?` | `{ id, amount, count }` |
| `cryptchat_claim_red_packet` | `packetId` | `{ id, amount, claimedAt }` |

### 4.7 IPFS

| 工具 | 参数 | 返回 |
|------|------|------|
| `cryptchat_upload_file` | `fileName, data, mimeType` | `{ cid }` |

---

## 5. Agent 场景

### 5.1 AI 群管 Bot

```
# 自动欢迎新人 + 发红包活跃气氛

1. cryptchat_get_group_messages(groupId)
   → 检查最新消息，看有没有新成员 @mention

2. cryptchat_send_group_message(groupId, "欢迎 @新人 加入! 🎉")

3. cryptchat_create_red_packet("group", groupId, "0.01", "ETH", 5, "新人红包!")
   → 发个小红包欢迎
```

### 5.2 AI 消息助手

```
# 检查收件箱 + 智能回复

1. cryptchat_get_inbox()
   → 看看谁发了新消息、有没有 @ 我的

2. cryptchat_get_moments()
   → 刷一下朋友圈

3. cryptchat_send_dm(contactId, "自动回复: 正在忙, 稍后回复")
   → 自动回复消息
```

### 5.3 社交管理 Agent

```
# 定时发 GM 动态 + 好友管理

1. cryptchat_post_moment("GM! ☀️ 今天是 Web3 的好日子")
   → 每日 GM 动态

2. cryptchat_get_moments()
   → 看朋友们的动态

3. cryptchat_like_moment(momentId)
   → 给朋友的动态点赞
```

### 5.4 综合示例 — 帮 stevenwang 管理社交

```
用户: "帮我看看今天有什么新消息"

Agent:
1. cryptchat_get_inbox()     → 3 条未读 DM
2. cryptchat_get_moments()   → 朋友圈 5 条新动态
3. cryptchat_list_friends()  → 好友在线

Agent 回复:
"今天有 3 条未读消息:
- @Alice: '今晚吃饭?'
- @Bob: '帮我看看那个合约'
- @Charlie: [红包] 新年快乐

朋友圈有 5 条新动态, @David 发了条合照。

要我帮你回复什么?"
```

---

## 6. 错误处理

所有工具可能在 JSON-RPC 错误中返回错误信息:

| 错误信息 | 原因 | 解决 |
|----------|------|------|
| `Unauthorized` | Token 过期或无效 | 重新用 SDK login 获取新 token |
| `API_KEY not configured` | 未设置 `CRYPTCHAT_API_KEY` | 设置环境变量 |
| `API URL not configured` | 未设置 `CRYPTCHAT_API_URL` | 设置环境变量 |
| `User not found` | 目标用户不存在 | 检查 address 是否正确 |
| `Not friends` | 不是好友不能发 DM | 先发好友请求 |
| `Rate limit` | 请求太频繁 | 降低调用频率 |

---

## 7. 开发

### 7.1 本地开发

```bash
cd packages/mcp
npm install
npx tsx src/index.ts   # 直接运行 TypeScript
```

### 7.2 测试

```bash
# 列出所有工具
echo '{"jsonrpc":"2.0","method":"list_tools","id":1}' | node dist/index.js

# 调用具体工具
echo '{"jsonrpc":"2.0","method":"tool_call","params":{"name":"cryptchat_get_inbox","args":{}},"id":2}' | CRYPTCHAT_API_URL=... CRYPTCHAT_API_KEY=... node dist/index.js
```

### 7.3 代码结构

```
packages/mcp/
├── src/
│   ├── index.ts          — MCP Server 入口 (stdio JSON-RPC)
│   ├── config.ts         — 环境变量读取
│   ├── schema.ts         — 26 个工具的 inputSchema 定义
│   ├── types.ts          — TypeScript 类型
│   ├── sdk-client-full.ts — SDK 客户端内联 (零外部依赖)
│   └── tools/
│       └── executor.ts   — 工具调用分发器
├── dist/                  — 编译产物 (15 个文件)
├── tsconfig.json
├── package.json
└── mcp-config.example.json
```

### 7.4 新增工具

1. 在 `schema.ts` 添加工具定义
2. 在 `tools/executor.ts` 添加处理逻辑
3. 在 `types.ts` 更新类型
4. `npx tsc` 编译

---

> 📖 **了解更多**: [SDK 接入指南](../docs/integration-guide.md) | [PRD 功能清单](../PRD.md)
