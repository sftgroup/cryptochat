import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';
import { prisma } from '../utils/prisma.js';

export const momentsRouter = Router();

/** POST /api/moments — Create a moment */
momentsRouter.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { content } = req.body;
    if (!content || typeof content !== 'string' || content.length > 1000) {
      return res.status(400).json({ error: 'Invalid content' });
    }

    const moment = await prisma.moment.create({
      data: { userId: req.user!.userId, content },
    });

    // Return with author info
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    res.json({
      moment: {
        id: moment.id,
        content: moment.content,
        time: moment.createdAt,
        authorName: user?.displayName || user?.address?.slice(0, 8),
        authorAddr: user?.address,
      },
    });
  } catch (err) {
    console.error('moments create error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

/** GET /api/moments — List moments (friends only or all public) */
momentsRouter.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    // Get friends' IDs
    const contacts = await prisma.contact.findMany({
      where: { userId: req.user!.userId, status: 'accepted' },
      select: { contactId: true },
    });
    const friendIds = contacts.map((c: { contactId: string }) => c.contactId);

    // Show own + friends' moments
    const moments = await prisma.moment.findMany({
      where: {
        userId: { in: [req.user!.userId, ...friendIds] },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Get author info
    const authorIds = [...new Set(moments.map((m: { userId: string }) => m.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: authorIds } },
      select: { id: true, address: true, displayName: true },
    });
    const userMap = new Map(users.map((u: { id: string; address?: string; displayName?: string }) => [u.id, u]));

    res.json({
      moments: moments.map((m: { id: string; userId: string; content: string; createdAt: Date }) => {
        const u = userMap.get(m.userId) as { address?: string; displayName?: string } | undefined;
        return {
          id: m.id,
          content: m.content,
          time: new Date(m.createdAt).toLocaleString(),
          authorName: u?.displayName || u?.address?.slice(0, 8),
          authorAddr: u?.address,
          userId: m.userId,
        };
      }),
    });
  } catch (err) {
    console.error('moments list error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});
