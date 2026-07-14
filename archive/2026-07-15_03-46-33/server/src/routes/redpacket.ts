import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';

export const redpacketRouter = Router();

// All routes require auth
redpacketRouter.use(authMiddleware);

// POST /api/redpacket — create a red packet
redpacketRouter.post('/', async (req: AuthRequest, res) => {
  try {
    const { amount, count, chainId, tokenAddress, tokenSymbol, message, scope, scopeId } = req.body;
    const senderId = req.user!.userId;

    if (!amount || !count || !chainId || !scope || !scopeId) {
      return res.status(400).json({ error: 'Missing required fields: amount, count, chainId, scope, scopeId' });
    }
    if (count < 1 || count > 100) return res.status(400).json({ error: 'count must be 1-100' });

    const packet = await prisma.redPacket.create({
      data: {
        senderId,
        scope,
        scopeId,
        amount: String(amount),
        count,
        chainId,
        tokenAddress: tokenAddress || null,
        tokenSymbol: tokenSymbol || 'ETH',
        message: message || '恭喜发财，大吉大利！',
        remaining: count,
      },
    });

    const { pushEvent } = await import('../index.js');

    if (scope === 'group') {
      // Notify all group members
      const members = await prisma.groupMember.findMany({ where: { groupId: scopeId } });
      for (const m of members) {
        if (m.userId !== senderId) {
          pushEvent(m.userId, { type: 'red_packet', payload: { packetId: packet.id, senderId } });
        }
      }
    } else {
      // DM — notify the other party
      pushEvent(scopeId, { type: 'red_packet', payload: { packetId: packet.id, senderId } });
    }

    res.status(201).json({ packet });
  } catch (err) {
    console.error('create redpacket:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /api/redpacket?scope=dm&scopeId=userId — list packets for current user's chat
redpacketRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const scopeId = req.query.scopeId as string | undefined;
    const scope = req.query.scope as string | undefined;
    if (!scopeId) return res.status(400).json({ error: 'scopeId required' });

    const packets = await prisma.redPacket.findMany({
      where: {
        scope: scope || undefined,
        scopeId,
      },
      include: {
        claims: { select: { claimerId: true, amount: true, claimedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    res.json({ packets });
  } catch (err) {
    console.error('list redpackets:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /api/redpacket/:id — get single packet with claims
redpacketRouter.get('/:id', async (req: AuthRequest, res) => {
  try {
    const packet = await prisma.redPacket.findUnique({
      where: { id: req.params.id as string },
      include: {
        claims: { select: { claimerId: true, amount: true, claimedAt: true }, orderBy: { claimedAt: 'desc' } },
      },
    });
    if (!packet) return res.status(404).json({ error: 'Red packet not found' });
    res.json({ packet });
  } catch (err) {
    console.error('get redpacket:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /api/redpacket/:id/claim — claim a packet
redpacketRouter.post('/:id/claim', async (req: AuthRequest, res) => {
  try {
    const packetId = req.params.id as string;
    const claimerId = req.user!.userId;

    const packet = await prisma.redPacket.findUnique({ where: { id: packetId } });
    if (!packet) return res.status(404).json({ error: 'Red packet not found' });
    if (packet.remaining <= 0) return res.status(400).json({ error: 'All packets claimed!' });
    if (packet.senderId === claimerId) return res.status(400).json({ error: 'Cannot claim your own red packet' });

    // Check already claimed
    const existing = await prisma.redPacketClaim.findUnique({ where: { packetId_claimerId: { packetId, claimerId } } });
    if (existing) return res.status(400).json({ error: 'Already claimed!', claim: existing });

    // Random amount: total / count * random(0.5-1.5) capped by remaining
    const avgWei = BigInt(packet.amount) / BigInt(packet.count);
    const factor = 50 + Math.floor(Math.random() * 100); // 50-150 (%)
    let claimAmount = (avgWei * BigInt(factor)) / 100n;

    // Ensure not more than remaining total (approximation)
    const alreadyClaimed = await prisma.redPacketClaim.findMany({ where: { packetId } });
    const claimedTotal = alreadyClaimed.reduce((sum: bigint, c) => sum + BigInt(c.amount), 0n);
    const remainingTotal = BigInt(packet.amount) - claimedTotal;

    if (packet.remaining === 1) {
      // Last one gets all remaining
      claimAmount = remainingTotal;
    } else if (claimAmount > remainingTotal) {
      claimAmount = remainingTotal - 1n; // leave at least some for others
    }
    if (claimAmount <= 0n) claimAmount = 1n;

    const claim = await prisma.redPacketClaim.create({
      data: { packetId, claimerId, amount: String(claimAmount) },
    });

    await prisma.redPacket.update({
      where: { id: packetId },
      data: { remaining: { decrement: 1 }, claimed: { increment: 1 } },
    });

    // Notify sender
    const { pushEvent } = await import('../index.js');
    pushEvent(packet.senderId, { type: 'red_packet_claimed', payload: { packetId, claimerId, amount: String(claimAmount) } });

    res.json({ claim });
  } catch (err: any) {
    if (err?.code === 'P2002') return res.status(400).json({ error: 'Already claimed!' });
    console.error('claim redpacket:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});
