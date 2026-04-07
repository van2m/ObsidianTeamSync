// Note types / 笔记相关类型

export interface NoteInfo {
  id: string;
  path: string;
  pathHash: string;
  vaultId: string;
  mtime: number; // Unix milliseconds
  ctime: number;
  size: number;
  deleted: boolean;
  lastEditorId: string;
  lastEditorName?: string;
}

export interface NoteContent {
  id: string;
  path: string;
  markdown: string;
  mtime: number;
}

export interface NoteHistoryEntry {
  id: string;
  noteId: string;
  markdown: string;
  editorId: string;
  editorName: string;
  createdAt: string;
}

export interface CommentInfo {
  id: string;
  noteId: string;
  content: string;
  line?: number; // Line-level comment / 行级评论
  resolved: boolean;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCommentRequest {
  content: string;
  line?: number;
}

export interface UpdateCommentRequest {
  content?: string;
  resolved?: boolean;
}

/** Diff result between two versions / 两个版本之间的差异结果 */
export interface DiffResult {
  hunks: DiffHunk[];
  oldVersion: { id: string; editorName: string; createdAt: string };
  newVersion: { id: string; editorName: string; createdAt: string } | 'current';
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffLine {
  type: 'add' | 'remove' | 'normal';
  content: string;
}

export interface ActivityEntry {
  id: string;
  type: ActivityType;
  userId: string;
  userName: string;
  vaultId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export type ActivityType =
  | 'note.created'
  | 'note.updated'
  | 'note.deleted'
  | 'note.renamed'
  | 'note.rolledback'
  | 'member.joined'
  | 'member.left'
  | 'member.role_changed'
  | 'vault.created'
  | 'comment.added'
  | 'comment.resolved'
  | 'comment.deleted';
