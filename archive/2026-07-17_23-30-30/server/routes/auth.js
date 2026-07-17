var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/routes/auth.ts
import { Router } from "express";
import { ethers } from "ethers";

// ../node_modules/uuid/dist/esm-node/stringify.js
var byteToHex = [];
for (let i = 0; i < 256; ++i) {
  byteToHex.push((i + 256).toString(16).slice(1));
}
function unsafeStringify(arr, offset = 0) {
  return (byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + "-" + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + "-" + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + "-" + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + "-" + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]]).toLowerCase();
}
__name(unsafeStringify, "unsafeStringify");

// ../node_modules/uuid/dist/esm-node/rng.js
import crypto from "node:crypto";
var rnds8Pool = new Uint8Array(256);
var poolPtr = rnds8Pool.length;
function rng() {
  if (poolPtr > rnds8Pool.length - 16) {
    crypto.randomFillSync(rnds8Pool);
    poolPtr = 0;
  }
  return rnds8Pool.slice(poolPtr, poolPtr += 16);
}
__name(rng, "rng");

// ../node_modules/uuid/dist/esm-node/native.js
import crypto2 from "node:crypto";
var native_default = {
  randomUUID: crypto2.randomUUID
};

// ../node_modules/uuid/dist/esm-node/v4.js
function v4(options, buf, offset) {
  if (native_default.randomUUID && !buf && !options) {
    return native_default.randomUUID();
  }
  options = options || {};
  const rnds = options.random || (options.rng || rng)();
  rnds[6] = rnds[6] & 15 | 64;
  rnds[8] = rnds[8] & 63 | 128;
  if (buf) {
    offset = offset || 0;
    for (let i = 0; i < 16; ++i) {
      buf[offset + i] = rnds[i];
    }
    return buf;
  }
  return unsafeStringify(rnds);
}
__name(v4, "v4");
var v4_default = v4;

// src/routes/auth.ts
import { prisma } from "../utils/prisma.js";
import { signToken, signRefreshToken } from "../middleware/auth.js";
var authRouter = Router();
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

Nonce: ${v4_default()}`;
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
export {
  authRouter
};
