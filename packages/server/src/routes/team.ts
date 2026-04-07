// Team management routes / 团队管理路由
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { Role } from '@ots/shared';

const router = Router();
router.use(authMiddleware);

const createTeamSchema = z.object({
  name: z.string().min(1).max(100),
});

const updateRoleSchema = z.object({
  role: z.enum(['ADMIN', 'EDITOR', 'VIEWER']),
});

/** POST /api/teams - Create team / 创建团队 */
router.post('/', async (req: Request, res: Response) => {
  const parsed = createTeamSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ code: 400, status: false, message: parsed.error.issues[0].message });
    return;
  }

  const userId = req.user!.userId;
  const team = await prisma.team.create({
    data: {
      name: parsed.data.name,
      inviteCode: nanoid(12),
      members: {
        create: { userId, role: Role.OWNER },
      },
    },
    include: { members: true },
  });

  res.json({
    code: 0,
    status: true,
    message: 'ok',
    data: {
      id: team.id,
      name: team.name,
      inviteCode: team.inviteCode,
      createdAt: team.createdAt.toISOString(),
      memberCount: team.members.length,
    },
  });
});

/** GET /api/teams - List my teams / 列出我的团队 */
router.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const memberships = await prisma.teamMember.findMany({
    where: { userId },
    include: {
      team: {
        include: { _count: { select: { members: true } } },
      },
    },
  });

  const teams = memberships.map((m) => ({
    id: m.team.id,
    name: m.team.name,
    inviteCode: m.team.inviteCode,
    myRole: m.role,
    createdAt: m.team.createdAt.toISOString(),
    memberCount: m.team._count.members,
  }));

  res.json({ code: 0, status: true, message: 'ok', data: teams });
});

/** GET /api/teams/:teamId - Get team details / 获取团队详情 */
router.get('/:teamId', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { teamId } = req.params;

  const member = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
  if (!member) {
    res.status(403).json({ code: 403, status: false, message: 'Not a team member' });
    return;
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
      },
      vaults: { select: { id: true, name: true, type: true } },
    },
  });

  if (!team) {
    res.status(404).json({ code: 404, status: false, message: 'Team not found' });
    return;
  }

  res.json({
    code: 0,
    status: true,
    message: 'ok',
    data: {
      id: team.id,
      name: team.name,
      inviteCode: team.inviteCode,
      createdAt: team.createdAt.toISOString(),
      members: team.members.map((m) => ({
        id: m.id,
        userId: m.user.id,
        userName: m.user.name,
        userEmail: m.user.email,
        userAvatar: m.user.avatar,
        role: m.role,
        joinedAt: m.joinedAt.toISOString(),
      })),
      vaults: team.vaults,
    },
  });
});

/** POST /api/teams/:teamId/invite - Get/refresh invite code / 获取邀请码 */
router.post('/:teamId/invite', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { teamId } = req.params;

  const member = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
  if (!member || !['OWNER', 'ADMIN'].includes(member.role)) {
    res.status(403).json({ code: 403, status: false, message: 'Only owner/admin can invite' });
    return;
  }

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  res.json({
    code: 0,
    status: true,
    message: 'ok',
    data: { inviteCode: team!.inviteCode },
  });
});

/** POST /api/teams/join - Join team via invite code / 通过邀请码加入团队 */
router.post('/join', async (req: Request, res: Response) => {
  const { inviteCode } = req.body;
  if (!inviteCode) {
    res.status(400).json({ code: 400, status: false, message: 'inviteCode is required' });
    return;
  }

  const userId = req.user!.userId;
  const team = await prisma.team.findUnique({ where: { inviteCode } });
  if (!team) {
    res.status(404).json({ code: 404, status: false, message: 'Invalid invite code' });
    return;
  }

  const existing = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId: team.id } },
  });
  if (existing) {
    res.status(409).json({ code: 409, status: false, message: 'Already a member' });
    return;
  }

  await prisma.teamMember.create({
    data: { userId, teamId: team.id, role: Role.EDITOR },
  });

  res.json({
    code: 0,
    status: true,
    message: 'ok',
    data: { teamId: team.id, teamName: team.name },
  });
});

/** PATCH /api/teams/:teamId/members/:memberId - Update member role / 更新成员角色 */
router.patch('/:teamId/members/:memberId', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { teamId, memberId } = req.params;

  const parsed = updateRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ code: 400, status: false, message: parsed.error.issues[0].message });
    return;
  }

  // Check requester is owner/admin
  const requester = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
  if (!requester || !['OWNER', 'ADMIN'].includes(requester.role)) {
    res.status(403).json({ code: 403, status: false, message: 'Insufficient permissions' });
    return;
  }

  const target = await prisma.teamMember.findUnique({ where: { id: memberId } });
  if (!target || target.teamId !== teamId) {
    res.status(404).json({ code: 404, status: false, message: 'Member not found' });
    return;
  }

  if (target.role === Role.OWNER) {
    res.status(403).json({ code: 403, status: false, message: 'Cannot change owner role' });
    return;
  }

  await prisma.teamMember.update({
    where: { id: memberId },
    data: { role: parsed.data.role },
  });

  res.json({ code: 0, status: true, message: 'ok' });
});

/** DELETE /api/teams/:teamId/members/:memberId - Remove member / 移除成员 */
router.delete('/:teamId/members/:memberId', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { teamId, memberId } = req.params;

  const requester = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
  if (!requester || !['OWNER', 'ADMIN'].includes(requester.role)) {
    res.status(403).json({ code: 403, status: false, message: 'Insufficient permissions' });
    return;
  }

  const target = await prisma.teamMember.findUnique({ where: { id: memberId } });
  if (!target || target.teamId !== teamId) {
    res.status(404).json({ code: 404, status: false, message: 'Member not found' });
    return;
  }

  if (target.role === Role.OWNER) {
    res.status(403).json({ code: 403, status: false, message: 'Cannot remove team owner' });
    return;
  }

  await prisma.teamMember.delete({ where: { id: memberId } });
  res.json({ code: 0, status: true, message: 'ok' });
});

export default router;
