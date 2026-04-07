// Sync protocol types / 同步协议类型
// Based on Action|JSON format from fast-note-sync-service

/** WebSocket message actions / WebSocket 消息动作 */
export enum SyncAction {
  // Client → Server
  ClientAuth = 'ClientAuth',
  NoteSync = 'NoteSync',
  NoteModify = 'NoteModify',
  NoteDelete = 'NoteDelete',
  NoteRename = 'NoteRename',
  FolderSync = 'FolderSync',
  FolderModify = 'FolderModify',
  FolderDelete = 'FolderDelete',
  FileSync = 'FileSync',
  FileModify = 'FileModify',
  FileDelete = 'FileDelete',

  // Server → Client
  AuthResult = 'AuthResult',
  NoteSyncEnd = 'NoteSyncEnd',
  NoteSyncModify = 'NoteSyncModify',
  NoteSyncDelete = 'NoteSyncDelete',
  FolderSyncEnd = 'FolderSyncEnd',
  FilesSyncEnd = 'FilesSyncEnd',

  // Collaboration awareness / 协同感知
  UserOnline = 'UserOnline',
  UserOffline = 'UserOffline',
  UserCursor = 'UserCursor',
}

/** Base sync message / 同步消息基础结构 */
export interface SyncMessage<T = unknown> {
  action: SyncAction;
  context?: string; // UUID for request-response matching
  data: T;
}

/** Client auth payload */
export interface ClientAuthData {
  token: string;
  vaultId: string;
  deviceId: string;
  clientVersion: string;
}

/** Sync request payload / 同步请求 */
export interface SyncRequestData {
  vaultId: string;
  lastTime: number; // Unix milliseconds - last sync timestamp
}

/** Sync end response / 同步结束响应 */
export interface SyncEndData {
  code: SyncStatusCode;
  status: boolean;
  lastTime: number;
  needUploadCount: number;
  needModifyCount: number;
  needDeleteCount: number;
  changes: SyncChange[];
}

export interface SyncChange {
  path: string;
  pathHash: string;
  action: 'create' | 'modify' | 'delete' | 'rename';
  mtime: number;
  content?: string; // Only for small files; attachments use chunked transfer
  oldPath?: string; // For rename operations
}

export enum SyncStatusCode {
  Success = 1,
  NoUpdate = 6,
  Conflict = 441,
  AuthFailed = 508,
}

/**
 * Encode sync message to wire format / 编码消息为传输格式
 * Format: Action|JSON (context is included in the JSON payload)
 */
export function encodeSyncMessage(msg: SyncMessage): string {
  const payload: Record<string, unknown> = { ...msg.data as Record<string, unknown> };
  if (msg.context) {
    payload.__ctx = msg.context;
  }
  return `${msg.action}|${JSON.stringify(payload)}`;
}

/**
 * Decode sync message from wire format / 解码传输格式消息
 * Extracts context from __ctx field in payload if present.
 */
export function decodeSyncMessage(raw: string): SyncMessage {
  const sep = raw.indexOf('|');
  if (sep === -1) {
    throw new Error('Invalid sync message format');
  }
  const action = raw.substring(0, sep) as SyncAction;
  const payload = JSON.parse(raw.substring(sep + 1));
  const context = payload.__ctx as string | undefined;
  if (context !== undefined) {
    delete payload.__ctx;
  }
  return { action, data: payload, context };
}
