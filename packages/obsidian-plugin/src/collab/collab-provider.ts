// Custom Yjs WebSocket Provider / 自定义 Yjs WebSocket Provider
// Reuses the existing SyncEngine WebSocket connection for binary Yjs messages

import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import {
  CollabMsgType,
  encodeCollabMessage,
} from '@ots/shared';

export class OTSCollabProvider {
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  private pathHash: string;
  private sendBinary: (data: Uint8Array) => void;
  private synced = false;
  private updateHandler: (update: Uint8Array, origin: unknown) => void;
  private awarenessHandler: (changes: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => void;

  constructor(
    pathHash: string,
    doc: Y.Doc,
    sendBinary: (data: Uint8Array) => void,
  ) {
    this.pathHash = pathHash;
    this.doc = doc;
    this.sendBinary = sendBinary;
    this.awareness = new awarenessProtocol.Awareness(doc);

    // Listen for local doc updates → send to server
    this.updateHandler = (update: Uint8Array, origin: unknown) => {
      if (origin === this) return; // Skip updates from server
      this.sendBinary(encodeCollabMessage(CollabMsgType.YjsUpdate, this.pathHash, update));
    };
    doc.on('update', this.updateHandler);

    // Listen for local awareness changes → send to server
    this.awarenessHandler = (changes, origin) => {
      if (origin === 'remote') return;
      const changedClients = changes.added.concat(changes.updated).concat(changes.removed);
      const update = awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients);
      this.sendBinary(encodeCollabMessage(CollabMsgType.AwarenessUpdate, this.pathHash, update));
    };
    this.awareness.on('update', this.awarenessHandler);

    // Send RoomJoin
    this.sendBinary(encodeCollabMessage(CollabMsgType.RoomJoin, this.pathHash));
  }

  /** Handle incoming binary message from server */
  handleServerMessage(msgType: CollabMsgType, payload: Uint8Array): void {
    switch (msgType) {
      case CollabMsgType.RoomJoinAck:
        // Room joined successfully
        break;

      case CollabMsgType.RoomError:
        console.error('[OTS Collab] Room error for', this.pathHash);
        break;

      case CollabMsgType.YjsSyncStep1: {
        // Server sent SyncStep1, reply with SyncStep2
        const decoder = decoding.createDecoder(payload);
        const encoder = encoding.createEncoder();
        syncProtocol.readSyncStep1(decoder, encoder, this.doc);
        const reply = encoding.toUint8Array(encoder);
        if (reply.byteLength > 0) {
          this.sendBinary(encodeCollabMessage(CollabMsgType.YjsSyncStep2, this.pathHash, reply));
        }

        // Also send our SyncStep1 to get any missing updates from server
        if (!this.synced) {
          const syncEncoder = encoding.createEncoder();
          syncProtocol.writeSyncStep1(syncEncoder, this.doc);
          const step1 = encoding.toUint8Array(syncEncoder);
          this.sendBinary(encodeCollabMessage(CollabMsgType.YjsSyncStep1, this.pathHash, step1));
          this.synced = true;
        }
        break;
      }

      case CollabMsgType.YjsSyncStep2: {
        const decoder = decoding.createDecoder(payload);
        syncProtocol.readSyncStep2(decoder, this.doc);
        break;
      }

      case CollabMsgType.YjsUpdate:
        try {
          Y.applyUpdate(this.doc, payload, this);
        } catch (err) {
          console.error('[OTS Collab] Failed to apply Yjs update:', err);
        }
        break;

      case CollabMsgType.AwarenessUpdate:
        awarenessProtocol.applyAwarenessUpdate(this.awareness, payload, 'remote');
        break;
    }
  }

  /** Clean up and send RoomLeave */
  destroy(): void {
    // Remove listeners FIRST to prevent stale updates during teardown
    this.doc.off('update', this.updateHandler);
    this.awareness.off('update', this.awarenessHandler);
    // Then send RoomLeave
    try {
      this.sendBinary(encodeCollabMessage(CollabMsgType.RoomLeave, this.pathHash));
    } catch { /* ignore if WS disconnected */ }
    awarenessProtocol.removeAwarenessStates(
      this.awareness,
      [this.doc.clientID],
      'provider destroyed',
    );
    this.awareness.destroy();
  }
}
