# CryptChat — 部署记录

> 最后更新: 2026-07-14 02:28 (北京时间)

---

## 服务器信息

| 项目 | 值 |
|------|-----|
| 测试服务器 | `43.156.50.6` |
| SSH | `sshpass -p 'Asdf1234!' ssh ubuntu@43.156.50.6` |
| 前端 | `http://43.156.50.6:4088` |
| 后端 API | `43.156.50.6:4089` |
| WebSocket | `wss://43.156.50.6:4089/ws` |
| Ceres Graph API | `http://43.156.99.215:5000/api/v1` |
| Ceres DID 前端 | `http://43.156.50.6:5000` |
| OxaChain RPC | `https://rpc.oxachain.org` (chainId 19505) |
| OxaChain Explorer | `https://scan.oxachain.org` |

---

## 合约地址 (v2.0.0 — OxaChain L1 主网)

| 合约 | 网络 | 地址 | 用途 |
|------|------|------|------|
| CeresInviteCore | ETH | `0x61D6F790409780F165bc2a4Bf6D7C64C29bb6838` | bindInviterBySig / hasInviter |
| CeresInviteCore | BSC | `0x05df0bdF0AAb4AafBBF715fe091293217eA4C19a` | bindInviterBySig / hasInviter |
| CeresInviteCore | BASE | `0x3Bb6f516c0F29dB6A7210cC22d3f2653e964021d` | bindInviterBySig / hasInviter |
| **CeresInviteCore** | **OxaChain L1** | `0xe63B92A7873b7cFf52fC5DA1D3dd0440f2Da7178` | bindInviterBySig / hasInviter |
| **CeresRegistry** | **OxaChain L1** | `0x55C1364E46B8Bef987559608e3d831e7D47F1f35` | createProfile / tokenOf / mintFee |
| **CeresDID** | **OxaChain L1** | `0x08236d3246653C4699CBBe4458efdC0f5B067250` | updateProfile / getUrls |
| CeresInviteCore | Sepolia | `0xCD142BDDaf0fe4509C269CC1A5bbFFB25E33533D` | 保留（测试兼容） |

> ⚠️ 已废弃：IdentityRegistry v2 `0x253E08cE05ae2C72D19b14506C58CA5Fe9FDdC0f` (Sepolia) — 替代为 Ceres DID

---

## 技术栈

| 层 | 技术 |
|------|------|
| 前端 | React 19 + Vite + Tailwind CSS + wagmi 3.7.1 |
| 后端 | Express + TypeScript + Prisma + SQLite + WebSocket (ws) |
| 加密 | ECDH P-256 + AES-256-GCM (浏览器本地) |
| 身份 | Ceres DID (CeresInviteCore.bindInviterBySig, OxaChain L1) |
| 公钥 | CeresDID.updateProfile (链上 bytes 扩展, OxaChain L1) |
| 存储 | IPFS (文件/图片/Moments 内容) |
| 合约 | Solidity + Forge (三链部署) |

---

## 部署历史

### v1.0.0 — 2026-07-12

**Commit:** `c9a72b8` (15 new commits: `d0018e7` → `c9a72b8`)

**新增功能:**
- Ceres DID 身份铸造 + 校验 + 公钥链上存储
- 群聊成员邀请 + 退出 + 群密钥自动获取
- WebSocket 实时消息推送
- 红包完整流程
- 朋友圈点赞/评论
- 文件/图片传输 + inline 渲染
- 离线消息 + 未读红标
- @提及 + 通知
- React.lazy 懒加载优化

**Commit 列表:**

| SHA | 说明 |
|------|------|
| `d0018e7` | feat(v0.8): embed Ceres DID mint into CryptChat login flow |
| `b886296` | fix: add Ceres DID validation to add-friend flow |
| `9f42aa4` | feat: store ECDH pubkey on-chain via CeresDID.updateProfile |
| `76b5c82` | refactor: pubkey chain-only lookup (no backend fallback) |
| `aaeb6f2` | chore: dead code cleanup |
| `2462f36` | refactor: remove backend pubkey fallback from groupKeys |
| `cc45edd` | feat: group member invite, leave group, auto-fetch group keys |
| `f623e3e` | feat: offline message inbox + unread badges + auto mark-read |
| `3b62b99` | feat: moments like & comment (S4.4) |
| `13a3061` | feat: WebSocket real-time push (v1.0) |
| `cbb2543` | feat: @mention in group chat (v1.0) |
| `73dbf90` | feat: red packet (红包) — v1.0 |
| `3052020` | feat: file/image transfer — inline rendering (v1.0) |
| `e649f92` | feat: file transfer + group management (v1.0) |
| `c9a72b8` | perf: lazy-load all pages & heavy components (React.lazy + Suspense) |

---

### v0.6.0 — 2026-07-11

**Commit:** `8d60dc7`

- wagmi 3.7.1 迁移（替代 raw ethers.js + viem）
- 群聊 Join Group 修复
- Moments + IPFS 朋友圈
- IdentityRegistry v2 合约 (Sepolia)

**Commit 列表:** `74677c6` → `8d60dc7` (10 commits)

---

### v0.1.0 — 2026-07-10

- 项目初始化：React + Express + Prisma + SQLite
- 钱包签名登录
- IdentityRegistry 合约初版

---

## 部署命令

### 前端

```bash
# 构建
tar czf /tmp/cryptochat-frontend.tar.gz -C /home/ubuntu/workspace/cryptochat/client/dist .
scp /tmp/cryptochat-frontend.tar.gz ubuntu@43.156.50.6:/tmp/
ssh ubuntu@43.156.50.6 'sudo tar xzf /tmp/cryptochat-frontend.tar.gz -C /var/www/cryptochat/ && sudo nginx -s reload'
```

### 后端

```bash
# 构建+部署
cd /home/ubuntu/workspace/cryptochat/server && npx tsc
tar czf /tmp/cryptochat-server.tar.gz -C /home/ubuntu/workspace/cryptochat/server/dist .
scp /tmp/cryptochat-server.tar.gz ubuntu@43.156.50.6:/tmp/
ssh ubuntu@43.156.50.6 'tar xzf /tmp/cryptochat-server.tar.gz -C /opt/cryptochat/ && pm2 restart cryptochat-api'
```

### v2.0.0-2026-07-14 — Ceres DID OxaChain L1 主网迁移

| 项目 | 值 |
|------|-----|
| **Tag** | `v2.0.0-2026-07-14` |
| **Commit** | `e7f82e9` → `1e0abe6` |
| **变更** | Ceres DID 从 Sepolia 迁移到 OxaChain L1 (chainId 19505) |
| **文件** | `wagmi.ts`, `registry.ts`, `CeresMintPage.tsx`, `TransferCard.tsx` |
| **说明** | 五链部署表 (ETH/BSC/Base/Oxa/Sepolia), EIP-712 Invite chainId, writeContract/readContract as any |
| **构建** | 测试服务器直接 build (build-mcp 有 wagmi v3.7.1 缓存问题) |
| **部署** | `43.156.50.6:4088` `/var/www/cryptochat/` |

---

## 回滚

```bash
# Git MCP 回退到指定 commit
git__git_checkout(name="cryptochat", ref="<commit-sha>")

# 按 Tag 回滚
git__git_checkout(name="cryptochat", ref="v1.0.0-2026-07-13")
```
