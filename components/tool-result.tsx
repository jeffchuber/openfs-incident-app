"use client";

import type { TreeNode } from "@/lib/types";

function highlightLine(line: string): string {
  if (/\bERROR\b/.test(line)) return "text-[var(--red)]";
  if (/\bWARN\b/.test(line)) return "text-[var(--yellow)]";
  return "";
}

function ExecResult({ result }: { result: { stdout: string; stderr: string } }) {
  return (
    <div className="bg-[var(--bg)] rounded border border-[var(--border)] p-2 text-xs font-mono overflow-x-auto">
      {result.stdout && (
        <div className="whitespace-pre-wrap break-all">
          {result.stdout.split("\n").map((line, i) => (
            <div key={i} className={highlightLine(line)}>{line}</div>
          ))}
        </div>
      )}
      {result.stderr && (
        <div className="whitespace-pre-wrap break-all text-[var(--red)]">
          {result.stderr}
        </div>
      )}
    </div>
  );
}

function ReadFileResult({ result }: { result: { path: string; content?: string; error?: string } }) {
  if (!result) return null;
  if (result.error) {
    return (
      <div className="bg-[var(--bg)] rounded border border-[var(--border)] p-2 text-xs font-mono">
        <div className="text-[var(--cyan)] mb-1">{result.path}</div>
        <div className="text-[var(--red)]">{result.error}</div>
      </div>
    );
  }
  const lines = (result.content || "").split("\n");
  return (
    <div className="bg-[var(--bg)] rounded border border-[var(--border)] p-2 text-xs font-mono overflow-x-auto max-h-[300px] overflow-y-auto">
      <div className="text-[var(--cyan)] mb-1">{result.path}</div>
      {lines.map((line, i) => (
        <div key={i}>
          <span className="inline-block w-[3ch] text-right mr-2 text-[var(--text-dim)] select-none">{i + 1}</span>
          <span className={highlightLine(line)}>{line}</span>
        </div>
      ))}
    </div>
  );
}

function SearchResult({ result }: { result: { query: string; results: Array<{ score: number; source: string; snippet: string }> } }) {
  return (
    <div className="bg-[var(--bg)] rounded border border-[var(--border)] p-2 text-xs font-mono">
      <div className="text-[var(--magenta)] mb-1.5">
        search: &quot;{result.query}&quot; — {result.results.length} results
      </div>
      {result.results.map((r, i) => (
        <div key={i} className="mb-1.5 last:mb-0">
          <div className="flex items-center gap-2">
            <div className="w-16 h-1.5 bg-[var(--border)] rounded-full overflow-hidden shrink-0">
              <div
                className="h-full bg-[var(--magenta)] rounded-full"
                style={{ width: `${Math.round(r.score * 100)}%` }}
              />
            </div>
            <span className="text-[var(--text-dim)]">{r.score.toFixed(2)}</span>
            <span className="text-[var(--cyan)]">{r.source}</span>
          </div>
          <div className="text-[var(--text-dim)] ml-[4.5rem] truncate">{r.snippet}</div>
        </div>
      ))}
    </div>
  );
}

function ListFilesResult({ result }: { result: TreeNode[] }) {
  function renderNode(node: TreeNode, depth: number): React.ReactNode {
    return (
      <div key={node.path}>
        <div style={{ paddingLeft: `${depth * 12}px` }}>
          <span className="text-[var(--text-dim)]">{node.is_dir ? "📁 " : "📄 "}</span>
          <span className={node.is_dir ? "text-[var(--blue)]" : ""}>{node.name}</span>
        </div>
        {node.children?.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  }
  return (
    <div className="bg-[var(--bg)] rounded border border-[var(--border)] p-2 text-xs font-mono">
      {result.map((n) => renderNode(n, 0))}
    </div>
  );
}

export function ToolResult({
  toolName,
  args,
  result,
}: {
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
}) {
  const label =
    toolName === "exec_command"
      ? `$ ${args.command}`
      : toolName === "read_file"
        ? `read ${args.path}`
        : toolName === "search_runbooks"
          ? `search "${args.query}"`
          : toolName === "list_files"
            ? "list files"
            : toolName;

  return (
    <div className="my-2">
      <div className="text-[11px] text-[var(--text-dim)] mb-1 font-mono">
        <span className="text-[var(--orange)]">⚡</span> {label}
      </div>
      {toolName === "exec_command" && <ExecResult result={result as any} />}
      {toolName === "read_file" && <ReadFileResult result={result as any} />}
      {toolName === "search_runbooks" && <SearchResult result={result as any} />}
      {toolName === "list_files" && <ListFilesResult result={result as any} />}
    </div>
  );
}
