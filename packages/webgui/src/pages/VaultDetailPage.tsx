import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, FileText, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NotificationToast } from '@/components/notifications/NotificationToast';
import { vaultsApi } from '@/lib/api/vaults';
import { notesApi } from '@/lib/api/notes';
import { activityApi } from '@/lib/api/activity';
import { useVaultWebSocket } from '@/hooks/useVaultWebSocket';
import { formatRelativeTime } from '@/lib/utils';
import type { VaultInfo, NoteInfo, ActivityEntry, PaginatedResponse } from '@ots/shared';

const activityLabels: Record<string, string> = {
  'note.created': '创建了笔记',
  'note.updated': '更新了笔记',
  'note.deleted': '删除了笔记',
  'note.renamed': '重命名了笔记',
  'note.rolledback': '回滚了笔记',
  'member.joined': '加入了 Vault',
  'member.left': '离开了 Vault',
  'member.role_changed': '角色已变更',
  'vault.created': '创建了 Vault',
  'comment.added': '添加了评论',
  'comment.resolved': '解决了评论',
  'comment.deleted': '删除了评论',
};

export function VaultDetailPage() {
  const { vaultId } = useParams<{ vaultId: string }>();
  const navigate = useNavigate();
  useVaultWebSocket(vaultId);
  const [vault, setVault] = useState<VaultInfo | null>(null);
  const [notes, setNotes] = useState<PaginatedResponse<NoteInfo> | null>(null);
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!vaultId) return;
    Promise.all([
      vaultsApi.get(vaultId),
      notesApi.list(vaultId, 1, 20),
      activityApi.list(vaultId, 1, 20),
    ]).then(([v, n, a]) => {
      setVault(v);
      setNotes(n);
      setActivities(a.items);
    }).finally(() => setLoading(false));
  }, [vaultId]);

  const loadPage = (p: number) => {
    if (!vaultId) return;
    setPage(p);
    notesApi.list(vaultId, p, 20).then(setNotes);
  };

  const handleDelete = async () => {
    if (!vaultId || !confirm('确定要删除这个 Vault 吗？此操作不可撤销。')) return;
    await vaultsApi.delete(vaultId);
    navigate('/vaults');
  };

  if (loading) return <div className="text-muted-foreground">加载中...</div>;
  if (!vault) return <div className="text-muted-foreground">Vault 不存在</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/vaults')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{vault.name}</h1>
          <p className="text-sm text-muted-foreground">
            {vault.type === 'PERSONAL' ? '个人' : '团队'} Vault
            {vault.teamName && ` · ${vault.teamName}`}
          </p>
        </div>
        <Button variant="outline" size="sm" className="text-destructive" onClick={handleDelete}>
          <Trash2 className="mr-1 h-3 w-3" />
          删除
        </Button>
      </div>

      <Tabs defaultValue="notes">
        <TabsList>
          <TabsTrigger value="notes">笔记 ({notes?.total ?? 0})</TabsTrigger>
          <TabsTrigger value="activity">活动日志</TabsTrigger>
        </TabsList>

        <TabsContent value="notes" className="space-y-3">
          {!notes || notes.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无笔记</p>
          ) : (
            <>
              {notes.items.map((n) => (
                <Link key={n.id} to={`/notes/${n.id}`}>
                  <Card className="transition-colors hover:bg-accent">
                    <CardContent className="flex items-center gap-3 p-4">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{n.path}</p>
                        <p className="text-xs text-muted-foreground">
                          {n.lastEditorName && `${n.lastEditorName} · `}
                          {formatRelativeTime(n.mtime)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
              {notes.total > 20 && (
                <div className="flex justify-center gap-2 pt-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => loadPage(page - 1)}>
                    上一页
                  </Button>
                  <span className="flex items-center text-sm text-muted-foreground">
                    {page} / {Math.ceil(notes.total / 20)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= Math.ceil(notes.total / 20)}
                    onClick={() => loadPage(page + 1)}
                  >
                    下一页
                  </Button>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="activity" className="space-y-3">
          {activities.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无活动</p>
          ) : (
            activities.map((a) => (
              <div key={a.id} className="flex items-start gap-3 border-b pb-3 last:border-0">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs">
                  {a.userName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm">
                    <span className="font-medium">{a.userName}</span>{' '}
                    {activityLabels[a.type] || a.type}
                    {a.metadata?.path && (
                      <span className="text-muted-foreground"> {a.metadata.path as string}</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatRelativeTime(a.createdAt)}</p>
                </div>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>
      <NotificationToast />
    </div>
  );
}
