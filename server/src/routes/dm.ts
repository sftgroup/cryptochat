import { Router } from 'express';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { prisma } from '../utils/prisma.js';

export const dmRouter = Router();

// GET /api/dm/:userId/messages — get DM history with a friend
dmRouter.get('/:userId/messages', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const me = req.user!.userId as string;
    const peerId = req.params.userId as string;

    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: me, receiverId: peerId },
          { senderId: peerId, receiverId: me },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    res.json({ messages: messages.map(m => ({
      id: m.id,
      content: m.content,
      sender: m.senderId,
      receiver: m.receiverId,
      time: m.createdAt.getTime(),
    }))});
  } catch (err) {
    console.error('dm messages error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /api/dm/:userId/messages — send a DM
dmRouter.post('/:userId/messages', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const me = req.user!.userId as string;
    const peerId = req.params.userId as string;
    const { content } = req.body;

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'Content required' });
    }

    // Verify they are friends
    const contact = await prisma.contact.findFirst({
      where: {
        OR: [
          { userId: me, contactId: peerId, status: 'accepted' },
          { userId: peerId, contactId: me, status: 'accepted' },
        ],
      },
    });
    if (!contact) {
      return res.status(403).json({ error: 'Not friends' });
    }

    const message = await prisma.message.create({
      data: { senderId: me, receiverId: peerId, content: content.slice(0, 5000) },
    });

    res.json({ message: {
      id: message.id,
      content: message.content,
      sender: message.senderId,
      receiver: message.receiverId,
      time: message.createdAt.getTime(),
    }});
  } catch (err) {
    console.error('dm send error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});
