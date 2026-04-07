// File-level sync engine / 文件级同步引擎
// Manages WebSocket connection and file synchronization with the server
import {
  type SyncMessage,
  SyncAction,
  SyncStatusCode,
  encodeSyncMessage,
  decodeSyncMessage,
} from '@ots/shared';

export interface SyncEngineConfig {
  serverUrl: string;
  token: string;
  vaultId: string;
  deviceId: string;
}

export interface SyncEngineCallbacks {
  onConnected: () => void;
  onDisconnected: () => void;
  onNoteModified: (data: { path: string; content: string; mtime: number; editorName?: string }) => void;
  onNoteDeleted: (data: { path: string; mtime: number }) => void;
  onUserOnline: (data: { userId: string; userName: string }) => void;
  onUserOffline: (data: { userId: string; userName: string }) => void;
  onError: (error: Error) => void;
}

export class SyncEngine {
  private ws: WebSocket | null = null;
  private config: SyncEngineConfig;
  private callbacks: SyncEngineCallbacks;
  private lastSyncTime = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private isDestroyed = false;
  private binaryMessageHandler: ((data: ArrayBuffer) => void) | null = null;

  constructor(config: SyncEngineConfig, callbacks: SyncEngineCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
  }

  /** Set handler for incoming binary messages (used by CollabManager) */
  setBinaryMessageHandler(handler: (data: ArrayBuffer) => void): void {
    this.binaryMessageHandler = handler;
  }

  /** Send binary data over WebSocket (used by CollabProvider) */
  sendBinary(data: Uint8Array): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  /** Connect to sync server / 连接同步服务器 */
  connect() {
    if (this.isDestroyed) return;
    if (this.ws?.readyState === WebSocket.OPEN) return;

    const wsUrl = this.config.serverUrl.replace(/^http/, 'ws') + '/api/sync';
    this.ws = new WebSocket(wsUrl);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
      // Send auth / 发送认证
      this.send({
        action: SyncAction.ClientAuth,
        data: {
          token: this.config.token,
          vaultId: this.config.vaultId,
          deviceId: this.config.deviceId,
          clientVersion: '0.1.0',
        },
      });
    };

    this.ws.onmessage = (event) => {
      try {
        if (event.data instanceof ArrayBuffer) {
          // Binary frame → collaborative editing protocol
          this.binaryMessageHandler?.(event.data);
        } else {
          // Text frame → existing Action|JSON protocol
          const msg = decodeSyncMessage(event.data);
          this.handleMessage(msg);
        }
      } catch (err) {
        console.error('[OTS] Failed to parse sync message:', err);
      }
    };

    this.ws.onclose = () => {
      this.callbacks.onDisconnected();
      this.scheduleReconnect();
    };

    this.ws.onerror = (event) => {
      this.callbacks.onError(new Error('WebSocket error'));
    };
  }

  /** Disconnect from server / 断开连接 */
  disconnect() {
    this.isDestroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /** Request full sync / 请求全量同步 */
  requestSync() {
    this.send({
      action: SyncAction.NoteSync,
      data: {
        vaultId: this.config.vaultId,
        lastTime: this.lastSyncTime,
      },
    });
  }

  /** Upload note change / 上传笔记变更 */
  sendNoteModify(path: string, content: string, mtime: number) {
    this.send({
      action: SyncAction.NoteModify,
      data: { path, content, mtime },
    });
  }

  /** Upload note deletion / 上传笔记删除 */
  sendNoteDelete(path: string) {
    this.send({
      action: SyncAction.NoteDelete,
      data: { path },
    });
  }

  /** Check if connected / 检查是否已连接 */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private send(msg: SyncMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(encodeSyncMessage(msg));
    }
  }

  private handleMessage(msg: SyncMessage) {
    switch (msg.action) {
      case SyncAction.AuthResult: {
        const data = msg.data as { code: number; status: boolean };
        if (data.status) {
          this.callbacks.onConnected();
          // Auto-request sync after auth / 认证后自动请求同步
          this.requestSync();
        } else {
          this.callbacks.onError(new Error('Authentication failed'));
          this.disconnect();
        }
        break;
      }

      case SyncAction.NoteSyncEnd: {
        const data = msg.data as { lastTime: number; changes: any[] };
        this.lastSyncTime = data.lastTime;
        // Process each change / 处理每个变更
        for (const change of data.changes || []) {
          if (change.action === 'delete') {
            this.callbacks.onNoteDeleted({ path: change.path, mtime: change.mtime });
          } else {
            this.callbacks.onNoteModified({
              path: change.path,
              content: change.content,
              mtime: change.mtime,
            });
          }
        }
        break;
      }

      case SyncAction.NoteSyncModify: {
        const data = msg.data as any;
        this.callbacks.onNoteModified({
          path: data.path,
          content: data.content,
          mtime: data.mtime,
          editorName: data.editorName,
        });
        break;
      }

      case SyncAction.NoteSyncDelete: {
        const data = msg.data as any;
        this.callbacks.onNoteDeleted({ path: data.path, mtime: data.mtime });
        break;
      }

      case SyncAction.UserOnline:
        this.callbacks.onUserOnline(msg.data as any);
        break;

      case SyncAction.UserOffline:
        this.callbacks.onUserOffline(msg.data as any);
        break;
    }
  }

  private scheduleReconnect() {
    if (this.isDestroyed) return;
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelay);

    // Exponential backoff / 指数退避
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }
}
