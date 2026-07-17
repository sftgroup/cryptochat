// src/routes/discover.ts
import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { prisma } from "../utils/prisma.js";
var discoverRouter = Router();
discoverRouter.use(authMiddleware);
var CERES_API = process.env.CERES_API || "http://43.156.99.215:5000";
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
export {
  discoverRouter
};
