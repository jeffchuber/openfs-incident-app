import { tool } from "ai";
import { z } from "zod";
import { getBackend, serialExec, buildTree } from "./ax-backend";

export function createIncidentTools() {
  return {
    exec_command: tool({
      description:
        "Run a shell command in the incident response environment. " +
        "Available commands: cat, ls, grep, wc, head, tail, sort, uniq, cut, stat, search. " +
        "The filesystem is mounted at /ax with subdirectories: " +
        "/ax/incidents (postgres), /ax/oncall (postgres), /ax/logs (s3), " +
        "/ax/runbooks (chroma), /ax/scratch (memory).",
      parameters: z.object({
        command: z.string().describe("The shell command to execute"),
      }),
      execute: async ({ command }) => {
        const backend = getBackend();
        await backend.ready;
        try {
          const result = await serialExec(backend.bash, command);
          return {
            stdout: result.stdout || "(no output)",
            stderr: result.stderr || "",
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { stdout: "", stderr: msg };
        }
      },
    }),

    list_files: tool({
      description:
        "List files and directories in the incident response filesystem as a JSON tree.",
      parameters: z.object({
        path: z
          .string()
          .optional()
          .describe("Directory path to list (default: root)"),
      }),
      execute: async ({ path }) => {
        const backend = getBackend();
        await backend.ready;
        const tree = await buildTree(backend.client, path || "/");
        return tree;
      },
    }),

    read_file: tool({
      description:
        "Read the contents of a file. Use /ax/ prefix paths " +
        "(e.g. /ax/incidents/open.csv, /ax/logs/redis-2025-06-15.log).",
      parameters: z.object({
        path: z.string().describe("Full path to the file (e.g. /ax/incidents/open.csv)"),
      }),
      execute: async ({ path }) => {
        const backend = getBackend();
        await backend.ready;
        const axPath = path.startsWith("/ax/") ? path.slice(3) : path;
        try {
          const content = await backend.client.read(axPath);
          return { path, content };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { path, error: msg };
        }
      },
    }),

    search_runbooks: tool({
      description:
        "Semantic search across runbooks and knowledge base (Chroma backend). " +
        "Returns ranked results with relevance scores.",
      parameters: z.object({
        query: z.string().describe("Natural language search query"),
        limit: z
          .number()
          .optional()
          .describe("Max results to return (default: 5)"),
      }),
      execute: async ({ query, limit }) => {
        const backend = getBackend();
        await backend.ready;
        const results = await backend.client.search(query, limit ?? 5);
        return { query, results };
      },
    }),
  };
}

export const SYSTEM_PROMPT = `You are an SRE incident response copilot. You help engineers triage, diagnose, and resolve production incidents.

You have access to an incident response environment with the following filesystem layout:
- /ax/incidents/ — Incident records (Postgres backend). CSV files with open and closed incidents.
- /ax/oncall/ — On-call schedules (Postgres backend). CSV with team rotations.
- /ax/logs/ — Application and infrastructure logs (S3 backend). Timestamped log files.
- /ax/runbooks/ — Runbooks and postmortems (Chroma backend, semantic-searchable).
- /ax/scratch/ — Ephemeral workspace (in-memory).

Available tools:
- exec_command: Run shell commands (cat, ls, grep, wc, head, tail, sort, search, stat)
- list_files: Get filesystem tree as JSON
- read_file: Read file contents
- search_runbooks: Semantic search across runbooks (uses Chroma vector search)

Current incident context:
- INC-001: P1 — Redis OOM on prod-redis-3 (2025-06-15 09:45 UTC)
- On-call infra team: bob (primary), carol (secondary)

When investigating:
1. Start by understanding what happened — read logs and incident records
2. Search runbooks for relevant procedures
3. Check on-call schedules to identify responders
4. Look for similar past incidents (postmortems)
5. Suggest concrete remediation steps based on runbook procedures

Be concise and action-oriented. Use the tools to gather evidence before making recommendations.`;
