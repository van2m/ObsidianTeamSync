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
  const [allComments, setAllComments] = useState<CommentInfo[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);

  const loadComments = () => {
    // 始终获取全部评论，前端做筛选，保证计数准确
    commentsApi.list(noteId).then(setAllComments).finally(() => setLoading(false));
  };

  useEffect(() => {
    setLoading(true);
    loadComments();
  }, [noteId]);

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

  const openCount = allComments.filter((c) => !c.resolved).length;
  const resolvedCount = allComments.length - openCount;
  const comments = filter === 'open' ? allComments.filter((c) => !c.resolved)
    : filter === 'resolved' ? allComments.filter((c) => c.resolved)
    : allComments;

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
            {f === 'all' ? `全部 (${allComments.length})` : f === 'open' ? `未解决 (${openCount})` : `已解决 (${resolvedCount})`}
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
