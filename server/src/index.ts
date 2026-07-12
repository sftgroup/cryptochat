import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
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

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🔐 CryptChat API listening on :${PORT}`);
});

export { app, server };
