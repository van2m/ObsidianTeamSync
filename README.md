# ObsidianTeamSync

Obsidian Team Sync (OTS) -- Team collaborative note synchronization for Obsidian.

## Features

- **Real-time Sync** -- File-level WebSocket synchronization between Obsidian clients
- **Collaborative Editing** -- Yjs CRDT + CodeMirror 6 real-time multi-user editing with remote cursors
- **Team Management** -- Teams, roles (Owner/Admin/Editor/Viewer), invite codes
- **Comments** -- Line-level comments with resolve/unresolve, real-time notifications
- **Version History** -- Diff comparison, one-click rollback
- **Online Presence** -- See who's online and what they're editing
- **Web GUI** -- Browser-based management UI (React + Tailwind)

## Architecture

```
pnpm Monorepo
packages/
  shared/           -- Shared types and utilities (@ots/shared)
  server/           -- Express + Prisma + WebSocket backend (@ots/server)
  obsidian-plugin/  -- Obsidian plugin with CM6 collab (@ots/obsidian-plugin)
  webgui/           -- React + Vite + Tailwind web UI (@ots/webgui)
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js, Express, Prisma (MySQL), WebSocket (ws) |
| Realtime | Yjs CRDT, y-protocols, y-codemirror.next |
| Plugin | Obsidian API, CodeMirror 6, TypeScript |
| WebGUI | React 19, Vite 6, Tailwind CSS, shadcn/ui, zustand |
| Deploy | Docker, CloudBase (Tencent Cloud) |

### Sync Protocol

- **Text frames**: `Action|JSON` protocol for file-level sync
- **Binary frames**: Yjs protocol for real-time collaborative editing
- Both coexist on the same WebSocket connection (`/api/sync`)

## Getting Started

### Prerequisites

- Node.js >= 18
- pnpm >= 9
- Docker (for local MySQL)

### Setup

```bash
# Clone
git clone https://github.com/van2m/ObsidianTeamSync.git
cd ObsidianTeamSync

# Install dependencies
pnpm install

# Start local MySQL
docker compose -f docker-compose.dev.yml up -d

# Configure environment
cp packages/server/.env.example packages/server/.env
# Edit .env: set DATABASE_URL and JWT_SECRET

# Initialize database
pnpm db:push

# Start development
pnpm dev:server   # Backend on :9000
pnpm dev:webgui   # WebGUI on :5170
pnpm dev:plugin   # Plugin dev build
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `mysql://root:rootpass@localhost:3306/ots_dev` | MySQL connection string |
| `JWT_SECRET` | (required in production) | JWT signing secret |
| `PORT` | `9000` | Server port |
| `HOST` | `0.0.0.0` | Server bind address |
| `NODE_ENV` | `development` | Environment |
| `CORS_ORIGINS` | `*` | Comma-separated allowed origins |

WebGUI environment:

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | `/api` | API base URL (for cross-origin deployment) |

## API Overview

### REST Endpoints

| Category | Endpoints |
|----------|-----------|
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` |
| Teams | CRUD + invite/join at `/api/teams` |
| Vaults | CRUD at `/api/vaults` |
| Notes | CRUD + history + diff + rollback at `/api/notes` |
| Comments | CRUD + resolve at `/api/notes/:id/comments`, `/api/comments/:id` |
| Activity | `GET /api/vaults/:id/activity` |

### WebSocket Protocol

Connect to `/api/sync`, authenticate with `ClientAuth`, then:
- File sync: `NoteSync`, `NoteModify`, `NoteDelete`
- Presence: `UserOnline`, `UserOffline`, `UserEditingFile`
- Notifications: `CommentAdded`, `CommentUpdated`, `NoteRolledBack`
- Binary: Yjs `SyncStep1/2`, `YjsUpdate`, `AwarenessUpdate`

### Permission Model

```
OWNER (40) > ADMIN (30) > EDITOR (20) > VIEWER (10)
```

## Deployment

### Docker

```bash
# Build
docker build -t ots-server .

# Run
docker run -p 80:80 \
  -e DATABASE_URL="mysql://user:pass@host:3306/db" \
  -e JWT_SECRET="your-secret" \
  -e NODE_ENV=production \
  ots-server
```

### CloudBase

1. Create CloudBase MySQL instance
2. Deploy server container to CloudBase Cloud Run
3. Build and upload WebGUI to static hosting: `pnpm build:webgui`
4. Configure custom domain and SPA routing

## License

MIT
