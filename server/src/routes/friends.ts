import { Router } from 'express';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { prisma } from '../utils/prisma.js';

export const friendsRouter = Router();
friendsRouter.use(authMiddleware);

type FriendStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted';

// GET /api/friends — list friends with status + last activity
friendsRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;

    // Get accepted contacts (both directions)
    const contacts = await prisma.contact.findMany({
      where: {
        OR: [
          { userId, status: 'accepted' },
          { contactId: userId, status: 'accepted' },
        ],
      },
      include: {
        user: { select: { id: true, address: true, displayName: true, avatarUrl: true, bio: true } },
        contact: { select: { id: true, address: true, displayName: true, avatarUrl: true, bio: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Normalize: always return the OTHER person's info
    const friends = contacts.map((c: { userId: string; contactId: string; user?: any; contact?: any }) => {
      const isMe = c.userId === userId;
      const friend = isMe ? c.contact : c.user;
      return {
        id: c.id,
        userId: friend.id,
        address: friend.address,
        displayName: friend.displayName || friend.address.slice(0, 6) + '...' + friend.address.slice(-4),
        avatarUrl: friend.avatarUrl,
        bio: friend.bio,
        status: c.status,
      };
    });

    res.json({ friends });
  } catch (err) {
    console.error('list friends error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /api/friends/requests — incoming friend requests
friendsRouter.get('/requests', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const requests = await prisma.contact.findMany({
      where: { contactId: userId, status: 'pending' },
      include: {
        user: { select: { id: true, address: true, displayName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      requests: requests.map((r: { id: string; fromId: string; toId: string; status: string; createdAt: Date; user?: { id: string; address: string; displayName?: string; avatarUrl?: string } }) => ({
        id: r.id,
        userId: r.user?.id,
        address: r.user?.address,
        displayName: r.user?.displayName || r.user?.address?.slice(0, 6) + '...' + r.user?.address?.slice(-4),
        avatarUrl: r.user?.avatarUrl,
        createdAt: r.createdAt,
      })),
    });
  } catch (err) {
    console.error('friend requests error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /api/friends/request — send friend request
friendsRouter.post('/request', async (req: AuthRequest, res) => {
  try {
    const { address } = req.body;
    if (!address) return res.status(400).json({ error: 'Address required' });

    const targetAddr = (address as string).toLowerCase();
    const targetUser = await prisma.user.findUnique({ where: { address: targetAddr } });
    if (!targetUser) return res.status(404).json({ error: 'User not found on CryptChat' });
    if (targetUser.id === req.user!.userId) return res.status(400).json({ error: 'Cannot add yourself' });

    // Check existing
    const existing = await prisma.contact.findFirst({
      where: {
        OR: [
          { userId: req.user!.userId, contactId: targetUser.id },
          { userId: targetUser.id, contactId: req.user!.userId },
        ],
      },
    });

    if (existing) {
      if (existing.status === 'accepted') return res.status(409).json({ error: 'Already friends' });
      if (existing.status === 'pending' && existing.userId === req.user!.userId) return res.status(409).json({ error: 'Request already sent' });
      // If they sent to us, accept
      if (existing.status === 'pending' && existing.userId === targetUser.id) {
        await prisma.contact.update({ where: { id: existing.id }, data: { status: 'accepted' } });
        return res.json({ status: 'accepted' });
      }
    }

    // Create pending request
    const contact = await prisma.contact.create({
      data: {
        userId: req.user!.userId,
        contactId: targetUser.id,
        status: 'pending',
      },
    });

    res.status(201).json({ status: 'pending', requestId: contact.id });
  } catch (err) {
    console.error('send request error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /api/friends/accept — accept a friend request
friendsRouter.post('/accept', async (req: AuthRequest, res) => {
  try {
    const { requestId } = req.body;
    if (!requestId) return res.status(400).json({ error: 'requestId required' });

    const contact = await prisma.contact.findUnique({ where: { id: requestId } });
    if (!contact || contact.contactId !== req.user!.userId) {
      return res.status(403).json({ error: 'Invalid request' });
    }

    await prisma.contact.update({ where: { id: requestId }, data: { status: 'accepted' } });
    res.json({ status: 'accepted' });
  } catch (err) {
    console.error('accept error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// DELETE /api/friends/:address — remove friend
friendsRouter.delete('/:address', async (req: AuthRequest, res) => {
  try {
    const addr = (req.params.address as string).toLowerCase();
    const targetUser = await prisma.user.findUnique({ where: { address: addr } });
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    await prisma.contact.deleteMany({
      where: {
        OR: [
          { userId: req.user!.userId, contactId: targetUser.id },
          { userId: targetUser.id, contactId: req.user!.userId },
        ],
      },
    });

    res.json({ status: 'removed' });
  } catch (err) {
    console.error('remove friend error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /api/friends/status/:address — check relationship status
friendsRouter.get('/status/:address', async (req: AuthRequest, res) => {
  try {
    const addr = (req.params.address as string).toLowerCase();
    const targetUser = await prisma.user.findUnique({ where: { address: addr } });
    if (!targetUser) return res.json({ status: 'not_found' });

    const contact = await prisma.contact.findFirst({
      where: {
        OR: [
          { userId: req.user!.userId, contactId: targetUser.id },
          { userId: targetUser.id, contactId: req.user!.userId },
        ],
      },
    });

    if (!contact) return res.json({ status: 'none' });
    if (contact.status === 'accepted') return res.json({ status: 'accepted' });
    if (contact.userId === req.user!.userId) return res.json({ status: 'pending_sent' });
    res.json({ status: 'pending_received', requestId: contact.id });
  } catch (err) {
    console.error('status error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});
