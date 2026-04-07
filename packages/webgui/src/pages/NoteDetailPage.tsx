import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, History, FileText, MessageSquare, GitCompare, RotateCcw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CommentPanel } from '@/components/comments/CommentPanel';
import { DiffViewer } from '@/components/diff/DiffViewer';
import { notesApi } from '@/lib/api/notes';
import { formatDate } from '@/lib/utils';
import type { NoteContent, NoteHistoryEntry, DiffResult } from '@ots/shared';

export function NoteDetailPage() {
  const { noteId } = useParams<{ noteId: string }>();
  const navigate = useNavigate();
  const [note, setNote] = useState<NoteContent | null>(null);
  const [history, setHistory] = useState<NoteHistoryEntry[]>([]);
  const [selectedHistory, setSelectedHistory] = useState<NoteHistoryEntry | null>(null);
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [rolling, setRolling] = useState(false);

  const [error, setError] = useState('');

  const loadData = () => {
    if (!noteId) return;
    setError('');
    Promise.all([notesApi.get(noteId), notesApi.history(noteId)])
      .then(([n, h]) => {
        setNote(n);
        setHistory(h);
      })
      .catch((err) => setError(err.message || '加载失败'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, [noteId]);

  const handleDiff = async (historyId: string) => {
    if (!noteId) return;
    try {
      const result = await notesApi.diff(noteId, historyId, 'current');
      setDiffResult(result);
    } catch (err: any) {
      setError(err.message || '获取差异失败');
    }
  };

  const handleRollback = async (historyId: string) => {
    if (!noteId) return;
    if (!confirm('确定要回滚到此版本吗？当前内容将被覆盖。')) return;
    setRolling(true);
    try {
      await notesApi.rollback(noteId, historyId);
      setDiffResult(null);
      setSelectedHistory(null);
      loadData();
    } catch (err: any) {
      setError(err.message || '回滚失败');
    } finally {
      setRolling(false);
    }
  };

  if (loading) return <div className="text-muted-foreground">加载中...</div>;
  if (error) return <div className="text-destructive">{error}</div>;
  if (!note) return <div className="text-muted-foreground">笔记不存在</div>;

  const displayContent = selectedHistory?.markdown ?? note.markdown;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          <h1 className="text-xl font-bold">{note.path}</h1>
        </div>
      </div>

      <Tabs defaultValue="content">
        <TabsList>
          <TabsTrigger value="content">内容</TabsTrigger>
          <TabsTrigger value="history">
            <History className="mr-1 h-3 w-3" />
            历史 ({history.length})
          </TabsTrigger>
          <TabsTrigger value="comments">
            <MessageSquare className="mr-1 h-3 w-3" />
            评论
          </TabsTrigger>
        </TabsList>

        <TabsContent value="content">
          {diffResult ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">版本对比</h3>
                <Button variant="outline" size="sm" onClick={() => setDiffResult(null)}>
                  关闭对比
                </Button>
              </div>
              <DiffViewer diff={diffResult} />
            </div>
          ) : (
            <>
              <Card>
                <CardContent className="prose prose-neutral max-w-none p-6">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayContent}</ReactMarkdown>
                  {!displayContent && <p className="text-muted-foreground italic">空笔记</p>}
                </CardContent>
              </Card>
              {selectedHistory && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    正在查看 {selectedHistory.editorName} 于 {formatDate(selectedHistory.createdAt)} 的版本
                  </span>
                  <Button variant="outline" size="sm" onClick={() => setSelectedHistory(null)}>
                    返回最新
                  </Button>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-2">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无历史记录</p>
          ) : (
            history.map((h) => (
              <Card
                key={h.id}
                className={`transition-colors hover:bg-accent ${selectedHistory?.id === h.id ? 'ring-2 ring-primary' : ''}`}
              >
                <CardHeader className="p-4">
                  <CardTitle className="flex items-center justify-between text-sm">
                    <span
                      className="cursor-pointer hover:underline"
                      onClick={() => setSelectedHistory(h)}
                    >
                      {h.editorName}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-normal text-muted-foreground">{formatDate(h.createdAt)}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleDiff(h.id)}
                      >
                        <GitCompare className="mr-1 h-3 w-3" />
                        对比
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs text-destructive"
                        onClick={() => handleRollback(h.id)}
                        disabled={rolling}
                      >
                        <RotateCcw className="mr-1 h-3 w-3" />
                        回滚
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="comments">
          {noteId && <CommentPanel noteId={noteId} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
