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

  const [notes, total] = await Promise.all([
    prisma.note.findMany({
      where: { vaultId, deleted: false },
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
    prisma.note.count({ where: { vaultId, deleted: false } }),
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
  const history = await prisma.noteHistory.findMany({
    where: { noteId: req.params.noteId },
    include: { editor: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  res.json({
    code: 0,
    status: true,
    message: 'ok',
    data: history.map((h) => ({
      id: h.id,
      markdown: h.markdown,
      editorId: h.editor.id,
      editorName: h.editor.name,
      createdAt: h.createdAt.toISOString(),
    })),
  });
});

export default router;
