import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react';

interface CommentFormProps {
  onSubmit: (content: string, line?: number) => Promise<void>;
  showLineInput?: boolean;
}

export function CommentForm({ onSubmit, showLineInput }: CommentFormProps) {
  const [content, setContent] = useState('');
  const [line, setLine] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(content.trim(), line ? parseInt(line) : undefined);
      setContent('');
      setLine('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 border-t pt-3">
      {showLineInput && (
        <input
          type="number"
          placeholder="行号（可选）"
          value={line}
          onChange={(e) => setLine(e.target.value)}
          min={1}
          className="h-8 w-24 rounded-md border border-input bg-transparent px-2 text-xs"
        />
      )}
      <div className="flex gap-2">
        <textarea
          placeholder="添加评论..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={2}
          className="flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <Button type="submit" size="icon" disabled={submitting || !content.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}
