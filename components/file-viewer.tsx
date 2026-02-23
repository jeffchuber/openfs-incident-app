"use client";

import { useState, useEffect } from "react";

function highlightLine(line: string): string {
  if (/\bERROR\b/.test(line)) return "text-[var(--red)]";
  if (/\bWARN\b/.test(line)) return "text-[var(--yellow)]";
  return "";
}

export function FileViewer({
  path,
  onClose,
  onCat,
}: {
  path: string | null;
  onClose: () => void;
  onCat: (path: string) => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!path) return;
    setContent(null);
    setError(null);
    fetch(`/api/read?path=${encodeURIComponent(path)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setContent(data.content);
      })
      .catch((err) => setError(err.message));
  }, [path]);

  if (!path) return null;

  return (
    <div className="border-b border-[var(--border)] shrink-0 flex flex-col max-h-[40%]">
      <div className="flex items-center px-3.5 py-1.5 bg-[var(--bg-panel)] border-b border-[var(--border)] gap-2 shrink-0">
        <span className="flex-1 text-xs text-[var(--cyan)]">{path}</span>
        <button
          onClick={() => onCat(path)}
          className="text-[11px] px-2 py-0.5 bg-transparent border border-[var(--border)] rounded text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--text-dim)] cursor-pointer"
        >
          cat
        </button>
        <button
          onClick={onClose}
          className="bg-transparent border-none text-[var(--text-dim)] hover:text-[var(--text)] cursor-pointer text-base px-1 leading-none"
        >
          ×
        </button>
      </div>
      <div className="flex-1 overflow-auto p-2.5 text-xs leading-relaxed whitespace-pre-wrap break-all bg-[var(--bg)] font-mono">
        {error ? (
          <span className="text-[var(--red)]">{error}</span>
        ) : content === null ? (
          <span className="text-[var(--text-dim)]">Loading...</span>
        ) : (
          content.split("\n").map((line, i) => (
            <div key={i}>
              <span className="inline-block w-[3ch] text-right mr-3 text-[var(--text-dim)] select-none">
                {i + 1}
              </span>
              <span className={highlightLine(line)}>{line}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
