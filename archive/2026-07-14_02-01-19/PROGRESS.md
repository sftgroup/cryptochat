# CryptChat — 项目进度

> 最后更新: 2026-07-13 12:15 (北京时间)

---

## 当前状态

| 项目 | 状态 |
|------|------|
| 版本 | v1.0.0 — Full Feature Set |
| 本地代码 | `/home/ubuntu/workspace/cryptochat/` ✅ |
| Git MCP | `sftgroup/cryptochat`，master 分支，24 commits ✅ |
| 测试环境 | Ceres 合约在生产环境 (ETH/BSC/BASE 主网) |
| 前端 | `https://43.156.50.6:4088/app` (React + Vite + wagmi 3.7.1 + Tailwind) ✅ |
| 后端 API | `43.156.50.6:4089` (Express + TypeScript + Prisma + WebSocket) ✅ |
| 合约 | CeresInviteCore: ETH/BSC/BASE 三链部署 ✅ |

### 测试服务器

| 项目 | 值 |
|------|-----|
| IP | `43.156.50.6` |
| 前端 | `https://43.156.50.6:4088` |
| 入口 | `:4088/` → landing.html，`:4088/app` → React SPA |
| 后端 API | `:4089` |
| WebSocket | `wss://43.156.50.6:4089/ws` |
| Nginx | 路由 `/` → landing.html，`/app` → React SPA |

---

## 加密方案

**自建 ECDH + AES-256-GCM 端到端加密（v1.0 采用 Ceres DID 纯链上身份体系）**

```
Ceres DID 铸造 (CeresInviteCore.bindInviterBySig, EIP-712 签名)
  → ECDH P-256 密钥对 (浏览器 localStorage)
  → 公钥关联到 Ceres DID (CeresDID.updateProfile, 链上 bytes 扩展)
  → 聊天时通过 Ceres DID 链上获取对方公钥 → ECDH 派生共享密钥 → AES-256-GCM 加解密
  → 纯链上查询，无后端 fallback（去信任化）
  → 已废弃: IdentityRegistry 合约 (Sepolia 0x253E08...) 及 POST /api/user/pubkey
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

### 功能
- [x] **Ceres DID 铸造** — LoginPage 集成 CeresInviteCore.bindInviterBySig ✅
- [x] **Ceres DID 验证** — 加好友前校验 DID 状态 ✅
- [x] **ECDH 公钥链上存储** — CeresDID.updateProfile ✅
- [x] **公钥纯链上查询** — 去掉后端 fallback ✅
- [x] **IdentityRegistry 清理** — 移除旧合约引用 ✅
- [x] **群成员邀请** — 通过 Ceres DID 地址邀请 ✅
- [x] **退出群聊** — 成员退群 + 自动拉取密钥 ✅
- [x] **离线消息** — 收件箱 + 未读红标 + 自动标记已读 ✅
- [x] **WebSocket** — 实时消息推送 ✅
- [x] **@提及** — 群聊 @成员 + 通知 ✅
- [x] **红包** — 发红包 / 抢红包 / 到账 ✅
- [x] **朋友圈点赞/评论** — Moments like & comment ✅
- [x] **文件/图片传输** — inline 渲染 + 下载预览 ✅
- [x] **懒加载** — React.lazy + Suspense ✅

### 部署
- [ ] Sepolia 测试网迁移到 Ceres 主网合约（生产级）
- [ ] 正式服务器部署 (HTTPS + 域名)
- [ ] 移动端 PWA 支持

---

## 最近修改记录

### 2026-07-12 — v1.0.0 Full Feature Set

| 类别 | 操作 | 详情 |
|------|------|------|
| **Ceres DID** | 身份铸造 | LoginPage 集成 Ceres DID 铸造流程 (`d0018e7`) |
| | DID 校验 | 加好友前验证 Ceres DID 状态 (`b886296`) |
| | 公钥链上存储 | ECDH pubkey 通过 CeresDID.updateProfile 上链 (`9f42aa4`) |
| | 纯链上查询 | pubkey 查询去掉后端 fallback (`76b5c82`) |
| | 代码清理 | 移除 IdentityRegistry 旧合约引用 (`aaeb6f2`) |
| **群聊** | 邀请成员 | 群主通过 Ceres DID 地址邀请 (`cc45edd`) |
| | 退出群聊 | 成员自行退群 (`cc45edd`) |
| | 密钥自动获取 | 新成员加入后自动拉取 GroupKeyEnvelope (`cc45edd`) |
| | 群密钥纯链上 | 去掉后端 pubkey fallback (`2462f36`) |
| **消息** | 离线消息 | 登录后自动同步离线消息 (`f623e3e`) |
| | 未读红标 | unread badge + 进入聊天自动标记已读 (`f623e3e`) |
| | WebSocket | WS 实时推送替代 2s 轮询 (`13a3061`) |
| | @提及 | 群聊 @成员 + 通知 (`cbb2543`) |
| **红包** | 完整流程 | 发红包 → 抢红包 → 领取到账 + 记录列表 (`73dbf90`) |
| **朋友圈** | 点赞/评论 | Moments 点赞 + 评论功能 (`3b62b99`) |
| **文件** | 文件/图片传输 | 聊天中发送文件 + 图片 inline 渲染 (`3052020`) |
| | 传输管理 | 文件传输完整方案 + 群管理完善 (`e649f92`) |
| **性能** | 懒加载 | React.lazy + Suspense 所有页面组件 (`c9a72b8`) |

**Git MCP: 15 new commits (`d0018e7` → `c9a72b8`)，全部已同步到 GitHub ✅**

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
| `c9a72b8` | 2026-07-12 | perf: lazy-load all pages & heavy components (React.lazy + Suspense) | ✅ |
| `e649f92` | 2026-07-12 | feat: file transfer + group management (v1.0) | ✅ |
| `3052020` | 2026-07-12 | feat: file/image transfer — inline rendering (v1.0) | ✅ |
| `73dbf90` | 2026-07-12 | feat: red packet (红包) — v1.0 | ✅ |
| `cbb2543` | 2026-07-12 | feat: @mention in group chat (v1.0) | ✅ |
| `13a3061` | 2026-07-12 | feat: WebSocket real-time push (v1.0) | ✅ |
| `3b62b99` | 2026-07-12 | feat: moments like & comment (S4.4) | ✅ |
| `f623e3e` | 2026-07-12 | feat: offline message inbox + unread badges + auto mark-read | ✅ |
| `cc45edd` | 2026-07-12 | feat: group member invite, leave group, auto-fetch group keys | ✅ |
| `2462f36` | 2026-07-12 | refactor: remove backend pubkey fallback from groupKeys | ✅ |
| `aaeb6f2` | 2026-07-12 | chore: dead code cleanup | ✅ |
| `76b5c82` | 2026-07-12 | refactor: pubkey chain-only lookup (no backend fallback) | ✅ |
| `9f42aa4` | 2026-07-12 | feat: store ECDH pubkey on-chain via CeresDID.updateProfile | ✅ |
| `b886296` | 2026-07-12 | fix: add Ceres DID validation to add-friend flow | ✅ |
| `d0018e7` | 2026-07-12 | feat(v0.8): embed Ceres DID mint into CryptChat login flow | ✅ |
