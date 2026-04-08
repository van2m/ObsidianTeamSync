// Vault management routes / Vault 管理路由
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

const createVaultSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['PERSONAL', 'TEAM']),
  teamId: z.string().optional(),
});

/** GET /api/vaults - List my vaults (personal + team) / 列出我的所有 Vault */
router.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  // Personal vaults / 个人 Vault
  const personalVaults = await prisma.vault.findMany({
    where: { ownerId: userId, type: 'PERSONAL' },
    include: { _count: { select: { notes: true } } },
  });

  // Team vaults (from all my teams) / 团队 Vault
  const memberships = await prisma.teamMember.findMany({
    where: { userId },
    select: { teamId: true },
  });
  const teamIds = memberships.map((m) => m.teamId);

  const teamVaults = await prisma.vault.findMany({
    where: { teamId: { in: teamIds }, type: 'TEAM' },
    include: {
      team: { select: { id: true, name: true } },
      _count: { select: { notes: true } },
    },
  });

  const vaults = [
    ...personalVaults.map((v) => ({
      id: v.id,
      name: v.name,
      type: v.type,
      createdAt: v.createdAt.toISOString(),
      noteCount: v._count.notes,
    })),
    ...teamVaults.map((v) => ({
      id: v.id,
      name: v.name,
      type: v.type,
      teamId: v.team?.id,
      teamName: v.team?.name,
      createdAt: v.createdAt.toISOString(),
      noteCount: v._count.notes,
    })),
  ];

  res.json({ code: 0, status: true, message: 'ok', data: vaults });
});

/** POST /api/vaults - Create vault / 创建 Vault */
router.post('/', async (req: Request, res: Response) => {
  const parsed = createVaultSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ code: 400, status: false, message: parsed.error.issues[0].message });
    return;
  }

  const userId = req.user!.userId;
  const { name, type, teamId } = parsed.data;

  if (type === 'TEAM') {
    if (!teamId) {
      res.status(400).json({ code: 400, status: false, message: 'teamId required for team vault' });
      return;
    }
    // Verify user is owner/admin of the team
    const member = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId, teamId } },
    });
    if (!member || !['OWNER', 'ADMIN'].includes(member.role)) {
      res.status(403).json({ code: 403, status: false, message: 'Only owner/admin can create team vaults' });
      return;
    }
  }

  const vault = await prisma.vault.create({
    data: {
      name,
      type,
      ownerId: userId,
      teamId: type === 'TEAM' ? teamId : null,
    },
  });

  res.json({
    code: 0,
    status: true,
    message: 'ok',
    data: {
      id: vault.id,
      name: vault.name,
      type: vault.type,
      teamId: vault.teamId,
      createdAt: vault.createdAt.toISOString(),
    },
  });
});

/** GET /api/vaults/:vaultId - Get vault details / 获取 Vault 详情 */
router.get('/:vaultId', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { vaultId } = req.params;

  const vault = await prisma.vault.findUnique({
    where: { id: vaultId },
    include: {
      team: { select: { id: true, name: true, members: true } },
      _count: { select: { notes: true, files: true } },
    },
  });

  if (!vault) {
    res.status(404).json({ code: 404, status: false, message: 'Vault not found' });
    return;
  }

  // Access check
  if (vault.type === 'PERSONAL' && vault.ownerId !== userId) {
    res.status(403).json({ code: 403, status: false, message: 'Access denied' });
    return;
  }
  if (vault.type === 'TEAM' && !vault.team?.members.some((m) => m.userId === userId)) {
    res.status(403).json({ code: 403, status: false, message: 'Not a team member' });
    return;
  }

  res.json({
    code: 0,
    status: true,
    message: 'ok',
    data: {
      id: vault.id,
      name: vault.name,
      type: vault.type,
      teamId: vault.teamId,
      teamName: vault.team?.name,
      createdAt: vault.createdAt.toISOString(),
      noteCount: vault._count.notes,
      fileCount: vault._count.files,
    },
  });
});

/** DELETE /api/vaults/:vaultId - Delete vault / 删除 Vault */
router.delete('/:vaultId', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { vaultId } = req.params;

  const vault = await prisma.vault.findUnique({
    where: { id: vaultId },
    include: { team: { include: { members: true } } },
  });

  if (!vault) {
    res.status(404).json({ code: 404, status: false, message: 'Vault not found' });
    return;
  }

  // Only owner can delete personal vault; only owner/admin can delete team vault
  if (vault.type === 'PERSONAL' && vault.ownerId !== userId) {
    res.status(403).json({ code: 403, status: false, message: 'Access denied' });
    return;
  }
  if (vault.type === 'TEAM') {
    const member = vault.team?.members.find((m) => m.userId === userId);
    if (!member || !['OWNER', 'ADMIN'].includes(member.role)) {
      res.status(403).json({ code: 403, status: false, message: 'Only owner/admin can delete team vault' });
      return;
    }
  }

  // Destroy active Yjs rooms before deleting vault
  const { destroyRoomsByVault } = await import('../collab/room-manager.js');
  await destroyRoomsByVault(vaultId);

  await prisma.vault.delete({ where: { id: vaultId } });
  res.json({ code: 0, status: true, message: 'ok' });
});

export default router;
