# CryptChat — 项目进度

> 最后更新: 2026-07-12 11:08 (北京时间)

---

## 当前状态

| 项目 | 状态 |
|------|------|
| 版本 | v0.6.0 — Group Chat + Social Redesign + wagmi 3.7.1 |
| 本地代码 | `/home/ubuntu/workspace/cryptochat/` ✅ |
| Git MCP | `sftgroup/cryptochat`，master 分支，10 commits ✅ |
| 测试环境 | Sepolia 测试网 (chainId 11155111) |
| 前端 | `https://43.156.50.6:4088/app` (React + Vite + wagmi 3.7.1 + Tailwind) ✅ |
| 后端 API | `43.156.50.6:4089` (Express + TypeScript + Prisma) ✅ |
| 合约 | IdentityRegistry v2: `0x253E08cE05ae2C72D19b14506C58CA5Fe9FDdC0f` (Sepolia) ✅ |
| 本地修改 | 与 Git MCP 无差异 ✅ |

### 测试服务器

| 项目 | 值 |
|------|-----|
| IP | `43.156.50.6` |
| 前端 | `https://43.156.50.6:4088` |
| 入口 | `:4088/` → landing.html，`:4088/app` → React SPA |
| 后端 API | `:4089` |
| Nginx | 路由 `/` → landing.html，`/app` → React SPA |

---

## 加密方案

**自建 ECDH + AES-256-GCM 端到端加密（非 XMTP）**

```
ECDH P-256 密钥对 (浏览器 localStorage)
  → 公钥注册到链上 (IdentityRegistry.setPubkey, Sepolia, GAS 付费)
  → 后端 /api/user/pubkey 作为 fallback
  → 聊天时链上获取对方公钥 → ECDH 派生共享密钥 → AES-256-GCM 加解密
  → EIP-712 零 gas 签名验证身份
```

---

## 代码结构

```
workspace/cryptochat/
├── client/src/
│   ├── pages/         LoginPage / ChatPage / ProfilePage
│   ├── components/    CreateGroup / DiscoverPanel / IpfsMomentContent / TransferCard / TransferForm
│   └── lib/
│       ├── api.ts         — REST API 封装 + authStore
│       ├── crypto.ts      — ECDH P-256 + AES-256-GCM 完整加密栈
│       ├── registry.ts    — wagmi 3.7.1 IdentityRegistry 链上交互
│       └── tx.ts          — 转账/红包 编解码 + 多链配置
├── server/src/
│   ├── index.ts            — Express 入口，10 个路由
│   ├── routes/             — auth / dm / friends / groups / moments / ipfs / profile / tx / user / discover
│   ├── services/
│   ├── middleware/
│   └── utils/
├── contracts/src/
│   └── IdentityRegistry.sol  — 链上公钥注册 v2（bytes 参数）
└── package.json
```

---

## 待办清单

### 紧急
- [ ] 本地代码确认无需提交（已与 MCP 对比确认一致 ✅）

### 功能
- [ ] 群聊 E2EE 加密（DM 已完成 ECDH，群聊待适配 shared group key）
- [ ] WebSocket 替代 2s 轮询（实时消息推送）
- [ ] 红包功能完整实现（目前只有 UI 组件）

### 部署
- [ ] 从 Sepolia 测试网迁移到主网
- [ ] 合约主网部署（ETH/BSC/Base）
- [ ] 正式服务器部署

---

## 最近修改记录

### 2026-07-11 — v0.6.0 wagmi 3.7.1 迁移 + 群聊修复

| 操作 | 详情 |
|------|------|
| **wagmi 3.7.1 迁移** | `useConnect` / `useAccount` / `useWriteContract` 替换 raw ethers.js + viem |
| **修复** | Join Group 按钮点击弹出 Add Friend 面板（`setRightPanel('add_friend')` 硬编码）→ 新增 `join_group` rightPanel 类型 |
| **修复** | 后端新增 `POST /api/groups/join { name }` 支持按群名搜索加入 |
| **修复** | 加了好友看不到 — 联系人状态 `pending` 需双方接受 |
| **修复** | "全黑页面" — CSS `--tw-bg: #09090b` → `#000` (Twitter dark)，文字颜色恢复 |
| **UI** | 分隔线、群组列表 Join Group 按钮、Avatar 渐变色 |

### 2026-07-11 — Moments + IPFS

| 操作 | 详情 |
|------|------|
| **Moments 朋友圈** | 新增 Tab，支持文字 + 图片发布 |
| **IPFS 存储** | 内容 (CID-referenced) 存储到 IPFS，`IpfsMomentContent` 组件渲染 |
| **红包按钮** | 聊天界面新增 🧧 Red Packet 按钮 + TransferCard/TransferForm |
| **IPFS 文件上传** | 聊天中支持 📎 文件上传到 IPFS |

### 2026-07-11 — 链上身份 + 加密

| 操作 | 详情 |
|------|------|
| **IdentityRegistry v2** | 合约参数改为 `bytes`（替代 string），MetaMask 交互 UX 更干净 |
| **EIP-712 公钥认证** | 零 gas 签名验证，替代链上 tx（降低门槛） |
| **IdentityRegistry 部署** | Sepolia `0x253E08cE05ae2C72D19b14506C58CA5Fe9FDdC0f` |
| **ECDH 加密** | P-256 密钥对 → 链上 pubkey 查询 → 共享密钥派生 → AES-256-GCM |
| **加好友前要求上链** | `ensurePubkeyOnChain()` — 未注册时引导上链（一次性 gas） |
| **Git 状态** | ✅ commit `111723c` → `c3b516b` → `b2e8050` → `41ca237` → `74677c6` |

### 2026-07-10 — 项目初始化

| 操作 | 详情 |
|------|------|
| **GitHub 仓库创建** | `sftgroup/cryptochat` |
| **后端搭建** | Express + TypeScript + Prisma + SQLite，钱包签名登录 |
| **前端搭建** | React + Vite + Tailwind，LoginPage + ChatPage |
| **合约** | IdentityRegistry.sol 初版 |

---

## Git 同步状态

| 最近 Commit | 日期 | 说明 | GitHub |
|-------------|------|------|--------|
| `8d60dc7` | 2026-07-11 | feat: wagmi 3.7.1 migration + join-group fix + UI enhancements | ✅ 已同步 |
| `5ebccf9` | 2026-07-11 | feat: migrate to wagmi 3.7.1 | ✅ 已同步 |
| `007356c` | 2026-07-11 | fix: add separator lines, Join Group button in Groups tab | ✅ 已同步 |
| `1df866b` | 2026-07-11 | feat: moments content stored on IPFS (CID-referenced) | ✅ 已同步 |
| `a2dcc16` | 2026-07-11 | feat: Moments tab + Red Packet button + IPFS file upload in chat | ✅ 已同步 |
| `111723c` | 2026-07-11 | feat: on-chain pubkey required before add-friend / create-group | ✅ 已同步 |
| `c3b516b` | 2026-07-11 | feat: IdentityRegistry v2 — bytes param | ✅ 已同步 |
| `b2e8050` | 2026-07-11 | feat: EIP-712 pubkey attestation (zero gas) | ✅ 已同步 |
| `41ca237` | 2026-07-11 | feat: IdentityRegistry deployed Sepolia `0x253E...0f` | ✅ 已同步 |
| `74677c6` | 2026-07-11 | feat: IdentityRegistry.sol + on-chain pubkey storage | ✅ 已同步 |

**Git MCP: 10 commits 全部已同步到 GitHub ✅**
**本地代码: 与 MCP 导出对比无差异 ✅**
