# CryptChat

Web3 native encrypted messaging — Wallet as identity, E2EE, integrated SDK & MCP for AI agents.

[![Version](https://img.shields.io/badge/version-v2.3.0-blue)](https://github.com/sftgroup/cryptochat)
[![PRD](https://img.shields.io/badge/PRD-39%2F39-brightgreen)](PRD.md)
[![SDK](https://img.shields.io/badge/SDK-v0.1.0-green)](packages/sdk)
[![MCP](https://img.shields.io/badge/MCP-v0.1.0-orange)](packages/mcp)
[![License](https://img.shields.io/badge/license-MIT-brightgreen)](LICENSE)

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Wallet / dApp                  AI Agent                  │
│  ┌─────────────┐               ┌──────────────┐          │
│  │ @cryptchat/ │               │ CryptChat MCP │          │
│  │    sdk      │               │   (stdio)     │          │
│  └──────┬──────┘               └──────┬────────┘          │
│         │ REST API                    │ REST API           │
├─────────┼─────────────────────────────┼────────────────────┤
│         ▼                             ▼                    │
│  ┌─────────────────────────────────────────────┐          │
│  │         CryptChat Backend (Express)          │          │
│  │  Auth · Friends · DM · Groups · Moments     │          │
│  │  Red Packets · IPFS · WebSocket (ws)        │          │
│  └──────────────────┬──────────────────────────┘          │
│                     │                                      │
│  ┌──────────────────┼──────────────────────────┐          │
│  │  ECDH P-256 → AES-256-GCM (Client-side E2EE)│          │
│  │  Ceres DID (OxaChain L1 chainId 19505)      │          │
│  └──────────────────────────────────────────────┘          │
└──────────────────────────────────────────────────────────┘
```

## Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19 + Vite + Tailwind CSS + wagmi 3.7.1 |
| **Backend** | Node.js + Express + TypeScript + Prisma (SQLite) |
| **Real-time** | WebSocket (ws) — push events, live typing |
| **Encryption** | ECDH P-256 + AES-256-GCM (zero-knowledge, client-side only) |
| **Identity** | Ceres DID v2.3 (CeresInviteCore + CeresDID + CeresRegistry) |
| **Storage** | IPFS (files / images / moments content) |
| **SDK** | `@cryptchat/sdk` v0.1.0 — 35 API methods, TypeScript |
| **MCP** | `@cryptchat/mcp` v0.1.0 — 26 AI Agent tools |

## Quick Start

```bash
# Install
cd cryptochat
cd client && npm install && cd ../server && npm install

# Dev
cd .. && npm run dev    # starts client (Vite) + server (tsx)

# Build
cd client && npm run build       # outputs dist/
cd ../server && npx tsc          # outputs dist/

# Deploy
# Client → /var/www/cryptochat (nginx serves on :4088)
# Server → node dist/index.js (API on :4089)
```

## Contracts (OxaChain L1 Mainnet)

| Contract | Address | Purpose |
|----------|---------|---------|
| CeresInviteCore | `0xe63B...7178` | bindInviterBySig / hasInviter |
| CeresRegistry | `0x55C1...1f35` | createProfile / tokenOf / mintFee |
| CeresDID | `0x0823...7250` | updateProfile / getUrls |

> Also deployed on ETH, BSC, Base, Sepolia. See [DEPLOY_RECORDS.md](./DEPLOY_RECORDS.md).

## SDK — `@cryptchat/sdk`

NPM package for wallets & dApps to integrate CryptChat messaging without handling contracts or E2EE keys.

```ts
import { CryptChatClient } from '@cryptchat/sdk';

const client = new CryptChatClient({ apiBaseUrl: 'https://chat.team3.0xai.net' });

// 1. Wallet auth
const challenge = await client.getNonce('0x123...');
const signature = await wallet.signMessage(challenge.nonce);
await client.login('0x123...', signature);

// 2. Chat
const inbox = await client.getInbox();
await client.sendDM(userId, 'Hello!');
const msgs = await client.getGroupMessages(groupId);

// 3. Social
await client.getFriends();
await client.postMoment('GM! ☀️');
await client.createRedPacket({ scope: 'group', scopeId, amount: '1', token: 'ETH', count: 5 });

// 4. On-chain (returns calldata — SDK never holds your key)
const tx = await client.prepareTx({ chainId: 19505, type: 'RedPacket', params: {...} });
// Sign tx with your wallet and send
```

📦 **Package**: `packages/sdk/` — 35 methods covering Auth / Profile / Friends / DM / Groups / Moments / Red Packets / IPFS / Transactions  
📖 **Full docs**: [docs/integration-guide.md](./docs/integration-guide.md)

## MCP — `@cryptchat/mcp`

Standard MCP (Model Context Protocol) server — give any AI agent full CryptChat chat capabilities.

```json
{
  "mcpServers": {
    "cryptchat": {
      "command": "node",
      "args": ["packages/mcp/dist/index.js"],
      "env": {
        "CRYPTCHAT_API_URL": "https://chat.team3.0xai.net",
        "CRYPTCHAT_API_KEY": "your-api-key"
      }
    }
  }
}
```

**26 tools**: Profile · Search Users · Friends (list/request/accept) · DM Inbox · Send DM · Groups (list/create/invite/leave) · Moments (feed/post/delete/like/comment) · Red Packets (create/claim) · IPFS upload

🔧 **Package**: `packages/mcp/`  
📖 **Config guide**: [docs/integration-guide.md](./docs/integration-guide.md)

## Features

- 🔑 **Wallet Auth** — wallet-as-identity via Ceres DID (EIP-712 typed messages)
- 🔐 **E2EE** — ECDH P-256 + AES-256-GCM, zero server knowledge
- 👥 **Friends & Groups** — encrypted group key distribution
- 💸 **In-chat Transfers** — multi-chain (returns calldata)
- 🧧 **Red Packets** — on-chain lucky money
- 📱 **Moments** — WeChat-style social feed with likes & comments
- 📎 **Files** — IPFS upload/download with preview
- @ **Mentions** — group @member with push notifications
- ✅ **Read Receipts** — ✓ sent / ✓✓ read in DM
- 🗑 **Delete Moments** — full CRUD
- 🌐 **Open Protocol** — SDK + MCP, no vendor lock-in

## Documentation

| Doc | Description |
|-----|------------|
| [README.md](./README.md) | 项目概述（你在看） |
| [PRD.md](./PRD.md) | 产品需求文档 & 功能完成度 |
| [PROGRESS.md](./PROGRESS.md) | 项目进度 & 修改记录 |
| [DEPLOY_RECORDS.md](./DEPLOY_RECORDS.md) | 部署记录 & 合约地址 |
| [docs/integration-guide.md](./docs/integration-guide.md) | SDK & MCP 接入完整指南 |
| [docs/deploy.md](./docs/deploy.md) | 部署操作手册 |

## Version

**v2.3.0** — PRD 39/39 (100%). SDK v0.1.0 + MCP v0.1.0 + Ceres 深度集成完成 (2026-07-15)
