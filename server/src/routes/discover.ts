import { Router } from 'express';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { prisma } from '../utils/prisma.js';

export const discoverRouter = Router();
discoverRouter.use(authMiddleware);

const CERES_API = process.env.CERES_API || 'http://43.156.99.215:5000';

// GET /api/discover/ceres — find contacts via Ceres invite graph
discoverRouter.get('/ceres', async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const results: Array<{ address: string; relation: string; displayName?: string }> = [];

    // 1. Find who invited me
    try {
      const invCheck = await fetch(`${CERES_API}/batch-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addresses: [user.address] }),
        signal: AbortSignal.timeout(5000),
      });
      if (invCheck.ok) {
        const invData = await invCheck.json() as any;
        const entry = invData?.[user.address];
        if (entry?.invited) {
          results.push({ address: entry.inviter || '', relation: 'invited_by' });
        }
      }
    } catch { /* ignore */ }

    // 2. Find who I invited
    try {
      const graphResp = await fetch(`${CERES_API}/address-graph/${user.address}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (graphResp.ok) {
        const graphData = await graphResp.json() as any;
        const invitees = graphData?.invitees || [];
        for (const inv of invitees) {
          if (inv.address && !results.some(r => r.address === inv.address)) {
            results.push({ address: inv.address, relation: 'invited' });
          }
        }
      }
    } catch { /* ignore */ }

    // Look up display names from our DB
    if (results.length > 0) {
      const addresses = results.map(r => r.address.toLowerCase());
      const localUsers = await prisma.user.findMany({
        where: { address: { in: addresses } },
        select: { address: true, displayName: true, id: true },
      });
      for (const r of results) {
        const lu = localUsers.find((u: { id: string; address: string }) => u.address === r.address.toLowerCase());
        if (lu) {
          (r as any).userId = lu.id;
          r.displayName = lu.displayName || undefined;
        }
      }
    }

    res.json({ results, source: 'ceres' });
  } catch (err) {
    console.error('ceres discover error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /api/discover/search — search all users
discoverRouter.get('/search', async (req: AuthRequest, res) => {
  try {
    const q = (req.query.q as string || '').trim().toLowerCase();
    if (!q || q.length < 2) {
      return res.json({ results: [] });
    }

    // Search by address, display name, or ENS
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { address: { contains: q } },
          { displayName: { contains: q } },
          { ensName: { contains: q } },
        ],
        NOT: { id: req.user!.userId },
      },
      select: { id: true, address: true, displayName: true, ensName: true, avatarUrl: true },
      take: 20,
    });

    res.json({ results: users });
  } catch (err) {
    console.error('discover search error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});
