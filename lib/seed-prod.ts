/**
 * Seed production backends with incident data via OpenFS Vfs.
 *
 * Usage: npx tsx lib/seed-prod.ts
 *
 * Writes incident records to Postgres, logs to S3, and runbooks to in-memory.
 * Requires env vars from .env.local to be set.
 */
import { createVfs } from "@open-fs/core";

const OPENFS_BINARY =
  process.env.OPENFS_BINARY ||
  "openfs";

const seeds: [string, string][] = [
  [
    "/incidents/open.csv",
    `id,severity,status,assignee,title,created_at
INC-001,P1,open,,Redis OOM on prod-redis-3,2025-06-15T09:45:00Z
INC-002,P2,investigating,alice,API latency spike p99 > 2s,2025-06-15T08:30:00Z
INC-003,P3,open,,Stale cache entries in CDN,2025-06-14T16:00:00Z`,
  ],
  [
    "/incidents/closed.csv",
    `id,severity,status,assignee,title,created_at,resolved_at
INC-098,P2,resolved,bob,Database connection pool exhaustion,2025-06-10T14:00:00Z,2025-06-10T15:30:00Z
INC-099,P1,resolved,carol,Redis OOM on prod-redis-1,2025-05-28T03:00:00Z,2025-05-28T04:45:00Z`,
  ],
  [
    "/oncall/schedule.csv",
    `team,primary,secondary,start,end
infra,bob,carol,2025-06-15,2025-06-22
platform,alice,dave,2025-06-15,2025-06-22
data,eve,frank,2025-06-15,2025-06-22`,
  ],
  [
    "/logs/redis-2025-06-15.log",
    `2025-06-15T09:30:01Z INFO  prod-redis-3 connected_clients=142 used_memory=6.1G maxmemory=8G
2025-06-15T09:35:00Z INFO  prod-redis-3 connected_clients=158 used_memory=6.8G maxmemory=8G
2025-06-15T09:38:00Z WARN  prod-redis-3 used_memory approaching maxmemory threshold (85%)
2025-06-15T09:40:00Z WARN  prod-redis-3 eviction policy=noeviction, cannot free memory
2025-06-15T09:42:00Z ERROR prod-redis-3 OOM command not allowed when used memory > maxmemory
2025-06-15T09:42:01Z ERROR prod-redis-3 OOM command not allowed: SET session:usr_48291
2025-06-15T09:42:05Z ERROR prod-redis-3 OOM command not allowed: SET session:usr_10382
2025-06-15T09:43:00Z WARN  prod-redis-3 client connection refused: max memory reached
2025-06-15T09:44:00Z ERROR prod-redis-3 OOM command not allowed: SET session:usr_77412
2025-06-15T09:44:30Z ERROR prod-redis-3 OOM command not allowed: LPUSH queue:notifications
2025-06-15T09:45:00Z ERROR prod-redis-3 ALERT triggered: memory_usage_critical
2025-06-15T09:45:01Z INFO  alertmanager firing alert redis_oom_critical for prod-redis-3
2025-06-15T09:45:05Z INFO  pagerduty incident created for on-call team=infra`,
  ],
  [
    "/logs/api-gateway-2025-06-15.log",
    `2025-06-15T09:40:12Z INFO  api-gw request_id=a1b2 POST /api/login 200 45ms
2025-06-15T09:41:00Z INFO  api-gw request_id=c3d4 GET /api/profile 200 12ms
2025-06-15T09:42:02Z ERROR api-gw request_id=e5f6 POST /api/login 503 timeout=5000ms upstream=prod-redis-3
2025-06-15T09:42:10Z ERROR api-gw request_id=g7h8 POST /api/login 503 timeout=5000ms upstream=prod-redis-3
2025-06-15T09:42:30Z ERROR api-gw request_id=i9j0 GET /api/session 503 timeout=5000ms upstream=prod-redis-3
2025-06-15T09:43:00Z WARN  api-gw circuit_breaker=open for upstream=prod-redis-3 failures=15/20
2025-06-15T09:43:01Z ERROR api-gw request_id=k1l2 POST /api/login 503 circuit_breaker=open
2025-06-15T09:44:00Z ERROR api-gw error_rate=34% for path=/api/login in last 5m`,
  ],
  [
    "/runbooks/redis-oom.md",
    `# Runbook: Redis OOM Recovery

## Symptoms
- Redis returns OOM errors on write commands
- Clients receive connection refused or timeout
- Alert: redis_oom_critical

## Diagnosis
1. Check current memory: redis-cli INFO memory | grep used_memory_human
2. Identify hot keys: redis-cli --hotkeys
3. Check eviction policy: redis-cli CONFIG GET maxmemory-policy

## Immediate Mitigation
1. Set volatile-lru: redis-cli CONFIG SET maxmemory-policy volatile-lru
2. Flush expired keys: redis-cli --scan --pattern 'session:*' | head -100
3. Add TTL to session keys: ensure all SET commands include EX/PX

## Scaling
1. Increase maxmemory: redis-cli CONFIG SET maxmemory 12G
2. Update redis.conf for persistence
3. Consider adding a replica for read offload`,
  ],
  [
    "/runbooks/latency-troubleshooting.md",
    `# Runbook: API Latency Investigation

## Symptoms
- p99 latency exceeds SLO (e.g., > 2 seconds)
- Elevated error rates on upstream dependencies

## Investigation Steps
1. Check p99/p50 in Grafana
2. Identify slow endpoints
3. Trace slow requests via trace_id
4. Check upstream dependencies: Redis, Postgres, external APIs
5. Look for connection pool exhaustion or GC pauses`,
  ],
  [
    "/runbooks/postmortem-2025-05-redis.md",
    `# Postmortem: Redis OOM -- 2025-05-28

## Summary
prod-redis-1 ran out of memory due to unbounded session cache.
Login failures for 1h45m.

## Root Cause
Session keys stored without TTL. Session store grew from 2GB to 7.8GB.
Eviction policy was noeviction, so Redis refused all writes.

## Resolution
1. Set maxmemory-policy to volatile-lru
2. Added 24h TTL to all session keys
3. Patched auth service to include EX 86400 on session SET
4. Increased maxmemory to 12GB`,
  ],
];

async function main() {
  console.log(`Connecting to openfs mcp (binary: ${OPENFS_BINARY})...`);

  const client = await createVfs({ openFsBinary: OPENFS_BINARY });
  console.log("Connected.\n");

  for (const [path, content] of seeds) {
    try {
      await client.write(path, content);
      console.log(`  ✓ ${path} (${content.length} bytes)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ✗ ${path}: ${msg}`);
    }
  }

  // Verify by listing
  console.log("\nVerifying...");
  for (const dir of ["/incidents", "/oncall", "/logs", "/runbooks"]) {
    try {
      const entries = await client.list(dir);
      console.log(
        `  ${dir}: ${entries.map((e: any) => e.name).join(", ")}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ${dir}: ${msg}`);
    }
  }

  await client.close();
  console.log("\nDone. Backends seeded.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
