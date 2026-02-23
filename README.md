# OpenFS Incident Response

AI-powered SRE incident triage app built with [OpenFS](https://github.com/open-fs/openfs), Next.js, and Claude. Demonstrates how OpenFS unifies multiple storage backends (Postgres, S3, Chroma, in-memory) behind a single virtual filesystem that an AI agent can navigate with standard shell commands.

## What it does

An SRE copilot for triaging production incidents. Claude can browse incident records, read logs, search runbooks, and run shell commands across a virtual filesystem backed by real databases:

| Mount path | Backend | Contents |
|---|---|---|
| `/ax/incidents/` | Postgres | Open/closed incident CSVs |
| `/ax/oncall/` | Postgres | On-call rotation schedules |
| `/ax/logs/` | S3 | Timestamped application logs |
| `/ax/runbooks/` | Chroma | Runbooks and postmortems (semantic-searchable) |
| `/ax/scratch/` | In-memory | Ephemeral workspace |

The UI has four panels:
- **File explorer** (left) -- browse the virtual filesystem with backend labels
- **File viewer** -- read any file across any backend
- **Chat** -- talk to Claude, which has tool access to the filesystem
- **Terminal** -- run shell commands (`cat`, `ls`, `grep`, `search`, etc.)

## Quick start (dev mode)

Dev mode uses an in-memory mock -- no external services needed. You only need an Anthropic API key for the chat.

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local and set ANTHROPIC_API_KEY

# 3. Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app starts with seeded incident data (a Redis OOM scenario) ready for triage.

## Production mode

Production mode connects to real backends via the [OpenFS](https://github.com/open-fs/openfs) Rust binary over MCP.

### Prerequisites

- `openfs` binary installed and on your `$PATH` (or set `OPENFS_BINARY` to the absolute path)
- Postgres database (e.g. Supabase)
- S3-compatible object storage (e.g. Tigris, AWS S3, MinIO)
- Chroma Cloud instance (for semantic search over runbooks)

### Setup

```bash
# 1. Copy and fill in all production env vars
cp .env.example .env.local
# Set OPENFS_MODE=production and all backend credentials

# 2. Seed production backends with demo data
npm run seed

# 3. Start the app
npm run dev
```

The `openfs.yaml` config file defines the backend connections and mount points. Environment variables are interpolated at runtime.

## Project structure

```
app/
  layout.tsx              # Root layout
  page.tsx                # Main page -- 4-panel layout
  api/
    chat/route.ts         # Claude streaming chat (Vercel AI SDK)
    exec/route.ts         # Shell command execution via just-bash
    read/route.ts         # File read endpoint
    tree/route.ts         # Filesystem tree endpoint
components/
  layout-shell.tsx        # Panel layout wrapper
  file-explorer.tsx       # Tree view with backend badges
  file-viewer.tsx         # File content display
  chat-panel.tsx          # Chat UI with tool result rendering
  tool-result.tsx         # Renders tool call results inline
  terminal.tsx            # Shell command input/output
lib/
  ax-backend.ts           # Backend singleton (dev mock or prod OpenFS)
  mock-backend.ts         # In-memory Vfs mock with multi-backend simulation
  seed-data.ts            # Incident data seeded into dev mock
  seed-prod.ts            # Script to seed production backends
  tools.ts                # Claude tool definitions + system prompt
  types.ts                # Shared TypeScript types
openfs.yaml               # OpenFS backend configuration (production)
```

## Dependencies

| Package | Purpose |
|---|---|
| `@open-fs/core` | TypeScript client for the OpenFS Rust binary (Vfs interface) |
| `@open-fs/just-bash` | Bridges OpenFS into just-bash as a mountable filesystem |
| `just-bash` | In-process Bash interpreter for shell commands |
| `ai` / `@ai-sdk/anthropic` | Vercel AI SDK for streaming Claude responses |
| `next` | React framework |

## How it works

**Dev mode:** `createConfigurableMock()` builds an in-memory `Vfs` that simulates multiple backends. Each mount prefix behaves like its real counterpart (S3 rejects `append`, Chroma supports `search`, Postgres `stat` returns row counts). The mock is seeded with a Redis OOM incident scenario.

**Production mode:** `createVfs()` spawns the `openfs mcp` Rust binary as a subprocess and communicates over stdio using [MCP](https://modelcontextprotocol.io). The binary handles routing to Postgres, S3, and Chroma based on `openfs.yaml`.

In both modes, the `Vfs` is wrapped in an `OpenFs` adapter (from `@open-fs/just-bash`) and mounted into a `just-bash` shell at `/ax`. This gives Claude and the terminal full shell access (`cat`, `ls`, `grep`, `search`) across all backends through a unified path namespace.

## License

MIT
