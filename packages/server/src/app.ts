// ObsidianTeamSync Server Entry Point
// OTS 服务端入口
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { config } from './config.js';
import { prisma } from './lib/prisma.js';
import { setupSyncServer } from './sync/ws-server.js';
import authRoutes from './routes/auth.js';
import teamRoutes from './routes/team.js';
import vaultRoutes from './routes/vault.js';
import noteRoutes from './routes/note.js';
import activityRoutes from './routes/activity.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '0.1.0',
    uptime: process.uptime(),
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/vaults', vaultRoutes);
app.use('/api', noteRoutes);     // /api/vaults/:id/notes, /api/notes/:id
app.use('/api', activityRoutes); // /api/vaults/:id/activity

// Global error handler / 全局错误处理 (Q-04 fix)
import type { Request, Response, NextFunction } from 'express';
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ code: 500, status: false, message: 'Internal server error' });
});

// Create HTTP server for both Express and WebSocket
const server = createServer(app);

// Setup WebSocket sync server / 初始化 WebSocket 同步服务器
setupSyncServer(server);

// Start server
async function start() {
  try {
    await prisma.$connect();
    console.log('✅ Database connected');

    server.listen(config.port, config.host, () => {
      console.log(`🚀 ObsidianTeamSync server running at http://${config.host}:${config.port}`);
      console.log(`   Environment: ${config.nodeEnv}`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

start();

// Graceful shutdown / 优雅关闭 (O-04 fix: also handle SIGTERM for Docker/K8s)
import { persistAllRooms } from './collab/room-manager.js';

async function shutdown() {
  console.log('\n🛑 Shutting down...');
  await persistAllRooms();
  await prisma.$disconnect();
  server.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
