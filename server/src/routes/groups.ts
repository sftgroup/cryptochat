import { Router, Request } from 'express';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { prisma } from '../utils/prisma.js';

export const groupRouter = Router();
groupRouter.use(authMiddleware);

// Helper: get typed string param
function p(req: Request, key: string): string {
  const v = req.params[key];
  return Array.isArray(v) ? v[0] : v || '';
}

// GET /api/groups — list user's groups
groupRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const memberships = await prisma.groupMember.findMany({
      where: { userId: req.user!.userId },
      include: {
        group: {
          include: {
            members: {
              include: {
                user: { select: { id: true, address: true, displayName: true, avatarUrl: true } },
              },
            },
          },
        },
      },
      orderBy: { group: { updatedAt: 'desc' } },
    });
    res.json({ groups: memberships.map(m => m.group) });
  } catch (err) {
    console.error('list groups error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /api/groups — create a new group
groupRouter.post('/', async (req: AuthRequest, res) => {
  try {
    const { name, description, memberAddresses } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Group name required' });
    }

    const group = await prisma.group.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        creatorId: req.user!.userId,
        members: {
          create: { userId: req.user!.userId, role: 'admin' },
        },
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, address: true, displayName: true } },
          },
        },
      },
    });

    // Add invited members
    if (memberAddresses && Array.isArray(memberAddresses) && memberAddresses.length > 0) {
      const addresses: string[] = memberAddresses.map((a: string) => a.toLowerCase());
      const users = await prisma.user.findMany({ where: { address: { in: addresses } } });
      for (const user of users) {
        try {
          await prisma.groupMember.create({ data: { groupId: group.id, userId: user.id, role: 'member' } });
        } catch { /* already member */ }
      }
    }

    res.status(201).json({ group });
  } catch (err) {
    console.error('create group error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /api/groups/:id — get group details
groupRouter.get('/:id', async (req: AuthRequest, res) => {
  try {
    const groupId = p(req, 'id');
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          include: {
            user: { select: { id: true, address: true, displayName: true, avatarUrl: true } },
          },
        },
      },
    });
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const isMember = group.members.some(m => m.userId === req.user!.userId);
    if (!isMember) return res.status(403).json({ error: 'Not a member' });

    res.json({ group });
  } catch (err) {
    console.error('get group error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /api/groups/:id/join — join a group
groupRouter.post('/:id/join', async (req: AuthRequest, res) => {
  try {
    const groupId = p(req, 'id');
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ error: 'Group not found' });

    try {
      await prisma.groupMember.create({ data: { groupId: group.id, userId: req.user!.userId, role: 'member' } });
    } catch {
      return res.status(409).json({ error: 'Already a member' });
    }

    const updated = await prisma.group.findUnique({
      where: { id: group.id },
      include: {
        members: {
          include: {
            user: { select: { id: true, address: true, displayName: true, avatarUrl: true } },
          },
        },
      },
    });
    res.json({ group: updated });
  } catch (err) {
    console.error('join group error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /api/groups/:id/invite — invite user(s) to a group
groupRouter.post('/:id/invite', async (req: AuthRequest, res) => {
  try {
    const { addresses } = req.body;
    if (!addresses || !Array.isArray(addresses)) {
      return res.status(400).json({ error: 'addresses array required' });
    }

    const groupId = p(req, 'id');
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const normalized: string[] = addresses.map((a: string) => a.toLowerCase());
    const users = await prisma.user.findMany({ where: { address: { in: normalized } } });

    let added = 0;
    for (const user of users) {
      try {
        await prisma.groupMember.create({ data: { groupId: group.id, userId: user.id, role: 'member' } });
        added++;
      } catch { /* already member */ }
    }

    res.json({ invited: added, total: normalized.length });
  } catch (err) {
    console.error('invite error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /api/groups/:id/messages — get group messages
groupRouter.get('/:id/messages', async (req: AuthRequest, res) => {
  try {
    const groupId = p(req, 'id');
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const msgs = await prisma.groupMessage.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ messages: msgs.reverse() });
  } catch (err) {
    console.error('messages error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});
