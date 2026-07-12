import { Router, type IRouter } from "express";
import { authMiddleware, type AuthRequest } from "../middleware/auth.js";
import { prisma } from "../utils/prisma.js";

export const profileRouter: IRouter = Router();

profileRouter.get("/", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, address: true, displayName: true, ensName: true, avatarUrl: true, bio: true, createdAt: true },
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
      select: { id: true, address: true, displayName: true, ensName: true, avatarUrl: true, bio: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ user });
  } catch (err) {
    console.error("profile error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

profileRouter.patch("/", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { displayName, avatarUrl, bio } = req.body;
    const data: any = {};
    if (displayName !== undefined) data.displayName = displayName?.trim() || null;
    if (avatarUrl !== undefined) data.avatarUrl = avatarUrl?.trim() || null;
    if (bio !== undefined) data.bio = (bio as string)?.slice(0, 160) || null;
    const user = await prisma.user.update({ where: { id: req.user!.userId }, data, select: { id: true, address: true, displayName: true, ensName: true, avatarUrl: true, bio: true } });
    res.json({ user });
  } catch (err) { console.error("profile update error:", err); res.status(500).json({ error: "Internal error" }); }
});
