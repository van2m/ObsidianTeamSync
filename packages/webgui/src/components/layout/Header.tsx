import { LogOut, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth-store';
import { OnlineUsers } from '@/components/presence/OnlineUsers';

export function Header() {
  const { user, logout } = useAuthStore();

  return (
    <header className="flex h-14 items-center justify-between border-b px-6">
      <div />
      <div className="flex items-center gap-4">
        <OnlineUsers />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <User className="h-4 w-4" />
          <span>{user?.name}</span>
        </div>
        <Button variant="ghost" size="icon" onClick={logout} title="退出登录">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
