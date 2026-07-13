import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';
import { prisma } from '../utils/prisma.js';

export const userRouter = Router();

/**
 * GET /api/user/me
 * Returns current user profile
 */
userRouter.get('/me', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        address: true,
        ensName: true,
        avatarUrl: true,
        displayName: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    console.error('me error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * GET /api/user/search?q=xxx
 * Search users by address, ENS, or displayName
 */
userRouter.get('/search', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const q = (req.query.q as string || '').trim();
    if (!q || q.length < 2) {
      return res.json({ users: [] });
    }

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { address: { contains: q.toLowerCase() } },
          { ensName: { contains: q.toLowerCase() } },
          { displayName: { contains: q } },
        ],
        id: { not: req.user!.userId }, // Exclude self
      },
      select: {
        id: true,
        address: true,
        ensName: true,
        avatarUrl: true,
        displayName: true,
      },
      take: 20,
    });

    res.json({ users });
  } catch (err) {
    console.error('search error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * PATCH /api/user/profile
 * Body: { displayName, avatarUrl }
 */
userRouter.patch('/profile', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { displayName, avatarUrl } = req.body;

    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        ...(displayName !== undefined && { displayName }),
        ...(avatarUrl !== undefined && { avatarUrl }),
      },
      select: {
        id: true,
        address: true,
        ensName: true,
        avatarUrl: true,
        displayName: true,
      },
    });

    res.json(user);
  } catch (err) {
    console.error('profile error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * POST /api/user/pubkey
 * Register ECDH public key
 */
userRouter.post('/pubkey', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { publicKey } = req.body;
    if (!publicKey || typeof publicKey !== 'string' || publicKey.length > 2000) {
      return res.status(400).json({ error: 'Invalid publicKey' });
    }

    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: { publicKey },
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('pubkey error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * GET /api/user/pubkey/:address
 * Get a user's ECDH public key by wallet address
 */
userRouter.get('/pubkey/:address', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findFirst({
      where: { address: (req.params.address as string).toLowerCase() },
      select: { id: true, address: true, publicKey: true, pubkeyAttestation: true },
    });

    if (!user || !user.publicKey) {
      return res.status(404).json({ error: 'Public key not found' });
    }

    res.json({
      userId: user.id, address: user.address, publicKey: user.publicKey,
      attestation: user.pubkeyAttestation ? JSON.parse(user.pubkeyAttestation) : null,
    });
  } catch (err) {
    console.error('pubkey get error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * POST /api/user/pubkey-attestation
 * Store EIP-712 signed attestation for the user's public key
 */
userRouter.post('/pubkey-attestation', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { wallet, pubkey, timestamp, signature } = req.body;
    if (!wallet || !pubkey || !timestamp || !signature) {
      return res.status(400).json({ error: 'Missing attestation fields' });
    }

    await prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        publicKey: pubkey,
        pubkeyAttestation: JSON.stringify({ wallet, pubkey, timestamp, signature }),
      },
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('pubkey-attestation error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * GET /api/user/:id
 * Get another user's public profile
 */
userRouter.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id as string },
      select: {
        id: true,
        address: true,
        ensName: true,
        avatarUrl: true,
        displayName: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    console.error('user error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});
