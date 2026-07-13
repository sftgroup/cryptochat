import { Router } from 'express';
import { ethers } from 'ethers';
import { authMiddleware } from '../middleware/auth.js';
import { prisma } from '../utils/prisma.js';

export const txRouter = Router();

// All routes require auth
txRouter.use(authMiddleware);

/**
 * POST /api/tx/estimate
 * Body: { to, value, chainId, tokenAddress? }
 * Returns an estimate of gas for the transfer
 */
txRouter.post('/estimate', async (req, res) => {
  try {
    const { to, value, chainId, tokenAddress } = req.body;
    if (!to || !value || !chainId) {
      return res.status(400).json({ error: 'Missing to, value, or chainId' });
    }

    // We just return a reasonable gas estimate — actual signing happens client-side
    // Native token transfer: 21000 gas * current gas price
    // ERC20 transfer: ~55000 gas
    const isToken = !!tokenAddress;
    const gasEstimate = isToken ? 65000n : 21000n;

    res.json({
      gasEstimate: gasEstimate.toString(),
      gasEstimateGwei: (gasEstimate * 5n).toString(), // 5 gwei estimate
      isToken,
    });
  } catch (err) {
    console.error('estimate error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * GET /api/tx/chains
 * Returns supported chains for transfers
 */
txRouter.get('/chains', (_req, res) => {
  res.json({
    chains: [
      { id: 1, name: 'Ethereum', symbol: 'ETH', rpc: 'https://eth.llamarpc.com' },
      { id: 56, name: 'BNB Chain', symbol: 'BNB', rpc: 'https://bsc-dataseed.binance.org' },
      { id: 137, name: 'Polygon', symbol: 'POL', rpc: 'https://polygon.llamarpc.com' },
      { id: 8453, name: 'Base', symbol: 'ETH', rpc: 'https://base.llamarpc.com' },
      { id: 42161, name: 'Arbitrum', symbol: 'ETH', rpc: 'https://arb1.arbitrum.io/rpc' },
      { id: 10, name: 'Optimism', symbol: 'ETH', rpc: 'https://mainnet.optimism.io' },
      { id: 43114, name: 'Avalanche', symbol: 'AVAX', rpc: 'https://api.avax.network/ext/bc/C/rpc' },
    ],
  });
});

/**
 * POST /api/tx/prepare
 * Body: { to, value, chainId, tokenAddress? }
 * Returns unsigned transaction for the client to sign
 */
txRouter.post('/prepare', async (req, res) => {
  try {
    const { to, value, chainId, tokenAddress } = req.body;
    if (!to || !value || !chainId) {
      return res.status(400).json({ error: 'Missing to, value, or chainId' });
    }

    const chainIdNum = parseInt(chainId, 10);

    // Just return the prepared params — actual tx building happens client-side with ethers
    res.json({
      to,
      value,
      chainId: chainIdNum,
      tokenAddress: tokenAddress || null,
      data: tokenAddress
        ? new ethers.Interface(['function transfer(address to, uint256 amount)']).encodeFunctionData('transfer', [to, value])
        : '0x',
    });
  } catch (err) {
    console.error('prepare error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});
