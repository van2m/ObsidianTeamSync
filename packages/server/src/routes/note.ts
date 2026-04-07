// Note management routes / 笔记管理路由
import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { pathHash } from '../lib/hash.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireVaultRole, requireNoteRole } from '../middleware/permission.js';
import { Role } from '@ots/shared';

const router = Router();
router.use(authMiddleware);

/** GET /api/vaults/:vaultId/notes - List notes in vault / 列出 Vault 中的笔记 */
router.get('/vaults/:vaultId/notes', requireVaultRole(Role.VIEWER), async (req: Request, res: Response) => {
  const { vaultId } = req.params;
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = Math.min(parseInt(req.query.pageSize as string) || 50, 100);

  const pathFilter = req.query.path as string | undefined;
  const where: any = { vaultId, deleted: false };
  if (pathFilter) {
    where.path = pathFilter; // Exact match for note lookup by path
  }

  const [notes, total] = await Promise.all([
    prisma.note.findMany({
      where,
      select: {
        id: true,
        path: true,
        pathHash: true,
        mtime: true,
        ctime: true,
        size: true,
        lastEditorId: true,
        lastEditor: { select: { name: true } },
      },
      orderBy: { mtime: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.note.count({ where }),
  ]);

  res.json({
    code: 0,
    status: true,
    message: 'ok',
    data: {
      items: notes.map((n) => ({
        id: n.id,
        path: n.path,
        pathHash: n.pathHash,
        mtime: Number(n.mtime),
        ctime: Number(n.ctime),
        size: n.size,
        lastEditorId: n.lastEditorId,
        lastEditorName: n.lastEditor.name,
      })),
      total,
      page,
      pageSize,
    },
  });
});

/** GET /api/notes/:noteId - Get note content / 获取笔记内容 */
router.get('/notes/:noteId', requireNoteRole(Role.VIEWER), async (req: Request, res: Response) => {
  const note = await prisma.note.findUnique({
    where: { id: req.params.noteId },
    select: { id: true, path: true, markdown: true, mtime: true, vaultId: true },
  });

  if (!note) {
    res.status(404).json({ code: 404, status: false, message: 'Note not found' });
    return;
  }

  res.json({
    code: 0,
    status: true,
    message: 'ok',
    data: {
      id: note.id,
      path: note.path,
      markdown: note.markdown ?? '',
      mtime: Number(note.mtime),
    },
  });
});

/** PUT /api/notes/:noteId - Update note (via REST, non-collab) / 更新笔记内容 */
router.put('/notes/:noteId', requireNoteRole(Role.EDITOR), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { markdown } = req.body;

  if (typeof markdown !== 'string') {
    res.status(400).json({ code: 400, status: false, message: 'markdown is required' });
    return;
  }

  // Check for active Yjs room — reject if note is being collaboratively edited
  const existingNote = await prisma.note.findUnique({ where: { id: req.params.noteId }, select: { vaultId: true, pathHash: true } });
  if (existingNote) {
    const { getRoomByKey } = await import('../collab/room-manager.js');
    const roomKey = `${existingNote.vaultId}:${existingNote.pathHash}`;
    if (getRoomByKey(roomKey)) {
      res.status(409).json({ code: 409, status: false, message: '笔记正在协同编辑中，请通过编辑器修改' });
      return;
    }
  }

  const now = BigInt(Date.now());
  const note = await prisma.note.update({
    where: { id: req.params.noteId },
    data: {
      markdown,
      mtime: now,
      size: Buffer.byteLength(markdown, 'utf8'),
      lastEditorId: userId,
    },
  });

  // Save history snapshot / 保存历史快照
  await prisma.noteHistory.create({
    data: {
      noteId: note.id,
      markdown,
      editorId: userId,
    },
  });

  res.json({
    code: 0,
    status: true,
    message: 'ok',
    data: { id: note.id, mtime: Number(note.mtime) },
  });
});

/** POST /api/vaults/:vaultId/notes - Create note / 创建笔记 */
router.post('/vaults/:vaultId/notes', requireVaultRole(Role.EDITOR), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { vaultId } = req.params;
  const { path: notePath, markdown } = req.body;

  if (!notePath || typeof notePath !== 'string') {
    res.status(400).json({ code: 400, status: false, message: 'path is required' });
    return;
  }

  const hash = pathHash(notePath);
  const now = BigInt(Date.now());
  const content = markdown ?? '';

  const note = await prisma.note.create({
    data: {
      path: notePath,
      pathHash: hash,
      markdown: content,
      mtime: now,
      ctime: now,
      size: Buffer.byteLength(content, 'utf8'),
      vaultId,
      lastEditorId: userId,
    },
  });

  res.json({
    code: 0,
    status: true,
    message: 'ok',
    data: { id: note.id, path: note.path, pathHash: note.pathHash },
  });
});

/** DELETE /api/notes/:noteId - Soft delete note / 软删除笔记 */
router.delete('/notes/:noteId', requireNoteRole(Role.EDITOR), async (req: Request, res: Response) => {
  await prisma.note.update({
    where: { id: req.params.noteId },
    data: { deleted: true, mtime: BigInt(Date.now()) },
  });
  res.json({ code: 0, status: true, message: 'ok' });
});

/** GET /api/notes/:noteId/history - Get note history / 获取笔记历史 */
router.get('/notes/:noteId/history', requireNoteRole(Role.VIEWER), async (req: Request, res: Response) => {
  const includeContent = req.query.content === 'true';

  const history = await prisma.noteHistory.findMany({
    where: { noteId: req.params.noteId },
    select: {
      id: true,
      markdown: includeContent, // Only include full content when explicitly requested
      createdAt: true,
      noteId: true,
      editorId: true,
      editor: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  res.json({
    code: 0,
    status: true,
    message: 'ok',
    data: history.map((h) => ({
      id: h.id,
      noteId: h.noteId,
      ...(includeContent ? { markdown: (h as any).markdown } : {}),
      editorId: h.editor.id,
      editorName: h.editor.name,
      createdAt: h.createdAt.toISOString(),
    })),
  });
});

/** GET /api/notes/:noteId/diff - Compare two versions / 版本对比 */
router.get('/notes/:noteId/diff', requireNoteRole(Role.VIEWER), async (req: Request, res: Response) => {
  try {
    const { noteId } = req.params;
    const fromId = req.query.from as string;
    const toId = (req.query.to as string) || 'current';

    if (!fromId) {
      return res.status(400).json({ code: 400, status: false, message: 'from parameter required' });
    }

    // Get "from" version
    const fromHistory = await prisma.noteHistory.findUnique({
      where: { id: fromId },
      include: { editor: { select: { name: true } } },
    });
    if (!fromHistory || fromHistory.noteId !== noteId) {
      return res.status(404).json({ code: 404, status: false, message: 'From version not found' });
    }

    let toMarkdown: string;
    let toVersion: { id: string; editorName: string; createdAt: string } | 'current';

    if (toId === 'current') {
      const note = await prisma.note.findUnique({ where: { id: noteId }, select: { markdown: true } });
      toMarkdown = note?.markdown || '';
      toVersion = 'current';
    } else {
      const toHistory = await prisma.noteHistory.findUnique({
        where: { id: toId },
        include: { editor: { select: { name: true } } },
      });
      if (!toHistory || toHistory.noteId !== noteId) {
        return res.status(404).json({ code: 404, status: false, message: 'To version not found' });
      }
      toMarkdown = toHistory.markdown;
      toVersion = { id: toHistory.id, editorName: toHistory.editor.name, createdAt: toHistory.createdAt.toISOString() };
    }

    // Compute diff
    const { structuredPatch } = await import('diff');
    const patch = structuredPatch('', '', fromHistory.markdown, toMarkdown, '', '');

    const hunks = patch.hunks.map((h) => ({
      oldStart: h.oldStart,
      oldLines: h.oldLines,
      newStart: h.newStart,
      newLines: h.newLines,
      lines: h.lines.map((line) => ({
        type: line.startsWith('+') ? 'add' as const : line.startsWith('-') ? 'remove' as const : 'normal' as const,
        content: line.substring(1),
      })),
    }));

    res.json({
      code: 0,
      status: true,
      message: 'ok',
      data: {
        hunks,
        oldVersion: {
          id: fromHistory.id,
          editorName: fromHistory.editor.name,
          createdAt: fromHistory.createdAt.toISOString(),
        },
        newVersion: toVersion,
      },
    });
  } catch (err) {
    console.error('Diff error:', err);
    res.status(500).json({ code: 500, status: false, message: 'Failed to compute diff' });
  }
});

/** POST /api/notes/:noteId/rollback - Rollback to a specific version / 回滚到指定版本 */
router.post('/notes/:noteId/rollback', requireNoteRole(Role.EDITOR), async (req: Request, res: Response) => {
  try {
    const { noteId } = req.params;
    const { historyId } = req.body as { historyId: string };
    const userId = (req as any).user.userId;

    if (!historyId) {
      return res.status(400).json({ code: 400, status: false, message: 'historyId required' });
    }

    const historyEntry = await prisma.noteHistory.findUnique({ where: { id: historyId } });
    if (!historyEntry || historyEntry.noteId !== noteId) {
      return res.status(404).json({ code: 404, status: false, message: 'History version not found' });
    }

    const now = BigInt(Date.now());

    // Get note info first for room key
    const note = await prisma.note.findUnique({
      where: { id: noteId },
      select: { id: true, vaultId: true, path: true, pathHash: true },
    });
    if (!note) {
      return res.status(404).json({ code: 404, status: false, message: 'Note not found' });
    }

    // Destroy active Yjs room FIRST to prevent persist from overwriting rollback
    const { forceDestroyRoom } = await import('../collab/room-manager.js');
    const roomKey = `${note.vaultId}:${note.pathHash}`;
    await forceDestroyRoom(roomKey);

    // Then update note markdown, clear yjsState to force Yjs rebuild
    await prisma.note.update({
      where: { id: noteId },
      data: {
        markdown: historyEntry.markdown,
        yjsState: null,
        mtime: now,
        lastEditorId: userId,
      },
    });

    // Create history entry for the rollback
    await prisma.noteHistory.create({
      data: { noteId, markdown: historyEntry.markdown, editorId: userId },
    });

    // Activity log
    await prisma.activity.create({
      data: {
        type: 'note.rolledback',
        metadata: JSON.stringify({ noteId, notePath: note.path, rolledBackTo: historyId }),
        userId,
        vaultId: note.vaultId,
      },
    });

    // Broadcast rollback notification
    const { notifyVault } = await import('../sync/ws-server.js');
    const { SyncAction } = await import('@ots/shared');
    notifyVault(note.vaultId, {
      action: SyncAction.NoteRolledBack,
      data: { noteId, notePath: note.path, userName: (req as any).user.name },
    });

    res.json({
      code: 0,
      status: true,
      message: 'ok',
      data: { id: note.id, mtime: Number(now) },
    });
  } catch (err) {
    console.error('Rollback error:', err);
    res.status(500).json({ code: 500, status: false, message: 'Failed to rollback' });
  }
});

export default router;
