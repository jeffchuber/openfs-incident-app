"use client";

import { useState, useEffect, useCallback } from "react";
import type { TreeNode } from "@/lib/types";

const backendColors: Record<string, string> = {
  postgres: "bg-[#58a6ff22] text-[var(--blue)]",
  s3: "bg-[#f0883e22] text-[var(--orange)]",
  chroma: "bg-[#bc8cff22] text-[var(--magenta)]",
  memory: "bg-[#3fb95022] text-[var(--green)]",
};

function formatSize(size: number | null, backend: string | null): string {
  if (size == null) return "";
  if (backend === "postgres") return `${size} rows`;
  if (size < 1024) return `${size} B`;
  return `${(size / 1024).toFixed(1)} KB`;
}

function TreeItem({
  node,
  depth,
  onSelectFile,
  selectedPath,
}: {
  node: TreeNode;
  depth: number;
  onSelectFile: (path: string) => void;
  selectedPath: string | null;
}) {
  const [expanded, setExpanded] = useState(true);

  if (node.is_dir) {
    return (
      <div>
        <div
          className="flex items-center gap-1 py-0.5 px-2 cursor-pointer rounded mx-1 hover:bg-[var(--bg-hover)]"
          style={{ paddingLeft: `${8 + depth * 16}px` }}
          onClick={() => setExpanded(!expanded)}
        >
          <span className="w-4 text-center text-xs shrink-0 text-[var(--blue)]">
            {expanded ? "📂" : "📁"}
          </span>
          <span className="flex-1 text-[var(--text-bright)] font-medium truncate">
            {node.name}
          </span>
          {node.backend && depth === 0 && (
            <span
              className={`text-[10px] px-1.5 py-px rounded-lg font-medium shrink-0 ${backendColors[node.backend] || ""}`}
            >
              {node.backend}
            </span>
          )}
        </div>
        {expanded && node.children && (
          <div>
            {node.children.map((child) => (
              <TreeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                onSelectFile={onSelectFile}
                selectedPath={selectedPath}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isSelected = selectedPath === node.path;
  return (
    <div
      className={`flex items-center gap-1 py-0.5 px-2 cursor-pointer rounded mx-1 hover:bg-[var(--bg-hover)] ${isSelected ? "bg-[var(--bg-selected)]" : ""}`}
      style={{ paddingLeft: `${8 + depth * 16}px` }}
      onClick={() => onSelectFile(node.path)}
    >
      <span className="w-4 text-center text-xs shrink-0 text-[var(--text-dim)]">
        📄
      </span>
      <span className="flex-1 truncate">{node.name}</span>
      {node.backend && depth === 0 && (
        <span
          className={`text-[10px] px-1.5 py-px rounded-lg font-medium shrink-0 ${backendColors[node.backend] || ""}`}
        >
          {node.backend}
        </span>
      )}
      {!node.is_dir && node.size != null && (
        <span className="text-[11px] text-[var(--text-dim)] shrink-0 ml-1">
          {formatSize(node.size, node.backend)}
        </span>
      )}
    </div>
  );
}

export function FileExplorer({
  onSelectFile,
  selectedPath,
  refreshKey,
}: {
  onSelectFile: (path: string) => void;
  selectedPath: string | null;
  refreshKey: number;
}) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadTree = useCallback(async () => {
    try {
      const res = await fetch("/api/tree");
      const data = await res.json();
      setTree(data);
      setError(null);
    } catch (err) {
      setError("Failed to load tree");
    }
  }, []);

  useEffect(() => {
    loadTree();
  }, [loadTree, refreshKey]);

  return (
    <div className="w-[300px] min-w-[240px] bg-[var(--bg-panel)] border-r border-[var(--border)] flex flex-col overflow-hidden">
      <div className="px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-dim)] border-b border-[var(--border)] shrink-0">
        File Explorer
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {error ? (
          <div className="p-3.5 text-[var(--red)]">{error}</div>
        ) : (
          tree.map((node) => (
            <TreeItem
              key={node.path}
              node={node}
              depth={0}
              onSelectFile={onSelectFile}
              selectedPath={selectedPath}
            />
          ))
        )}
      </div>
    </div>
  );
}
