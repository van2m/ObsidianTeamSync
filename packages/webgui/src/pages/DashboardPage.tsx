import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderOpen, Users, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { vaultsApi } from '@/lib/api/vaults';
import { teamsApi } from '@/lib/api/teams';
import type { VaultInfo, TeamInfo } from '@ots/shared';

export function DashboardPage() {
  const [vaults, setVaults] = useState<VaultInfo[]>([]);
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([vaultsApi.list(), teamsApi.list()])
      .then(([v, t]) => {
        setVaults(v);
        setTeams(t);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-muted-foreground">加载中...</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">仪表盘</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">我的 Vault</CardTitle>
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{vaults.length}</div>
            <Link to="/vaults" className="text-xs text-muted-foreground hover:underline">
              查看全部
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">我的团队</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{teams.length}</div>
            <Link to="/teams" className="text-xs text-muted-foreground hover:underline">
              查看全部
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">最近 Vault</h2>
          <Button variant="outline" size="sm" asChild>
            <Link to="/vaults">
              <Plus className="mr-1 h-3 w-3" />
              新建
            </Link>
          </Button>
        </div>
        {vaults.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无 Vault，去创建一个吧</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {vaults.slice(0, 6).map((v) => (
              <Link key={v.id} to={`/vaults/${v.id}`}>
                <Card className="transition-colors hover:bg-accent">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{v.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="rounded bg-secondary px-1.5 py-0.5">
                        {v.type === 'PERSONAL' ? '个人' : '团队'}
                      </span>
                      <span>{v.noteCount} 篇笔记</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
