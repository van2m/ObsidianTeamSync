# ObsidianTeamSync Server - Multi-stage Docker build
# For CloudBase 云托管 (container service)

# ============ Stage 1: Build ============
FROM node:18-alpine AS builder

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy workspace config and package files first (better layer caching)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/

# Install all dependencies (including devDependencies for building)
RUN pnpm install --frozen-lockfile

# Copy Prisma schema and generate client
COPY packages/server/prisma/ packages/server/prisma/
RUN cd packages/server && npx prisma generate

# Copy source code
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/

# Build shared + server
RUN pnpm --filter @ots/shared build
RUN pnpm --filter @ots/server build

# ============ Stage 2: Production ============
FROM node:18-alpine

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy workspace config and package files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy Prisma generated client from builder (prisma CLI is devDependency, not in prod)
COPY --from=builder /app/node_modules/.prisma/ node_modules/.prisma/

# Copy build outputs from builder stage
COPY --from=builder /app/packages/shared/dist/ packages/shared/dist/
COPY --from=builder /app/packages/server/dist/ packages/server/dist/

# Environment
ENV NODE_ENV=production
ENV PORT=80

EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:80/api/health || exit 1

# Start server
CMD ["node", "packages/server/dist/app.js"]
