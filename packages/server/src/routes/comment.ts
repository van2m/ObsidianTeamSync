// Comment CRUD routes / 评论增删改查路由
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireNoteRole } from '../middleware/permission.js';
import { notifyVault } from '../sync/ws-server.js';
import { SyncAction, Role, type CommentNotifyData } from '@ots/shared';

const router = Router();

// All comment routes require authentication
router.use(authMiddleware);

/** Helper: verify user has access to the vault containing a comment */
async function verifyCommentVaultAccess(userId: string, comment: { noteId: string; note: { vaultId: string } }): Promise<boolean> {
  const vault = await prisma.vault.findUnique({
    where: { id: comment.note.vaultId },
    select: { type: true, ownerId: true, teamId: true },
  });
  if (!vault) return false;
  if (vault.type === 'PERSONAL') return vault.ownerId === userId;
  if (vault.teamId) {
    const member = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId, teamId: vault.teamId } },
    });
    return !!member;
  }
  return false;
}

/** POST /api/notes/:noteId/comments — Create comment */
router.post('/notes/:noteId/comments', requireNoteRole(Role.VIEWER), async (req, res) => {
  try {
    const { noteId } = req.params;
    const { content, line } = req.body as { content: string; line?: number };
    const userId = (req as any).user.userId;

    if (!content?.trim()) {
      return res.status(400).json({ code: 400, status: false, message: 'Content is required' });
    }
    if (content.length > 10000) {
      return res.status(400).json({ code: 400, status: false, message: 'Content too long (max 10000 chars)' });
    }

    const comment = await prisma.comment.create({
      data: {
        content: content.trim(),
        line: line ?? null,
        noteId,
        authorId: userId,
      },
      include: { author: { select: { name: true, avatar: true } } },
    });

    // Get note for vault info
    const note = await prisma.note.findUnique({
      where: { id: noteId },
      select: { vaultId: true, path: true },
    });

    // Create activity record
    if (note) {
      await prisma.activity.create({
        data: {
          type: 'comment.added',
          metadata: JSON.stringify({ noteId, notePath: note.path, line }),
          userId,
          vaultId: note.vaultId,
        },
      });

      // Broadcast to vault
      notifyVault(note.vaultId, {
        action: SyncAction.CommentAdded,
        data: {
          commentId: comment.id,
          noteId,
          notePath: note.path,
          authorId: userId,
          authorName: comment.author.name,
          content: comment.content,
          line: comment.line,
        } satisfies CommentNotifyData,
      });
    }

    res.json({
      code: 0,
      status: true,
      message: 'ok',
      data: {
        id: comment.id,
        noteId: comment.noteId,
        content: comment.content,
        line: comment.line,
        resolved: comment.resolved,
        authorId: comment.authorId,
        authorName: comment.author.name,
        authorAvatar: comment.author.avatar,
        createdAt: comment.createdAt.toISOString(),
        updatedAt: comment.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    console.error('Create comment error:', err);
    res.status(500).json({ code: 500, status: false, message: 'Failed to create comment' });
  }
});

/** GET /api/notes/:noteId/comments — List comments */
router.get('/notes/:noteId/comments', requireNoteRole(Role.VIEWER), async (req, res) => {
  try {
    const { noteId } = req.params;
    const { resolved } = req.query;

    const where: any = { noteId };
    if (resolved === 'true') where.resolved = true;
    if (resolved === 'false') where.resolved = false;

    const comments = await prisma.comment.findMany({
      where,
      include: { author: { select: { name: true, avatar: true } } },
      orderBy: { createdAt: 'asc' },
      take: 200, // Cap at 200 comments per note
    });

    res.json({
      code: 0,
      status: true,
      message: 'ok',
      data: comments.map((c) => ({
        id: c.id,
        noteId: c.noteId,
        content: c.content,
        line: c.line,
        resolved: c.resolved,
        authorId: c.authorId,
        authorName: c.author.name,
        authorAvatar: c.author.avatar,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error('List comments error:', err);
    res.status(500).json({ code: 500, status: false, message: 'Failed to list comments' });
  }
});

/** PUT /api/comments/:commentId — Update comment content */
router.put('/comments/:commentId', async (req, res) => {
  try {
    const { commentId } = req.params;
    const { content } = req.body as { content: string };
    const userId = (req as any).user.userId;

    if (!content?.trim()) {
      return res.status(400).json({ code: 400, status: false, message: 'Content is required' });
    }
    if (content.length > 10000) {
      return res.status(400).json({ code: 400, status: false, message: 'Content too long (max 10000 chars)' });
    }

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: { note: { select: { vaultId: true, path: true } } },
    });
    if (!comment) {
      return res.status(404).json({ code: 404, status: false, message: 'Comment not found' });
    }
    // Verify vault access
    if (!await verifyCommentVaultAccess(userId, comment)) {
      return res.status(403).json({ code: 403, status: false, message: 'Access denied' });
    }
    if (comment.authorId !== userId) {
      return res.status(403).json({ code: 403, status: false, message: 'Only the author can edit' });
    }

    const updated = await prisma.comment.update({
      where: { id: commentId },
      data: { content: content.trim() },
      include: { author: { select: { name: true, avatar: true } } },
    });

    notifyVault(comment.note.vaultId, {
      action: SyncAction.CommentUpdated,
      data: {
        commentId,
        noteId: comment.noteId,
        notePath: comment.note.path,
        authorId: userId,
        authorName: updated.author.name,
        content: updated.content,
      } satisfies CommentNotifyData,
    });

    res.json({
      code: 0,
      status: true,
      message: 'ok',
      data: {
        id: updated.id,
        noteId: updated.noteId,
        content: updated.content,
        line: updated.line,
        resolved: updated.resolved,
        authorId: updated.authorId,
        authorName: updated.author.name,
        authorAvatar: updated.author.avatar,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    console.error('Update comment error:', err);
    res.status(500).json({ code: 500, status: false, message: 'Failed to update comment' });
  }
});

/** PATCH /api/comments/:commentId/resolve — Toggle resolved status */
router.patch('/comments/:commentId/resolve', async (req, res) => {
  try {
    const { commentId } = req.params;
    const { resolved } = req.body as { resolved: boolean };
    const userId = (req as any).user.userId;

    if (typeof resolved !== 'boolean') {
      return res.status(400).json({ code: 400, status: false, message: 'resolved must be a boolean' });
    }

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: { note: { select: { vaultId: true, path: true } } },
    });
    if (!comment) {
      return res.status(404).json({ code: 404, status: false, message: 'Comment not found' });
    }
    if (!await verifyCommentVaultAccess(userId, comment)) {
      return res.status(403).json({ code: 403, status: false, message: 'Access denied' });
    }

    const updated = await prisma.comment.update({
      where: { id: commentId },
      data: { resolved },
      include: { author: { select: { name: true, avatar: true } } },
    });

    // Activity for resolve
    if (resolved) {
      await prisma.activity.create({
        data: {
          type: 'comment.resolved',
          metadata: JSON.stringify({ noteId: comment.noteId, commentId }),
          userId,
          vaultId: comment.note.vaultId,
        },
      });
    }

    notifyVault(comment.note.vaultId, {
      action: SyncAction.CommentUpdated,
      data: {
        commentId,
        noteId: comment.noteId,
        notePath: comment.note.path,
        authorId: updated.authorId,
        authorName: updated.author.name,
        resolved: updated.resolved,
      } satisfies CommentNotifyData,
    });

    res.json({
      code: 0,
      status: true,
      message: 'ok',
      data: {
        id: updated.id,
        noteId: updated.noteId,
        content: updated.content,
        line: updated.line,
        resolved: updated.resolved,
        authorId: updated.authorId,
        authorName: updated.author.name,
        authorAvatar: updated.author.avatar,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    console.error('Resolve comment error:', err);
    res.status(500).json({ code: 500, status: false, message: 'Failed to resolve comment' });
  }
});

/** DELETE /api/comments/:commentId — Delete comment */
router.delete('/comments/:commentId', async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = (req as any).user.userId;

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: { note: { select: { vaultId: true, path: true } } },
    });
    if (!comment) {
      return res.status(404).json({ code: 404, status: false, message: 'Comment not found' });
    }
    if (!await verifyCommentVaultAccess(userId, comment)) {
      return res.status(403).json({ code: 403, status: false, message: 'Access denied' });
    }
    if (comment.authorId !== userId) {
      return res.status(403).json({ code: 403, status: false, message: 'Only the author can delete' });
    }

    await prisma.comment.delete({ where: { id: commentId } });

    await prisma.activity.create({
      data: {
        type: 'comment.deleted',
        metadata: JSON.stringify({ noteId: comment.noteId, commentId }),
        userId,
        vaultId: comment.note.vaultId,
      },
    });

    notifyVault(comment.note.vaultId, {
      action: SyncAction.CommentDeleted,
      data: {
        commentId,
        noteId: comment.noteId,
        notePath: comment.note.path,
        authorId: userId,
        authorName: '',
      } satisfies CommentNotifyData,
    });

    res.json({ code: 0, status: true, message: 'ok', data: null });
  } catch (err) {
    console.error('Delete comment error:', err);
    res.status(500).json({ code: 500, status: false, message: 'Failed to delete comment' });
  }
});

export default router;
