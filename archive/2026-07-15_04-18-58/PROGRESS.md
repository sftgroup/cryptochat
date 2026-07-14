# CryptChat — 项目进度

> 最后更新: 2026-07-15 04:16 (北京时间)

---

## 当前状态

| 项目 | 状态 |
|------|------|
| 版本 | v2.3.0 — PRD 100% 功能完成 |
| 本地代码 | `/home/ubuntu/workspace/cryptochat/` ✅ |
| Git MCP | `sftgroup/cryptochat`，master 分支 ✅ |
| 测试环境 | Ceres 合约在生产环境 (ETH/BSC/Base/Oxa 四链) |
| 前端 | `http://43.156.50.6:4088/app` (React + Vite + wagmi 3.7.1 + Tailwind) ✅ |
| 后端 API | `43.156.50.6:4089` (Express + TypeScript + Prisma + WebSocket) ✅ |
| 合约 | CeresDID + CeresRegistry: OxaChain L1 主网 ✅ |
| SDK | `@cryptchat/sdk@0.1.0` — 35 API 方法 ✅ |
| MCP | `@cryptchat/mcp@0.1.0` — 26 AI Agent 工具 ✅ |

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

## PRD 完成度

**39/39（100%）**

```
█████████████████████████████████████████████  100%
```

| 版本 | 日期 | 完成度 | 里程碑 |
|------|------|--------|--------|
| v1.0.0 | 07-12 | 20/39 | 核心聊天 + WebSocket |
| v2.0.0 | 07-14 | 27/39 | Ceres DID OxaChain L1 主网迁移 |
| v2.1.0 | 07-15 | 32/39 | SDK + MCP + 文档全量 |
| v2.2.0 | 07-15 | 35/39 | Moments 可见性 + 邀请图谱 + 社交推荐 |
| v2.3.0 | 07-15 | 39/39 | Ceres 深度集成完成 |

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
│   ├── components/    CeresInviteTree / SocialDiscovery / DiscoverPanel
│   │                  CreateGroup / IpfsMomentContent / TransferCard / TransferForm
│   └── lib/
│       ├── api.ts         — REST API 封装 + authStore
│       ├── crypto.ts      — ECDH P-256 + AES-256-GCM 完整加密栈
│       ├── registry.ts    — Ceres v2.3 五链合约表 + OxaChain DID 链上查询
│       └── tx.ts          — 转账/红包 编解码 + 多链配置
├── server/src/
│   ├── index.ts            — Express 入口，11 个路由
│   ├── routes/             — auth / dm / friends / groups / moments / ipfs / profile / tx / user / discover / redpacket
│   └── utils/
├── packages/
│   ├── sdk/    — @cryptchat/sdk@0.1.0  (35 API 方法)
│   └── mcp/    — @cryptchat/mcp@0.1.0  (26 MCP 工具)
└── docs/
    ├── deploy.md           — 部署操作手册
    ├── integration-guide.md — SDK & MCP 接入指南
    └── mcp-usage.md        — MCP 独立使用文档
```

---

## 功能清单

### 社交核心 ✅
- [x] **S1.1 钱包登录** — EIP-712 签名 + JWT
- [x] **S1.2 Ceres DID** — 五链部署 (ETH/BSC/Base/Oxa/Sepolia)
- [x] **S1.3 ECDH 密钥** — P-256 浏览器本地生成
- [x] **S1.4 Ceres DID 铸造** — CeresMintPage 完整流程
- [x] **S1.5 Ceres DID 验证** — batch-check 启动时验证
- [x] **S1.6 公钥关联 Ceres DID** — updateProfile + getUrls
- [x] **S1.7 个人资料编辑** — ProfilePage

### 好友 ✅
- [x] **S2.1 添加好友** — Ceres DID 前后端双重校验
- [x] **S2.2 好友列表** — status: accepted
- [x] **S2.3 好友请求** — 发送/接受/拒绝
- [x] **S2.9 文件下载** — FileCard Download
- [x] **S2.10 表情选择器** — EmojiPicker
- [x] **S2.11 消息已读** — ✓ 已发送 / ✓✓ 已读
- [x] **S2.12 离线消息** — /api/dm/inbox

### 群聊 ✅
- [x] **S3.1 创建群** — 邀请码机制
- [x] **S3.2 群消息** — 端到端加密
- [x] **S3.3 群管理** — 踢人 / 转让 / 退出
- [x] **S3.14 @mention** — 群聊 @成员

### 朋友圈 ✅
- [x] **S4.1 发动态** — IPFS 内容存储 + 图片
- [x] **S4.2 点赞** — toggle like
- [x] **S4.3 评论** — commentOnMoment
- [x] **S4.5 可见性控制** — friends / public
- [x] **S4.6 动态删除** — DELETE /api/moments/:id

### 社交发现 ✅
- [x] **S5.2 Ceres 邀请图谱** — CeresInviteTree 三级树
- [x] **S5.3 社交推荐** — SocialDiscovery 双策略

### 红包 ✅
- [x] **红包全流程** — 发红包 / 抢红包 / 链上到账

### SDK & MCP ✅
- [x] **@cryptchat/sdk@0.1.0** — 35 API 方法
- [x] **@cryptchat/mcp@0.1.0** — 26 AI Agent 工具

### 部署 ✅
- [x] **Sepolia→OxaChain L1 主网迁移** — v2.0.0
- [x] **SDK + MCP 构建** — v2.1.0
- [x] **Ceres 深度集成** — v2.3.0

---

## 待办清单

### 功能
- [x] 全部 39 项功能 ✅ (100%)

### 部署
- [ ] 正式服务器部署 (HTTPS + 域名)
- [ ] 移动端 PWA 支持
- [ ] MCP API Key 管理后台

---

## Git 同步状态

| Tag | Commit | 日期 | 说明 |
|-----|--------|------|------|
| `v2.3.0-2026-07-15` | `47f875e` | 07-15 | Ceres 深度集成完成, PRD 39/39 (100%) |
| `v2.2.0-2026-07-15` | `4b7fa18` | 07-15 | Moments 可见性 + 邀请图谱 + 社交推荐 |
| `v2.1.0-2026-07-15` | `e941703` | 07-15 | SDK v0.1.0 + MCP v0.1.0 + 文档全量 |
| `v2.0.0-2026-07-14` | `de8fc94` | 07-14 | Ceres DID OxaChain L1 主网迁移 |
| `v1.0.0-*` | `d0018e7` | 07-12 | Ceres DID 铸造 + 完整聊天功能 |
