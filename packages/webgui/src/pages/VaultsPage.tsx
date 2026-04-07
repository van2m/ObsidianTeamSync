import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderOpen, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { vaultsApi } from '@/lib/api/vaults';
import { teamsApi } from '@/lib/api/teams';
import { ApiClientError } from '@/lib/api-client';
import { VaultType } from '@ots/shared';
import type { VaultInfo, TeamInfo } from '@ots/shared';

export function VaultsPage() {
  const [vaults, setVaults] = useState<VaultInfo[]>([]);
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<VaultType>(VaultType.PERSONAL);
  const [teamId, setTeamId] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadVaults = () => {
    vaultsApi.list().then(setVaults).finally(() => setLoading(false));
  };

  useEffect(() => {
    Promise.all([vaultsApi.list(), teamsApi.list()]).then(([v, t]) => {
      setVaults(v);
      setTeams(t);
    }).finally(() => setLoading(false));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await vaultsApi.create({
        name,
        type,
        ...(type === VaultType.TEAM ? { teamId } : {}),
      });
      setOpen(false);
      setName('');
      setType(VaultType.PERSONAL);
      setTeamId('');
      loadVaults();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="text-muted-foreground">加载中...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">我的 Vault</h1>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); setError(''); }}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1 h-3 w-3" />
              创建 Vault
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleCreate}>
              <DialogHeader>
                <DialogTitle>创建 Vault</DialogTitle>
                <DialogDescription>创建一个新的笔记库</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
                <div className="space-y-2">
                  <Label htmlFor="vaultName">名称</Label>
                  <Input id="vaultName" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>类型</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={type === VaultType.PERSONAL ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setType(VaultType.PERSONAL)}
                    >
                      个人
                    </Button>
                    <Button
                      type="button"
                      variant={type === VaultType.TEAM ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setType(VaultType.TEAM)}
                    >
                      团队
                    </Button>
                  </div>
                </div>
                {type === VaultType.TEAM && (
                  <div className="space-y-2">
                    <Label htmlFor="teamSelect">选择团队</Label>
                    <select
                      id="teamSelect"
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                      value={teamId}
                      onChange={(e) => setTeamId(e.target.value)}
                      required
                    >
                      <option value="">请选择团队</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button type="submit" disabled={submitting}>{submitting ? '创建中...' : '创建'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {vaults.length === 0 ? (
        <p className="text-muted-foreground">暂无 Vault</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {vaults.map((v) => (
            <Link key={v.id} to={`/vaults/${v.id}`}>
              <Card className="transition-colors hover:bg-accent">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <FolderOpen className="h-4 w-4" />
                    {v.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded bg-secondary px-1.5 py-0.5">
                      {v.type === 'PERSONAL' ? '个人' : '团队'}
                    </span>
                    {v.teamName && <span>{v.teamName}</span>}
                    <span>{v.noteCount} 篇笔记</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
