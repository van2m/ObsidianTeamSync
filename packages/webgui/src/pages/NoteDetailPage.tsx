import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, History, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { notesApi } from '@/lib/api/notes';
import { formatDate } from '@/lib/utils';
import type { NoteContent, NoteHistoryEntry } from '@ots/shared';

export function NoteDetailPage() {
  const { noteId } = useParams<{ noteId: string }>();
  const navigate = useNavigate();
  const [note, setNote] = useState<NoteContent | null>(null);
  const [history, setHistory] = useState<NoteHistoryEntry[]>([]);
  const [selectedHistory, setSelectedHistory] = useState<NoteHistoryEntry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!noteId) return;
    Promise.all([notesApi.get(noteId), notesApi.history(noteId)])
      .then(([n, h]) => {
        setNote(n);
        setHistory(h);
      })
      .finally(() => setLoading(false));
  }, [noteId]);

  if (loading) return <div className="text-muted-foreground">加载中...</div>;
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
        </TabsList>

        <TabsContent value="content">
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
        </TabsContent>

        <TabsContent value="history" className="space-y-2">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无历史记录</p>
          ) : (
            history.map((h) => (
              <Card
                key={h.id}
                className={`cursor-pointer transition-colors hover:bg-accent ${selectedHistory?.id === h.id ? 'ring-2 ring-primary' : ''}`}
                onClick={() => setSelectedHistory(h)}
              >
                <CardHeader className="p-4">
                  <CardTitle className="flex items-center justify-between text-sm">
                    <span>{h.editorName}</span>
                    <span className="font-normal text-muted-foreground">{formatDate(h.createdAt)}</span>
                  </CardTitle>
                </CardHeader>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
