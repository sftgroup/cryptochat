import { Router } from 'express';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { prisma } from '../utils/prisma.js';

export const dmRouter = Router();

// GET /api/dm/inbox — get recent messages from all friends (offline sync)
dmRouter.get('/inbox', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const me = req.user!.userId as string;

    // Find all accepted contacts
    const contacts = await prisma.contact.findMany({
      where: {
        OR: [
          { userId: me, status: 'accepted' },
          { contactId: me, status: 'accepted' },
        ],
      },
      include: {
        user: { select: { id: true, address: true, displayName: true, avatarUrl: true } },
        contact: { select: { id: true, address: true, displayName: true, avatarUrl: true } },
      },
    });

    // For each contact, fetch latest unread messages
    const inbox: Record<string, { friend: any; unread: number; lastMessage: any | null }> = {};

    for (const c of contacts) {
      const friendId = c.userId === me ? c.contactId : c.userId;
      const friend = c.userId === me ? c.contact : c.user;
      if (!friend || inbox[friendId]) continue;

      const unread = await prisma.message.count({
        where: { senderId: friendId, receiverId: me, read: false },
      });

      const lastMsg = await prisma.message.findFirst({
        where: {
          OR: [
            { senderId: me, receiverId: friendId },
            { senderId: friendId, receiverId: me },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });

      inbox[friendId] = {
        friend: { id: friend.id, address: friend.address, displayName: friend.displayName, avatarUrl: friend.avatarUrl },
        unread,
        lastMessage: lastMsg ? { content: lastMsg.content, time: lastMsg.createdAt.getTime(), sender: lastMsg.senderId } : null,
      };
    }

    res.json({ inbox: Object.values(inbox) });
  } catch (err) {
    console.error('inbox error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /api/dm/:userId/messages — get DM history & mark as read
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

    // Mark received messages as read
    await prisma.message.updateMany({
      where: { senderId: peerId, receiverId: me, read: false },
      data: { read: true },
    });

    res.json({ messages: messages.map(m => ({
      id: m.id,
      content: m.content,
      sender: m.senderId,
      receiver: m.receiverId,
      time: m.createdAt.getTime(),
      read: m.read,
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

    // Real-time push to receiver
    const { pushEvent } = await import('../index.js');
    pushEvent(peerId, { type: 'new_dm', payload: { senderId: me } });

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
