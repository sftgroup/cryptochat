import { Router } from 'express';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { prisma } from '../utils/prisma.js';

export const groupRouter = Router();
groupRouter.use(authMiddleware);

// GET /api/groups
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
    console.error('list groups:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /api/groups
groupRouter.post('/', async (req: AuthRequest, res) => {
  try {
    const { name, description, memberAddresses } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Group name required' });

    const group = await prisma.group.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        creatorId: req.user!.userId,
        members: { create: { userId: req.user!.userId, role: 'admin' } },
      },
      include: {
        members: {
          include: { user: { select: { id: true, address: true, displayName: true } } },
        },
      },
    });

    if (memberAddresses?.length) {
      const users = await prisma.user.findMany({
        where: { address: { in: (memberAddresses as string[]).map(a => a.toLowerCase()) } },
      });
      for (const u of users) {
        try { await prisma.groupMember.create({ data: { groupId: group.id, userId: u.id, role: 'member' } }); } catch {}
      }
    }

    res.status(201).json({ group });
  } catch (err) {
    console.error('create group:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /api/groups/join — search groups by name and join
// Must come BEFORE /:id route to avoid matching "join" as :id
groupRouter.post('/join', async (req: AuthRequest, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Group name required' });

    // Search by exact name first, then partial match
    let group = await prisma.group.findFirst({ where: { name: name.trim() } });
    if (!group) {
      group = await prisma.group.findFirst({ where: { name: { contains: name.trim() } } });
    }
    if (!group) return res.status(404).json({ error: 'Group not found' });

    // Check if already a member
    const existing = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: req.user!.userId } },
    });
    if (existing) return res.status(409).json({ error: 'Already a member' });

    // Join
    await prisma.groupMember.create({
      data: { groupId: group.id, userId: req.user!.userId, role: 'member' },
    });

    const updated = await prisma.group.findUnique({
      where: { id: group.id },
      include: { members: { include: { user: { select: { id: true, address: true, displayName: true, avatarUrl: true } } } } },
    });
    res.json({ group: updated });
  } catch (err) {
    console.error('join by name:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /api/groups/:id — group details
groupRouter.get('/:id', async (req: AuthRequest, res) => {
  try {
    const group = await prisma.group.findUnique({
      where: { id: req.params.id as string },
      include: {
        members: {
          include: { user: { select: { id: true, address: true, displayName: true, avatarUrl: true } } },
        },
      },
    });
    if (!group) return res.status(404).json({ error: 'Not found' });
    const isMember = group.members.some(m => m.userId === req.user!.userId);
    if (!isMember) return res.status(403).json({ error: 'Not a member' });
    res.json({ group });
  } catch (err) {
    console.error('get group:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /api/groups/:id/join
groupRouter.post('/:id/join', async (req: AuthRequest, res) => {
  try {
    const group = await prisma.group.findUnique({ where: { id: req.params.id as string } });
    if (!group) return res.status(404).json({ error: 'Not found' });
    try {
      await prisma.groupMember.create({ data: { groupId: group.id, userId: req.user!.userId, role: 'member' } });
    } catch { return res.status(409).json({ error: 'Already a member' }); }
    const updated = await prisma.group.findUnique({
      where: { id: group.id },
      include: { members: { include: { user: { select: { id: true, address: true, displayName: true, avatarUrl: true } } } } },
    });
    res.json({ group: updated });
  } catch (err) { console.error('join:', err); res.status(500).json({ error: 'Internal error' }); }
});

// POST /api/groups/:id/invite
groupRouter.post('/:id/invite', async (req: AuthRequest, res) => {
  try {
    const { addresses } = req.body;
    if (!addresses?.length) return res.status(400).json({ error: 'Addresses required' });
    const group = await prisma.group.findUnique({ where: { id: req.params.id as string } });
    if (!group) return res.status(404).json({ error: 'Not found' });
    const users = await prisma.user.findMany({ where: { address: { in: (addresses as string[]).map(a => a.toLowerCase()) } } });
    let added = 0;
    for (const u of users) {
      try { await prisma.groupMember.create({ data: { groupId: group.id, userId: u.id, role: 'member' } }); added++; } catch {}
    }
    res.json({ invited: added, total: addresses.length });
  } catch (err) { console.error('invite:', err); res.status(500).json({ error: 'Internal error' }); }
});

// GET /api/groups/:id/messages
groupRouter.get('/:id/messages', async (req: AuthRequest, res) => {
  try {
    const msgs = await prisma.groupMessage.findMany({
      where: { groupId: req.params.id as string },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ messages: msgs.reverse() });
  } catch (err) { console.error('messages:', err); res.status(500).json({ error: 'Internal error' }); }
});

// POST /api/groups/:id/messages — send group message
groupRouter.post('/:id/messages', async (req: AuthRequest, res) => {
  try {
    const groupId = req.params.id as string;
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ error: 'Not found' });
    const isMember = await prisma.groupMember.findUnique({ where: { groupId_userId: { groupId, userId: req.user!.userId } } });
    if (!isMember) return res.status(403).json({ error: 'Not a member' });

    const msg = await prisma.groupMessage.create({
      data: { groupId, senderId: req.user!.userId, content: req.body.content, messageType: req.body.messageType || 'text', metadata: req.body.metadata || null },
    });
    res.status(201).json({ message: msg });
  } catch (err) {
    console.error('send group msg:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});
