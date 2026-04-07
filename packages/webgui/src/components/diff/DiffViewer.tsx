import type { DiffResult } from '@ots/shared';
import { cn } from '@/lib/utils';

interface DiffViewerProps {
  diff: DiffResult;
}

export function DiffViewer({ diff }: DiffViewerProps) {
  const oldLabel = `${diff.oldVersion.editorName} @ ${new Date(diff.oldVersion.createdAt).toLocaleString('zh-CN')}`;
  const newLabel = diff.newVersion === 'current' ? '当前版本' : `${diff.newVersion.editorName} @ ${new Date(diff.newVersion.createdAt).toLocaleString('zh-CN')}`;

  return (
    <div className="space-y-2">
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="text-red-600">--- {oldLabel}</span>
        <span className="text-green-600">+++ {newLabel}</span>
      </div>
      <div className="overflow-auto rounded-md border font-mono text-xs">
        {diff.hunks.map((hunk, hi) => (
          <div key={hi}>
            <div className="bg-muted px-3 py-1 text-muted-foreground">
              @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
            </div>
            {hunk.lines.map((line, li) => (
              <div
                key={li}
                className={cn(
                  'px-3 py-0.5 whitespace-pre-wrap',
                  line.type === 'add' && 'bg-green-50 text-green-800',
                  line.type === 'remove' && 'bg-red-50 text-red-800',
                )}
              >
                <span className="mr-2 inline-block w-4 text-right text-muted-foreground">
                  {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                </span>
                {line.content}
              </div>
            ))}
          </div>
        ))}
        {diff.hunks.length === 0 && (
          <div className="p-4 text-center text-muted-foreground">两个版本内容相同</div>
        )}
      </div>
    </div>
  );
}
