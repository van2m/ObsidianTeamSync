// Collaborative editing message handler / 协同编辑消息处理器
// Handles binary WebSocket frames for Yjs sync, awareness, and room management

import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import {
  CollabMsgType,
  COLLAB_HEADER_LENGTH,
  decodeCollabMessage,
  encodeCollabMessage,
} from '@ots/shared';
import {
  getOrCreateRoom,
  addClientToRoom,
  removeClientFromRoom,
  trackAwarenessClient,
  getRoomByKey,
  type CollabRoom,
} from './room-manager.js';
import type { WebSocket } from 'ws';

interface AuthenticatedSocket extends WebSocket {
  userId?: string;
  userName?: string;
  vaultId?: string;
  deviceId?: string;
  isAlive?: boolean;
}

/** Handle an incoming binary collab message */
export async function handleCollabMessage(ws: AuthenticatedSocket, data: Buffer): Promise<void> {
  if (!ws.vaultId || !ws.userId) return;

  const uint8 = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const { msgType, pathHash, payload } = decodeCollabMessage(uint8);

  switch (msgType) {
    case CollabMsgType.RoomJoin:
      await handleRoomJoin(ws, pathHash);
      break;

    case CollabMsgType.RoomLeave:
      handleRoomLeave(ws, pathHash);
      break;

    case CollabMsgType.YjsSyncStep1:
      handleYjsSyncStep1(ws, pathHash, payload);
      break;

    case CollabMsgType.YjsSyncStep2:
      handleYjsSyncStep2(ws, pathHash, payload);
      break;

    case CollabMsgType.YjsUpdate:
      handleYjsUpdate(ws, pathHash, payload);
      break;

    case CollabMsgType.AwarenessUpdate:
      handleAwarenessUpdate(ws, pathHash, payload);
      break;

    default:
      console.warn('Unknown collab message type:', msgType);
  }
}

async function handleRoomJoin(ws: AuthenticatedSocket, pathHash: string): Promise<void> {
  const room = await getOrCreateRoom(ws.vaultId!, pathHash);

  if (!room) {
    // Note not found
    const errMsg = encodeCollabMessage(CollabMsgType.RoomError, pathHash, new Uint8Array(0));
    ws.send(errMsg);
    return;
  }

  addClientToRoom(room, ws);

  // Send RoomJoinAck
  ws.send(encodeCollabMessage(CollabMsgType.RoomJoinAck, pathHash, new Uint8Array(0)));

  // Send Yjs SyncStep1 to client (server initiates sync)
  const encoder = encoding.createEncoder();
  syncProtocol.writeSyncStep1(encoder, room.doc);
  const syncStep1 = encoding.toUint8Array(encoder);
  ws.send(encodeCollabMessage(CollabMsgType.YjsSyncStep1, pathHash, syncStep1));

  // Send current awareness state to the new client
  const awarenessStates = awarenessProtocol.encodeAwarenessUpdate(
    room.awareness,
    Array.from(room.awareness.getStates().keys()),
  );
  if (awarenessStates.byteLength > 0) {
    ws.send(encodeCollabMessage(CollabMsgType.AwarenessUpdate, pathHash, awarenessStates));
  }
}

function handleRoomLeave(ws: AuthenticatedSocket, pathHash: string): void {
  const roomKey = `${ws.vaultId}:${pathHash}`;
  const room = getRoomByKey(roomKey);
  if (!room) return;

  // Broadcast awareness removal before leaving (using tracked clientIds)
  const clientIds = room.clients.get(ws);
  if (clientIds && clientIds.size > 0) {
    const removal = awarenessProtocol.encodeAwarenessUpdate(
      room.awareness,
      Array.from(clientIds),
    );
    broadcastToRoom(room, removal, CollabMsgType.AwarenessUpdate, ws);
  }

  removeClientFromRoom(room, ws);
}

function handleYjsSyncStep1(ws: AuthenticatedSocket, pathHash: string, payload: Uint8Array): void {
  const roomKey = `${ws.vaultId}:${pathHash}`;
  const room = getRoomByKey(roomKey);
  if (!room) return;

  const decoder = decoding.createDecoder(payload);
  const encoder = encoding.createEncoder();
  syncProtocol.readSyncStep1(decoder, encoder, room.doc);
  const reply = encoding.toUint8Array(encoder);

  if (reply.byteLength > 0) {
    ws.send(encodeCollabMessage(CollabMsgType.YjsSyncStep2, pathHash, reply));
  }
}

function handleYjsSyncStep2(ws: AuthenticatedSocket, pathHash: string, payload: Uint8Array): void {
  const roomKey = `${ws.vaultId}:${pathHash}`;
  const room = getRoomByKey(roomKey);
  if (!room) return;

  const decoder = decoding.createDecoder(payload);
  syncProtocol.readSyncStep2(decoder, room.doc);
}

function handleYjsUpdate(ws: AuthenticatedSocket, pathHash: string, payload: Uint8Array): void {
  const roomKey = `${ws.vaultId}:${pathHash}`;
  const room = getRoomByKey(roomKey);
  if (!room) return;

  try {
    // Apply update to server doc
    Y.applyUpdate(room.doc, payload);
    // Broadcast to other clients in the room
    broadcastToRoom(room, payload, CollabMsgType.YjsUpdate, ws);
  } catch (err) {
    console.error(`Failed to apply Yjs update for room ${roomKey}:`, err);
  }
}

function handleAwarenessUpdate(ws: AuthenticatedSocket, pathHash: string, payload: Uint8Array): void {
  const roomKey = `${ws.vaultId}:${pathHash}`;
  const room = getRoomByKey(roomKey);
  if (!room) return;

  // Track awareness clientIds from this socket for cleanup on disconnect
  try {
    const decoder = decoding.createDecoder(payload);
    const length = decoding.readVarUint(decoder);
    for (let i = 0; i < length; i++) {
      const clientId = decoding.readVarUint(decoder);
      trackAwarenessClient(room, ws, clientId);
      // Skip the rest of this entry (clock + state JSON)
      decoding.readVarUint(decoder);
      decoding.readVarString(decoder);
    }
  } catch {
    // Parsing for tracking only; non-fatal if it fails
  }

  awarenessProtocol.applyAwarenessUpdate(room.awareness, payload, ws);

  // Broadcast to other clients
  broadcastToRoom(room, payload, CollabMsgType.AwarenessUpdate, ws);
}

/** Broadcast a collab message to all clients in a room except the sender */
function broadcastToRoom(
  room: CollabRoom,
  payload: Uint8Array,
  msgType: CollabMsgType,
  exclude?: WebSocket,
): void {
  const frame = encodeCollabMessage(msgType, room.pathHash, payload);
  for (const [client] of room.clients) {
    if (client !== exclude && client.readyState === 1 /* WebSocket.OPEN */) {
      client.send(frame);
    }
  }
}
