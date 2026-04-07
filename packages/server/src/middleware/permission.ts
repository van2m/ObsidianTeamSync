// Permission check middleware / 权限检查中间件
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { Role, ROLE_HIERARCHY } from '@ots/shared';

/**
 * Check if user has required role in a vault (by vaultId param).
 * 检查用户是否在 Vault 中拥有所需角色。
 * P-01 fix: 直接查询单条 membership 而非加载全部成员。
 */
export function requireVaultRole(minRole: Role) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ code: 401, status: false, message: 'Not authenticated' });
      return;
    }

    const vaultId = req.params.vaultId || req.body?.vaultId;
    if (!vaultId) {
      res.status(400).json({ code: 400, status: false, message: 'vaultId is required' });
      return;
    }

    const vault = await prisma.vault.findUnique({
      where: { id: vaultId },
      select: { type: true, ownerId: true, teamId: true },
    });

    if (!vault) {
      res.status(404).json({ code: 404, status: false, message: 'Vault not found' });
      return;
    }

    // Personal vault - only owner has access / 个人 Vault 仅主人可访问
    if (vault.type === 'PERSONAL') {
      if (vault.ownerId !== userId) {
        res.status(403).json({ code: 403, status: false, message: 'Access denied' });
        return;
      }
      next();
      return;
    }

    // Team vault - check membership and role / 团队 Vault 检查成员身份和角色
    if (!vault.teamId) {
      res.status(403).json({ code: 403, status: false, message: 'Invalid vault configuration' });
      return;
    }

    const member = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId, teamId: vault.teamId } },
      select: { role: true },
    });

    if (!member) {
      res.status(403).json({ code: 403, status: false, message: 'Not a team member' });
      return;
    }

    const userLevel = ROLE_HIERARCHY[member.role as Role] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[minRole];
    if (userLevel < requiredLevel) {
      res.status(403).json({ code: 403, status: false, message: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

/**
 * Check vault access via noteId (resolves note -> vault -> permission).
 * 通过 noteId 检查 Vault 权限（先查 note 所属 vault 再校验权限）。
 */
export function requireNoteRole(minRole: Role) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ code: 401, status: false, message: 'Not authenticated' });
      return;
    }

    const noteId = req.params.noteId;
    if (!noteId) {
      res.status(400).json({ code: 400, status: false, message: 'noteId is required' });
      return;
    }

    const note = await prisma.note.findUnique({
      where: { id: noteId },
      select: { vaultId: true, vault: { select: { type: true, ownerId: true, teamId: true } } },
    });

    if (!note) {
      res.status(404).json({ code: 404, status: false, message: 'Note not found' });
      return;
    }

    const vault = note.vault;
    if (vault.type === 'PERSONAL') {
      if (vault.ownerId !== userId) {
        res.status(403).json({ code: 403, status: false, message: 'Access denied' });
        return;
      }
      next();
      return;
    }

    if (!vault.teamId) {
      res.status(403).json({ code: 403, status: false, message: 'Invalid vault configuration' });
      return;
    }

    const member = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId, teamId: vault.teamId } },
      select: { role: true },
    });

    if (!member) {
      res.status(403).json({ code: 403, status: false, message: 'Not a team member' });
      return;
    }

    const userLevel = ROLE_HIERARCHY[member.role as Role] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[minRole];
    if (userLevel < requiredLevel) {
      res.status(403).json({ code: 403, status: false, message: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

/** @deprecated Use requireVaultRole instead */
export const requireRole = requireVaultRole;
