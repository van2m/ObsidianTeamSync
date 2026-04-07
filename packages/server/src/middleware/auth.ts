// JWT authentication middleware / JWT 认证中间件
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import type { AuthTokenPayload } from '@ots/shared';

declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ code: 401, status: false, message: 'Missing authorization token' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret) as AuthTokenPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ code: 401, status: false, message: 'Invalid or expired token' });
  }
}
