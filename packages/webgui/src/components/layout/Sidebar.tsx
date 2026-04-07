import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '仪表盘' },
  { to: '/teams', icon: Users, label: '团队' },
  { to: '/vaults', icon: FolderOpen, label: 'Vault' },
];

export function Sidebar() {
  return (
    <aside className="flex h-full w-56 flex-col border-r bg-muted/40">
      <div className="flex h-14 items-center border-b px-4">
        <span className="text-lg font-semibold">OTS</span>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
