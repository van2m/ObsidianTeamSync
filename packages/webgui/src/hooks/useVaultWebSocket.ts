import { useEffect, useRef } from 'react';
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

export function useVaultWebSocket(vaultId: string | undefined) {
  const wsRef = useRef<WebSocket | null>(null);
  const token = useAuthStore((s) => s.token);
  const { addUser, removeUser, updateEditing, clear } = usePresenceStore();
  const pushNotification = useNotificationStore((s) => s.push);

  useEffect(() => {
    if (!vaultId || !token) return;

    clear();

    const wsUrl = window.location.origin.replace(/^http/, 'ws') + '/api/sync';
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
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

    ws.onclose = () => {
      clear();
    };

    return () => {
      ws.close();
      wsRef.current = null;
      clear();
    };
  }, [vaultId, token]);
}
