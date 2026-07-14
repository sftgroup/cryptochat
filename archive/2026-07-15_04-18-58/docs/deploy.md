# CryptChat — 部署操作手册

> 版本: v2.1.0 | 更新: 2026-07-15

---

## 服务器信息

| 项目 | 值 |
|------|-----|
| 测试服务器 | `43.156.50.6` |
| SSH | `ssh ubuntu@43.156.50.6` |
| 前端 | `https://43.156.50.6:4088` |
| 前端 SPA | `https://43.156.50.6:4088/app` |
| 后端 API | `43.156.50.6:4089` |
| WebSocket | `wss://43.156.50.6:4089/ws` |
| 后端日志 | `tail -f /tmp/cryptochat-server.log` |
| Nginx 配置 | `/etc/nginx/sites-enabled/cryptochat` |

---

## 架构

```
┌────────────────────────────────────────────────┐
│              Nginx (:4088 SSL)                  │
│  /           → landing.html                     │
│  /app(/.*)?  → index.html (SPA fallback)       │
│  /assets/    → static (immutable cache)         │
│  /api/       → proxy_pass :4089                 │
│  /ws         → proxy_pass :4089 (Upgrade)       │
├────────────────────────────────────────────────┤
│  CryptChat Backend (node dist/index.js :4089)   │
│  Prisma SQLite        WebSocket (ws)            │
├────────────────────────────────────────────────┤
│  CryptChat SDK       CryptChat MCP              │
│  packages/sdk/       packages/mcp/              │
└────────────────────────────────────────────────┘
```

---

## 部署步骤

### 1. 构建前端

```bash
cd /home/ubuntu/workspace/cryptochat/client
npm install
npx vite build               # → dist/
```

### 2. 构建后端

```bash
cd /home/ubuntu/workspace/cryptochat/server
npm install
npx tsc                       # → dist/
npx prisma generate           # → 生成 Prisma Client
```

### 3. 构建 SDK（可选，NPM 发布时用）

```bash
cd /home/ubuntu/workspace/cryptochat/packages/sdk
npm install
npx tsc                       # → dist/
```

### 4. 构建 MCP（可选，部署到 Agent 时用）

```bash
cd /home/ubuntu/workspace/cryptochat/packages/mcp
npm install
npx tsc                       # → dist/
```

### 5. 部署到测试服务器

```bash
# ── 前端 ──
cd /home/ubuntu/workspace/cryptochat/client
tar czf /tmp/cryptochat-client.tar.gz -C dist .
scp /tmp/cryptochat-client.tar.gz ubuntu@43.156.50.6:/tmp/
ssh ubuntu@43.156.50.6 '
  cd /var/www/cryptochat
  sudo rm -rf assets/ index.html
  sudo tar xzf /tmp/cryptochat-client.tar.gz
  sudo chown -R ubuntu:ubuntu .
  sudo nginx -s reload
'

# ── 后端 ──
cd /home/ubuntu/workspace/cryptochat/server
tar czf /tmp/cryptochat-server.tar.gz -C dist . -C ../ prisma/ -C ../ package.json
scp /tmp/cryptochat-server.tar.gz ubuntu@43.156.50.6:/tmp/
ssh ubuntu@43.156.50.6 '
  cd /home/ubuntu/cryptochat/server
  rm -rf dist/ routes/ middleware/ utils/
  tar xzf /tmp/cryptochat-server.tar.gz
  npx prisma generate
  # 重启服务
  kill $(pgrep -f "cryptochat/server/dist/index.js" | head -1) 2>/dev/null
  sleep 1
  nohup node dist/index.js > /tmp/cryptochat-server.log 2>&1 &
  sleep 2
  curl -s http://127.0.0.1:4089/health
'
```

### 6. 部署 MCP Server 到 Agent

```bash
# ── 方式 A: 本地文件 ──
cd /home/ubuntu/workspace/cryptochat/packages/mcp
npm install && npx tsc

# 在 OpenClaw / Claude Desktop / Cursor 配置:
{
  "mcpServers": {
    "cryptchat": {
      "command": "node",
      "args": ["/home/ubuntu/workspace/cryptochat/packages/mcp/dist/index.js"],
      "env": {
        "CRYPTCHAT_API_URL": "https://chat.team3.0xai.net",
        "CRYPTCHAT_API_KEY": "your-api-key"
      }
    }
  }
}

# ── 方式 B: 远程服务器 ──
# 部署到测试服务器
tar czf /tmp/cryptochat-mcp.tar.gz -C packages/mcp/dist . -C ../ package.json
scp /tmp/cryptochat-mcp.tar.gz ubuntu@43.156.50.6:/tmp/
ssh ubuntu@43.156.50.6 '
  mkdir -p /opt/cryptochat-mcp
  cd /opt/cryptochat-mcp
  rm -rf *
  tar xzf /tmp/cryptochat-mcp.tar.gz
  npm install --production
'

# MCP 配置指向远程
{
  "mcpServers": {
    "cryptchat": {
      "command": "ssh",
      "args": ["ubuntu@43.156.50.6", "CRYPTCHAT_API_KEY=xxx node /opt/cryptochat-mcp/dist/index.js"]
    }
  }
}
```

---

## 运行时管理

```bash
# 查看服务状态
ssh ubuntu@43.156.50.6 'ps aux | grep cryptochat | grep -v grep'

# 查看日志
ssh ubuntu@43.156.50.6 'tail -100 /tmp/cryptochat-server.log'

# 重启后端
ssh ubuntu@43.156.50.6 '
  kill $(pgrep -f "cryptochat/server/dist/index.js" | head -1) 2>/dev/null
  sleep 1
  cd /home/ubuntu/cryptochat/server
  nohup node dist/index.js > /tmp/cryptochat-server.log 2>&1 &
'

# 健康检查
curl http://43.156.50.6:4089/health
curl -k https://43.156.50.6:4088/app
```

---

## 路由表

| URL | 后端路由 | 说明 |
|-----|---------|------|
| `GET /` | nginx → landing.html | Landing Page |
| `GET /app` | nginx → index.html | SPA 入口 |
| `GET /app/*` | nginx → index.html | SPA 客户端路由 |
| `GET /api/auth/nonce` | Express → auth.ts | 签名 nonce |
| `POST /api/auth/login` | Express → auth.ts | 登录 |
| `GET /api/dm/inbox` | Express → dm.ts | DM 收件箱 |
| `GET /api/dm/:userId/messages` | Express → dm.ts | DM 消息 |
| `POST /api/dm/:userId/messages` | Express → dm.ts | 发 DM |
| `GET /api/friends` | Express → friends.ts | 好友列表 |
| `POST /api/friends/request` | Express → friends.ts | 好友请求 |
| `GET /api/groups` | Express → groups.ts | 群列表 |
| `POST /api/groups` | Express → groups.ts | 创建群 |
| `GET /api/groups/:id/messages` | Express → groups.ts | 群消息 |
| `POST /api/groups/:id/messages` | Express → groups.ts | 发群消息 |
| `GET /api/moments` | Express → moments.ts | 动态列表 |
| `POST /api/moments` | Express → moments.ts | 发动态 |
| `DELETE /api/moments/:id` | Express → moments.ts | 删动态 |
| `POST /api/moments/:id/like` | Express → moments.ts | 点赞 |
| `POST /api/redpacket` | Express → redpacket.ts | 发红包 |
| `POST /api/ipfs/upload` | Express → ipfs.ts | IPFS 上传 |
| `GET /api/ipfs/file/:cid` | Express → ipfs.ts | IPFS 下载 |
| `GET /api/profile` | Express → profile.ts | 个人资料 |
| `PATCH /api/profile` | Express → profile.ts | 编辑资料 |
| `POST /api/tx/prepare` | Express → tx.ts | 准备交易 |
| `GET /api/discover/search` | Express → discover.ts | 发现用户 |

---

## 故障排查

| 现象 | 排查命令 | 常见原因 |
|------|---------|---------|
| 502 Bad Gateway | `ps aux \| grep cryptochat` | 后端未运行 |
| WebSocket 断开 | `curl -k https://43.156.50.6:4089/ws` | nginx Upgrade 配置丢失 |
| 消息收不到 | `tail -100 /tmp/cryptochat-server.log` | Prisma/SQLite 锁 |
| SDK 超时 | `curl http://43.156.50.6:4089/api/dm/inbox -H 'Authorization: Bearer xxx'` | Token 过期 |
| IPFS 上传失败 | 检查 IPFS API 节点连通性 | IPFS 节点离线 |
| SSL 证书过期 | `ssh ubuntu@43.156.50.6 'openssl x509 -in /etc/ssl/certs/cryptochat.crt -noout -dates'` | 需要续期 |

---

## 版本历史

| Tag | 日期 | 说明 |
|-----|------|------|
| `v0.1.0` | 2026-07-10 | 项目初始化 |
| `v0.6.0` | 2026-07-11 | wagmi 3.7.1 + Moments + IPFS |
| `v1.0.0` | 2026-07-12 | Ceres DID + WebSocket + 红包 + E2EE 完整 |
| `v2.0.0-2026-07-14` | 2026-07-14 | Ceres DID OxaChain L1 主网迁移 |
| `v2.1.0` | 2026-07-15 | SDK v0.1.0 + MCP v0.1.0 + 32/39 features |
