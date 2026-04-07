// WebSocket sync server / WebSocket 同步服务器
// Handles file-level synchronization using Action|JSON protocol
// and collaborative editing using binary Yjs protocol
import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { prisma } from '../lib/prisma.js';
import { pathHash } from '../lib/hash.js';
import {
  type AuthTokenPayload,
  type SyncMessage,
  SyncAction,
  SyncStatusCode,
  encodeSyncMessage,
  decodeSyncMessage,
} from '@ots/shared';
import type { Server } from 'http';
import { handleCollabMessage } from '../collab/collab-handler.js';
import { removeClientFromAllRooms, getRoomByKey } from '../collab/room-manager.js';

interface AuthenticatedSocket extends WebSocket {
  userId?: string;
  userName?: string;
  vaultId?: string;
  deviceId?: string;
  isAlive?: boolean;
}

/** Map: vaultId -> Set of connected sockets / Vault 到连接 Socket 的映射 */
const vaultConnections = new Map<string, Set<AuthenticatedSocket>>();

/** Throttle history snapshots: key = `noteId:userId`, value = last snapshot timestamp */
const historyThrottle = new Map<string, number>();

/** Per-note mutex to prevent TOCTOU between NoteModify and Yjs room operations */
const noteLocks = new Map<string, Promise<void>>();
async function withNoteLock(key: string, fn: () => Promise<void>): Promise<void> {
  const prev = noteLocks.get(key) ?? Promise.resolve();
  const current = prev.then(fn, fn); // Always run, even if prev rejected
  noteLocks.set(key, current);
  await current;
  if (noteLocks.get(key) === current) noteLocks.delete(key);
}
const HISTORY_THROTTLE_MS = 30000; // 30 seconds

// Periodically clean stale throttle entries to prevent memory leak
const throttleCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of historyThrottle) {
    if (now - ts > HISTORY_THROTTLE_MS * 2) {
      historyThrottle.delete(key);
    }
  }
}, 60000);
throttleCleanupTimer.unref(); // Don't block process exit

export function setupSyncServer(server: Server) {
  const wss = new WebSocketServer({ server, path: '/api/sync' });

  // Heartbeat / 心跳检测
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const sock = ws as AuthenticatedSocket;
      if (sock.isAlive === false) return sock.terminate();
      sock.isAlive = false;
      sock.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(heartbeatInterval));

  wss.on('connection', (ws: AuthenticatedSocket, req: IncomingMessage) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (raw, isBinary) => {
      try {
        if (isBinary) {
          // Binary frame → Yjs collaborative editing protocol
          await handleCollabMessage(ws, raw as Buffer);
        } else {
          // Text frame → existing Action|JSON protocol
          const msg = decodeSyncMessage(raw.toString());
          await handleMessage(ws, msg);
        }
      } catch (err) {
        console.error('Sync message error:', err);
        try {
          if (ws.readyState === 1 /* OPEN */) {
            ws.send(encodeSyncMessage({
              action: SyncAction.AuthResult,
              data: { code: 500, status: false, message: 'Internal error' },
            }));
          }
        } catch { /* ignore send errors in error handler */ }
      }
    });

    ws.on('close', () => {
      // Clean up collab rooms / 清理协同房间
      removeClientFromAllRooms(ws);

      if (ws.vaultId) {
        const conns = vaultConnections.get(ws.vaultId);
        if (conns) {
          conns.delete(ws);
          if (conns.size === 0) vaultConnections.delete(ws.vaultId);
        }
        // Broadcast user offline / 广播用户离线
        broadcastToVault(ws.vaultId, {
          action: SyncAction.UserOffline,
          data: { userId: ws.userId, userName: ws.userName },
        }, ws);
      }
    });
  });

  console.log('✅ WebSocket sync server ready on /api/sync');
}

async function handleMessage(ws: AuthenticatedSocket, msg: SyncMessage) {
  switch (msg.action) {
    case SyncAction.ClientAuth:
      await handleAuth(ws, msg.data as { token: string; vaultId: string; deviceId?: string });
      break;

    case SyncAction.NoteSync:
      await handleNoteSync(ws, msg);
      break;

    case SyncAction.NoteModify:
      await handleNoteModify(ws, msg);
      break;

    case SyncAction.NoteDelete:
      await handleNoteDelete(ws, msg);
      break;

    default:
      console.warn('Unknown sync action:', msg.action);
  }
}

async function handleAuth(
  ws: AuthenticatedSocket,
  data: { token: string; vaultId: string; deviceId?: string }
) {
  try {
    const payload = jwt.verify(data.token, config.jwtSecret) as AuthTokenPayload;

    // Verify vault access permission / 验证 Vault 访问权限 (S-01 fix)
    const vault = await prisma.vault.findUnique({
      where: { id: data.vaultId },
      select: { type: true, ownerId: true, teamId: true },
    });
    if (!vault) {
      ws.send(encodeSyncMessage({
        action: SyncAction.AuthResult,
        data: { code: SyncStatusCode.AuthFailed, status: false, message: 'Vault not found' },
      }));
      ws.close();
      return;
    }

    if (vault.type === 'PERSONAL') {
      if (vault.ownerId !== payload.userId) {
        ws.send(encodeSyncMessage({
          action: SyncAction.AuthResult,
          data: { code: SyncStatusCode.AuthFailed, status: false, message: 'Access denied' },
        }));
        ws.close();
        return;
      }
    } else if (vault.teamId) {
      const member = await prisma.teamMember.findUnique({
        where: { userId_teamId: { userId: payload.userId, teamId: vault.teamId } },
      });
      if (!member) {
        ws.send(encodeSyncMessage({
          action: SyncAction.AuthResult,
          data: { code: SyncStatusCode.AuthFailed, status: false, message: 'Not a team member' },
        }));
        ws.close();
        return;
      }
    }

    ws.userId = payload.userId;
    ws.userName = payload.name;
    ws.vaultId = data.vaultId;
    ws.deviceId = data.deviceId;

    // Register connection / 注册连接
    if (!vaultConnections.has(data.vaultId)) {
      vaultConnections.set(data.vaultId, new Set());
    }
    vaultConnections.get(data.vaultId)!.add(ws);

    ws.send(encodeSyncMessage({
      action: SyncAction.AuthResult,
      data: { code: SyncStatusCode.Success, status: true, message: 'Authenticated' },
    }));

    // Broadcast user online / 广播用户上线
    broadcastToVault(data.vaultId, {
      action: SyncAction.UserOnline,
      data: { userId: ws.userId, userName: ws.userName },
    }, ws);
  } catch {
    ws.send(encodeSyncMessage({
      action: SyncAction.AuthResult,
      data: { code: SyncStatusCode.AuthFailed, status: false, message: 'Auth failed' },
    }));
    ws.close();
  }
}

async function handleNoteSync(ws: AuthenticatedSocket, msg: SyncMessage) {
  if (!ws.vaultId || !ws.userId) return;

  const { lastTime } = msg.data as { lastTime: number };
  const lastTimeBigInt = BigInt(lastTime || 0);

  // Find notes modified since lastTime / 查找 lastTime 以后修改的笔记
  const modifiedNotes = await prisma.note.findMany({
    where: {
      vaultId: ws.vaultId,
      mtime: { gt: lastTimeBigInt },
      deleted: false,
    },
    select: { path: true, pathHash: true, mtime: true, markdown: true, size: true },
  });

  const deletedNotes = await prisma.note.findMany({
    where: {
      vaultId: ws.vaultId,
      mtime: { gt: lastTimeBigInt },
      deleted: true,
    },
    select: { path: true, pathHash: true, mtime: true },
  });

  const now = Date.now();
  ws.send(encodeSyncMessage({
    action: SyncAction.NoteSyncEnd,
    context: msg.context,
    data: {
      code: modifiedNotes.length + deletedNotes.length > 0
        ? SyncStatusCode.Success
        : SyncStatusCode.NoUpdate,
      status: true,
      lastTime: now,
      needModifyCount: modifiedNotes.length,
      needDeleteCount: deletedNotes.length,
      needUploadCount: 0,
      changes: [
        ...modifiedNotes.map((n) => ({
          path: n.path,
          pathHash: n.pathHash,
          action: 'modify' as const,
          mtime: Number(n.mtime),
          content: n.markdown,
        })),
        ...deletedNotes.map((n) => ({
          path: n.path,
          pathHash: n.pathHash,
          action: 'delete' as const,
          mtime: Number(n.mtime),
        })),
      ],
    },
  }));
}

async function handleNoteModify(ws: AuthenticatedSocket, msg: SyncMessage) {
  if (!ws.vaultId || !ws.userId) return;

  const { path: notePath, content, mtime } = msg.data as {
    path: string;
    content: string;
    mtime: number;
  };

  if (typeof notePath !== 'string' || typeof content !== 'string') return;

  const hash = pathHash(notePath);
  const vaultId = ws.vaultId;
  const userId = ws.userId;
  const roomKey = `${vaultId}:${hash}`;

  // Use per-note lock to prevent TOCTOU race with Yjs room operations
  await withNoteLock(roomKey, async () => {
    // Check inside lock to prevent race
    if (getRoomByKey(roomKey)) return; // Yjs room active, skip

    const now = BigInt(mtime || Date.now());

    const note = await prisma.note.upsert({
      where: { vaultId_pathHash: { vaultId, pathHash: hash } },
      update: {
        markdown: content,
        mtime: now,
        size: Buffer.byteLength(content, 'utf8'),
        lastEditorId: userId,
        deleted: false,
      },
      create: {
        path: notePath,
        pathHash: hash,
        markdown: content,
        mtime: now,
        ctime: now,
        size: Buffer.byteLength(content, 'utf8'),
        vaultId,
        lastEditorId: userId,
      },
    });

    // Save history snapshot with throttle (30s per user per note)
    const throttleKey = `${note.id}:${userId}`;
    const lastSnapshot = historyThrottle.get(throttleKey) || 0;
    if (Date.now() - lastSnapshot >= HISTORY_THROTTLE_MS) {
      await prisma.noteHistory.create({
        data: { noteId: note.id, markdown: content, editorId: userId },
      });
      historyThrottle.set(throttleKey, Date.now());
    }

    // Broadcast to other devices
    broadcastToVault(vaultId, {
      action: SyncAction.NoteSyncModify,
      data: {
        path: notePath,
        pathHash: hash,
        mtime: Number(now),
        content,
        editorId: userId,
        editorName: ws.userName,
      },
    }, ws);
  }); // end withNoteLock
}

async function handleNoteDelete(ws: AuthenticatedSocket, msg: SyncMessage) {
  if (!ws.vaultId || !ws.userId) return;

  const { path: notePath } = msg.data as { path: string };
  const hash = pathHash(notePath);
  const now = BigInt(Date.now());

  await prisma.note.updateMany({
    where: { vaultId: ws.vaultId, pathHash: hash },
    data: { deleted: true, mtime: now },
  });

  broadcastToVault(ws.vaultId, {
    action: SyncAction.NoteSyncDelete,
    data: { path: notePath, pathHash: hash, mtime: Number(now) },
  }, ws);
}

/** Broadcast message to all connections in a vault / 向 Vault 内所有连接广播消息 */
export function notifyVault(vaultId: string, msg: SyncMessage) {
  broadcastToVault(vaultId, msg);
}

function broadcastToVault(vaultId: string, msg: SyncMessage, exclude?: WebSocket) {
  const conns = vaultConnections.get(vaultId);
  if (!conns) return;
  const encoded = encodeSyncMessage(msg);
  for (const ws of conns) {
    if (ws !== exclude && ws.readyState === WebSocket.OPEN) {
      ws.send(encoded);
    }
  }
}
