// src/routes/profile.ts
import { Router } from "express";
import { ethers } from "ethers";
import { authMiddleware } from "../middleware/auth.js";
import { prisma } from "../utils/prisma.js";
var profileRouter = Router();
var OXA_RPC = "https://rpc-oxa.0xainet.top";
var CERES_REGISTRY = "0x55C1364E46B8Bef987559608e3d831e7D47F1f35";
var CERES_DID = "0x08236d3246653C4699CBBe4458efdC0f5B067250";
var registryAbi = [{ type: "function", name: "tokenOf", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" }];
var didAbi = [{ type: "function", name: "profiles", inputs: [{ name: "", type: "uint256" }], outputs: [{ name: "name", type: "string" }, { name: "bio", type: "string" }, { name: "avatar", type: "string" }, { name: "updatedAt", type: "uint256" }], stateMutability: "view" }];
profileRouter.get("/ceres/:address", async (req, res) => {
  try {
    const addr = req.params.address.toLowerCase();
    const provider = new ethers.JsonRpcProvider(OXA_RPC);
    const registry = new ethers.Contract(CERES_REGISTRY, registryAbi, provider);
    const did = new ethers.Contract(CERES_DID, didAbi, provider);
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
export {
  profileRouter
};
