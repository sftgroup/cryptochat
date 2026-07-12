import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { authRouter } from './routes/auth.js';
import { userRouter } from './routes/user.js';
import { txRouter } from './routes/tx.js';
import { groupRouter } from './routes/groups.js';
import { discoverRouter } from './routes/discover.js';
import { profileRouter } from './routes/profile.js';
import { friendsRouter } from './routes/friends.js';
import { dmRouter } from './routes/dm.js';
import { momentsRouter } from './routes/moments.js';
import { ipfsRouter } from './routes/ipfs.js';

const app = express();
const PORT = parseInt(process.env.PORT || '4088', 10);

app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(express.json());

// Routes
app.use('/api/auth', authRouter);
app.use('/api/user', userRouter);
app.use('/api/tx', txRouter);
app.use('/api/groups', groupRouter);
app.use('/api/discover', discoverRouter);
app.use('/api/profile', profileRouter);
app.use('/api/friends', friendsRouter);
app.use('/api/dm', dmRouter);
app.use('/api/moments', momentsRouter);
app.use('/api/ipfs', ipfsRouter);

// Health
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.1.0', time: Date.now() });
});

const server = createServer(app);

// ── WebSocket server for real-time push ──

const wss = new WebSocketServer({ server, path: '/ws' });

const clients = new Map<string, Set<WebSocket>>();

wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  const userId = url.searchParams.get('userId');

  if (!token || !userId) {
    ws.close(4001, 'Missing token or userId');
    return;
  }

  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId)!.add(ws);
  console.log(`[WS] connected: ${userId.slice(0, 10)}... (${clients.size} users)`);

  ws.on('close', () => {
    const set = clients.get(userId);
    if (set) {
      set.delete(ws);
      if (set.size === 0) clients.delete(userId);
    }
  });
});

export function pushEvent(userId: string, event: { type: string; payload?: any }) {
  const set = clients.get(userId);
  if (!set || set.size === 0) return false;

  const data = JSON.stringify({ ...event, ts: Date.now() });
  for (const ws of set) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
  return true;
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🔐 CryptChat API listening on :${PORT} + WS /ws`);
});

export { app, server, clients };
