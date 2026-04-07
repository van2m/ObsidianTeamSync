import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Users, LogIn } from 'lucide-react';
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
import { teamsApi } from '@/lib/api/teams';
import { ApiClientError } from '@/lib/api-client';
import type { TeamInfo } from '@ots/shared';

export function TeamsPage() {
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [createError, setCreateError] = useState('');
  const [joinError, setJoinError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadTeams = () => {
    teamsApi.list().then(setTeams).finally(() => setLoading(false));
  };

  useEffect(() => { loadTeams(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setSubmitting(true);
    try {
      await teamsApi.create({ name: teamName });
      setCreateOpen(false);
      setTeamName('');
      loadTeams();
    } catch (err) {
      setCreateError(err instanceof ApiClientError ? err.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError('');
    setSubmitting(true);
    try {
      await teamsApi.join({ inviteCode });
      setJoinOpen(false);
      setInviteCode('');
      loadTeams();
    } catch (err) {
      setJoinError(err instanceof ApiClientError ? err.message : '加入失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="text-muted-foreground">加载中...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">我的团队</h1>
        <div className="flex gap-2">
          <Dialog open={joinOpen} onOpenChange={(o) => { setJoinOpen(o); setJoinError(''); }}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <LogIn className="mr-1 h-3 w-3" />
                加入团队
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleJoin}>
                <DialogHeader>
                  <DialogTitle>加入团队</DialogTitle>
                  <DialogDescription>输入邀请码加入现有团队</DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  {joinError && <div className="mb-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{joinError}</div>}
                  <Label htmlFor="inviteCode">邀请码</Label>
                  <Input id="inviteCode" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} required className="mt-2" />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={submitting}>{submitting ? '加入中...' : '加入'}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); setCreateError(''); }}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1 h-3 w-3" />
                创建团队
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleCreate}>
                <DialogHeader>
                  <DialogTitle>创建团队</DialogTitle>
                  <DialogDescription>创建一个新的团队来协作</DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  {createError && <div className="mb-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{createError}</div>}
                  <Label htmlFor="teamName">团队名称</Label>
                  <Input id="teamName" value={teamName} onChange={(e) => setTeamName(e.target.value)} required className="mt-2" />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={submitting}>{submitting ? '创建中...' : '创建'}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {teams.length === 0 ? (
        <p className="text-muted-foreground">暂无团队</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {teams.map((t) => (
            <Link key={t.id} to={`/teams/${t.id}`}>
              <Card className="transition-colors hover:bg-accent">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Users className="h-4 w-4" />
                    {t.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-xs text-muted-foreground">{t.memberCount} 位成员</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
