import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';
import crypto from 'crypto';

export const ipfsRouter = Router();

/**
 * POST /api/ipfs/upload
 * Upload a file → returns a content-derived CID for IPFS reference.
 * 
 * Note: This stores the file on the server as a stand-in for real IPFS.
 * In production, integrate with Pinata, Web3.Storage, or a local IPFS node.
 * The CID is derived from the file content hash (SHA-256), making it
 * deterministic and content-addressable — same as real IPFS.
 */
ipfsRouter.post('/upload', authMiddleware, async (req: AuthRequest, res) => {
  // For now, accept multipart upload via express-fileupload or base64
  // Simple approach: accept base64 + filename in JSON
  const { fileName, data, mimeType } = req.body;

  if (!data || !fileName) {
    return res.status(400).json({ error: 'fileName and data (base64) required' });
  }

  try {
    const buffer = Buffer.from(data, 'base64');

    // Generate content-derived CID (SHA-256 multihash, like IPFS)
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');

    // Save to disk (stand-in for IPFS pinning)
    const fs = await import('fs');
    const path = await import('path');
    const uploadDir = path.join(process.cwd(), 'uploads');
    await fs.promises.mkdir(uploadDir, { recursive: true });
    const filePath = path.join(uploadDir, `${hash}_${fileName}`);
    await fs.promises.writeFile(filePath, buffer);

    // Return IPFS-style CID (we use sha256 multihash format)
    // Real IPFS CID: base32-encoded multihash.  We use hex for simplicity.
    const cid = `Qm${hash.substring(0, 44)}`;

    res.json({
      cid,
      name: fileName,
      size: buffer.length,
      mimeType: mimeType || 'application/octet-stream',
      url: `/api/ipfs/file/${cid}`,
    });
  } catch (err: any) {
    console.error('ipfs upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

/** GET /api/ipfs/file/:cid — Retrieve a file by CID */
ipfsRouter.get('/file/:cid', async (req, res) => {
  try {
    const { cid } = req.params;
    const fs = await import('fs');
    const path = await import('path');
    const uploadDir = path.join(process.cwd(), 'uploads');

    // Find file starting with the CID hash prefix
    const files = await fs.promises.readdir(uploadDir);
    const match = files.find(f => f.startsWith(cid.replace('Qm', '')) || f.includes(cid));

    if (!match) {
      return res.status(404).json({ error: 'File not found' });
    }

    const filePath = path.join(uploadDir, match);
    const stat = await fs.promises.stat(filePath);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `inline; filename="${match}"`);
    res.sendFile(filePath);
  } catch (err) {
    console.error('ipfs get error:', err);
    res.status(500).json({ error: 'Retrieval failed' });
  }
});
