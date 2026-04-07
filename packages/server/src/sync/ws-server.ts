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
        ws.send(encodeSyncMessage({
          action: SyncAction.AuthResult,
          data: { code: 500, status: false, message: 'Internal error' },
        }));
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

  const hash = pathHash(notePath);
  const now = BigInt(mtime || Date.now());

  // If note has an active Yjs room, skip file-level sync — Yjs handles it
  // 如果笔记有活跃 Yjs 房间，跳过文件级同步 — Yjs 负责处理
  const roomKey = `${ws.vaultId}:${hash}`;
  const activeRoom = getRoomByKey(roomKey);
  if (activeRoom) {
    // Note is being collaboratively edited; ignore file-level NoteModify
    // to avoid destroying CRDT history. The collab session will persist
    // the final state when the room is destroyed.
    return;
  }

  const note = await prisma.note.upsert({
    where: { vaultId_pathHash: { vaultId: ws.vaultId, pathHash: hash } },
    update: {
      markdown: content,
      mtime: now,
      size: Buffer.byteLength(content, 'utf8'),
      lastEditorId: ws.userId,
      deleted: false,
    },
    create: {
      path: notePath,
      pathHash: hash,
      markdown: content,
      mtime: now,
      ctime: now,
      size: Buffer.byteLength(content, 'utf8'),
      vaultId: ws.vaultId,
      lastEditorId: ws.userId,
    },
  });

  // Save history snapshot / 保存历史快照 (L-02 fix)
  await prisma.noteHistory.create({
    data: { noteId: note.id, markdown: content, editorId: ws.userId },
  });

  // Broadcast to other devices / 广播给其他设备
  broadcastToVault(ws.vaultId, {
    action: SyncAction.NoteSyncModify,
    data: {
      path: notePath,
      pathHash: hash,
      mtime: Number(now),
      content,
      editorId: ws.userId,
      editorName: ws.userName,
    },
  }, ws);
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
