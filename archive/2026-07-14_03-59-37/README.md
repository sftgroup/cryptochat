# CryptChat

Web3 native encrypted messaging. Wallet as identity, E2EE, chat-to-pay.

## Architecture
```
ECDH P-256 (browser) → Ceres DID (OxaChain L1) → AES-256-GCM (e2e)
```

## Stack
- **Frontend**: React 19 + Vite + Tailwind CSS + wagmi 3.7.1
- **Backend**: Node.js + Express + TypeScript + Prisma (SQLite) + WebSocket (ws)
- **Encryption**: ECDH P-256 + AES-256-GCM (zero-knowledge, client-side only)
- **Identity**: Ceres DID v2.3 (CeresInviteCore + CeresDID + CeresRegistry, OxaChain L1 chainId 19505)
- **Storage**: IPFS (files / images / moments content)

## Contracts (OxaChain L1 Mainnet)

| Contract | Address | Purpose |
|----------|---------|---------|
| CeresInviteCore | `0xe63B...7178` | bindInviterBySig / hasInviter |
| CeresRegistry | `0x55C1...1f35` | createProfile / tokenOf / mintFee |
| CeresDID | `0x0823...7250` | updateProfile / getUrls |

> Also deployed on ETH, BSC, Base, Sepolia. See [DEPLOY_RECORDS.md](./DEPLOY_RECORDS.md).

## Quick Start

```bash
# Install
cd client && pnpm install

# Dev
pnpm dev

# Build
pnpm build      # outputs dist/ → deploy to nginx

# Server
cd ../server && npx tsx src/index.ts
```

## Deployment

```bash
# Build & deploy frontend
cd client && pnpm build
tar czf /tmp/cryptochat-dist.tar.gz -C dist .
scp /tmp/cryptochat-dist.tar.gz ubuntu@43.156.50.6:/tmp/
ssh ubuntu@43.156.50.6 'sudo tar xzf /tmp/cryptochat-dist.tar.gz -C /var/www/cryptochat/ && sudo systemctl restart nginx'
```

## Features
- 🔑 Wallet auth (wallet-as-identity via Ceres DID)
- 🔐 E2EE (ECDH P-256 + AES-256-GCM, zero server knowledge)
- 👥 Friends & Groups (encrypted group chat with ECDH)
- 💸 In-chat transfers (BSC, multi-chain)
- 🧧 Red packets
- 📱 Moments (like WeChat moments)
- 📎 File/image transfer (IPFS)
- ⚡ Zero gas for messaging (encryption runs in browser)
- 🌐 Open protocol (no vendor lock-in)

## Documentation
- [PROGRESS.md](./PROGRESS.md) — 项目进度 & 修改记录
- [DEPLOY_RECORDS.md](./DEPLOY_RECORDS.md) — 部署记录 & 合约地址
- [PRD.md](./PRD.md) — 产品需求文档

## Version
**v2.0.0** — Ceres DID OxaChain L1 mainnet migration (2026-07-14)
