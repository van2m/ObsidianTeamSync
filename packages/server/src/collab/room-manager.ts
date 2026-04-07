// Yjs Room Manager / Yjs 房间生命周期管理
// Handles creation, persistence, and cleanup of collaborative editing rooms

import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import { prisma } from '../lib/prisma.js';
import type { WebSocket } from 'ws';

interface AuthenticatedSocket extends WebSocket {
  userId?: string;
  userName?: string;
  vaultId?: string;
  deviceId?: string;
  isAlive?: boolean;
}

export interface CollabRoom {
  roomKey: string;                  // `${vaultId}:${pathHash}`
  vaultId: string;
  pathHash: string;
  noteId: string;                   // Note UUID from database
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  clients: Map<AuthenticatedSocket, Set<number>>; // socket → Set of awareness clientIds
  lastActivity: number;
  dirty: boolean;
  persistTimer: ReturnType<typeof setTimeout> | null;
  destroyTimer: ReturnType<typeof setTimeout> | null;
}

const activeRooms = new Map<string, CollabRoom>();
const pendingRooms = new Map<string, Promise<CollabRoom | null>>();

const PERSIST_DEBOUNCE_MS = 5000;
const DESTROY_DELAY_MS = 30000;
const PERIODIC_PERSIST_MS = 60000;

// Periodic persistence for all dirty rooms / 定期持久化所有脏房间
let periodicTimer: ReturnType<typeof setInterval> | null = null;

function startPeriodicPersist() {
  if (periodicTimer) return;
  periodicTimer = setInterval(async () => {
    for (const [key, room] of activeRooms) {
      if (room.dirty) {
        await persistRoom(key);
      }
    }
  }, PERIODIC_PERSIST_MS);
}

function stopPeriodicPersist() {
  if (periodicTimer) {
    clearInterval(periodicTimer);
    periodicTimer = null;
  }
}

/** Get or create a collaborative room for a note */
export async function getOrCreateRoom(vaultId: string, pathHash: string): Promise<CollabRoom | null> {
  const roomKey = `${vaultId}:${pathHash}`;

  // Return existing room
  const existing = activeRooms.get(roomKey);
  if (existing) {
    // Cancel pending destroy
    if (existing.destroyTimer) {
      clearTimeout(existing.destroyTimer);
      existing.destroyTimer = null;
    }
    return existing;
  }

  // Deduplicate concurrent creation requests
  const pending = pendingRooms.get(roomKey);
  if (pending) return pending;

  const promise = createRoom(vaultId, pathHash, roomKey);
  pendingRooms.set(roomKey, promise);
  try {
    return await promise;
  } finally {
    pendingRooms.delete(roomKey);
  }
}

async function createRoom(vaultId: string, pathHash: string, roomKey: string): Promise<CollabRoom | null> {
  // Load note from database
  const note = await prisma.note.findFirst({
    where: { vaultId, pathHash, deleted: false },
    select: { id: true, markdown: true, yjsState: true },
  });

  if (!note) return null;

  // Create Y.Doc
  const doc = new Y.Doc();

  if (note.yjsState && note.yjsState.length > 0) {
    // Restore from persisted Yjs state
    Y.applyUpdate(doc, new Uint8Array(note.yjsState));
  } else if (note.markdown) {
    // Initialize Y.Text from existing markdown (Phase 1 migration)
    const ytext = doc.getText('content');
    ytext.insert(0, note.markdown);
  }

  const awareness = new awarenessProtocol.Awareness(doc);

  const room: CollabRoom = {
    roomKey,
    vaultId,
    pathHash,
    noteId: note.id,
    doc,
    awareness,
    clients: new Map(),
    lastActivity: Date.now(),
    dirty: false,
    persistTimer: null,
    destroyTimer: null,
  };

  // Track doc changes for persistence
  doc.on('update', () => {
    room.dirty = true;
    room.lastActivity = Date.now();
    schedulePersist(room);
  });

  activeRooms.set(roomKey, room);
  startPeriodicPersist();

  return room;
}

/** Add a client to a room */
export function addClientToRoom(room: CollabRoom, ws: AuthenticatedSocket): void {
  if (!room.clients.has(ws)) {
    room.clients.set(ws, new Set());
  }
  room.lastActivity = Date.now();
}

/** Track an awareness clientId for a socket (learned from incoming awareness updates) */
export function trackAwarenessClient(room: CollabRoom, ws: AuthenticatedSocket, clientId: number): void {
  const ids = room.clients.get(ws);
  if (ids) ids.add(clientId);
}

/** Remove a client from a room */
export function removeClientFromRoom(room: CollabRoom, ws: AuthenticatedSocket): void {
  const clientIds = room.clients.get(ws);
  if (clientIds && clientIds.size > 0) {
    // Remove awareness states for all tracked clientIds
    awarenessProtocol.removeAwarenessStates(room.awareness, Array.from(clientIds), 'client disconnected');
  }
  room.clients.delete(ws);

  // Schedule room destruction if empty
  if (room.clients.size === 0) {
    room.destroyTimer = setTimeout(async () => {
      await persistRoom(room.roomKey);
      destroyRoom(room.roomKey);
    }, DESTROY_DELAY_MS);
  }
}

/** Remove a client from all rooms (called on socket close) */
export function removeClientFromAllRooms(ws: AuthenticatedSocket): void {
  for (const room of activeRooms.values()) {
    if (room.clients.has(ws)) {
      removeClientFromRoom(room, ws);
    }
  }
}

/** Get a room by its key */
export function getRoomByKey(roomKey: string): CollabRoom | undefined {
  return activeRooms.get(roomKey);
}

/** Persist a room's Yjs state to the database */
export async function persistRoom(roomKey: string): Promise<void> {
  const room = activeRooms.get(roomKey);
  if (!room || !room.dirty) return;

  try {
    const yjsState = Buffer.from(Y.encodeStateAsUpdate(room.doc));
    const markdown = room.doc.getText('content').toString();
    const now = BigInt(Date.now());

    await prisma.note.update({
      where: { id: room.noteId },
      data: { yjsState, markdown, mtime: now },
    });

    room.dirty = false;
  } catch (err) {
    console.error(`Failed to persist room ${roomKey}:`, err);
  }
}

/** Persist all active rooms (called on shutdown) */
export async function persistAllRooms(): Promise<void> {
  const promises: Promise<void>[] = [];
  for (const [key, room] of activeRooms) {
    if (room.dirty) {
      promises.push(persistRoom(key));
    }
  }
  await Promise.all(promises);
}

/** Force destroy a room (used by rollback) — skips persistence since content will be overwritten */
export async function forceDestroyRoom(roomKey: string): Promise<void> {
  const room = activeRooms.get(roomKey);
  if (!room) return;

  // Notify all clients in the room to reload (send a close frame with reason)
  for (const [client] of room.clients) {
    if (client.readyState === 1 /* OPEN */) {
      try {
        client.close(4001, 'Note rolled back — please reload');
      } catch { /* ignore close errors */ }
    }
  }
  room.clients.clear();

  // Don't persist — the rollback already wrote correct content
  destroyRoom(roomKey);
}

/** Destroy a room and release resources */
function destroyRoom(roomKey: string): void {
  const room = activeRooms.get(roomKey);
  if (!room) return;

  if (room.persistTimer) clearTimeout(room.persistTimer);
  if (room.destroyTimer) clearTimeout(room.destroyTimer);
  room.awareness.destroy();
  room.doc.destroy();
  activeRooms.delete(roomKey);

  if (activeRooms.size === 0) {
    stopPeriodicPersist();
  }
}

/** Schedule a debounced persist for a room */
function schedulePersist(room: CollabRoom): void {
  if (room.persistTimer) clearTimeout(room.persistTimer);
  room.persistTimer = setTimeout(() => {
    persistRoom(room.roomKey).catch((err) => console.error('Persist failed:', err));
  }, PERSIST_DEBOUNCE_MS);
}
