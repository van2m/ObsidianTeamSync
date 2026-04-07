import { useEffect } from 'react';
import { useNotificationStore } from '@/stores/notification-store';
import { X } from 'lucide-react';

export function NotificationToast() {
  const notifications = useNotificationStore((s) => s.notifications);
  const dismiss = useNotificationStore((s) => s.dismiss);

  // Auto-dismiss after 5 seconds
  useEffect(() => {
    const timers = notifications.map((n) =>
      setTimeout(() => dismiss(n.id), 5000)
    );
    return () => timers.forEach(clearTimeout);
  }, [notifications]);

  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {notifications.map((n) => (
        <div
          key={n.id}
          className="flex items-start gap-2 rounded-lg border bg-background p-3 shadow-lg animate-in slide-in-from-right"
        >
          <div className="flex-1">
            <p className="text-sm font-medium">{n.title}</p>
            {n.description && (
              <p className="text-xs text-muted-foreground">{n.description}</p>
            )}
          </div>
          <button onClick={() => dismiss(n.id)} className="text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
