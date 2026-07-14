# CryptChat 集成指南 — SDK & MCP

> 版本: v2.3.0 | 更新: 2026-07-15

---

## 目录

1. [SDK 接入](#1-sdk-接入) — 钱包 / dApp 集成
2. [MCP 接入](#2-mcp-接入) — AI Agent 集成
3. [API 认证流程](#3-api-认证流程)
4. [常见场景](#4-常见场景)

---

## 1. SDK 接入

### 1.1 安装

```bash
npm install @cryptchat/sdk
```

### 1.2 初始化

```ts
import { CryptChatClient } from '@cryptchat/sdk';

const client = new CryptChatClient({
  apiBaseUrl: 'https://chat.team3.0xai.net',  // CryptChat 后端地址
  // token: 'existing-jwt'  // 可选：已有 token 直接复用
});
```

### 1.3 认证流程

```ts
// Step 1: 获取 Nonce（服务端生成的一次性签名挑战）
const challenge = await client.getNonce(walletAddress);
// → { nonce: "Sign this message...", address: "0x...", timestamp: 1752... }

// Step 2: 钱包签名（调用者自己处理，SDK 不碰私钥）
const signature = await wallet.signMessage({ message: challenge.nonce });

// Step 3: 登录 → 返回 JWT + 用户 profile
const auth = await client.login(walletAddress, signature);
// → { token: "eyJ...", refreshToken: "eyJ...", user: {...} }

// Step 4: Token 持久化（下次直接 setToken 跳过签名）
localStorage.setItem('cryptchat_token', auth.token);
client.setToken(auth.token);
```

### 1.4 SDK 35 方法完整列表

| # | 分类 | 方法 | 说明 |
|---|------|------|------|
| 1 | Auth | `getNonce(address)` | 获取 EIP-712 签名挑战 |
| 2 | Auth | `login(address, sig)` | 钱包签名登录，返回 JWT |
| 3 | Auth | `setToken(token)` | 设置已有 JWT |
| 4 | Auth | `refresh()` | 用 refreshToken 续期 |
| 5 | Profile | `getProfile()` | 获取自己的 Profile |
| 6 | Profile | `getProfileByAddress(addr)` | 按地址查 Profile |
| 7 | Profile | `updateProfile(data)` | 更新 displayName/bio/avatar |
| 8 | Profile | `searchUsers(query)` | 搜索用户 |
| 9 | Friends | `getFriends()` | 好友列表 |
| 10 | Friends | `getFriendRequests()` | 待处理请求 |
| 11 | Friends | `sendFriendRequest(addr)` | 发送好友请求 |
| 12 | Friends | `acceptFriendRequest(id)` | 接受请求 |
| 13 | Friends | `removeFriend(addr)` | 删除好友 |
| 14 | Friends | `getFriendStatus(addr)` | 查询关系状态 |
| 15 | DM | `getInbox()` | 收件箱（含未读+预览） |
| 16 | DM | `getDMMessages(userId, opts)` | 拉取私聊消息 |
| 17 | DM | `sendDM(userId, content)` | 发送私聊消息 |
| 18 | Groups | `getGroups()` | 群列表 |
| 19 | Groups | `getGroup(groupId)` | 群详情 |
| 20 | Groups | `createGroup(name)` | 创建群 |
| 21 | Groups | `joinGroupByCode(code)` | 通过邀请码加群 |
| 22 | Groups | `inviteToGroup(gid, uid)` | 邀请成员 |
| 23 | Groups | `getGroupMessages(gid, opts)` | 群消息 |
| 24 | Groups | `sendGroupMessage(gid, text)` | 发群消息 |
| 25 | Groups | `updateGroup(gid, data)` | 更新群信息 |
| 26 | Groups | `kickMember(gid, uid)` | 踢人 |
| 27 | Groups | `transferGroupOwner(gid, uid)` | 转让群主 |
| 28 | Groups | `leaveGroup(gid)` | 退出群 |
| 29 | Moments | `getMoments(opts)` | 动态流（好友+公开） |
| 30 | Moments | `postMoment(content)` | 发布动态 |
| 31 | Moments | `deleteMoment(id)` | 删除动态 |
| 32 | Moments | `toggleMomentLike(id)` | 点赞/取消赞 |
| 33 | Moments | `commentOnMoment(id, text)` | 评论动态 |
| 34 | RedPackets | `createRedPacket(params)` | 发红包 |
| 35 | RedPackets | `getRedPackets(scope, id)` | 查红包 |
| 36 | RedPackets | `getRedPacket(id)` | 红包详情 |
| 37 | RedPackets | `claimRedPacket(id)` | 抢红包 |
| 38 | IPFS | `uploadFile(params)` | 上传文件到 IPFS |
| 39 | IPFS | `getFile(cid)` | 从 IPFS 下载文件 |
| 40 | TX | `getSupportedChains()` | 获取支持链 |
| 41 | TX | `estimateTx(type, params)` | 估算 Gas |
| 42 | TX | `prepareTx(params)` | 准备交易 calldata |
| 43 | ECDH | `getUserPubkey(addr)` | 查询公钥 |
| 44 | ECDH | `registerPubkey(pk)` | 注册公钥 |

### 1.5 API 详细参考

#### 个人资料

```ts
const profile = await client.getProfile();
// → { id, address, displayName, avatarUrl, bio, ensName }

const other = await client.getProfileByAddress('0x...');

await client.updateProfile({ displayName: 'Alice', bio: 'Hello Crypto!' });

const results = await client.searchUsers('Alice');
```

#### 好友

```ts
// 好友列表
const friends = await client.getFriends();
// → [{ id, address, displayName, status: 'accepted' }, ...]

// 好友请求
const requests = await client.getFriendRequests();
await client.sendFriendRequest('0xFriendAddress');
await client.acceptFriendRequest('requestId');
await client.removeFriend('0xAddress');

// 查询关系状态
const { status } = await client.getFriendStatus('0x...');
// → 'accepted' | 'pending' | 'none'
```

#### DM 私聊

```ts
// 收件箱（所有对话 + 未读数 + 最后消息预览）
const inbox = await client.getInbox();
// → [{ friend: {...}, unread: 3, lastMessage: { content, time, sender } }]

// 拉取消息
const messages = await client.getDMMessages(userId, { limit: 50 });

// 发送消息
const msg = await client.sendDM(userId, 'Hello! 👋');
```

#### 群聊

```ts
// 群列表
const groups = await client.getGroups();

// 创建群
const group = await client.createGroup('Web3 Builders');

// 加入群
await client.joinGroupByCode('ABCD12');

// 邀请成员
await client.inviteToGroup(groupId, userId);

// 群消息
const msgs = await client.getGroupMessages(groupId, { limit: 50 });
await client.sendGroupMessage(groupId, 'GM everyone! @Alice check this');

// 群管理（owner）
await client.updateGroup(groupId, { name: 'New Name' });
await client.kickMember(groupId, userId);
await client.transferGroupOwner(groupId, newOwnerId);
await client.leaveGroup(groupId);
```

#### 朋友圈 / Moments

```ts
// 动态流
const moments = await client.getMoments({ limit: 20 });

// 发布动态
await client.postMoment('Hello Web3! 🌍');

// 删除动态
await client.deleteMoment(momentId);

// 点赞/取消赞
const { liked } = await client.toggleMomentLike(momentId);

// 评论
await client.commentOnMoment(momentId, 'Nice!');
```

#### 红包

```ts
// 发红包
const packet = await client.createRedPacket({
  scope: 'group',
  scopeId: groupId,
  amount: '1',
  token: 'ETH',
  count: 10,
  message: '新年快乐! 🧧',
});

// 查红包
const packets = await client.getRedPackets('group', groupId);
const detail = await client.getRedPacket(packetId);

// 抢红包
const claim = await client.claimRedPacket(packetId);
// → { id, packetId, claimerId, amount, time }
```

#### 链上交易

```ts
// 获取支持链
const chains = await client.getSupportedChains();
// → [{ chainId: 19505, name: 'OxaChain', rpcUrl: '...' }, ...]

// 估算 Gas
const est = await client.estimateTx('Transfer', {
  to: '0x...',
  token: 'ETH',
  amount: '0.1',
});
// → { chainId, from, to, value, data, gasEstimate }

// 准备交易（返回 calldata，你用自己的钱包签名 + 发送）
const tx = await client.prepareTx({
  chainId: 19505,
  type: 'RedPacket',
  params: { scope: 'group', scopeId, amount: '1', count: 5 },
});
// → { to, data, value, gasEstimate }

// 用 ethers/viem/wagmi 发送
const hash = await wallet.sendTransaction({ to: tx.to, data: tx.data, value: tx.value });
```

#### IPFS

```ts
// 上传文件
const { cid } = await client.uploadFile({
  fileName: 'photo.png',
  data: base64EncodedData,
  mimeType: 'image/png',
});

// 下载文件
const blob = await client.getFile(cid);
```

#### ECDH 加密密钥

```ts
// 查询对方公钥（用于 E2EE）
const { pubkey } = await client.getUserPubkey('0x...');

// 注册自己的公钥
await client.registerPubkey(myEcdhPubkey);
```

---

## 2. MCP 接入

### 2.1 概述

CryptChat MCP 是一个标准 MCP (Model Context Protocol) Server，让任何 AI Agent 获得完整的 CryptChat 聊天能力。

**特点**：
- 🚀 **26 个工具** — 覆盖社交、消息、群组、动态、红包全场景
- 🔌 **即插即用** — 标准 MCP stdio 协议，兼容 OpenClaw / Claude Desktop / Cursor
- 🔑 **API Key 认证** — 不依赖钱包签名，适合 Agent 场景
- 📦 **零依赖部署** — 所有代码内联编译，单文件部署

### 2.2 配置

#### OpenClaw

在 Gateway 配置中加入：

```json
{
  "mcpServers": {
    "cryptchat": {
      "command": "node",
      "args": ["/path/to/cryptochat/packages/mcp/dist/index.js"],
      "env": {
        "CRYPTCHAT_API_URL": "https://chat.team3.0xai.net",
        "CRYPTCHAT_API_KEY": "ctk_live_xxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

#### Claude Desktop

编辑 `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cryptchat": {
      "command": "node",
      "args": ["/path/to/cryptochat/packages/mcp/dist/index.js"],
      "env": {
        "CRYPTCHAT_API_URL": "https://chat.team3.0xai.net",
        "CRYPTCHAT_API_KEY": "ctk_live_xxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

#### Cursor

`.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "cryptchat": {
      "command": "node",
      "args": ["/path/to/cryptochat/packages/mcp/dist/index.js"],
      "env": {
        "CRYPTCHAT_API_URL": "https://chat.team3.0xai.net",
        "CRYPTCHAT_API_KEY": "ctk_live_xxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

### 2.3 环境变量

| 变量 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `CRYPTCHAT_API_URL` | 否 | `https://chat.team3.0xai.net` | 后端 API 地址 |
| `CRYPTCHAT_API_KEY` | 否 | `""` | 用户 JWT Token（通过 SDK login 获取） |

### 2.4 MCP 26 工具完整列表

| # | 分类 | 工具 | 说明 |
|---|------|------|------|
| 1 | Profile | `cryptchat_get_profile` | 获取个人资料 |
| 2 | Profile | `cryptchat_search_users` | 搜索用户 |
| 3 | Friends | `cryptchat_list_friends` | 好友列表 |
| 4 | Friends | `cryptchat_get_friend_requests` | 待处理请求 |
| 5 | Friends | `cryptchat_send_friend_request` | 发送好友请求 |
| 6 | Friends | `cryptchat_accept_friend_request` | 接受好友请求 |
| 7 | DM | `cryptchat_get_inbox` | DM 收件箱 |
| 8 | DM | `cryptchat_get_dm_messages` | 拉取 DM 消息 |
| 9 | DM | `cryptchat_send_dm` | 发送 DM |
| 10 | Groups | `cryptchat_list_groups` | 群列表 |
| 11 | Groups | `cryptchat_get_group` | 群详情 |
| 12 | Groups | `cryptchat_create_group` | 创建群 |
| 13 | Groups | `cryptchat_get_group_messages` | 群消息 |
| 14 | Groups | `cryptchat_send_group_message` | 发群消息 |
| 15 | Groups | `cryptchat_invite_to_group` | 邀请入群 |
| 16 | Groups | `cryptchat_leave_group` | 退群 |
| 17 | Moments | `cryptchat_get_moments` | 动态流 |
| 18 | Moments | `cryptchat_post_moment` | 发动态 |
| 19 | Moments | `cryptchat_delete_moment` | 删动态 |
| 20 | Moments | `cryptchat_like_moment` | 点赞 |
| 21 | Moments | `cryptchat_comment_moment` | 评论 |
| 22 | RedPackets | `cryptchat_get_red_packets` | 查红包 |
| 23 | RedPackets | `cryptchat_create_red_packet` | 发红包 |
| 24 | RedPackets | `cryptchat_claim_red_packet` | 抢红包 |
| 25 | IPFS | `cryptchat_upload_file` | 上传文件 |
| 26 | Moments | `cryptchat_get_moment_detail` | 动态详情（含点赞评论） |

#### Profile

| 工具 | 描述 | 参数 |
|------|------|------|
| `cryptchat_get_profile` | 获取个人资料 | — |
| `cryptchat_search_users` | 搜索用户 | `query` |

#### Friends

| 工具 | 描述 | 参数 |
|------|------|------|
| `cryptchat_list_friends` | 好友列表 | — |
| `cryptchat_get_friend_requests` | 待处理请求 | — |
| `cryptchat_send_friend_request` | 发送好友请求 | `address` |
| `cryptchat_accept_friend_request` | 接受好友请求 | `requestId` |

#### DM

| 工具 | 描述 | 参数 |
|------|------|------|
| `cryptchat_get_inbox` | DM 收件箱 | — |
| `cryptchat_get_dm_messages` | 拉取 DM 消息 | `userId`, `limit` |
| `cryptchat_send_dm` | 发送 DM | `userId`, `content` |

#### Groups

| 工具 | 描述 | 参数 |
|------|------|------|
| `cryptchat_list_groups` | 群列表 | — |
| `cryptchat_get_group` | 群详情 | `groupId` |
| `cryptchat_create_group` | 创建群 | `name` |
| `cryptchat_get_group_messages` | 群消息 | `groupId`, `limit` |
| `cryptchat_send_group_message` | 发群消息 | `groupId`, `content` |
| `cryptchat_invite_to_group` | 邀请入群 | `groupId`, `userId` |
| `cryptchat_leave_group` | 退群 | `groupId` |

#### Moments

| 工具 | 描述 | 参数 |
|------|------|------|
| `cryptchat_get_moments` | 动态流 | `limit` |
| `cryptchat_post_moment` | 发动态 | `content` |
| `cryptchat_delete_moment` | 删动态 | `momentId` |
| `cryptchat_like_moment` | 点赞 | `momentId` |
| `cryptchat_comment_moment` | 评论 | `momentId`, `content` |

#### Red Packets

| 工具 | 描述 | 参数 |
|------|------|------|
| `cryptchat_get_red_packets` | 查红包 | `scope`, `scopeId` |
| `cryptchat_create_red_packet` | 发红包 | `scope`, `scopeId`, `amount`, `token`, `count`, `message` |
| `cryptchat_claim_red_packet` | 抢红包 | `packetId` |

#### IPFS

| 工具 | 描述 | 参数 |
|------|------|------|
| `cryptchat_upload_file` | 上传文件 | `fileName`, `data`, `mimeType` |

### 2.5 MCP 独立使用文档

详见 [docs/mcp-usage.md](./mcp-usage.md) — 包含 Agent 场景示例、开发指南、测试方法。

### 2.6 Agent 使用示例

```
# Agent 可以这样使用 CryptChat MCP：

1. cryptchat_get_inbox     → 查看有没有新消息
2. cryptchat_get_moments   → 刷一下朋友圈
3. cryptchat_send_dm       → 给某人发私信
4. cryptchat_get_group_messages → 看群聊消息
5. cryptchat_send_group_message → 回复群消息（@mention 用 @name）
6. cryptchat_create_red_packet  → 发个红包活跃气氛
7. cryptchat_post_moment   → 发一条动态
```

---

## 3. API 认证流程

### 3.1 钱包用户（SDK）

```
┌──────────┐     ┌──────────────┐     ┌──────────┐
│  Wallet   │     │ CryptChat    │     │ Browser  │
│           │     │ Backend      │     │ Storage  │
└─────┬─────┘     └──────┬───────┘     └────┬─────┘
      │ 1. 连接钱包       │                  │
      │                  │                  │
      │ 2. GET /nonce    │                  │
      │ ←── nonce ──────│                  │
      │                  │                  │
      │ 3. sign(nonce)   │                  │
      │                  │                  │
      │ 4. POST /login   │                  │
      │    {address, sig}│                  │
      │ ←── JWT ────────│                  │
      │                  │                  │
      │ 5. 持久化 Token  │ ──────────────→ │ localStorage
      │                  │                  │
      │ 6. 后续请求       │                  │
      │  Authorization: Bearer <JWT>        │
```

### 3.2 AI Agent（MCP）

```
┌──────────┐     ┌──────────────┐
│ AI Agent  │     │ CryptChat    │
│ (MCP)     │     │ Backend      │
└─────┬─────┘     └──────┬───────┘
      │ 1. 启动时加载      │
      │    API_KEY (JWT)  │
      │                  │
      │ 2. 所有工具调用     │
      │  Authorization: Bearer <JWT>
      │ ←── JSON ─────── │
      │                  │
      │ 3. Token 过期      │
      │  需重新获取 JWT    │
```

> **获取 API Key**：用 SDK 的 `client.login()` 获取 `token` → 传给 MCP 的 `CRYPTCHAT_API_KEY`

---

## 4. 常见场景

### 4.1 钱包插件集成

```ts
// MetaMask Snap / Wallet Plugin
import { CryptChatClient } from '@cryptchat/sdk';

class WalletChat {
  client: CryptChatClient;

  async init() {
    this.client = new CryptChatClient({ apiBaseUrl: 'https://chat.team3.0xai.net' });
    const savedToken = await this.storage.get('cryptchat_token');
    if (savedToken) this.client.setToken(savedToken);
  }

  async connect(address: string) {
    const challenge = await this.client.getNonce(address);
    const sig = await this.signTypedData(challenge);
    const auth = await this.client.login(address, sig);
    await this.storage.set('cryptchat_token', auth.token);
  }

  async checkInbox() {
    const inbox = await this.client.getInbox();
    return inbox.filter(e => e.unread > 0).length; // 未读消息数
  }
}
```

### 4.2 AI Agent 自动回复

```
# Agent 用 MCP 工具实现自动回复流程：

1. cryptchat_get_inbox
   → 获取所有未读消息

2. for each unread DM:
   cryptchat_get_dm_messages(userId)
   → 读取历史上下文

3. cryptchat_send_dm(userId, "自动回复内容")
   → 发送 AI 生成的回复
```

### 4.3 群聊管理 Bot

```
# Agent 作为群管理 Bot：

1. cryptchat_list_groups
   → 获取所有管理的群

2. cryptchat_get_group_messages(groupId, { limit: 20 })
   → 检查最新消息

3. cryptchat_invite_to_group(groupId, newUserId)
   → 邀请新成员

4. cryptchat_send_group_message(groupId, "欢迎 @新人 加入!")
   → 发送欢迎消息
```

---

## 5. 错误处理

SDK 所有方法在请求失败时抛出 `Error`，`message` 为后端返回的 `error` 字段：

```ts
try {
  await client.sendDM(userId, 'hello');
} catch (err) {
  console.error(err.message);
  // 可能原因：
  // - 'Unauthorized': Token 过期 → client.refresh()
  // - 'User not found': 对方不存在
  // - 'Not friends': 不是好友，需要先发送好友请求
  // - 'Internal error': 服务端错误
}
```

---

## 6. 版本兼容

| 后端版本 | SDK 版本 | MCP 版本 | 兼容性 |
|---------|---------|---------|--------|
| v2.3.0 | v0.1.0 | v0.1.0 | ✅ 完全兼容 (39/39 PRD) |
| v2.2.0 | v0.1.0 | v0.1.0 | ✅ 完全兼容 |
| v2.1.0 | v0.1.0 | v0.1.0 | ✅ 完全兼容 |
| v2.0.0 | — | — | 无 SDK/MCP |

> SDK/MCP 开发规范来自 PredX 架构 — 详见 [predx/docs/integration-guide.md](https://github.com/sftgroup/predx)
