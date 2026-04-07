# ObsidianTeamSync

Obsidian Team Sync (OTS) — 为 Obsidian 打造的团队协作笔记同步系统。

## 功能特性

- **实时同步** — 基于 WebSocket 的文件级同步，多设备实时同步笔记
- **协同编辑** — Yjs CRDT + CodeMirror 6 实现多人实时编辑，支持远程光标显示
- **团队管理** — 团队创建、邀请码加入、四级角色权限（所有者/管理员/编辑者/查看者）
- **评论批注** — 支持行级评论、解决/重开、实时通知
- **版本历史** — 版本对比（diff 视图）、一键回滚
- **在线感知** — 实时显示在线用户和正在编辑的文件
- **Web 管理界面** — 基于 React + Tailwind 的浏览器端管理 UI

## 项目架构

```
pnpm Monorepo
packages/
  shared/           — 共享类型和工具函数 (@ots/shared)
  server/           — Express + Prisma + WebSocket 后端 (@ots/server)
  obsidian-plugin/  — Obsidian 插件，含 CM6 协同编辑 (@ots/obsidian-plugin)
  webgui/           — React + Vite + Tailwind Web 管理界面 (@ots/webgui)
```

### 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Node.js、Express、Prisma (MySQL)、WebSocket (ws) |
| 实时协同 | Yjs CRDT、y-protocols、y-codemirror.next |
| 插件 | Obsidian API、CodeMirror 6、TypeScript |
| Web 界面 | React 19、Vite 6、Tailwind CSS、shadcn/ui、zustand |
| 部署 | Docker、CloudBase（腾讯云开发） |

### 同步协议

- **文本帧**: `Action|JSON` 协议，用于文件级同步
- **二进制帧**: Yjs 协议，用于实时协同编辑
- 两种帧在同一 WebSocket 连接 (`/api/sync`) 上共存

## 快速开始

### 环境要求

- Node.js >= 18
- pnpm >= 9
- Docker（用于本地 MySQL）

### 安装步骤

```bash
# 克隆仓库
git clone https://github.com/van2m/ObsidianTeamSync.git
cd ObsidianTeamSync

# 安装依赖
pnpm install

# 启动本地 MySQL
docker compose -f docker-compose.dev.yml up -d

# 配置环境变量
cp packages/server/.env.example packages/server/.env
# 编辑 .env：设置 DATABASE_URL 和 JWT_SECRET

# 初始化数据库
pnpm db:push

# 启动开发环境
pnpm dev:server   # 后端，端口 9000
pnpm dev:webgui   # Web 界面，端口 5170
pnpm dev:plugin   # 插件开发构建
```

### 环境变量

**服务端：**

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DATABASE_URL` | `mysql://root:rootpass@localhost:3306/ots_dev` | MySQL 连接串 |
| `JWT_SECRET` | （生产环境必填） | JWT 签名密钥 |
| `PORT` | `9000` | 服务端口 |
| `HOST` | `0.0.0.0` | 绑定地址 |
| `NODE_ENV` | `development` | 运行环境 |
| `CORS_ORIGINS` | `*` | 允许的跨域来源（逗号分隔） |

**Web 界面：**

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `VITE_API_BASE_URL` | `/api` | API 基础地址（跨域部署时设置） |

## API 概览

### REST 接口

| 模块 | 接口 |
|------|------|
| 认证 | `POST /api/auth/register`、`POST /api/auth/login`、`GET /api/auth/me` |
| 团队 | `/api/teams` 下的增删改查 + 邀请/加入 |
| Vault | `/api/vaults` 下的增删改查 |
| 笔记 | `/api/notes` 下的增删改查 + 历史 + 对比 + 回滚 |
| 评论 | `/api/notes/:id/comments`、`/api/comments/:id` |
| 活动 | `GET /api/vaults/:id/activity` |

### WebSocket 协议

连接 `/api/sync`，通过 `ClientAuth` 认证后：
- 文件同步：`NoteSync`、`NoteModify`、`NoteDelete`
- 在线感知：`UserOnline`、`UserOffline`、`UserEditingFile`
- 实时通知：`CommentAdded`、`CommentUpdated`、`NoteRolledBack`
- 二进制协同：Yjs `SyncStep1/2`、`YjsUpdate`、`AwarenessUpdate`

### 权限模型

```
所有者 (40) > 管理员 (30) > 编辑者 (20) > 查看者 (10)
```

## 部署

### Docker 部署

```bash
# 构建镜像
docker build -t ots-server .

# 运行容器
docker run -p 80:80 \
  -e DATABASE_URL="mysql://user:pass@host:3306/db" \
  -e JWT_SECRET="你的密钥" \
  -e NODE_ENV=production \
  ots-server
```

### CloudBase 云部署

1. 创建 CloudBase MySQL 实例
2. 将服务端容器部署到 CloudBase 云托管
3. 构建并上传 Web 界面到静态网站托管：`pnpm build:webgui`
4. 配置自定义域名和 SPA 路由

## 开源协议

MIT
