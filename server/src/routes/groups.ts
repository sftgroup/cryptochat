import { Router } from 'express';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { prisma } from '../utils/prisma.js';

export const groupRouter = Router();
groupRouter.use(authMiddleware);

// ── Group Key Management ──────────────────────────────────────────

// POST /api/groups/:id/keys — upload encrypted group key envelopes (creator only)
groupRouter.post('/:id/keys', async (req: AuthRequest, res) => {
  try {
    const groupId = req.params.id as string;
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ error: 'Not found' });
    if (group.creatorId !== req.user!.userId) return res.status(403).json({ error: 'Only group creator can set keys' });

    const { envelopes } = req.body; // [{ userId, encryptedKey, iv }]
    if (!envelopes?.length) return res.status(400).json({ error: 'envelopes required' });

    let created = 0;
    for (const env of envelopes) {
      // Verify user is a member
      const member = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId: env.userId } },
      });
      if (!member) continue;

      await prisma.groupKeyEnvelope.upsert({
        where: { groupId_userId: { groupId, userId: env.userId } },
        create: { groupId, userId: env.userId, encryptedKey: env.encryptedKey, iv: env.iv, version: 1 },
        update: { encryptedKey: env.encryptedKey, iv: env.iv },
      });
      created++;
    }

    res.json({ ok: true, created, total: envelopes.length });
  } catch (err) { console.error('group keys upload:', err); res.status(500).json({ error: 'Internal error' }); }
});

// GET /api/groups/:id/keys/my — get my own group key envelope
groupRouter.get('/:id/keys/my', async (req: AuthRequest, res) => {
  try {
    const envelope = await prisma.groupKeyEnvelope.findUnique({
      where: { groupId_userId: { groupId: req.params.id as string, userId: req.user!.userId } },
    });
    if (!envelope) return res.status(404).json({ error: 'No key envelope for you in this group' });

    res.json({ envelope: { userId: envelope.userId, encryptedKey: envelope.encryptedKey, iv: envelope.iv, version: envelope.version } });
  } catch (err) { console.error('get my group key:', err); res.status(500).json({ error: 'Internal error' }); }
});

// GET /api/groups/:id/keys — get all key envelopes (admin or member)
groupRouter.get('/:id/keys', async (req: AuthRequest, res) => {
  try {
    const groupId = req.params.id as string;
    const isMember = await prisma.groupMember.findUnique({ where: { groupId_userId: { groupId, userId: req.user!.userId } } });
    if (!isMember) return res.status(403).json({ error: 'Not a member' });

    const envelopes = await prisma.groupKeyEnvelope.findMany({ where: { groupId } });
    res.json({ envelopes: envelopes.map(e => ({ userId: e.userId, encryptedKey: e.encryptedKey, iv: e.iv, version: e.version })) });
  } catch (err) { console.error('list group keys:', err); res.status(500).json({ error: 'Internal error' }); }
});

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

// POST /api/groups/join-by-code — join via invite code
// Must come BEFORE /:id route
// Must come BEFORE /:id route
groupRouter.post('/join-by-code', async (req: AuthRequest, res) => {
  try {
    const { code } = req.body;
    if (!code?.trim()) return res.status(400).json({ error: 'Invite code required' });

    const group = await prisma.group.findUnique({ where: { inviteCode: code.trim().toUpperCase() } });
    if (!group) return res.status(404).json({ error: 'Invalid invite code' });

    const existing = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: req.user!.userId } },
    });
    if (existing) return res.status(409).json({ error: 'Already a member' });

    await prisma.groupMember.create({
      data: { groupId: group.id, userId: req.user!.userId, role: 'member' },
    });

    const updated = await prisma.group.findUnique({
      where: { id: group.id },
      include: { members: { include: { user: { select: { id: true, address: true, displayName: true, avatarUrl: true } } } } },
    });
    res.json({ group: updated });
  } catch (err) {
    console.error('join by code:', err);
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

// POST /api/groups/:id/invite-code — generate/reveal invite code (admin only)
groupRouter.post('/:id/invite-code', async (req: AuthRequest, res) => {
  try {
    const groupId = req.params.id as string;
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ error: 'Not found' });

    const isMember = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: req.user!.userId } },
    });
    if (!isMember || isMember.role !== 'admin') return res.status(403).json({ error: 'Only group admins can generate invite codes' });

    // If already has a code, just return it
    if (group.inviteCode) return res.json({ inviteCode: group.inviteCode });

    // Generate a 6-char alphanumeric code
    const code = Array.from({ length: 6 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]).join('');

    const updated = await prisma.group.update({
      where: { id: groupId },
      data: { inviteCode: code },
    });

    res.json({ inviteCode: updated.inviteCode });
  } catch (err) { console.error('invite code:', err); res.status(500).json({ error: 'Internal error' }); }
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
      data: { groupId, senderId: req.user!.userId, content: req.body.content, messageType: req.body.messageType || 'text', metadata: req.body.metadata || null, keyVersion: req.body.keyVersion || 1 },
    });
    res.status(201).json({ message: msg });
  } catch (err) {
    console.error('send group msg:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});
