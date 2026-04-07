import { Check, Trash2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatRelativeTime } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import type { CommentInfo } from '@ots/shared';

interface CommentItemProps {
  comment: CommentInfo;
  onResolve: (commentId: string, resolved: boolean) => void;
  onDelete: (commentId: string) => void;
}

export function CommentItem({ comment, onResolve, onDelete }: CommentItemProps) {
  const currentUser = useAuthStore((s) => s.user);
  const isAuthor = currentUser?.id === comment.authorId;

  return (
    <div className={`rounded-md border p-3 ${comment.resolved ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
            {comment.authorName.charAt(0).toUpperCase()}
          </div>
          <div>
            <span className="text-xs font-medium">{comment.authorName}</span>
            <span className="ml-2 text-[10px] text-muted-foreground">
              {formatRelativeTime(comment.createdAt)}
            </span>
            {comment.line && (
              <span className="ml-2 rounded bg-muted px-1 text-[10px] text-muted-foreground">
                行 {comment.line}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-1">
          {!comment.resolved ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              title="标记已解决"
              onClick={() => onResolve(comment.id, true)}
            >
              <Check className="h-3 w-3" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              title="重新打开"
              onClick={() => onResolve(comment.id, false)}
            >
              <Undo2 className="h-3 w-3" />
            </Button>
          )}
          {isAuthor && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive"
              title="删除"
              onClick={() => onDelete(comment.id)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
      <p className="mt-2 text-sm whitespace-pre-wrap">{comment.content}</p>
      {comment.resolved && (
        <span className="mt-1 inline-block rounded bg-green-100 px-1.5 py-0.5 text-[10px] text-green-700">
          已解决
        </span>
      )}
    </div>
  );
}
