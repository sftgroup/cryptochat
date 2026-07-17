var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/utils/prisma.ts
import { PrismaClient } from "@prisma/client";
var prisma;
var init_prisma = __esm({
  "src/utils/prisma.ts"() {
    "use strict";
    prisma = new PrismaClient();
  }
});

// src/middleware/auth.ts
import jwt from "jsonwebtoken";
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "24h" });
}
function signRefreshToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}
async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing token" });
  }
  try {
    const payload = verifyToken(header.slice(7));
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}
var JWT_SECRET;
var init_auth = __esm({
  "src/middleware/auth.ts"() {
    "use strict";
    init_prisma();
    JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
    __name(signToken, "signToken");
    __name(signRefreshToken, "signRefreshToken");
    __name(verifyToken, "verifyToken");
    __name(authMiddleware, "authMiddleware");
  }
});

// src/routes/auth.ts
import { Router } from "express";
import { ethers } from "ethers";
import { v4 as uuid } from "uuid";
var authRouter;
var init_auth2 = __esm({
  "src/routes/auth.ts"() {
    "use strict";
    init_prisma();
    init_auth();
    authRouter = Router();
    authRouter.get("/nonce", async (req, res) => {
      try {
        const address = req.query.address?.toLowerCase();
        if (!address || !ethers.isAddress(address)) {
          return res.status(400).json({ error: "Invalid address" });
        }
        const existing = await prisma.nonce.findFirst({
          where: { address, used: false, expiresAt: { gt: /* @__PURE__ */ new Date() } },
          orderBy: { createdAt: "desc" }
        });
        if (existing) {
          return res.json({ nonce: existing.nonce });
        }
        const nonce = `Welcome to CryptChat!

Sign this message to verify your identity.

Nonce: ${uuid()}`;
        await prisma.nonce.create({
          data: {
            address,
            nonce,
            expiresAt: new Date(Date.now() + 5 * 60 * 1e3)
            // 5 min
          }
        });
        res.json({ nonce });
      } catch (err) {
        console.error("nonce error:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    authRouter.post("/login", async (req, res) => {
      try {
        const { address, signature } = req.body;
        const addr = address?.toLowerCase();
        if (!addr || !ethers.isAddress(addr) || !signature) {
          return res.status(400).json({ error: "Invalid address or signature" });
        }
        const nonceRecord = await prisma.nonce.findFirst({
          where: { address: addr, used: false, expiresAt: { gt: /* @__PURE__ */ new Date() } },
          orderBy: { createdAt: "desc" }
        });
        if (!nonceRecord) {
          return res.status(400).json({ error: "No valid nonce. Request /auth/nonce first." });
        }
        let recoveredAddress;
        try {
          recoveredAddress = ethers.verifyMessage(nonceRecord.nonce, signature).toLowerCase();
        } catch {
          return res.status(400).json({ error: "Invalid signature format" });
        }
        if (recoveredAddress !== addr) {
          return res.status(401).json({ error: "Signature verification failed" });
        }
        await prisma.nonce.update({ where: { id: nonceRecord.id }, data: { used: true } });
        let user = await prisma.user.findUnique({ where: { address: addr } });
        if (!user) {
          user = await prisma.user.create({
            data: { address: addr, displayName: addr.slice(0, 6) + "..." + addr.slice(-4) }
          });
        }
        const token = signToken({ userId: user.id, address: user.address });
        const refreshToken = signRefreshToken({ userId: user.id, address: user.address });
        await prisma.session.create({
          data: {
            userId: user.id,
            token,
            refreshToken,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1e3)
          }
        });
        res.json({
          token,
          refreshToken,
          user: {
            id: user.id,
            address: user.address,
            ensName: user.ensName,
            avatarUrl: user.avatarUrl,
            displayName: user.displayName
          }
        });
      } catch (err) {
        console.error("login error:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    authRouter.post("/refresh", async (req, res) => {
      try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
          return res.status(400).json({ error: "Missing refresh token" });
        }
        const session = await prisma.session.findUnique({ where: { refreshToken } });
        if (!session || session.expiresAt < /* @__PURE__ */ new Date()) {
          return res.status(401).json({ error: "Invalid or expired refresh token" });
        }
        const user = await prisma.user.findUnique({ where: { id: session.userId } });
        if (!user) {
          return res.status(401).json({ error: "User not found" });
        }
        const newToken = signToken({ userId: user.id, address: user.address });
        const newRefresh = signRefreshToken({ userId: user.id, address: user.address });
        await prisma.session.delete({ where: { id: session.id } });
        await prisma.session.create({
          data: {
            userId: user.id,
            token: newToken,
            refreshToken: newRefresh,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1e3)
          }
        });
        res.json({ token: newToken, refreshToken: newRefresh });
      } catch (err) {
        console.error("refresh error:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
  }
});

// src/routes/user.ts
import { Router as Router2 } from "express";
var userRouter;
var init_user = __esm({
  "src/routes/user.ts"() {
    "use strict";
    init_auth();
    init_prisma();
    userRouter = Router2();
    userRouter.get("/me", authMiddleware, async (req, res) => {
      try {
        const user = await prisma.user.findUnique({
          where: { id: req.user.userId },
          select: {
            id: true,
            address: true,
            ensName: true,
            avatarUrl: true,
            displayName: true,
            createdAt: true
          }
        });
        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }
        res.json(user);
      } catch (err) {
        console.error("me error:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    userRouter.get("/search", authMiddleware, async (req, res) => {
      try {
        const q = (req.query.q || "").trim();
        if (!q || q.length < 2) {
          return res.json({ users: [] });
        }
        const users = await prisma.user.findMany({
          where: {
            OR: [
              { address: { contains: q.toLowerCase() } },
              { ensName: { contains: q.toLowerCase() } },
              { displayName: { contains: q } }
            ],
            id: { not: req.user.userId }
            // Exclude self
          },
          select: {
            id: true,
            address: true,
            ensName: true,
            avatarUrl: true,
            displayName: true
          },
          take: 20
        });
        res.json({ users });
      } catch (err) {
        console.error("search error:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    userRouter.patch("/profile", authMiddleware, async (req, res) => {
      try {
        const { displayName, avatarUrl } = req.body;
        const user = await prisma.user.update({
          where: { id: req.user.userId },
          data: {
            ...displayName !== void 0 && { displayName },
            ...avatarUrl !== void 0 && { avatarUrl }
          },
          select: {
            id: true,
            address: true,
            ensName: true,
            avatarUrl: true,
            displayName: true
          }
        });
        res.json(user);
      } catch (err) {
        console.error("profile error:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    userRouter.post("/pubkey", authMiddleware, async (req, res) => {
      try {
        const { publicKey } = req.body;
        if (!publicKey || typeof publicKey !== "string" || publicKey.length > 2e3) {
          return res.status(400).json({ error: "Invalid publicKey" });
        }
        const user = await prisma.user.update({
          where: { id: req.user.userId },
          data: { publicKey }
        });
        res.json({ ok: true });
      } catch (err) {
        console.error("pubkey error:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    userRouter.get("/pubkey/:address", authMiddleware, async (req, res) => {
      try {
        const user = await prisma.user.findFirst({
          where: { address: req.params.address.toLowerCase() },
          select: { id: true, address: true, publicKey: true, pubkeyAttestation: true }
        });
        if (!user || !user.publicKey) {
          return res.status(404).json({ error: "Public key not found" });
        }
        res.json({
          userId: user.id,
          address: user.address,
          publicKey: user.publicKey,
          attestation: user.pubkeyAttestation ? JSON.parse(user.pubkeyAttestation) : null
        });
      } catch (err) {
        console.error("pubkey get error:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    userRouter.post("/pubkey-attestation", authMiddleware, async (req, res) => {
      try {
        const { wallet, pubkey, timestamp, signature } = req.body;
        if (!wallet || !pubkey || !timestamp || !signature) {
          return res.status(400).json({ error: "Missing attestation fields" });
        }
        await prisma.user.update({
          where: { id: req.user.userId },
          data: {
            publicKey: pubkey,
            pubkeyAttestation: JSON.stringify({ wallet, pubkey, timestamp, signature })
          }
        });
        res.json({ ok: true });
      } catch (err) {
        console.error("pubkey-attestation error:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    userRouter.get("/:id", authMiddleware, async (req, res) => {
      try {
        const user = await prisma.user.findUnique({
          where: { id: req.params.id },
          select: {
            id: true,
            address: true,
            ensName: true,
            avatarUrl: true,
            displayName: true
          }
        });
        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }
        res.json(user);
      } catch (err) {
        console.error("user error:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
  }
});

// src/routes/tx.ts
import { Router as Router3 } from "express";
import { ethers as ethers2 } from "ethers";
function getProvider(chainId) {
  const rpc = RPC_MAP[chainId];
  if (!rpc) return null;
  return new ethers2.JsonRpcProvider(rpc);
}
var txRouter, RPC_MAP;
var init_tx = __esm({
  "src/routes/tx.ts"() {
    "use strict";
    init_auth();
    txRouter = Router3();
    txRouter.use(authMiddleware);
    RPC_MAP = {
      1: "https://eth.llamarpc.com",
      56: "https://bsc-dataseed.binance.org",
      137: "https://polygon.llamarpc.com",
      8453: "https://base.llamarpc.com",
      42161: "https://arb1.arbitrum.io/rpc",
      10: "https://mainnet.optimism.io",
      43114: "https://api.avax.network/ext/bc/C/rpc"
    };
    __name(getProvider, "getProvider");
    txRouter.post("/estimate", async (req, res) => {
      try {
        const { to, value, chainId, tokenAddress, from } = req.body;
        if (!to || !value || !chainId) {
          return res.status(400).json({ error: "Missing to, value, or chainId" });
        }
        const provider = getProvider(chainId);
        const isToken = !!tokenAddress;
        let gasEstimate;
        let gasPrice;
        if (provider) {
          try {
            const tx = {
              to,
              value: ethers2.parseEther(String(value)),
              chainId
            };
            if (from) tx.from = from;
            if (tokenAddress) {
              const iface = new ethers2.Interface(["function transfer(address to, uint256 amount)"]);
              tx.to = tokenAddress;
              tx.data = iface.encodeFunctionData("transfer", [to, value]);
              tx.value = void 0;
            }
            const [gas, price] = await Promise.all([
              provider.estimateGas(tx).catch(() => null),
              provider.getFeeData().catch(() => null)
            ]);
            gasEstimate = gas !== null ? gas : isToken ? 65000n : 21000n;
            gasPrice = price?.gasPrice || 5000000000n;
          } catch {
            gasEstimate = isToken ? 65000n : 21000n;
            gasPrice = 5000000000n;
          }
        } else {
          gasEstimate = isToken ? 65000n : 21000n;
          gasPrice = 5000000000n;
        }
        res.json({
          gasEstimate: gasEstimate.toString(),
          gasPriceWei: gasPrice.toString(),
          gasTotalWei: (gasEstimate * gasPrice).toString(),
          gasTotalEth: ethers2.formatEther(gasEstimate * gasPrice),
          isToken
        });
      } catch (err) {
        console.error("[tx] estimate error:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    txRouter.get("/chains", (_req, res) => {
      res.json({
        chains: Object.entries(RPC_MAP).map(([id, rpc]) => {
          const names = {
            "1": ["Ethereum", "ETH"],
            "56": ["BNB Chain", "BNB"],
            "137": ["Polygon", "POL"],
            "8453": ["Base", "ETH"],
            "42161": ["Arbitrum", "ETH"],
            "10": ["Optimism", "ETH"],
            "43114": ["Avalanche", "AVAX"]
          };
          const [name, symbol] = names[id] || ["Unknown", "ETH"];
          return { id: Number(id), name, symbol, rpc };
        })
      });
    });
    txRouter.post("/prepare", async (req, res) => {
      try {
        const { to, value, chainId, tokenAddress } = req.body;
        if (!to || !value || !chainId) {
          return res.status(400).json({ error: "Missing to, value, or chainId" });
        }
        const chainIdNum = parseInt(chainId, 10);
        res.json({
          to,
          value,
          chainId: chainIdNum,
          tokenAddress: tokenAddress || null,
          data: tokenAddress ? new ethers2.Interface(["function transfer(address to, uint256 amount)"]).encodeFunctionData("transfer", [to, value]) : "0x"
        });
      } catch (err) {
        console.error("[tx] prepare error:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
  }
});

// src/routes/groups.ts
import { Router as Router4 } from "express";
var groupRouter;
var init_groups = __esm({
  "src/routes/groups.ts"() {
    "use strict";
    init_auth();
    init_prisma();
    groupRouter = Router4();
    groupRouter.use(authMiddleware);
    groupRouter.post("/:id/keys", async (req, res) => {
      try {
        const groupId = req.params.id;
        const group = await prisma.group.findUnique({ where: { id: groupId } });
        if (!group) return res.status(404).json({ error: "Not found" });
        if (group.creatorId !== req.user.userId) return res.status(403).json({ error: "Only group creator can set keys" });
        const { envelopes } = req.body;
        if (!envelopes?.length) return res.status(400).json({ error: "envelopes required" });
        let created = 0;
        for (const env of envelopes) {
          const member = await prisma.groupMember.findUnique({
            where: { groupId_userId: { groupId, userId: env.userId } }
          });
          if (!member) continue;
          await prisma.groupKeyEnvelope.upsert({
            where: { groupId_userId: { groupId, userId: env.userId } },
            create: { groupId, userId: env.userId, encryptedKey: env.encryptedKey, iv: env.iv, version: 1 },
            update: { encryptedKey: env.encryptedKey, iv: env.iv }
          });
          created++;
        }
        res.json({ ok: true, created, total: envelopes.length });
      } catch (err) {
        console.error("group keys upload:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    groupRouter.get("/:id/keys/my", async (req, res) => {
      try {
        const envelope = await prisma.groupKeyEnvelope.findUnique({
          where: { groupId_userId: { groupId: req.params.id, userId: req.user.userId } }
        });
        if (!envelope) return res.status(404).json({ error: "No key envelope for you in this group" });
        res.json({ envelope: { userId: envelope.userId, encryptedKey: envelope.encryptedKey, iv: envelope.iv, version: envelope.version } });
      } catch (err) {
        console.error("get my group key:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    groupRouter.get("/:id/keys", async (req, res) => {
      try {
        const groupId = req.params.id;
        const isMember = await prisma.groupMember.findUnique({ where: { groupId_userId: { groupId, userId: req.user.userId } } });
        if (!isMember) return res.status(403).json({ error: "Not a member" });
        const envelopes = await prisma.groupKeyEnvelope.findMany({ where: { groupId } });
        res.json({ envelopes: envelopes.map((e) => ({ userId: e.userId, encryptedKey: e.encryptedKey, iv: e.iv, version: e.version })) });
      } catch (err) {
        console.error("list group keys:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    groupRouter.get("/", async (req, res) => {
      try {
        const memberships = await prisma.groupMember.findMany({
          where: { userId: req.user.userId },
          include: {
            group: {
              include: {
                members: {
                  include: {
                    user: { select: { id: true, address: true, displayName: true, avatarUrl: true } }
                  }
                }
              }
            }
          },
          orderBy: { group: { updatedAt: "desc" } }
        });
        res.json({ groups: memberships.map((m) => m.group) });
      } catch (err) {
        console.error("list groups:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    groupRouter.post("/", async (req, res) => {
      try {
        const { name, description, memberAddresses } = req.body;
        if (!name?.trim()) return res.status(400).json({ error: "Group name required" });
        const group = await prisma.group.create({
          data: {
            name: name.trim(),
            description: description?.trim() || null,
            creatorId: req.user.userId,
            members: { create: { userId: req.user.userId, role: "admin" } }
          },
          include: {
            members: {
              include: { user: { select: { id: true, address: true, displayName: true } } }
            }
          }
        });
        if (memberAddresses?.length) {
          const users = await prisma.user.findMany({
            where: { address: { in: memberAddresses.map((a) => a.toLowerCase()) } }
          });
          for (const u of users) {
            try {
              await prisma.groupMember.create({ data: { groupId: group.id, userId: u.id, role: "member" } });
            } catch {
            }
          }
        }
        res.status(201).json({ group });
      } catch (err) {
        console.error("create group:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    groupRouter.post("/join", async (req, res) => {
      try {
        const { name } = req.body;
        if (!name?.trim()) return res.status(400).json({ error: "Group name required" });
        let group = await prisma.group.findFirst({ where: { name: name.trim() } });
        if (!group) {
          group = await prisma.group.findFirst({ where: { name: { contains: name.trim() } } });
        }
        if (!group) return res.status(404).json({ error: "Group not found" });
        const existing = await prisma.groupMember.findUnique({
          where: { groupId_userId: { groupId: group.id, userId: req.user.userId } }
        });
        if (existing) return res.status(409).json({ error: "Already a member" });
        await prisma.groupMember.create({
          data: { groupId: group.id, userId: req.user.userId, role: "member" }
        });
        const updated = await prisma.group.findUnique({
          where: { id: group.id },
          include: { members: { include: { user: { select: { id: true, address: true, displayName: true, avatarUrl: true } } } } }
        });
        res.json({ group: updated });
      } catch (err) {
        console.error("join by name:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    groupRouter.post("/join-by-code", async (req, res) => {
      try {
        const { code } = req.body;
        if (!code?.trim()) return res.status(400).json({ error: "Invite code required" });
        const group = await prisma.group.findUnique({ where: { inviteCode: code.trim().toUpperCase() } });
        if (!group) return res.status(404).json({ error: "Invalid invite code" });
        const existing = await prisma.groupMember.findUnique({
          where: { groupId_userId: { groupId: group.id, userId: req.user.userId } }
        });
        if (existing) return res.status(409).json({ error: "Already a member" });
        await prisma.groupMember.create({
          data: { groupId: group.id, userId: req.user.userId, role: "member" }
        });
        const updated = await prisma.group.findUnique({
          where: { id: group.id },
          include: { members: { include: { user: { select: { id: true, address: true, displayName: true, avatarUrl: true } } } } }
        });
        res.json({ group: updated });
      } catch (err) {
        console.error("join by code:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    groupRouter.get("/:id", async (req, res) => {
      try {
        const group = await prisma.group.findUnique({
          where: { id: req.params.id },
          include: {
            members: {
              include: { user: { select: { id: true, address: true, displayName: true, avatarUrl: true } } }
            }
          }
        });
        if (!group) return res.status(404).json({ error: "Not found" });
        const isMember = group.members.some((m) => m.userId === req.user.userId);
        if (!isMember) return res.status(403).json({ error: "Not a member" });
        res.json({ group });
      } catch (err) {
        console.error("get group:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    groupRouter.post("/:id/join", async (req, res) => {
      try {
        const group = await prisma.group.findUnique({ where: { id: req.params.id } });
        if (!group) return res.status(404).json({ error: "Not found" });
        try {
          await prisma.groupMember.create({ data: { groupId: group.id, userId: req.user.userId, role: "member" } });
        } catch {
          return res.status(409).json({ error: "Already a member" });
        }
        const updated = await prisma.group.findUnique({
          where: { id: group.id },
          include: { members: { include: { user: { select: { id: true, address: true, displayName: true, avatarUrl: true } } } } }
        });
        res.json({ group: updated });
      } catch (err) {
        console.error("join:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    groupRouter.post("/:id/invite", async (req, res) => {
      try {
        const { addresses } = req.body;
        if (!addresses?.length) return res.status(400).json({ error: "Addresses required" });
        const group = await prisma.group.findUnique({ where: { id: req.params.id } });
        if (!group) return res.status(404).json({ error: "Not found" });
        const users = await prisma.user.findMany({ where: { address: { in: addresses.map((a) => a.toLowerCase()) } } });
        let added = 0;
        for (const u of users) {
          try {
            await prisma.groupMember.create({ data: { groupId: group.id, userId: u.id, role: "member" } });
            added++;
          } catch {
          }
        }
        res.json({ invited: added, total: addresses.length });
      } catch (err) {
        console.error("invite:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    groupRouter.post("/:id/invite-code", async (req, res) => {
      try {
        const groupId = req.params.id;
        const group = await prisma.group.findUnique({ where: { id: groupId } });
        if (!group) return res.status(404).json({ error: "Not found" });
        const isMember = await prisma.groupMember.findUnique({
          where: { groupId_userId: { groupId, userId: req.user.userId } }
        });
        if (!isMember || isMember.role !== "admin") return res.status(403).json({ error: "Only group admins can generate invite codes" });
        if (group.inviteCode) return res.json({ inviteCode: group.inviteCode });
        const code = Array.from({ length: 6 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random() * 36)]).join("");
        const updated = await prisma.group.update({
          where: { id: groupId },
          data: { inviteCode: code }
        });
        res.json({ inviteCode: updated.inviteCode });
      } catch (err) {
        console.error("invite code:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    groupRouter.get("/:id/messages", async (req, res) => {
      try {
        const msgs = await prisma.groupMessage.findMany({
          where: { groupId: req.params.id },
          orderBy: { createdAt: "desc" },
          take: 100
        });
        res.json({ messages: msgs.reverse() });
      } catch (err) {
        console.error("messages:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    groupRouter.post("/:id/messages", async (req, res) => {
      try {
        const groupId = req.params.id;
        const group = await prisma.group.findUnique({ where: { id: groupId } });
        if (!group) return res.status(404).json({ error: "Not found" });
        const isMember = await prisma.groupMember.findUnique({ where: { groupId_userId: { groupId, userId: req.user.userId } } });
        if (!isMember) return res.status(403).json({ error: "Not a member" });
        const msg = await prisma.groupMessage.create({
          data: { groupId, senderId: req.user.userId, content: req.body.content, messageType: req.body.messageType || "text", metadata: req.body.metadata || null, keyVersion: req.body.keyVersion || 1 }
        });
        const members = await prisma.groupMember.findMany({ where: { groupId } });
        const { pushEvent: pushEvent2 } = await Promise.resolve().then(() => (init_index(), index_exports));
        const meta = req.body.metadata ? JSON.parse(req.body.metadata) : null;
        const mentionedIds = meta?.mentions || [];
        for (const m of members) {
          if (m.userId !== req.user.userId) {
            pushEvent2(m.userId, { type: "new_group_msg", payload: { groupId, mentioned: mentionedIds.includes(m.userId) ? true : false } });
          }
        }
        res.status(201).json({ message: msg });
      } catch (err) {
        console.error("send group msg:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    groupRouter.post("/:id/leave", async (req, res) => {
      try {
        const groupId = req.params.id;
        const userId = req.user.userId;
        const membership = await prisma.groupMember.findUnique({
          where: { groupId_userId: { groupId, userId } }
        });
        if (!membership) return res.status(404).json({ error: "Not a member of this group" });
        if (membership.role === "admin") {
          const memberCount = await prisma.groupMember.count({ where: { groupId, id: { not: membership.id } } });
          if (memberCount === 0) {
            await prisma.groupMember.deleteMany({ where: { groupId } });
            await prisma.groupKeyEnvelope.deleteMany({ where: { groupId } });
            await prisma.groupMessage.deleteMany({ where: { groupId } });
            await prisma.group.delete({ where: { id: groupId } });
            return res.json({ deleted: true });
          }
        }
        await prisma.groupMember.delete({ where: { id: membership.id } });
        res.json({ success: true });
      } catch (err) {
        console.error("leave group:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    groupRouter.put("/:id", async (req, res) => {
      try {
        const groupId = req.params.id;
        const userId = req.user.userId;
        const membership = await prisma.groupMember.findUnique({
          where: { groupId_userId: { groupId, userId } }
        });
        if (!membership || membership.role !== "admin") {
          return res.status(403).json({ error: "Only admin can update group" });
        }
        const { name, description } = req.body;
        const data = {};
        if (name) data.name = name;
        if (description !== void 0) data.description = description;
        if (Object.keys(data).length === 0) {
          return res.status(400).json({ error: "Nothing to update" });
        }
        const group = await prisma.group.update({ where: { id: groupId }, data });
        res.json({ group });
      } catch (err) {
        console.error("update group:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    groupRouter.post("/:id/kick/:userId", async (req, res) => {
      try {
        const groupId = req.params.id;
        const adminId = req.user.userId;
        const targetId = req.params.userId;
        const adminMembership = await prisma.groupMember.findUnique({
          where: { groupId_userId: { groupId, userId: adminId } }
        });
        if (!adminMembership || adminMembership.role !== "admin") {
          return res.status(403).json({ error: "Only admin can kick members" });
        }
        if (adminId === targetId) {
          return res.status(400).json({ error: "Cannot kick yourself \u2014 use Leave Group instead" });
        }
        const target = await prisma.groupMember.findUnique({
          where: { groupId_userId: { groupId, userId: targetId } }
        });
        if (!target) return res.status(404).json({ error: "Member not found in group" });
        await prisma.groupMember.delete({ where: { id: target.id } });
        await prisma.groupKeyEnvelope.deleteMany({ where: { groupId, userId: targetId } });
        const { pushEvent: pushEvent2 } = await Promise.resolve().then(() => (init_index(), index_exports));
        pushEvent2(targetId, { type: "kicked_from_group", payload: { groupId } });
        res.json({ success: true });
      } catch (err) {
        console.error("kick member:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    groupRouter.post("/:id/transfer", async (req, res) => {
      try {
        const groupId = req.params.id;
        const adminId = req.user.userId;
        const newAdminId = req.body.userId;
        const adminMembership = await prisma.groupMember.findUnique({
          where: { groupId_userId: { groupId, userId: adminId } }
        });
        if (!adminMembership || adminMembership.role !== "admin") {
          return res.status(403).json({ error: "Only admin can transfer ownership" });
        }
        const target = await prisma.groupMember.findUnique({
          where: { groupId_userId: { groupId, userId: newAdminId } }
        });
        if (!target) return res.status(404).json({ error: "Target member not found in group" });
        await prisma.groupMember.update({
          where: { id: adminMembership.id },
          data: { role: "member" }
        });
        await prisma.groupMember.update({
          where: { id: target.id },
          data: { role: "admin" }
        });
        const { pushEvent: pushEvent2 } = await Promise.resolve().then(() => (init_index(), index_exports));
        pushEvent2(newAdminId, { type: "group_admin_changed", payload: { groupId } });
        res.json({ success: true });
      } catch (err) {
        console.error("transfer admin:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
  }
});

// src/routes/discover.ts
import { Router as Router5 } from "express";
var discoverRouter, CERES_API;
var init_discover = __esm({
  "src/routes/discover.ts"() {
    "use strict";
    init_auth();
    init_prisma();
    discoverRouter = Router5();
    discoverRouter.use(authMiddleware);
    CERES_API = process.env.CERES_API || "http://43.156.99.215:5000";
    discoverRouter.get("/ceres", async (req, res) => {
      try {
        const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
        if (!user) return res.status(404).json({ error: "User not found" });
        const results = [];
        try {
          const invCheck = await fetch(`${CERES_API}/batch-check`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ addresses: [user.address] }),
            signal: AbortSignal.timeout(5e3)
          });
          if (invCheck.ok) {
            const invData = await invCheck.json();
            const entry = invData?.[user.address];
            if (entry?.invited) {
              results.push({ address: entry.inviter || "", relation: "invited_by" });
            }
          }
        } catch {
        }
        try {
          const graphResp = await fetch(`${CERES_API}/address-graph/${user.address}`, {
            signal: AbortSignal.timeout(5e3)
          });
          if (graphResp.ok) {
            const graphData = await graphResp.json();
            const invitees = graphData?.invitees || [];
            for (const inv of invitees) {
              if (inv.address && !results.some((r) => r.address === inv.address)) {
                results.push({ address: inv.address, relation: "invited" });
              }
            }
          }
        } catch {
        }
        if (results.length > 0) {
          const addresses = results.map((r) => r.address.toLowerCase());
          const localUsers = await prisma.user.findMany({
            where: { address: { in: addresses } },
            select: { address: true, displayName: true, id: true }
          });
          for (const r of results) {
            const lu = localUsers.find((u) => u.address === r.address.toLowerCase());
            if (lu) {
              r.userId = lu.id;
              r.displayName = lu.displayName || void 0;
            }
          }
        }
        res.json({ results, source: "ceres" });
      } catch (err) {
        console.error("ceres discover error:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    discoverRouter.get("/search", async (req, res) => {
      try {
        const q = (req.query.q || "").trim().toLowerCase();
        if (!q || q.length < 2) {
          return res.json({ results: [] });
        }
        const users = await prisma.user.findMany({
          where: {
            OR: [
              { address: { contains: q } },
              { displayName: { contains: q } },
              { ensName: { contains: q } }
            ],
            NOT: { id: req.user.userId }
          },
          select: { id: true, address: true, displayName: true, ensName: true, avatarUrl: true },
          take: 20
        });
        res.json({ results: users });
      } catch (err) {
        console.error("discover search error:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
  }
});

// src/routes/profile.ts
import { Router as Router6 } from "express";
import { ethers as ethers3 } from "ethers";
var profileRouter, OXA_RPC, CERES_REGISTRY, CERES_DID, registryAbi, didAbi;
var init_profile = __esm({
  "src/routes/profile.ts"() {
    "use strict";
    init_auth();
    init_prisma();
    profileRouter = Router6();
    OXA_RPC = "https://rpc-oxa.0xainet.top";
    CERES_REGISTRY = "0x55C1364E46B8Bef987559608e3d831e7D47F1f35";
    CERES_DID = "0x08236d3246653C4699CBBe4458efdC0f5B067250";
    registryAbi = [{ type: "function", name: "tokenOf", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" }];
    didAbi = [{ type: "function", name: "profiles", inputs: [{ name: "", type: "uint256" }], outputs: [{ name: "name", type: "string" }, { name: "bio", type: "string" }, { name: "avatar", type: "string" }, { name: "updatedAt", type: "uint256" }], stateMutability: "view" }];
    profileRouter.get("/ceres/:address", async (req, res) => {
      try {
        const addr = req.params.address.toLowerCase();
        const provider = new ethers3.JsonRpcProvider(OXA_RPC);
        const registry = new ethers3.Contract(CERES_REGISTRY, registryAbi, provider);
        const did = new ethers3.Contract(CERES_DID, didAbi, provider);
        const tokenId = await registry.tokenOf(addr);
        if (!tokenId || tokenId === 0n) return res.json({ name: "", bio: "", avatar: "" });
        const profile = await did.profiles(tokenId);
        const result = { name: profile.name || "", bio: profile.bio || "", avatar: profile.avatar || "" };
        const existing = await prisma.user.findUnique({ where: { address: addr } });
        if (existing && result.name && !existing.displayName) {
          await prisma.user.update({ where: { address: addr }, data: { displayName: result.name, bio: result.bio || null } });
        }
        res.json(result);
      } catch (err) {
        console.warn("[Ceres] server-side profile read failed:", err?.reason || err?.message || err);
        res.json({ name: "", bio: "", avatar: "" });
      }
    });
    profileRouter.get("/", authMiddleware, async (req, res) => {
      try {
        const user = await prisma.user.findUnique({
          where: { id: req.user.userId },
          select: { id: true, address: true, displayName: true, ensName: true, avatarUrl: true, bio: true, createdAt: true }
        });
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json({ user });
      } catch (err) {
        console.error("profile error:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    profileRouter.get("/:address", async (req, res) => {
      try {
        const addr = req.params.address.toLowerCase();
        const user = await prisma.user.findUnique({
          where: { address: addr },
          select: { id: true, address: true, displayName: true, ensName: true, avatarUrl: true, bio: true, createdAt: true }
        });
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json({ user });
      } catch (err) {
        console.error("profile error:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    profileRouter.patch("/", authMiddleware, async (req, res) => {
      try {
        const { displayName, avatarUrl, bio } = req.body;
        const data = {};
        if (displayName !== void 0) data.displayName = displayName?.trim() || null;
        if (avatarUrl !== void 0) data.avatarUrl = avatarUrl?.trim() || null;
        if (bio !== void 0) data.bio = bio?.slice(0, 160) || null;
        const user = await prisma.user.update({ where: { id: req.user.userId }, data, select: { id: true, address: true, displayName: true, ensName: true, avatarUrl: true, bio: true } });
        res.json({ user });
      } catch (err) {
        console.error("profile update error:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
  }
});

// src/routes/friends.ts
import { Router as Router7 } from "express";
var friendsRouter;
var init_friends = __esm({
  "src/routes/friends.ts"() {
    "use strict";
    init_auth();
    init_prisma();
    friendsRouter = Router7();
    friendsRouter.use(authMiddleware);
    friendsRouter.get("/", async (req, res) => {
      try {
        const userId = req.user.userId;
        const contacts = await prisma.contact.findMany({
          where: {
            OR: [
              { userId, status: "accepted" },
              { contactId: userId, status: "accepted" }
            ]
          },
          include: {
            user: { select: { id: true, address: true, displayName: true, avatarUrl: true, bio: true } },
            contact: { select: { id: true, address: true, displayName: true, avatarUrl: true, bio: true } }
          },
          orderBy: { createdAt: "desc" }
        });
        const friends = contacts.map((c) => {
          const isMe = c.userId === userId;
          const friend = isMe ? c.contact : c.user;
          return {
            id: c.id,
            userId: friend.id,
            address: friend.address,
            displayName: friend.displayName || friend.address.slice(0, 6) + "..." + friend.address.slice(-4),
            avatarUrl: friend.avatarUrl,
            bio: friend.bio,
            status: c.status
          };
        });
        res.json({ friends });
      } catch (err) {
        console.error("list friends error:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    friendsRouter.get("/requests", async (req, res) => {
      try {
        const userId = req.user.userId;
        const requests = await prisma.contact.findMany({
          where: { contactId: userId, status: "pending" },
          include: {
            user: { select: { id: true, address: true, displayName: true, avatarUrl: true } }
          },
          orderBy: { createdAt: "desc" }
        });
        res.json({
          requests: requests.map((r) => ({
            id: r.id,
            userId: r.user?.id,
            address: r.user?.address,
            displayName: r.user?.displayName || r.user?.address?.slice(0, 6) + "..." + r.user?.address?.slice(-4),
            avatarUrl: r.user?.avatarUrl,
            createdAt: r.createdAt
          }))
        });
      } catch (err) {
        console.error("friend requests error:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    friendsRouter.post("/request", async (req, res) => {
      try {
        const { address } = req.body;
        if (!address) return res.status(400).json({ error: "Address required" });
        const targetAddr = address.toLowerCase();
        const targetUser = await prisma.user.findUnique({ where: { address: targetAddr } });
        if (!targetUser) return res.status(404).json({ error: "User not found on CryptChat" });
        if (targetUser.id === req.user.userId) return res.status(400).json({ error: "Cannot add yourself" });
        const CERES_API2 = "http://43.156.99.215:5000/api/v1";
        try {
          const myProfile = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { address: true } });
          const checkRes = await fetch(`${CERES_API2}/batch-check`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ addresses: [myProfile.address, targetAddr] }),
            signal: AbortSignal.timeout(5e3)
          });
          if (checkRes.ok) {
            const { profiles } = await checkRes.json();
            for (const p of profiles) {
              if (!p.invited) {
                const who = p.address.toLowerCase() === myProfile.address.toLowerCase() ? "You" : "They";
                return res.status(403).json({ error: `${who} don't have a Ceres DID. Both parties need a Ceres DID to add friends. Visit Ceres to mint your on-chain identity.` });
              }
            }
          }
        } catch (ceresErr) {
          console.warn("[Ceres] DID check failed, allowing request:", ceresErr);
        }
        const existing = await prisma.contact.findFirst({
          where: {
            OR: [
              { userId: req.user.userId, contactId: targetUser.id },
              { userId: targetUser.id, contactId: req.user.userId }
            ]
          }
        });
        if (existing) {
          if (existing.status === "accepted") return res.status(409).json({ error: "Already friends" });
          if (existing.status === "pending" && existing.userId === req.user.userId) return res.status(409).json({ error: "Request already sent" });
          if (existing.status === "pending" && existing.userId === targetUser.id) {
            await prisma.contact.update({ where: { id: existing.id }, data: { status: "accepted" } });
            return res.json({ status: "accepted" });
          }
        }
        const contact = await prisma.contact.create({
          data: {
            userId: req.user.userId,
            contactId: targetUser.id,
            status: "pending"
          }
        });
        res.status(201).json({ status: "pending", requestId: contact.id });
      } catch (err) {
        console.error("send request error:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    friendsRouter.post("/accept", async (req, res) => {
      try {
        const { requestId } = req.body;
        if (!requestId) return res.status(400).json({ error: "requestId required" });
        const contact = await prisma.contact.findUnique({ where: { id: requestId } });
        if (!contact || contact.contactId !== req.user.userId) {
          return res.status(403).json({ error: "Invalid request" });
        }
        await prisma.contact.update({ where: { id: requestId }, data: { status: "accepted" } });
        res.json({ status: "accepted" });
      } catch (err) {
        console.error("accept error:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    friendsRouter.delete("/:address", async (req, res) => {
      try {
        const addr = req.params.address.toLowerCase();
        const targetUser = await prisma.user.findUnique({ where: { address: addr } });
        if (!targetUser) return res.status(404).json({ error: "User not found" });
        await prisma.contact.deleteMany({
          where: {
            OR: [
              { userId: req.user.userId, contactId: targetUser.id },
              { userId: targetUser.id, contactId: req.user.userId }
            ]
          }
        });
        res.json({ status: "removed" });
      } catch (err) {
        console.error("remove friend error:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    friendsRouter.get("/status/:address", async (req, res) => {
      try {
        const addr = req.params.address.toLowerCase();
        const targetUser = await prisma.user.findUnique({ where: { address: addr } });
        if (!targetUser) return res.json({ status: "not_found" });
        const contact = await prisma.contact.findFirst({
          where: {
            OR: [
              { userId: req.user.userId, contactId: targetUser.id },
              { userId: targetUser.id, contactId: req.user.userId }
            ]
          }
        });
        if (!contact) return res.json({ status: "none" });
        if (contact.status === "accepted") return res.json({ status: "accepted" });
        if (contact.userId === req.user.userId) return res.json({ status: "pending_sent" });
        res.json({ status: "pending_received", requestId: contact.id });
      } catch (err) {
        console.error("status error:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
  }
});

// src/routes/dm.ts
import { Router as Router8 } from "express";
var dmRouter;
var init_dm = __esm({
  "src/routes/dm.ts"() {
    "use strict";
    init_auth();
    init_prisma();
    dmRouter = Router8();
    dmRouter.get("/inbox", authMiddleware, async (req, res) => {
      try {
        const me = req.user.userId;
        const contacts = await prisma.contact.findMany({
          where: {
            OR: [
              { userId: me, status: "accepted" },
              { contactId: me, status: "accepted" }
            ]
          },
          include: {
            user: { select: { id: true, address: true, displayName: true, avatarUrl: true } },
            contact: { select: { id: true, address: true, displayName: true, avatarUrl: true } }
          }
        });
        const inbox = {};
        for (const c of contacts) {
          const friendId = c.userId === me ? c.contactId : c.userId;
          const friend = c.userId === me ? c.contact : c.user;
          if (!friend || inbox[friendId]) continue;
          const unread = await prisma.message.count({
            where: { senderId: friendId, receiverId: me, read: false }
          });
          const lastMsg = await prisma.message.findFirst({
            where: {
              OR: [
                { senderId: me, receiverId: friendId },
                { senderId: friendId, receiverId: me }
              ]
            },
            orderBy: { createdAt: "desc" }
          });
          inbox[friendId] = {
            friend: { id: friend.id, address: friend.address, displayName: friend.displayName, avatarUrl: friend.avatarUrl },
            unread,
            lastMessage: lastMsg ? { content: lastMsg.content, time: lastMsg.createdAt.getTime(), sender: lastMsg.senderId } : null
          };
        }
        res.json({ inbox: Object.values(inbox) });
      } catch (err) {
        console.error("inbox error:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    dmRouter.get("/:userId/messages", authMiddleware, async (req, res) => {
      try {
        const me = req.user.userId;
        const peerId = req.params.userId;
        const messages = await prisma.message.findMany({
          where: {
            OR: [
              { senderId: me, receiverId: peerId },
              { senderId: peerId, receiverId: me }
            ]
          },
          orderBy: { createdAt: "asc" },
          take: 100
        });
        await prisma.message.updateMany({
          where: { senderId: peerId, receiverId: me, read: false },
          data: { read: true }
        });
        res.json({ messages: messages.map((m) => ({
          id: m.id,
          content: m.content,
          sender: m.senderId,
          receiver: m.receiverId,
          time: m.createdAt.getTime(),
          read: m.read
        })) });
      } catch (err) {
        console.error("dm messages error:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    dmRouter.post("/:userId/messages", authMiddleware, async (req, res) => {
      try {
        const me = req.user.userId;
        const peerId = req.params.userId;
        const { content } = req.body;
        if (!content || typeof content !== "string") {
          return res.status(400).json({ error: "Content required" });
        }
        const contact = await prisma.contact.findFirst({
          where: {
            OR: [
              { userId: me, contactId: peerId, status: "accepted" },
              { userId: peerId, contactId: me, status: "accepted" }
            ]
          }
        });
        if (!contact) {
          return res.status(403).json({ error: "Not friends" });
        }
        const message = await prisma.message.create({
          data: { senderId: me, receiverId: peerId, content: content.slice(0, 5e3) }
        });
        const { pushEvent: pushEvent2 } = await Promise.resolve().then(() => (init_index(), index_exports));
        pushEvent2(peerId, { type: "new_dm", payload: { senderId: me } });
        res.json({ message: {
          id: message.id,
          content: message.content,
          sender: message.senderId,
          receiver: message.receiverId,
          time: message.createdAt.getTime()
        } });
      } catch (err) {
        console.error("dm send error:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
  }
});

// src/routes/moments.ts
import { Router as Router9 } from "express";
var momentsRouter;
var init_moments = __esm({
  "src/routes/moments.ts"() {
    "use strict";
    init_auth();
    init_prisma();
    momentsRouter = Router9();
    momentsRouter.post("/", authMiddleware, async (req, res) => {
      try {
        const { content, visibility } = req.body;
        if (!content || typeof content !== "string" || content.length > 1e3) {
          return res.status(400).json({ error: "Invalid content" });
        }
        const vis = visibility === "public" ? "public" : "friends";
        const moment = await prisma.moment.create({
          data: { userId: req.user.userId, content, visibility: vis }
        });
        const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
        res.json({
          moment: {
            id: moment.id,
            content: moment.content,
            visibility: moment.visibility,
            time: moment.createdAt,
            authorName: user?.displayName || user?.address?.slice(0, 8),
            authorAddr: user?.address
          }
        });
      } catch (err) {
        console.error("moments create error:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    momentsRouter.get("/", authMiddleware, async (req, res) => {
      try {
        const contacts = await prisma.contact.findMany({
          where: { userId: req.user.userId, status: "accepted" },
          select: { contactId: true }
        });
        const friendIds = contacts.map((c) => c.contactId);
        const moments = await prisma.moment.findMany({
          where: {
            OR: [
              { userId: { in: [req.user.userId, ...friendIds] } },
              // own + friends (all visibility)
              { visibility: "public" }
              // public from anyone
            ]
          },
          orderBy: { createdAt: "desc" },
          take: 50
        });
        const authorIds = [...new Set(moments.map((m) => m.userId))];
        const users = await prisma.user.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, address: true, displayName: true }
        });
        const userMap = new Map(users.map((u) => [u.id, u]));
        const momentIds = moments.map((m) => m.id);
        const [allLikes, allComments] = await Promise.all([
          prisma.momentLike.findMany({ where: { momentId: { in: momentIds } } }),
          prisma.momentComment.findMany({ where: { momentId: { in: momentIds } }, orderBy: { createdAt: "asc" } })
        ]);
        const commenterIds = [...new Set(allComments.map((c) => c.userId))];
        const commenters = await prisma.user.findMany({
          where: { id: { in: commenterIds } },
          select: { id: true, address: true, displayName: true }
        });
        const commenterMap = new Map(commenters.map((u) => [u.id, u]));
        res.json({
          moments: moments.map((m) => {
            const u = userMap.get(m.userId);
            const likes = allLikes.filter((l) => l.momentId === m.id);
            const comments = allComments.filter((c) => c.momentId === m.id);
            return {
              id: m.id,
              content: m.content,
              time: new Date(m.createdAt).toLocaleString(),
              authorName: u?.displayName || u?.address?.slice(0, 8),
              authorAddr: u?.address,
              userId: m.userId,
              likes: likes.map((l) => l.userId),
              liked: likes.some((l) => l.userId === req.user.userId),
              comments: comments.map((c) => ({
                id: c.id,
                userId: c.userId,
                content: c.content,
                time: new Date(c.createdAt).toLocaleString(),
                authorName: commenterMap.get(c.userId)?.displayName || commenterMap.get(c.userId)?.address?.slice(0, 8)
              }))
            };
          })
        });
      } catch (err) {
        console.error("moments list error:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    momentsRouter.delete("/:id", authMiddleware, async (req, res) => {
      try {
        const momentId = req.params.id;
        const userId = req.user.userId;
        const moment = await prisma.moment.findUnique({ where: { id: momentId } });
        if (!moment) {
          return res.status(404).json({ error: "Moment not found" });
        }
        if (moment.userId !== userId) {
          return res.status(403).json({ error: "Not your moment" });
        }
        await prisma.moment.delete({ where: { id: momentId } });
        res.json({ deleted: true });
      } catch (err) {
        console.error("delete moment error:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    momentsRouter.post("/:id/like", authMiddleware, async (req, res) => {
      try {
        const momentId = req.params.id;
        const userId = req.user.userId;
        const existing = await prisma.momentLike.findUnique({
          where: { momentId_userId: { momentId, userId } }
        });
        if (existing) {
          await prisma.momentLike.delete({ where: { id: existing.id } });
          return res.json({ liked: false });
        }
        await prisma.momentLike.create({ data: { momentId, userId } });
        res.json({ liked: true });
      } catch (err) {
        console.error("like error:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    momentsRouter.post("/:id/comment", authMiddleware, async (req, res) => {
      try {
        const momentId = req.params.id;
        const { content } = req.body;
        if (!content || typeof content !== "string" || content.length > 500) {
          return res.status(400).json({ error: "Invalid content" });
        }
        const comment = await prisma.momentComment.create({
          data: { momentId, userId: req.user.userId, content }
        });
        const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
        res.json({
          comment: {
            id: comment.id,
            userId: comment.userId,
            content: comment.content,
            time: new Date(comment.createdAt).toLocaleString(),
            authorName: user?.displayName || user?.address?.slice(0, 8)
          }
        });
      } catch (err) {
        console.error("comment error:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
  }
});

// src/routes/ipfs.ts
import { Router as Router10 } from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest();
}
function toBase58(buf) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let num = BigInt("0x" + buf.toString("hex"));
  let encoded = "";
  while (num > 0n) {
    encoded = alphabet[Number(num % 58n)] + encoded;
    num /= 58n;
  }
  for (let i = 0; i < buf.length && buf[i] === 0; i++) encoded = "1" + encoded;
  return encoded;
}
function multihash(buf) {
  const len = Buffer.alloc(1);
  len.writeUInt8(buf.length);
  return Buffer.concat([Buffer.from([18]), len, buf]);
}
function ipfsCidV0(buf) {
  const mh = multihash(sha256(buf));
  return "Qm" + toBase58(Buffer.concat([mh, sha256(buf)]));
}
async function pinataUpload(fileName, buffer, mimeType) {
  if (!PINATA_JWT) return null;
  try {
    const blob = new Blob([buffer], { type: mimeType || "application/octet-stream" });
    const form = new FormData();
    form.append("file", blob, fileName);
    form.append("pinataMetadata", JSON.stringify({ name: fileName }));
    const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: { Authorization: `Bearer ${PINATA_JWT}` },
      body: form,
      signal: AbortSignal.timeout(3e4)
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn("[Pinata] upload failed:", res.status, errText.slice(0, 200));
      return null;
    }
    const data = await res.json();
    return data.IpfsHash || null;
  } catch (err) {
    console.warn("[Pinata] upload error:", err?.message || err);
    return null;
  }
}
var ipfsRouter, PINATA_JWT, PINATA_GATEWAY, uploadDir;
var init_ipfs = __esm({
  "src/routes/ipfs.ts"() {
    "use strict";
    init_auth();
    ipfsRouter = Router10();
    PINATA_JWT = process.env.PINATA_JWT || "";
    PINATA_GATEWAY = "https://gateway.pinata.cloud/ipfs";
    uploadDir = path.join(process.cwd(), "uploads");
    fs.promises.mkdir(uploadDir, { recursive: true }).catch(() => {
    });
    __name(sha256, "sha256");
    __name(toBase58, "toBase58");
    __name(multihash, "multihash");
    __name(ipfsCidV0, "ipfsCidV0");
    __name(pinataUpload, "pinataUpload");
    ipfsRouter.post("/upload", authMiddleware, async (req, res) => {
      const { fileName, data, mimeType } = req.body;
      if (!data || !fileName) return res.status(400).json({ error: "fileName and data (base64) required" });
      try {
        const buffer = Buffer.from(data, "base64");
        const cid = await pinataUpload(fileName, buffer, mimeType || "application/octet-stream");
        if (cid) {
          res.json({
            cid,
            name: fileName,
            size: buffer.length,
            mimeType: mimeType || "application/octet-stream",
            url: `${PINATA_GATEWAY}/${cid}`
          });
          return;
        }
        const localCid = ipfsCidV0(buffer);
        const hashHex = sha256(buffer).toString("hex");
        const filePath = path.join(uploadDir, `${hashHex}_${fileName}`);
        await fs.promises.writeFile(filePath, buffer);
        res.json({
          cid: localCid,
          name: fileName,
          size: buffer.length,
          mimeType: mimeType || "application/octet-stream",
          url: `/api/ipfs/file/${localCid}`
        });
      } catch (err) {
        console.error("ipfs upload error:", err);
        res.status(500).json({ error: "Upload failed" });
      }
    });
    ipfsRouter.get("/file/:cid", async (req, res) => {
      try {
        const { cid } = req.params;
        if (PINATA_JWT) {
          const targetUrl = `${PINATA_GATEWAY}/${cid}`;
          const upstream = await fetch(targetUrl, {
            signal: AbortSignal.timeout(15e3),
            headers: { Accept: "*/*" }
          });
          if (upstream.ok) {
            const ct = upstream.headers.get("content-type") || "application/octet-stream";
            const buf = Buffer.from(await upstream.arrayBuffer());
            res.setHeader("Content-Type", ct);
            res.setHeader("Content-Length", buf.length);
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
            res.end(buf);
            return;
          }
        }
        const files = await fs.promises.readdir(uploadDir);
        let match;
        if (cid.startsWith("Qm")) {
          const cleanHash = cid.replace("Qm", "");
          match = files.find((f) => f.startsWith(cleanHash) || f.includes(cleanHash));
        }
        if (!match) match = files.find((f) => f.startsWith(cid) || f.includes(cid));
        if (!match) {
          const byHashSuffix = files.find((f) => {
            const parts = f.split("_");
            return parts.length > 1 && cid.endsWith(parts[0].slice(0, 8));
          });
          match = byHashSuffix;
        }
        if (!match) return res.status(404).json({ error: "File not found" });
        const filePath = path.join(uploadDir, match);
        const stat = await fs.promises.stat(filePath);
        res.setHeader("Content-Length", stat.size);
        res.setHeader("Content-Disposition", `inline; filename="${match}"`);
        res.sendFile(filePath);
      } catch (err) {
        console.error("ipfs get error:", err);
        res.status(500).json({ error: "Retrieval failed" });
      }
    });
  }
});

// src/routes/redpacket.ts
import { Router as Router11 } from "express";
var redpacketRouter;
var init_redpacket = __esm({
  "src/routes/redpacket.ts"() {
    "use strict";
    init_prisma();
    init_auth();
    redpacketRouter = Router11();
    redpacketRouter.use(authMiddleware);
    redpacketRouter.post("/", async (req, res) => {
      try {
        const { amount, count, chainId, tokenAddress, tokenSymbol, message, scope, scopeId } = req.body;
        const senderId = req.user.userId;
        if (!amount || !count || !chainId || !scope || !scopeId) {
          return res.status(400).json({ error: "Missing required fields: amount, count, chainId, scope, scopeId" });
        }
        if (count < 1 || count > 100) return res.status(400).json({ error: "count must be 1-100" });
        const packet = await prisma.redPacket.create({
          data: {
            senderId,
            scope,
            scopeId,
            amount: String(amount),
            count,
            chainId,
            tokenAddress: tokenAddress || null,
            tokenSymbol: tokenSymbol || "ETH",
            message: message || "\u606D\u559C\u53D1\u8D22\uFF0C\u5927\u5409\u5927\u5229\uFF01",
            remaining: count
          }
        });
        const { pushEvent: pushEvent2 } = await Promise.resolve().then(() => (init_index(), index_exports));
        if (scope === "group") {
          const members = await prisma.groupMember.findMany({ where: { groupId: scopeId } });
          for (const m of members) {
            if (m.userId !== senderId) {
              pushEvent2(m.userId, { type: "red_packet", payload: { packetId: packet.id, senderId } });
            }
          }
        } else {
          pushEvent2(scopeId, { type: "red_packet", payload: { packetId: packet.id, senderId } });
        }
        res.status(201).json({ packet });
      } catch (err) {
        console.error("create redpacket:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    redpacketRouter.get("/", async (req, res) => {
      try {
        const scopeId = req.query.scopeId;
        const scope = req.query.scope;
        if (!scopeId) return res.status(400).json({ error: "scopeId required" });
        const packets = await prisma.redPacket.findMany({
          where: {
            scope: scope || void 0,
            scopeId
          },
          include: {
            claims: { select: { claimerId: true, amount: true, claimedAt: true } }
          },
          orderBy: { createdAt: "desc" },
          take: 20
        });
        res.json({ packets });
      } catch (err) {
        console.error("list redpackets:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    redpacketRouter.get("/:id", async (req, res) => {
      try {
        const packet = await prisma.redPacket.findUnique({
          where: { id: req.params.id },
          include: {
            claims: { select: { claimerId: true, amount: true, claimedAt: true }, orderBy: { claimedAt: "desc" } }
          }
        });
        if (!packet) return res.status(404).json({ error: "Red packet not found" });
        res.json({ packet });
      } catch (err) {
        console.error("get redpacket:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
    redpacketRouter.post("/:id/claim", async (req, res) => {
      try {
        const packetId = req.params.id;
        const claimerId = req.user.userId;
        const packet = await prisma.redPacket.findUnique({ where: { id: packetId } });
        if (!packet) return res.status(404).json({ error: "Red packet not found" });
        if (packet.remaining <= 0) return res.status(400).json({ error: "All packets claimed!" });
        if (packet.senderId === claimerId) return res.status(400).json({ error: "Cannot claim your own red packet" });
        const existing = await prisma.redPacketClaim.findUnique({ where: { packetId_claimerId: { packetId, claimerId } } });
        if (existing) return res.status(400).json({ error: "Already claimed!", claim: existing });
        const avgWei = BigInt(packet.amount) / BigInt(packet.count);
        const factor = 50 + Math.floor(Math.random() * 100);
        let claimAmount = avgWei * BigInt(factor) / 100n;
        const alreadyClaimed = await prisma.redPacketClaim.findMany({ where: { packetId } });
        const claimedTotal = alreadyClaimed.reduce((sum, c) => sum + BigInt(c.amount), 0n);
        const remainingTotal = BigInt(packet.amount) - claimedTotal;
        if (packet.remaining === 1) {
          claimAmount = remainingTotal;
        } else if (claimAmount > remainingTotal) {
          claimAmount = remainingTotal - 1n;
        }
        if (claimAmount <= 0n) claimAmount = 1n;
        const claim = await prisma.redPacketClaim.create({
          data: { packetId, claimerId, amount: String(claimAmount) }
        });
        await prisma.redPacket.update({
          where: { id: packetId },
          data: { remaining: { decrement: 1 }, claimed: { increment: 1 } }
        });
        const { pushEvent: pushEvent2 } = await Promise.resolve().then(() => (init_index(), index_exports));
        pushEvent2(packet.senderId, { type: "red_packet_claimed", payload: { packetId, claimerId, amount: String(claimAmount) } });
        res.json({ claim });
      } catch (err) {
        if (err?.code === "P2002") return res.status(400).json({ error: "Already claimed!" });
        console.error("claim redpacket:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });
  }
});

// src/index.ts
var index_exports = {};
__export(index_exports, {
  app: () => app,
  clients: () => clients,
  pushEvent: () => pushEvent,
  server: () => server
});
import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
function pushEvent(userId, event) {
  const set = clients.get(userId);
  if (!set || set.size === 0) return false;
  const data = JSON.stringify({ ...event, ts: Date.now() });
  for (const ws of set) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
  return true;
}
var app, PORT, server, wss, clients;
var init_index = __esm({
  "src/index.ts"() {
    init_auth2();
    init_user();
    init_tx();
    init_groups();
    init_discover();
    init_profile();
    init_friends();
    init_dm();
    init_moments();
    init_ipfs();
    init_redpacket();
    app = express();
    PORT = parseInt(process.env.PORT || "4088", 10);
    app.use(cors({ origin: process.env.CORS_ORIGIN || "*", credentials: true }));
    app.use(express.json());
    app.use("/api/auth", authRouter);
    app.use("/api/user", userRouter);
    app.use("/api/tx", txRouter);
    app.use("/api/groups", groupRouter);
    app.use("/api/discover", discoverRouter);
    app.use("/api/profile", profileRouter);
    app.use("/api/friends", friendsRouter);
    app.use("/api/dm", dmRouter);
    app.use("/api/moments", momentsRouter);
    app.use("/api/ipfs", ipfsRouter);
    app.use("/api/redpacket", redpacketRouter);
    app.get("/api/health", (_req, res) => {
      res.json({ status: "ok", version: "0.1.0", time: Date.now() });
    });
    server = createServer(app);
    wss = new WebSocketServer({ server, path: "/ws" });
    clients = /* @__PURE__ */ new Map();
    wss.on("connection", (ws, req) => {
      const url = new URL(req.url || "", `http://${req.headers.host}`);
      const token = url.searchParams.get("token");
      const userId = url.searchParams.get("userId");
      if (!token || !userId) {
        ws.close(4001, "Missing token or userId");
        return;
      }
      if (!clients.has(userId)) clients.set(userId, /* @__PURE__ */ new Set());
      clients.get(userId).add(ws);
      console.log(`[WS] connected: ${userId.slice(0, 10)}... (${clients.size} users)`);
      ws.on("close", () => {
        const set = clients.get(userId);
        if (set) {
          set.delete(ws);
          if (set.size === 0) clients.delete(userId);
        }
      });
    });
    __name(pushEvent, "pushEvent");
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`\u{1F510} CryptChat API listening on :${PORT} + WS /ws`);
    });
  }
});
init_index();
export {
  app,
  clients,
  pushEvent,
  server
};
