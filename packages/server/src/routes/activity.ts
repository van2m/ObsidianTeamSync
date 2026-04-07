// Activity feed routes / 活动流路由
import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireVaultRole } from '../middleware/permission.js';
import { Role } from '@ots/shared';

const router = Router();
router.use(authMiddleware);

/** GET /api/vaults/:vaultId/activity - Get vault activity feed / 获取 Vault 活动流 */
router.get('/vaults/:vaultId/activity', requireVaultRole(Role.VIEWER), async (req: Request, res: Response) => {
  const { vaultId } = req.params;
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = Math.min(parseInt(req.query.pageSize as string) || 20, 100);

  const [activities, total] = await Promise.all([
    prisma.activity.findMany({
      where: { vaultId },
      include: { user: { select: { id: true, name: true, avatar: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.activity.count({ where: { vaultId } }),
  ]);

  res.json({
    code: 0,
    status: true,
    message: 'ok',
    data: {
      items: activities.map((a) => ({
        id: a.id,
        type: a.type,
        userId: a.user.id,
        userName: a.user.name,
        userAvatar: a.user.avatar,
        metadata: safeJsonParse(a.metadata),
        createdAt: a.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    },
  });
});

/** Safe JSON.parse with fallback / 安全 JSON 解析 (D-02 fix) */
function safeJsonParse(str: string): Record<string, unknown> {
  try { return JSON.parse(str); } catch { return {}; }
}

export default router;
