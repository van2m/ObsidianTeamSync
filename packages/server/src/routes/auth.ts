// Authentication routes / 认证路由
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthTokenPayload, AuthResponse } from '@ots/shared';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(50),
  password: z.string().min(6).max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

/** POST /api/auth/register - Register new user / 注册新用户 */
router.post('/register', async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ code: 400, status: false, message: parsed.error.issues[0].message });
    return;
  }

  const { email, name, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ code: 409, status: false, message: 'Email already registered' });
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, name, password: hashedPassword },
  });

  // Auto-create personal vault / 自动创建个人 Vault
  await prisma.vault.create({
    data: {
      name: `${name}'s Vault`,
      type: 'PERSONAL',
      ownerId: user.id,
    },
  });

  const tokenPayload: AuthTokenPayload = { userId: user.id, email: user.email, name: user.name };
  const token = jwt.sign(tokenPayload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

  const response: AuthResponse = {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar ?? undefined,
      createdAt: user.createdAt.toISOString(),
    },
  };
  res.json({ code: 0, status: true, message: 'ok', data: response });
});

/** POST /api/auth/login - Login / 登录 */
router.post('/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ code: 400, status: false, message: parsed.error.issues[0].message });
    return;
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    res.status(401).json({ code: 401, status: false, message: 'Invalid email or password' });
    return;
  }

  const tokenPayload: AuthTokenPayload = { userId: user.id, email: user.email, name: user.name };
  const token = jwt.sign(tokenPayload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

  const response: AuthResponse = {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar ?? undefined,
      createdAt: user.createdAt.toISOString(),
    },
  };
  res.json({ code: 0, status: true, message: 'ok', data: response });
});

/** GET /api/auth/me - Get current user info / 获取当前用户信息 */
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user) {
    res.status(404).json({ code: 404, status: false, message: 'User not found' });
    return;
  }
  res.json({
    code: 0,
    status: true,
    message: 'ok',
    data: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      createdAt: user.createdAt.toISOString(),
    },
  });
});

export default router;
