import { usePresenceStore } from '@/stores/presence-store';
import { cn } from '@/lib/utils';

export function OnlineUsers() {
  const users = usePresenceStore((s) => s.users);
  const userList = Array.from(users.values());

  if (userList.length === 0) return null;

  const shown = userList.slice(0, 5);
  const extra = userList.length - shown.length;

  return (
    <div className="flex items-center gap-1" title={userList.map((u) => u.userName).join(', ')}>
      <span className="mr-1 text-xs text-muted-foreground">在线:</span>
      <div className="flex -space-x-1.5">
        {shown.map((u) => (
          <div
            key={u.userId}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full border-2 border-background text-[10px] font-medium text-primary-foreground',
              'bg-primary',
            )}
            title={u.editingNotePath ? `${u.userName} 正在编辑 ${u.editingNotePath}` : u.userName}
          >
            {u.userName.charAt(0).toUpperCase()}
          </div>
        ))}
        {extra > 0 && (
          <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] text-muted-foreground">
            +{extra}
          </div>
        )}
      </div>
    </div>
  );
}
