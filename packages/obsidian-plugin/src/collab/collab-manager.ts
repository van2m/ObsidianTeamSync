// Collaborative editing session manager / 协同编辑会话管理
// Manages which note is currently being collaboratively edited

import * as Y from 'yjs';
import { pathHash as computePathHash, CollabMsgType, decodeCollabMessage, COLLAB_HEADER_LENGTH } from '@ots/shared';
import { OTSCollabProvider } from './collab-provider';

interface CollabSession {
  path: string;
  pathHash: string;
  doc: Y.Doc;
  provider: OTSCollabProvider;
}

export class CollabManager {
  private activeSession: CollabSession | null = null;
  private sendBinaryFn: ((data: Uint8Array) => void) | null = null;

  /** Set the binary send function (from SyncEngine) */
  setSendBinary(fn: (data: Uint8Array) => void): void {
    this.sendBinaryFn = fn;
  }

  /** Join a collaborative editing session for a note */
  joinNote(path: string): { doc: Y.Doc; provider: OTSCollabProvider } | null {
    if (!this.sendBinaryFn) return null;

    // Leave current session if any
    this.leaveCurrentNote();

    const pathHashStr = computePathHash(path);
    const doc = new Y.Doc();
    const provider = new OTSCollabProvider(pathHashStr, doc, this.sendBinaryFn);

    this.activeSession = { path, pathHash: pathHashStr, doc, provider };
    return { doc, provider };
  }

  /** Leave the current collaborative session */
  leaveCurrentNote(): void {
    if (this.activeSession) {
      this.activeSession.provider.destroy();
      this.activeSession.doc.destroy();
      this.activeSession = null;
    }
  }

  /** Check if a specific path is currently in collaborative editing mode */
  isCollabActive(path: string): boolean {
    return this.activeSession?.path === path;
  }

  /** Get the current active session */
  getActiveSession(): CollabSession | null {
    return this.activeSession;
  }

  /** Handle incoming binary message from server (called by SyncEngine) */
  handleBinaryMessage(data: ArrayBuffer): void {
    const uint8 = new Uint8Array(data);
    if (uint8.byteLength < COLLAB_HEADER_LENGTH) return;

    const { msgType, pathHash, payload } = decodeCollabMessage(uint8);

    // Route to active session if pathHash matches
    if (this.activeSession && this.activeSession.pathHash === pathHash) {
      this.activeSession.provider.handleServerMessage(msgType as CollabMsgType, payload);
    }
  }

  /** Clean up all resources */
  destroy(): void {
    this.leaveCurrentNote();
    this.sendBinaryFn = null;
  }
}
