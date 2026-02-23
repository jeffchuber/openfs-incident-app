/**
 * Singleton backend — persisted across Next.js hot reloads via globalThis.
 *
 * Dev mode (default): in-memory mock with seeded incident data
 * Prod mode (OPENFS_MODE=production): real openfs subprocess via createVfs
 *   - Postgres for incidents/oncall
 *   - S3 for logs
 *   - Chroma Cloud for runbooks
 *   - In-memory for scratch
 */
import { Bash, MountableFs, InMemoryFs } from "just-bash";
import {
  OpenFs,
  createSearchCommand,
  createGrepCommand,
} from "@open-fs/just-bash";
import {
  createVfs,
  createMemoryVfs,
  type Vfs,
} from "@open-fs/core";
import {
  createConfigurableMock,
  type BackendMapping,
} from "./mock-backend";
import { seedIncidentData } from "./seed-data";
import type { TreeNode } from "./types";
import type { Entry } from "@open-fs/core";

// ── Types ─────────────────────────────────────────────

export interface Backend {
  bash: Bash;
  client: Vfs;
  ready: Promise<void>;
}

// ── Backend map for tree building ─────────────────────

const BACKEND_MAP: Record<string, string> = {
  "/openfs/incidents": "postgres",
  "/openfs/oncall": "postgres",
  "/openfs/logs": "s3",
  "/openfs/runbooks": "chroma",
  "/openfs/scratch": "memory",
};

export function getBackendLabel(path: string): string | null {
  for (const [prefix, backend] of Object.entries(BACKEND_MAP)) {
    if (path === prefix || path.startsWith(prefix + "/")) return backend;
  }
  return null;
}

// ── Known mount points (for prod mode root listing) ──

const MOUNT_POINTS = [
  "/incidents",
  "/oncall",
  "/logs",
  "/runbooks",
  "/scratch",
];

// ── Tree builder ──────────────────────────────────────

async function listChildren(
  client: Vfs,
  path: string
): Promise<TreeNode[]> {
  let entries: Entry[];
  try {
    entries = await client.list(path);
  } catch {
    return [];
  }
  const nodes: TreeNode[] = [];
  for (const entry of entries) {
    const fullPath =
      path === "/" ? `/${entry.name}` : `${path}/${entry.name}`;
    const vfsPath = `/openfs${fullPath}`;
    const node: TreeNode = {
      name: entry.name,
      path: vfsPath,
      is_dir: entry.is_dir,
      size: entry.size,
      modified: entry.modified,
      backend: getBackendLabel(vfsPath),
    };
    if (entry.is_dir) {
      node.children = await listChildren(client, fullPath);
    }
    nodes.push(node);
  }
  return nodes;
}

export async function buildTree(
  client: Vfs,
  path: string
): Promise<TreeNode[]> {
  // Try normal listing first
  const result = await listChildren(client, path);
  if (result.length > 0 || path !== "/") return result;

  // Root returned empty — build from known mount points (prod mode)
  const nodes: TreeNode[] = [];
  for (const mp of MOUNT_POINTS) {
    const name = mp.slice(1); // strip leading /
    const vfsPath = `/openfs${mp}`;
    const children = await listChildren(client, mp);
    nodes.push({
      name,
      path: vfsPath,
      is_dir: true,
      size: null,
      modified: null,
      backend: getBackendLabel(vfsPath),
      children,
    });
  }
  return nodes;
}

// ── Command queue (serialize concurrent bash access) ──

let commandQueue: Promise<unknown> = Promise.resolve();

export function serialExec(
  bash: Bash,
  cmd: string
): Promise<{ stdout: string; stderr: string }> {
  const p = commandQueue.then(() => bash.exec(cmd));
  commandQueue = p.catch(() => {});
  return p;
}

// ── Dev mode singleton ────────────────────────────────

const DEV_MAPPINGS: BackendMapping[] = [
  { prefix: "/incidents", backend: "postgres" },
  { prefix: "/oncall", backend: "postgres" },
  { prefix: "/logs", backend: "s3" },
  { prefix: "/runbooks", backend: "chroma" },
  { prefix: "/scratch", backend: "memory" },
];

function createDevBackend(): Backend {
  const client = createConfigurableMock(DEV_MAPPINGS);

  const openFs = new OpenFs();
  openFs.setVfs(client);

  const fs = new MountableFs({
    base: new InMemoryFs(),
    mounts: [{ mountPoint: "/openfs", filesystem: openFs }],
  });

  const bash = new Bash({
    fs,
    cwd: "/openfs",
    customCommands: [
      createSearchCommand(client) as any,
      createGrepCommand(client) as any,
    ],
  });

  const ready = seedIncidentData(client);

  return { bash, client, ready };
}

// ── Prod mode singleton ───────────────────────────────

function createProdBackend(): Backend {
  const openFsBinary =
    process.env.OPENFS_BINARY || "openfs";

  console.log(`[openfs-backend] Production mode: openfs=${openFsBinary}`);

  // Vfs and Bash are created in the async ready block.
  // We use a deferred pattern so getBackend() returns synchronously.
  let vfs: Vfs;
  let bash: Bash;

  const ready = (async () => {
    vfs = await createVfs({ openFsBinary });

    const openFs = new OpenFs();
    openFs.setVfs(vfs);

    const fs = new MountableFs({
      base: new InMemoryFs(),
      mounts: [{ mountPoint: "/openfs", filesystem: openFs }],
    });

    bash = new Bash({
      fs,
      cwd: "/openfs",
      customCommands: [
        createSearchCommand(vfs) as any,
        createGrepCommand(vfs) as any,
      ],
    });

    console.log("[openfs-backend] Vfs connected to openfs mcp subprocess");
  })();

  // Return a proxy backend — callers must await ready before using bash/client
  return {
    get bash() { return bash; },
    get client() { return vfs; },
    ready,
  };
}

// ── Singleton ─────────────────────────────────────────

const globalKey = "__openfs_incident_backend__";

export function getBackend(): Backend {
  const g = globalThis as any;
  if (!g[globalKey]) {
    const isProd = process.env.OPENFS_MODE === "production";
    g[globalKey] = isProd ? createProdBackend() : createDevBackend();
    console.log(
      `[openfs-backend] Created ${isProd ? "production" : "dev"} backend`
    );
  }
  return g[globalKey];
}
