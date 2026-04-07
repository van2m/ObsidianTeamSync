import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CommentItem } from './CommentItem';
import { CommentForm } from './CommentForm';
import { commentsApi } from '@/lib/api/comments';
import type { CommentInfo } from '@ots/shared';

type Filter = 'all' | 'open' | 'resolved';

interface CommentPanelProps {
  noteId: string;
}

export function CommentPanel({ noteId }: CommentPanelProps) {
  const [comments, setComments] = useState<CommentInfo[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);

  const loadComments = () => {
    const resolved = filter === 'open' ? false : filter === 'resolved' ? true : undefined;
    commentsApi.list(noteId, resolved).then(setComments).finally(() => setLoading(false));
  };

  useEffect(() => {
    setLoading(true);
    loadComments();
  }, [noteId, filter]);

  const handleCreate = async (content: string, line?: number) => {
    await commentsApi.create(noteId, { content, line });
    loadComments();
  };

  const handleResolve = async (commentId: string, resolved: boolean) => {
    await commentsApi.resolve(commentId, resolved);
    loadComments();
  };

  const handleDelete = async (commentId: string) => {
    await commentsApi.delete(commentId);
    loadComments();
  };

  const openCount = comments.filter((c) => !c.resolved).length;

  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        {(['all', 'open', 'resolved'] as Filter[]).map((f) => (
          <Button
            key={f}
            variant={filter === f ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? `全部 (${comments.length})` : f === 'open' ? `未解决 (${openCount})` : `已解决 (${comments.length - openCount})`}
          </Button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">加载中...</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无评论</p>
      ) : (
        <div className="space-y-2">
          {comments.map((c) => (
            <CommentItem key={c.id} comment={c} onResolve={handleResolve} onDelete={handleDelete} />
          ))}
        </div>
      )}

      <CommentForm onSubmit={handleCreate} showLineInput />
    </div>
  );
}
