# OpenFS Incident Response

AI-powered SRE incident triage app built with [OpenFS](https://github.com/open-fs/openfs), Next.js, and Claude. Demonstrates how OpenFS unifies multiple storage backends (Postgres, S3, Chroma, in-memory) behind a single virtual filesystem that an AI agent can navigate with standard shell commands.

```
 ┌──────────────────────────────────────────────────────────────────┐
 │  Browser (Next.js React app)                                    │
 │                                                                  │
 │  ┌──────────┐  ┌───────────────────────────────────────────┐    │
 │  │  File     │  │  Chat Panel          Terminal             │    │
 │  │  Explorer │  │  "What's the P1?"    incident$ grep OOM   │    │
 │  │           │  │                       /openfs/logs/...    │    │
 │  │  📂 incidents │  │  Claude calls tools ──►  just-bash runs  │    │
 │  │  📂 oncall    │  │  to read files,      commands on the   │    │
 │  │  📂 logs      │  │  run commands,       virtual filesystem │    │
 │  │  📂 runbooks  │  │  search runbooks                       │    │
 │  └──────────┘  └───────────────────────────────────────────┘    │
 └──────────────────────────┬───────────────────────────────────────┘
                            │ HTTP API
                            ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │  Next.js API Routes (server-side)                               │
 │                                                                  │
 │  /api/chat  ──► Claude + tools (Vercel AI SDK)                  │
 │  /api/exec  ──► just-bash shell interpreter                     │
 │  /api/tree  ──► Vfs.list() for directory tree                   │
 │  /api/read  ──► Vfs.read() for file contents                   │
 │                                                                  │
 │  All routes share a singleton Backend (lib/backend.ts)          │
 └──────────────────────────┬───────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
 ┌──────────────────────┐   ┌──────────────────────────────────────┐
 │  Dev mode            │   │  Production mode                     │
 │  (in-memory mock)    │   │  (real OpenFS subprocess)            │
 │                      │   │                                      │
 │  Everything runs in  │   │  openfs mcp ◄── stdio/MCP protocol  │
 │  a JS Map<string,    │   │       │                              │
 │  string>. No         │   │       ├──► Postgres (incidents,      │
 │  external services   │   │       │    oncall)                   │
 │  needed.             │   │       ├──► S3 (logs)                 │
 │                      │   │       ├──► Chroma (runbooks,         │
 │  Just set            │   │       │    semantic search)          │
 │  ANTHROPIC_API_KEY.  │   │       └──► Memory (scratch)          │
 └──────────────────────┘   └──────────────────────────────────────┘
```

## What it does

An SRE copilot for triaging production incidents. The app is pre-loaded with a realistic Redis OOM scenario: open incidents, on-call schedules, timestamped logs, and runbooks. Claude can browse it all, run shell commands, and search runbooks using semantic search.

| Mount path | Backend | Contents |
|---|---|---|
| `/openfs/incidents/` | Postgres | Open/closed incident CSVs |
| `/openfs/oncall/` | Postgres | On-call rotation schedules |
| `/openfs/logs/` | S3 | Timestamped application logs |
| `/openfs/runbooks/` | Chroma | Runbooks and postmortems (semantic-searchable) |
| `/openfs/scratch/` | In-memory | Ephemeral workspace |

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

---

## Architecture deep dive

### The Vfs abstraction

The core idea of OpenFS is a single `Vfs` interface that works the same whether the data lives in Postgres, S3, Chroma, or memory. Every operation in the app goes through this interface:

```
 ┌─────────────────────────────────────────────────────────┐
 │  Vfs interface (@open-fs/core)                          │
 │                                                          │
 │  read(path)              write(path, content)           │
 │  list(path)              delete(path)                   │
 │  stat(path)              append(path, content)          │
 │  exists(path)            rename(from, to)               │
 │  grep(pattern, path?)    search(query, limit?)          │
 │  readBatch(paths)        writeBatch(batch)              │
 │  cacheStats()            prefetch(paths)                │
 │  close()                                                │
 └─────────────────────────────────────────────────────────┘
              │                          │
              ▼                          ▼
     ┌─────────────────┐      ┌────────────────────┐
     │  MemoryVfs       │      │  SubprocessVfs      │
     │  (dev/testing)   │      │  (production)       │
     │                  │      │                     │
     │  JS Map in       │      │  Spawns `openfs     │
     │  memory.  No     │      │  mcp` as child      │
     │  subprocess.     │      │  process. Talks     │
     │                  │      │  MCP over stdio.    │
     └─────────────────┘      └────────────────────┘
```

**Code pointers:**
- Vfs interface definition: `@open-fs/core` (`~/src/openfs/ts/src/types.ts`)
- MemoryVfs: `@open-fs/core` (`~/src/openfs/ts/src/memory.ts`)
- SubprocessVfs: `@open-fs/core` (`~/src/openfs/ts/src/vfs.ts`)
- Factory functions `createVfs()` / `createMemoryVfs()`: `@open-fs/core` (`~/src/openfs/ts/src/index.ts`)

### How the backend singleton works

All API routes share a single `Backend` object (persisted across Next.js hot reloads via `globalThis`). The backend is created lazily on first request and contains:

1. **`client: Vfs`** -- the virtual filesystem (mock or real)
2. **`bash: Bash`** -- a just-bash shell interpreter with the Vfs mounted at `/openfs`
3. **`ready: Promise<void>`** -- resolves when the backend is fully initialized

```
 getBackend()  ←── called by every API route
       │
       ▼
 OPENFS_MODE === "production" ?
       │
       ├── yes ──► createProdBackend()
       │              │
       │              ├── createVfs({ openFsBinary })     ← spawns `openfs mcp`
       │              ├── new OpenFs() + setVfs(vfs)      ← wraps Vfs as IFileSystem
       │              ├── new MountableFs({ mounts: ["/openfs"] })
       │              └── new Bash({ fs, cwd: "/openfs" })
       │
       └── no  ──► createDevBackend()
                      │
                      ├── createConfigurableMock(mappings)  ← in-memory Vfs
                      ├── new OpenFs() + setVfs(client)
                      ├── new MountableFs({ mounts: ["/openfs"] })
                      ├── new Bash({ fs, cwd: "/openfs" })
                      └── seedIncidentData(client)          ← writes demo data
```

**Code pointer:** `lib/backend.ts` -- the entire file is the backend singleton. `createDevBackend()` (line ~148) and `createProdBackend()` (line ~175) show the two paths.

### The dev mode mock

The mock Vfs (`lib/mock-backend.ts`) is a single `Map<string, string>` that simulates backend-specific behavior based on path prefixes:

- **Postgres paths** (`/incidents/`, `/oncall/`): `stat()` returns row count instead of byte size
- **S3 paths** (`/logs/`): `append()` throws `ENOTSUP` (object storage doesn't support append)
- **Chroma paths** (`/runbooks/`): `search()` does keyword matching and returns scored results (simulating vector search)
- **Memory paths** (`/scratch/`): everything works, no restrictions

This means the dev mode UI looks and behaves almost identically to production -- backends show different badges, operations have realistic constraints, and semantic search works.

**Code pointer:** `lib/mock-backend.ts` -- `createConfigurableMock()` builds the mock. The `backendFor()` helper (line ~46) routes paths to behaviors.

### Seed data: the Redis OOM scenario

The app comes pre-loaded with a realistic incident (`lib/seed-data.ts`):

```
 /incidents/open.csv     3 open incidents including INC-001 (P1 Redis OOM)
 /incidents/closed.csv   2 resolved incidents (including a prior Redis OOM)
 /oncall/schedule.csv    Team rotations (infra: bob/carol, platform: alice/dave)
 /logs/redis-*.log       Redis memory climbing from 6.1G → OOM, with timestamps
 /logs/api-gateway-*.log API gateway 503s and circuit breaker opening
 /runbooks/redis-oom.md            Step-by-step Redis OOM recovery
 /runbooks/latency-troubleshooting.md   API latency investigation
 /runbooks/postmortem-2025-05-redis.md  Past incident postmortem
```

The data tells a coherent story: Redis memory climbs, OOM errors start, the API gateway trips its circuit breaker, and PagerDuty fires an alert to the on-call infra team.

**Code pointer:** `lib/seed-data.ts` -- all the seed data as `[path, content]` tuples. `lib/seed-prod.ts` -- the same data written to real backends via `createVfs()`.

### How just-bash bridges shell commands to the Vfs

[just-bash](https://github.com/nicholasgasior/just-bash) is an in-process Bash interpreter written in TypeScript. It provides `cat`, `ls`, `grep`, `head`, `tail`, `sort`, `wc`, and more -- but it needs an `IFileSystem` to operate on.

The `OpenFs` class from `@open-fs/just-bash` adapts the OpenFS `Vfs` interface to just-bash's `IFileSystem` interface:

```
 just-bash shell commands (cat, ls, grep, ...)
       │
       │  calls IFileSystem methods
       │  (readFile, readdir, stat, writeFile, ...)
       ▼
 ┌──────────────────────────────────────────┐
 │  MountableFs                             │
 │                                          │
 │  /openfs/  ──► OpenFs adapter            │
 │                    │                     │
 │                    │  translates to      │
 │                    │  Vfs methods        │
 │                    ▼                     │
 │              Vfs.read()                  │
 │              Vfs.list()                  │
 │              Vfs.stat()                  │
 │              ...                         │
 │                                          │
 │  /tmp/     ──► InMemoryFs (base)         │
 └──────────────────────────────────────────┘
```

`MountableFs` lets us overlay the OpenFS Vfs at `/openfs` on top of a plain `InMemoryFs`. This means commands like `cat /openfs/logs/redis.log` transparently read from S3 in production, or from the in-memory mock in dev.

Two custom commands are also registered:

- **`search "query"`** -- semantic search across Chroma-backed runbooks (calls `Vfs.search()`)
- **`openfsgrep pattern [path]`** -- regex search across all backends (calls `Vfs.grep()`)

**Code pointers:**
- OpenFs adapter class: `@open-fs/just-bash` (`~/src/just-bash-openfs/src/openfs.ts`)
- Custom search command: `@open-fs/just-bash` (`~/src/just-bash-openfs/src/search.ts`)
- Custom grep command: `@open-fs/just-bash` (`~/src/just-bash-openfs/src/grep.ts`)
- Shell setup in the app: `lib/backend.ts` lines ~154-166 (dev) and ~192-204 (prod)

### How Claude interacts with the filesystem

The chat API route (`app/api/chat/route.ts`) uses the [Vercel AI SDK](https://sdk.vercel.ai/) to stream Claude responses. Claude is given four tools:

```
 User message
       │
       ▼
 ┌─────────────────────────────────────────────────────────┐
 │  Claude (claude-sonnet-4-5 via Vercel AI SDK)           │
 │                                                          │
 │  System prompt describes the filesystem layout,          │
 │  available tools, and the current incident context.      │
 │                                                          │
 │  Tools:                                                  │
 │  ┌────────────────┐  ┌────────────────┐                 │
 │  │ exec_command    │  │ read_file      │                 │
 │  │                 │  │                │                 │
 │  │ Runs any shell  │  │ Reads a file   │                 │
 │  │ command via     │  │ by path via    │                 │
 │  │ just-bash       │  │ Vfs.read()     │                 │
 │  └────────┬───────┘  └────────┬───────┘                 │
 │  ┌────────┴───────┐  ┌────────┴───────┐                 │
 │  │ list_files      │  │ search_runbooks│                 │
 │  │                 │  │                │                 │
 │  │ Returns the     │  │ Semantic search│                 │
 │  │ directory tree   │  │ via Vfs.search│                 │
 │  │ as JSON          │  │ (Chroma)      │                 │
 │  └────────────────┘  └────────────────┘                 │
 │                                                          │
 │  maxSteps: 10  ── Claude can chain multiple tool calls  │
 │                    in one conversation turn              │
 └─────────────────────────────────────────────────────────┘
```

A typical Claude investigation looks like:

1. `list_files` to see what's available
2. `read_file /openfs/incidents/open.csv` to find the P1
3. `exec_command "grep ERROR /openfs/logs/redis-2025-06-15.log"` to scan logs
4. `search_runbooks "redis OOM recovery"` to find relevant runbooks
5. `read_file /openfs/runbooks/redis-oom.md` to get remediation steps
6. Synthesize findings into a response with concrete next steps

**Code pointers:**
- Tool definitions + system prompt: `lib/tools.ts`
- Chat API route: `app/api/chat/route.ts` (10 lines -- very concise thanks to Vercel AI SDK)
- Tool result rendering in the UI: `components/tool-result.tsx`

### The UI layer

The frontend is a single-page Next.js app with four components arranged in a split layout:

```
 ┌────────────────────────────────────────────────────────────┐
 │  LayoutShell (header bar with incident context)            │
 ├──────────┬─────────────────────────────────────────────────┤
 │          │  FileViewer (shown when file selected)          │
 │  File    ├─────────────────────────────────────────────────┤
 │  Explorer│  ChatPanel                                      │
 │          │  (Claude conversation with inline tool results) │
 │  Tree    ├─────────────────────────────────────────────────┤
 │  view    │  Terminal                                       │
 │  with    │  (shell input + sample command buttons)         │
 │  backend │                                                 │
 │  badges  │                                                 │
 └──────────┴─────────────────────────────────────────────────┘
```

- **`components/layout-shell.tsx`** -- Full-screen dark layout with a header showing the active P1 incident.
- **`components/file-explorer.tsx`** -- Fetches the tree from `/api/tree`, renders recursively. Each top-level directory shows a colored badge for its backend type (postgres, s3, chroma, memory).
- **`components/file-viewer.tsx`** -- Fetches file content from `/api/read?path=...` when a file is selected. Highlights ERROR/WARN lines in log files.
- **`components/chat-panel.tsx`** -- Uses `useChat()` from `@ai-sdk/react` to stream Claude messages. Renders tool invocations inline using `ToolResult`.
- **`components/tool-result.tsx`** -- Renders each tool call result with appropriate formatting: shell output for `exec_command`, file content with line numbers for `read_file`, scored results with progress bars for `search_runbooks`, and tree views for `list_files`.
- **`components/terminal.tsx`** -- Shell input with command history (arrow keys), sample command buttons, and log-level syntax highlighting.
- **`app/page.tsx`** -- Composes all panels together. Passes a `refreshKey` so the file explorer reloads after terminal commands modify the filesystem.

### The production config file

`openfs.yaml` defines how the OpenFS Rust binary routes paths to backends:

```yaml
mounts:
  - path: /incidents    # ──► Postgres (Supabase)
    backend: postgres
    mode: write_through

  - path: /logs         # ──► S3-compatible storage (Tigris, AWS, MinIO)
    backend: s3
    mode: write_through

  - path: /runbooks     # ──► Chroma Cloud (vector embeddings)
    backend: chroma

  - path: /scratch      # ──► In-memory (ephemeral)
    backend: scratch_mem
```

Environment variables (`$DATABASE_URL`, `$AWS_ACCESS_KEY_ID`, etc.) are interpolated at runtime. See `.env.example` for the full list.

**Code pointer:** `openfs.yaml` -- the full config with all backend definitions and mount points.

---

## Project structure

```
app/
  layout.tsx              # Root layout
  page.tsx                # Main page -- composes all 4 panels
  api/
    chat/route.ts         # Claude streaming chat (Vercel AI SDK)
    exec/route.ts         # Shell command execution via just-bash
    read/route.ts         # File read endpoint
    tree/route.ts         # Filesystem tree endpoint
components/
  layout-shell.tsx        # Full-screen dark layout + incident header
  file-explorer.tsx       # Tree view with backend badges
  file-viewer.tsx         # File content display with log highlighting
  chat-panel.tsx          # Chat UI with streaming + inline tool results
  tool-result.tsx         # Renders tool call results (shell, files, search)
  terminal.tsx            # Shell input with history + sample commands
lib/
  backend.ts              # Backend singleton (dev mock or prod OpenFS)
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
| `@open-fs/just-bash` | Bridges OpenFS Vfs into just-bash as a mountable filesystem |
| `just-bash` | In-process Bash interpreter for shell commands |
| `ai` / `@ai-sdk/anthropic` | Vercel AI SDK for streaming Claude responses with tool use |
| `next` | React framework (App Router) |

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

## License

MIT
