# CryptChat — 项目进度

> 最后更新: 2026-07-14 03:56 (北京时间)

---

## 当前状态

| 项目 | 状态 |
|------|------|
| 版本 | v2.0.0 — Ceres DID OxaChain L1 主网迁移 |
| 本地代码 | `/home/ubuntu/workspace/cryptochat/` ✅ |
| Git MCP | `sftgroup/cryptochat`，master 分支，28 commits ✅ |
| 测试环境 | Ceres 合约在生产环境 (ETH/BSC/Base/Oxa 四链) |
| 前端 | `http://43.156.50.6:4088/` (React + Vite + wagmi 3.7.1 + Tailwind) ✅ |
| 后端 API | `43.156.50.6:4089` (Express + TypeScript + Prisma + WebSocket) ✅ |
| 合约 | CeresDID + CeresRegistry: OxaChain L1 主网 ✅ |

### 测试服务器

| 项目 | 值 |
|------|-----|
| IP | `43.156.50.6` |
| 前端 | `http://43.156.50.6:4088` |
| 入口 | `:4088/` → landing.html，`:4088/app` → React SPA |
| 后端 API | `:4089` |
| WebSocket | `wss://43.156.50.6:4089/ws` |
| Nginx | 路由 `/` → landing.html，`/app` → React SPA |

---

## 加密方案

**自建 ECDH + AES-256-GCM 端到端加密（v2.0 采用 Ceres DID OxaChain L1 链上身份体系）**

```
Ceres DID 铸造 (CeresInviteCore.bindInviterBySig, EIP-712 签名, OxaChain L1 chainId=19505)
  → ECDH P-256 密钥对 (浏览器 localStorage)
  → 公钥关联到 Ceres DID (CeresDID.updateProfile, 链上 bytes 扩展)
  → 聊天时通过 Ceres DID 链上获取对方公钥 → ECDH 派生共享密钥 → AES-256-GCM 加解密
  → 纯链上查询，无后端 fallback（去信任化）
```

---

## 代码结构

```
workspace/cryptochat/
├── client/src/
│   ├── pages/         LoginPage / ChatPage / ProfilePage / CeresMintPage
│   ├── components/    CreateGroup / DiscoverPanel / IpfsMomentContent / TransferCard / TransferForm
│   └── lib/
│       ├── api.ts         — REST API 封装 + authStore
│       ├── crypto.ts      — ECDH P-256 + AES-256-GCM 完整加密栈
│       ├── registry.ts    — Ceres v2.3 五链合约表 + OxaChain DID 链上查询
│       └── tx.ts          — 转账/红包 编解码 + 多链配置
├── server/src/
│   ├── index.ts            — Express 入口，10 个路由
│   ├── routes/             — auth / dm / friends / groups / moments / ipfs / profile / tx / user / discover
│   ├── services/
│   ├── middleware/
│   └── utils/
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
- [x] **Ceres DID OxaChain L1 主网迁移** — Sepolia→OxaChain (chainId 19505), 五链部署 ✅
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
- [x] **Sepolia→OxaChain L1 主网迁移** — v2.0.0 tag `v2.0.0-2026-07-14` ✅
- [ ] 正式服务器部署 (HTTPS + 域名)
- [ ] 移动端 PWA 支持

---

## 修改记录

### 2026-07-14 — v2.0.0 Ceres DID OxaChain L1 主网迁移

| 类别 | 操作 | 详情 |
|------|------|------|
| **合约迁移** | 五链部署 | CeresInviteCore: ETH/BSC/Base/Oxa/Sepolia 全量合约地址 |
| | OxaChain L1 | 新增 chainId 19505, RPC `rpc.oxachain.org`, Explorer `scan.oxachain.org` |
| | CeresRegistry | OxaChain L1 `0x55C1...1f35` createProfile / tokenOf / mintFee |
| | CeresDID | OxaChain L1 `0x0823...7250` updateProfile / getUrls |
| **wagmi** | OxaChain 配置 | `wagmi.ts` 新增 OxaChain L1 定义 (chainId 19505) |
| | writeContract | 所有 `writeContract` `chainId` 字段改为 `as any` 兼容 wagmi v3.7.1 严格类型 |
| | readContract | 所有 `readContract` `chainId` 改为 `chainId as any` |
| **CeresMintPage** | EIP-712 | Invite 类型增加 `chainId` 字段，适配 InviteCore v2.3 |
| | 合约地址 | 所有 Sepolia 地址 → OxaChain L1 主网地址 |
| | catch 修复 | mint fee try-catch 缺失 `catch {}` 修复 |
| **TransferCard** | chainId | `chainId: 19505` → `chainId: 19505 as any` |
| **registry** | 多链查询 | `getPubkeyOnChain` 切换到 OxaChain L1 (chainId 19505) |
| **构建** | build-mcp | build-mcp 缓存问题，直接在测试服务器 build 部署 |

**Git MCP: 5 commits (`de8fc94` ← `93185d8` ...)，tag `v2.0.0-2026-07-14` ✅**

### 2026-07-12 — v1.0.0 Full Feature Set

> (各 commit 详情见下 Git 同步状态)

---

## Git 同步状态

| 最近 Commit | 日期 | 说明 | GitHub |
|-------------|------|------|--------|
| `e7f82e9` | 2026-07-14 | docs: update DEPLOY_RECORDS + PROGRESS + README | ✅ |
| `1e0abe6` | 2026-07-14 | fix(build): missing catch block + as any chainId casts | ✅ |
| `de8fc94` | 2026-07-14 | fix(build): all readContract chainId: oxaChain.id as any | ✅ |
| `93185d8` | 2026-07-14 | fix(build): missing catch {} for mint fee try block | ✅ |
| `d0018e7` | 2026-07-12 | feat(v0.8): embed Ceres DID mint into CryptChat login flow | ✅ |
