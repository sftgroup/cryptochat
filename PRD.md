# CryptChat 产品需求文档 (PRD)

> 版本: v1.0.0-alpha | 更新: 2026-07-13 | commit `13a3061`

---

## 1. 产品定位

CryptChat 是 Web3 原生的端到端加密即时通讯工具。身份体系基于 Ceres DID（去中心化身份）铸造，用户通过 CeresInviteCore 合约建立链上身份图谱，再在浏览器中生成 ECDH 密钥对并将公钥关联到 Ceres DID，实现去中心化的身份验证和消息加密。

**核心差异化**：
- **Ceres DID 身份体系**：铸造 Ceres DID 作为唯一数字身份，复用 Ceres 邀请关系图谱
- **链上公钥基础设施**：ECDH-P256 公钥关联到 Ceres DID，通过 Ceres Graph API + 链上合约双重查询，去信任化
- **端到端加密**：自建 ECDH + AES-256-GCM，不依赖 XMTP / PGP 等第三方协议
- **无中心服务器依赖**：后端仅做消息中继，加密/解密全在浏览器本地完成

### Ceres DID 集成

CryptChat 的用户身份直接使用 Ceres 的邀请绑定体系：

| 组件 | 说明 |
|------|------|
| **CeresInviteCore 合约** | 三条链已部署：ETH `0x61D6...`、BSC `0x05df...`、BASE `0x3Bb6...` |
| **bindInviterBySig** | 用 EIP-712 签名绑定邀请关系 → 建立 Ceres DID 链上身份 |
| **Ceres Graph API** | `43.156.99.215:5000/api/v1/batch-check` 查询用户 profile（inviter/invitee 关系、邀请数） |
| **ECDH 公钥注册** | 用户生成密钥对后，公钥存储为 Ceres DID 的扩展属性（链上或 Graph 层） |

**去掉的内容**（不再使用）：
- ~~IdentityRegistry 合约（Sepolia `0x253E...`）~~ — 替代为 Ceres DID
- ~~自建 pubkey 链上注册（`setPubkey` → `writeContract`）~~ — 替代为 Ceres DID 扩展属性
- ~~独立的好友图谱~~ — 复用 Ceres 邀请关系图谱

**Ceres DID 已有数据**（立即可用）：
- 每个地址 → inviter（邀请人）、inviteeCount（邀请人数）、descendantCount（下级总数）
- 安全社交图谱：只有被邀请关系的人才能建立连接（防机器人/防垃圾）

---

## 2. 用户场景

### 2.1 登录与身份（Ceres DID）

| 场景 | 描述 | 状态 |
|------|------|------|
| S1.1 钱包连接登录 | 用户通过 MetaMask 连接钱包，前端生成 nonce → 钱包签名 → 后端验证 JWT | ✅ 已实现 |
| S1.2 自动登录 | 本地缓存 JWT，刷新页面无需重新签名 | ✅ 已实现 |
| S1.3 断开连接 | 钱包断开自动登出，清除缓存 | ✅ 已实现 |
| S1.4 Ceres DID 铸造 | 首次使用通过 CeresInviteCore.bindInviterBySig 铸造 DID，建立链上身份 | ⚠️ 登录完成，待集成 DID 铸造 |
| S1.5 Ceres DID 验证 | 启动时调用 Ceres API `/v1/batch-check` 验证 DID 状态、获取邀请图谱 | ❌ 待实现 |
| S1.6 ECDH 密钥生成与管理 | 浏览器本地生成 ECDH-P256 密钥对，公钥关联到 Ceres DID | ✅ 密钥生成完成，待关联 DID |
| S1.7 个人资料 | 查看/编辑 displayName、bio，显示 Ceres DID 状态和邀请图谱 | ⚠️ 查看完成，编辑待完善 |

### 2.2 单聊 (DM)

| 场景 | 描述 | 状态 |
|------|------|------|
| S2.1 添加好友 | 通过钱包地址或 Ceres 邀请码搜索，发送好友请求（需 Ceres DID 已铸造） | ✅ 已实现基础版，待集成 Ceres DID |
| S2.2 接受/拒绝好友请求 | 收到请求后可接受或拒绝，接受后双向建立联系人关系 | ✅ 已实现 |
| S2.3 删除好友 | 从联系人列表移除，清除共享密钥缓存 | ✅ 已实现 |
| S2.4 好友列表 | 显示所有已接受的好友，可复用 Ceres 邀请图谱展示关系层级 | ✅ 已实现 |
| S2.5 单聊消息 - 发 | 输入文字/表情/IPFS 图片，发送前 ECDH 加密（用 Ceres DID 查对方公钥） | ✅ 已实现 |
| S2.6 单聊消息 - 收 | 轮询拉取消息（2s），自动 ECDH 解密 | ✅ 已实现 |
| S2.7 单聊消息 - E2EE 状态 | 聊天头显示 🔐 E2EE（已加密）或 ⚠ Plaintext（未加密） | ✅ 已实现 |
| S2.8 转账/红包 | 聊天中发送红包（TransferCard + TransferForm 组件） | ⚠️ UI 完成，后端待完善 |
| S2.9 文件传输 | 聊天中通过 IPFS 上传/分享文件 | ⚠️ 上传完成，下载/预览待完善 |
| S2.10 表情选择器 | EmojiPicker 弹窗选择表情插入输入框 | ✅ 已实现 |
| S2.11 消息状态 | 已发送/已读状态 | ❌ 待实现 |
| S2.12 离线消息 | 离线期间的消息在登录后同步 | ❌ 待实现 |

### 2.3 群聊

| 场景 | 描述 | 状态 |
|------|------|------|
| S3.1 创建群组 | 需 Ceres DID 已铸造 → 输入群名 + 可选描述，自动成为群主，生成邀请码 | ⚠️ 基础功能完成，待集成 DID |
| S3.2 邀请码 | 创建后展示 6 位字母数字邀请码，可复制分享（支持 Ceres 邀请链接） | ✅ 已实现 |
| S3.3 通过邀请码加入 | 输入 6 位邀请码加入群聊 | ✅ 已实现 |
| S3.4 通过群名搜索加入 | 搜索群名加入（后续改为仅 Ceres 邀请关系可加入） | ✅ 已实现 |
| S3.5 群聊消息 - 发 | 发送经过 Group Key 加密的消息 | ✅ 已实现 |
| S3.6 群聊消息 - 收 | 拉取并解密群消息 | ✅ 已实现 |
| S3.7 群密钥管理 | 群主创建 AES-256-GCM 群密钥 → 用每个成员 Ceres DID 的公钥 ECDH 加密 → 上传 | ✅ 已实现 |
| S3.8 群成员密钥获取 | 新成员加入后自动拉取 GroupKeyEnvelope，用 ECDH 解密得到群密钥 | ⚠️ 需手动刷新 |
| S3.9 群成员列表 | 显示所有群成员及其 Ceres DID 状态和 role（admin/member） | ✅ 已实现 |
| S3.10 邀请成员入群 | 群主通过 Ceres 邀请码或钱包地址邀请 | ⚠️ API 存在，前端待完善 |
| S3.11 退出群聊 | 成员自行退群 | ❌ 待实现 |
| S3.12 移除成员 | 群主踢人 | ❌ 待实现 |
| S3.13 修改群信息 | 群主修改群名/描述 | ❌ 待实现 |
| S3.14 群聊 @提及 | @某个群成员发送定向通知 | ❌ 待实现 |

### 2.4 朋友圈 (Moments)

| 场景 | 描述 | 状态 |
|------|------|------|
| S4.1 发布动态 | 文字内容（≤280 字符），可附加图片 | ✅ 已实现 |
| S4.2 动态列表 | 按时间倒序展示所有好友动态 | ✅ 已实现 |
| S4.3 图片上传 | 图片上传到 IPFS，动态中展示 IPFS CID 引用的图片 | ✅ 已实现 |
| S4.4 点赞/评论 | 对动态点赞或评论 | ❌ 待实现 |
| S4.5 可见性控制 | 仅好友可见 / 公开 | ❌ 待实现 |
| S4.6 动态删除 | 作者删除自己的动态 | ❌ 待实现 |

### 2.5 发现与搜索

| 场景 | 描述 | 状态 |
|------|------|------|
| S5.1 用户搜索 | 按钱包地址或 Ceres DID 用户名搜索（调用 Ceres API batch-check） | ✅ 已实现基础版，待集成 Ceres |
| S5.2 **Ceres 邀请图谱** | 可视化展示我的 Ceres 邀请树（inviter → me → invitees → descendants） | ❌ 待实现 |
| S5.3 社交发现 | 基于 Ceres 二级、三级关系推荐可能认识的人 | ❌ 待实现 |

---

## 3. 技术架构

### 3.1 加密方案

```
┌─────────────────────────────────────────────────────────┐
│                    E2EE 加密栈                            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. 身份层（Ceres DID）                                  │
│     用户通过 CeresInviteCore.bindInviterBySig 铸造 DID   │
│     → 链上记录 inviter/invitee 关系                      │
│     → Ceres Graph API 可查询完整身份图谱                  │
│                                                         │
│  2. 密钥生成（浏览器本地）                                │
│     ECDH-P256 密钥对 → localStorage 持久化                │
│                                                         │
│  3. 公钥注册（关联到 Ceres DID）                          │
│     主通道: Ceres DID 扩展属性（链上 bytes 字段）         │
│     备用:   POST /api/user/pubkey 后台存储               │
│                                                         │
│  4. 单聊加密                                             │
│     获取对方 Ceres DID + ECDH 公钥 → ECDH deriveBits    │
│     → AES-256-GCM 加解密                                 │
│                                                         │
│  5. 群聊加密                                             │
│     群主: 生成 group AES key → 每个成员 ECDH 加密 → 上传  │
│     成员: 拉取 envelope → ECDH 解密 → 得到 group key     │
│     消息: group key → AES-256-GCM                         │
│                                                         │
│  6. 身份认证                                             │
│     钱包签名 nonce → JWT（无 gas）                        │
│     Ceres DID 验证（通过 Ceres API 查询链上身份）          │
└─────────────────────────────────────────────────────────┘
```

### 3.2 合约

| 合约 | 网络 | 地址 | 功能 |
|------|------|------|------|
| CeresInviteCore | ETH | `0x61D6F790409780F165bc2a4Bf6D7C64C29bb6838` | bindInviterBySig / hasInviter / nonces |
| CeresInviteCore | BSC | `0x05df0bdF0AAb4AafBBF715fe091293217eA4C19a` | bindInviterBySig / hasInviter / nonces |
| CeresInviteCore | BASE | `0x3Bb6f516c0F29dB6A7210cC22d3f2653e964021d` | bindInviterBySig / hasInviter / nonces |

> ⚠️ IdentityRegistry 合约（Sepolia `0x253E08...`）将被废弃，不再在 CryptChat 中使用。

### 3.3 后端 API

| 模块 | 端点 | 方法 | 用途 |
|------|------|------|------|
| Auth | `/api/auth/nonce?address=` | GET | 获取签名 nonce |
| Auth | `/api/auth/login` | POST | 签名验证 → JWT |
| Auth | `/api/auth/refresh` | POST | 刷新 token |
| User | `/api/user/me` | GET | 当前用户信息 |
| User | `/api/user/search?q=` | GET | 搜索用户 |
| User | `/api/user/:id` | GET | 用户详情 |
| User | `/api/user/pubkey` | POST | 上传 ECDH 公钥 |
| User | `/api/user/pubkey/:address` | GET | 查公钥 |
| User | `/api/user/pubkey-attestation` | POST | EIP-712 认证 |
| Friends | `/api/friends` | GET | 好友列表 |
| Friends | `/api/friends/requests` | GET | 待处理请求 |
| Friends | `/api/friends/request` | POST | 发送好友请求 |
| Friends | `/api/friends/accept` | POST | 接受请求 |
| Friends | `/api/friends/:address` | DELETE | 删除好友 |
| Friends | `/api/friends/status/:address` | GET | 查询好友状态 |
| DM | `/api/dm/:userId/messages` | GET | 拉取私聊消息 |
| DM | `/api/dm/:userId/messages` | POST | 发送私聊消息 |
| Groups | `/api/groups` | GET | 我的群列表 |
| Groups | `/api/groups` | POST | 创建群 |
| Groups | `/api/groups/:id` | GET | 群详情 |
| Groups | `/api/groups/join` | POST | 按群名加入 |
| Groups | `/api/groups/join-by-code` | POST | 按邀请码加入 |
| Groups | `/api/groups/:id/join` | POST | 加入群 |
| Groups | `/api/groups/:id/invite` | POST | 邀请成员 |
| Groups | `/api/groups/:id/invite-code` | POST | 获取/生成邀请码 |
| Groups | `/api/groups/:id/messages` | GET | 拉取群消息 |
| Groups | `/api/groups/:id/messages` | POST | 发送群消息 |
| Groups | `/api/groups/:id/keys` | GET | 获取所有群密钥信封 |
| Groups | `/api/groups/:id/keys` | POST | 上传群密钥信封 |
| Groups | `/api/groups/:id/keys/my` | GET | 获取我的密钥信封 |
| Moments | `/api/moments` | GET | 动态列表 |
| Moments | `/api/moments` | POST | 发布动态 |
| IPFS | `/api/ipfs/upload` | POST | 上传文件到 IPFS |
| IPFS | `/api/ipfs/file/:cid` | GET | 代理 IPFS 文件 |
| Profile | `/api/profile` | GET | 当前用户 profile |
| Profile | `/api/profile/:address` | GET | 用户 profile |
| Tx | `/api/tx/estimate` | POST | 估算 gas |
| Tx | `/api/tx/chains` | GET | 支持链列表 |
| Tx | `/api/tx/prepare` | POST | 准备交易 |

### 3.4 数据模型

| 表 | 用途 |
|----|------|
| User | 用户（address 为主键，publicKey 存储 ECDH 公钥） |
| Session | JWT 会话管理 |
| Nonce | 一次性签名防重放 |
| Contact | 好友关系（双向，status: pending/accepted） |
| Message | 单聊消息 |
| Group | 群组（inviteCode 唯一） |
| GroupMember | 群成员（role: admin/member） |
| GroupMessage | 群消息（keyVersion 标记加密密钥版本） |
| GroupKeyEnvelope | 群密钥信封（ECDH 加密的 AES 群密钥） |
| Moment | 朋友圈动态 |

---

## 4. 安全模型

### 4.1 信任假设
- **服务端不持有私钥**：ECDH 私钥只在浏览器 localStorage
- **消息加密在客户端**：明文从不到达服务端（加密后的 ciphertext 存储）
- **服务端仅做中继**：存储加密消息、公钥备份（fallback）、联系人图
- **群密钥分发**：群主用每个成员的公钥分别加密群密钥，服务端看不到明文

### 4.2 攻击面
- **服务端被攻破**：攻击者只能看到加密消息（ciphertext），无法解密
- **localStorage 泄露**：如果用户设备被攻破，私钥可能被盗。可考虑未来加密码保护（PIN/Bio）
- **中间人攻击**：如果后台被篡改并返回假公钥，可能导致加密降级为明文。前端显示 `⚠ Plaintext` 警告

---

## 5. 下一步规划

### v0.8 — Ceres DID 集成（当前）
- [ ] **S1.4 Ceres DID 铸造**：登录后检查 Ceres DID 状态，未铸造则引导用户通过 CeresInviteCore.bindInviterBySig 铸造
- [ ] **S1.5 Ceres DID 验证**：App.tsx 启动时调用 Ceres API `/v1/batch-check` 获取身份状态
- [ ] **S1.6 ECDH 公钥关联 Ceres DID**：pubkey 存储改为 Ceres DID 扩展，替代 IdentityRegistry
- [ ] **S2.1 好友添加基于 Ceres 关系**：只能添加有 Ceres 邀请关系的人为好友（防垃圾）
- [ ] **移除 IdentityRegistry 依赖**：清理 registry.ts、App.tsx 中的 IdentityRegistry 相关代码
- [ ] 清理 IdentityRegistry 合约引用（Sepolia `0x253E08...`）
- [ ] Bug 修复：群创建流程链上交互优化（已加 idempotent check ✅）

### v0.9 — 稳定化
- [ ] S2.12 离线消息同步
- [ ] S3.8 新成员自动拉取群密钥（无需手动刷新）
- [ ] S3.10 邀请成员入群 UI
- [ ] S3.11 退出群聊
- [ ] S2.11 消息已读状态
- [ ] S4.4 朋友圈点赞/评论

### v1.0 — 体验提升
- [ ] WebSocket 实时推送（替代 2s 轮询）
- [ ] S3.14 群聊 @提及
- [ ] S1.7 个人资料编辑
- [ ] S2.8 红包完整流程
- [ ] S2.9 文件传输预览/下载
- [ ] S3.12 群主管理功能（踢人/改群名）

### v1.1 — 主网上线
- [ ] Sepolia → ETH/BSC/BASE 主网迁移（Ceres 合约已在三链部署）
- [ ] 生产服务器部署 (HTTPS + 域名)
- [ ] 移动端 PWA 支持

---

## 6. 测试环境

| 项目 | 值 |
|------|-----|
| 测试服务器 | `43.156.50.6` |
| 前端 | `https://43.156.50.6:4088/app` |
| 后端 API | `43.156.50.6:4089` |
| Ceres Graph API | `http://43.156.99.215:5000/api` |
| Ceres DID 前端 | `http://43.156.50.6:5000` (Docker) |
| 网络 | ETH / BSC / BASE 主网（Ceres 三链） |
| GitHub | `sftgroup/cryptochat` (master 分支) |
