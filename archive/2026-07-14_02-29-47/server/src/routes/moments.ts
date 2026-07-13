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
    const userMap = new Map(users.map((u: { id: string; address: string; displayName: string | null }) => [u.id, u]));

    // Include likes and comments
    const momentIds = moments.map((m: { id: string }) => m.id);
    const [allLikes, allComments] = await Promise.all([
      prisma.momentLike.findMany({ where: { momentId: { in: momentIds } } }),
      prisma.momentComment.findMany({ where: { momentId: { in: momentIds } }, orderBy: { createdAt: 'asc' } }),
    ]);

    // Get commenter info
    const commenterIds = [...new Set(allComments.map((c: { userId: string }) => c.userId))];
    const commenters = await prisma.user.findMany({
      where: { id: { in: commenterIds } },
      select: { id: true, address: true, displayName: true },
    });
    const commenterMap = new Map(commenters.map((u: { id: string; address: string; displayName: string | null }) => [u.id, u]));

    res.json({
      moments: moments.map((m: { id: string; userId: string; content: string; createdAt: Date }) => {
        const u = userMap.get(m.userId) as { address: string; displayName: string | null } | undefined;
        const likes = allLikes.filter((l: { momentId: string }) => l.momentId === m.id);
        const comments = allComments.filter((c: { momentId: string }) => c.momentId === m.id);
        return {
          id: m.id,
          content: m.content,
          time: new Date(m.createdAt).toLocaleString(),
          authorName: u?.displayName || u?.address?.slice(0, 8),
          authorAddr: u?.address,
          userId: m.userId,
          likes: likes.map((l: { userId: string }) => l.userId),
          liked: likes.some((l: { userId: string }) => l.userId === req.user!.userId),
          comments: comments.map((c: { id: string; userId: string; content: string; createdAt: Date }) => ({
            id: c.id,
            userId: c.userId,
            content: c.content,
            time: new Date(c.createdAt).toLocaleString(),
            authorName: commenterMap.get(c.userId)?.displayName || commenterMap.get(c.userId)?.address?.slice(0, 8),
          })),
        };
      }),
    });
  } catch (err) {
    console.error('moments list error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

/** POST /api/moments/:id/like — toggle like */
momentsRouter.post('/:id/like', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const momentId = req.params.id as string;
    const userId = req.user!.userId;

    const existing = await prisma.momentLike.findUnique({
      where: { momentId_userId: { momentId, userId } },
    });

    if (existing) {
      await prisma.momentLike.delete({ where: { id: existing.id } });
      return res.json({ liked: false });
    }

    await prisma.momentLike.create({ data: { momentId, userId } });
    res.json({ liked: true });
  } catch (err) {
    console.error('like error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

/** POST /api/moments/:id/comment — add a comment */
momentsRouter.post('/:id/comment', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const momentId = req.params.id as string;
    const { content } = req.body;
    if (!content || typeof content !== 'string' || content.length > 500) {
      return res.status(400).json({ error: 'Invalid content' });
    }

    const comment = await prisma.momentComment.create({
      data: { momentId, userId: req.user!.userId, content },
    });

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    res.json({
      comment: {
        id: comment.id,
        userId: comment.userId,
        content: comment.content,
        time: new Date(comment.createdAt).toLocaleString(),
        authorName: user?.displayName || user?.address?.slice(0, 8),
      },
    });
  } catch (err) {
    console.error('comment error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});
