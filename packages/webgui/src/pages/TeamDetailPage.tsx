import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Copy, ArrowLeft, UserMinus, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { teamsApi } from '@/lib/api/teams';
import { useAuthStore } from '@/stores/auth-store';
import { Role, ROLE_HIERARCHY } from '@ots/shared';
import type { TeamInfo, TeamMemberInfo } from '@ots/shared';

const roleLabels: Record<Role, string> = {
  [Role.OWNER]: '所有者',
  [Role.ADMIN]: '管理员',
  [Role.EDITOR]: '编辑者',
  [Role.VIEWER]: '查看者',
};

const roleColors: Record<Role, string> = {
  [Role.OWNER]: 'bg-yellow-100 text-yellow-800',
  [Role.ADMIN]: 'bg-blue-100 text-blue-800',
  [Role.EDITOR]: 'bg-green-100 text-green-800',
  [Role.VIEWER]: 'bg-gray-100 text-gray-800',
};

export function TeamDetailPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const [team, setTeam] = useState<TeamInfo | null>(null);
  const [members, setMembers] = useState<TeamMemberInfo[]>([]);
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const loadTeam = () => {
    if (!teamId) return;
    teamsApi.get(teamId).then((res) => {
      setTeam(res.team);
      setMembers(res.members);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { loadTeam(); }, [teamId]);

  const myMember = members.find((m) => m.userId === currentUser?.id);
  const isAdmin = myMember && ROLE_HIERARCHY[myMember.role] >= ROLE_HIERARCHY[Role.ADMIN];

  const handleInvite = async () => {
    if (!teamId) return;
    const res = await teamsApi.invite(teamId);
    setInviteCode(res.inviteCode);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!teamId) return;
    await teamsApi.removeMember(teamId, memberId);
    loadTeam();
  };

  const handleChangeRole = async (memberId: string, role: Role) => {
    if (!teamId) return;
    await teamsApi.updateMemberRole(teamId, memberId, { role });
    loadTeam();
  };

  if (loading) return <div className="text-muted-foreground">加载中...</div>;
  if (!team) return <div className="text-muted-foreground">团队不存在</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/teams')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{team.name}</h1>
          <p className="text-sm text-muted-foreground">{members.length} 位成员</p>
        </div>
        {isAdmin && (
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm" className="ml-auto" onClick={handleInvite}>
                邀请成员
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>邀请成员</DialogTitle>
                <DialogDescription>分享以下邀请码给团队成员</DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-2 py-4">
                <code className="flex-1 rounded bg-muted p-3 text-sm font-mono">{inviteCode || '生成中...'}</code>
                {inviteCode && (
                  <Button variant="outline" size="icon" onClick={handleCopy}>
                    <Copy className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {copied && <p className="text-sm text-green-600">已复制到剪贴板</p>}
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">成员列表</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-md border p-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                    {m.userName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{m.userName}</p>
                    <p className="text-xs text-muted-foreground">{m.userEmail}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${roleColors[m.role]}`}>
                    {roleLabels[m.role]}
                  </span>
                  {isAdmin && m.userId !== currentUser?.id && m.role !== Role.OWNER && (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="更改角色"
                        onClick={() => {
                          const nextRole = m.role === Role.ADMIN ? Role.EDITOR
                            : m.role === Role.EDITOR ? Role.VIEWER
                            : Role.EDITOR;
                          handleChangeRole(m.id, nextRole);
                        }}
                      >
                        <Shield className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        title="移除成员"
                        onClick={() => handleRemoveMember(m.id)}
                      >
                        <UserMinus className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
