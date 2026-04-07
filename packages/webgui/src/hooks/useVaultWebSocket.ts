import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { usePresenceStore } from '@/stores/presence-store';
import { useNotificationStore } from '@/stores/notification-store';
import {
  SyncAction,
  encodeSyncMessage,
  decodeSyncMessage,
  type UserPresenceData,
  type CommentNotifyData,
} from '@ots/shared';

function buildWsUrl(): string {
  const apiBase = import.meta.env.VITE_API_BASE_URL || '';
  if (apiBase && apiBase.startsWith('http')) {
    return apiBase.replace(/^http/, 'ws').replace(/\/api$/, '') + '/api/sync';
  }
  return window.location.origin.replace(/^http/, 'ws') + '/api/sync';
}

export function useVaultWebSocket(vaultId: string | undefined) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(1000);
  const destroyedRef = useRef(false);
  const token = useAuthStore((s) => s.token);
  const { addUser, removeUser, updateEditing, clear } = usePresenceStore();
  const pushNotification = useNotificationStore((s) => s.push);

  const connect = useCallback(() => {
    if (!vaultId || !token || destroyedRef.current) return;

    const ws = new WebSocket(buildWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectDelayRef.current = 1000; // Reset on success
      ws.send(encodeSyncMessage({
        action: SyncAction.ClientAuth,
        data: { token, vaultId, deviceId: 'webgui-' + Date.now(), clientVersion: '0.1.0' },
      }));
    };

    ws.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      try {
        const msg = decodeSyncMessage(event.data);
        switch (msg.action) {
          case SyncAction.UserOnline: {
            const data = msg.data as UserPresenceData;
            addUser(data);
            break;
          }
          case SyncAction.UserOffline: {
            const data = msg.data as UserPresenceData;
            removeUser(data.userId);
            break;
          }
          case SyncAction.UserEditingFile: {
            const data = msg.data as UserPresenceData;
            updateEditing(data.userId, data.editingNotePath);
            break;
          }
          case SyncAction.CommentAdded: {
            const data = msg.data as CommentNotifyData;
            pushNotification({
              title: '新评论',
              description: `${data.authorName} 评论了 ${data.notePath || '笔记'}`,
              type: 'info',
            });
            break;
          }
          case SyncAction.NoteRolledBack: {
            const data = msg.data as { notePath: string; userName: string };
            pushNotification({
              title: '版本回滚',
              description: `${data.userName} 回滚了 ${data.notePath}`,
              type: 'warning',
            });
            break;
          }
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = () => {
      // Ensure onclose fires for reconnect on connection failure
      ws.close();
    };

    ws.onclose = () => {
      clear();
      // Auto-reconnect with exponential backoff
      if (!destroyedRef.current) {
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          connect();
        }, reconnectDelayRef.current);
        reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 30000);
      }
    };
  }, [vaultId, token]);

  useEffect(() => {
    destroyedRef.current = false;
    clear();
    connect();

    return () => {
      destroyedRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
      clear();
    };
  }, [vaultId, token]);
}
