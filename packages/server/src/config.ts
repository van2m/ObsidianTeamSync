// Server configuration / 服务端配置
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const config = {
  port: parseInt(process.env.PORT || '9000', 10),
  host: process.env.HOST || '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET || 'change-me-to-a-secure-random-string',
  nodeEnv: process.env.NODE_ENV || 'development',
  /** Token expiration in seconds (7 days) */
  jwtExpiresIn: 7 * 24 * 60 * 60,
} as const;

if (config.jwtSecret === 'change-me-to-a-secure-random-string') {
  if (config.nodeEnv === 'production') {
    throw new Error('FATAL: JWT_SECRET must be set in production. Generate with: openssl rand -base64 32');
  }
  console.warn(
    '⚠️  WARNING: Using default JWT secret. Set JWT_SECRET in .env for production.'
  );
}
