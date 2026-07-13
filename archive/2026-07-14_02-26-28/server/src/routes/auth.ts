import { Router } from 'express';
import { ethers } from 'ethers';
import { v4 as uuid } from 'uuid';
import { prisma } from '../utils/prisma.js';
import { signToken, signRefreshToken } from '../middleware/auth.js';

export const authRouter = Router();

/**
 * GET /api/auth/nonce?address=0x...
 * Returns a random nonce for the user to sign
 */
authRouter.get('/nonce', async (req, res) => {
  try {
    const address = (req.query.address as string)?.toLowerCase();
    if (!address || !ethers.isAddress(address)) {
      return res.status(400).json({ error: 'Invalid address' });
    }

    // Check if user already has a nonce
    const existing = await prisma.nonce.findFirst({
      where: { address, used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      return res.json({ nonce: existing.nonce });
    }

    const nonce = `Welcome to CryptChat!\n\nSign this message to verify your identity.\n\nNonce: ${uuid()}`;
    await prisma.nonce.create({
      data: {
        address,
        nonce,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min
      },
    });

    res.json({ nonce });
  } catch (err) {
    console.error('nonce error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * POST /api/auth/login
 * Body: { address, signature }
 * Verifies signature → creates/finds user → returns JWT
 */
authRouter.post('/login', async (req, res) => {
  try {
    const { address, signature } = req.body;
    const addr = (address as string)?.toLowerCase();

    if (!addr || !ethers.isAddress(addr) || !signature) {
      return res.status(400).json({ error: 'Invalid address or signature' });
    }

    // Find the latest valid nonce
    const nonceRecord = await prisma.nonce.findFirst({
      where: { address: addr, used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    if (!nonceRecord) {
      return res.status(400).json({ error: 'No valid nonce. Request /auth/nonce first.' });
    }

    // Verify the signature
    let recoveredAddress: string;
    try {
      recoveredAddress = ethers.verifyMessage(nonceRecord.nonce, signature).toLowerCase();
    } catch {
      return res.status(400).json({ error: 'Invalid signature format' });
    }

    if (recoveredAddress !== addr) {
      return res.status(401).json({ error: 'Signature verification failed' });
    }

    // Mark nonce as used
    await prisma.nonce.update({ where: { id: nonceRecord.id }, data: { used: true } });

    // Find or create user
    let user = await prisma.user.findUnique({ where: { address: addr } });
    if (!user) {
      user = await prisma.user.create({
        data: { address: addr, displayName: addr.slice(0, 6) + '...' + addr.slice(-4) },
      });
    }

    // Create session
    const token = signToken({ userId: user.id, address: user.address });
    const refreshToken = signRefreshToken({ userId: user.id, address: user.address });

    await prisma.session.create({
      data: {
        userId: user.id,
        token,
        refreshToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    res.json({
      token,
      refreshToken,
      user: {
        id: user.id,
        address: user.address,
        ensName: user.ensName,
        avatarUrl: user.avatarUrl,
        displayName: user.displayName,
      },
    });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * POST /api/auth/refresh
 * Body: { refreshToken }
 * Returns new tokens
 */
authRouter.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Missing refresh token' });
    }

    const session = await prisma.session.findUnique({ where: { refreshToken } });
    if (!session || session.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Issue new tokens, invalidate old session
    const newToken = signToken({ userId: user.id, address: user.address });
    const newRefresh = signRefreshToken({ userId: user.id, address: user.address });

    await prisma.session.delete({ where: { id: session.id } });
    await prisma.session.create({
      data: {
        userId: user.id,
        token: newToken,
        refreshToken: newRefresh,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    res.json({ token: newToken, refreshToken: newRefresh });
  } catch (err) {
    console.error('refresh error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});
