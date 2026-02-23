"use client";

import { useState, useRef, useCallback } from "react";

interface TermLine {
  type: "cmd" | "stdout" | "stderr" | "info";
  text: string;
}

const SAMPLE_COMMANDS = [
  'cat /ax/incidents/open.csv | grep P1',
  'cat /ax/oncall/schedule.csv | grep infra',
  'search "redis memory OOM"',
  'grep ERROR /ax/logs/redis-2025-06-15.log',
  'cat /ax/logs/redis-2025-06-15.log | grep OOM | wc -l',
  'stat /ax/incidents/open.csv',
];

function highlightLine(line: string): string {
  if (/\bERROR\b/.test(line)) return "text-[var(--red)]";
  if (/\bWARN\b/.test(line)) return "text-[var(--yellow)]";
  return "";
}

export function Terminal({
  onCommandRun,
}: {
  onCommandRun?: () => void;
}) {
  const [lines, setLines] = useState<TermLine[]>([
    { type: "info", text: "Incident response environment ready. Click files or type commands below." },
  ]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (outputRef.current) {
        outputRef.current.scrollTop = outputRef.current.scrollHeight;
      }
    });
  }, []);

  const runCmd = useCallback(
    async (cmd: string) => {
      if (running || !cmd.trim()) return;
      setRunning(true);

      setHistory((h) => [...h, cmd]);
      setHistoryIdx(-1);
      setLines((l) => [...l, { type: "cmd", text: cmd }]);
      scrollBottom();

      try {
        const res = await fetch("/api/exec", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cmd }),
        });
        const data = await res.json();
        setLines((l) => {
          const next = [...l];
          if (data.stdout?.trim()) next.push({ type: "stdout", text: data.stdout.trimEnd() });
          if (data.stderr?.trim()) next.push({ type: "stderr", text: data.stderr.trimEnd() });
          return next;
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setLines((l) => [...l, { type: "stderr", text: `fetch error: ${msg}` }]);
      }

      setRunning(false);
      setInput("");
      scrollBottom();
      onCommandRun?.();
      inputRef.current?.focus();
    },
    [running, scrollBottom, onCommandRun]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      runCmd(input);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length === 0) return;
      const idx = historyIdx === -1 ? history.length - 1 : Math.max(0, historyIdx - 1);
      setHistoryIdx(idx);
      setInput(history[idx]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIdx === -1) return;
      if (historyIdx >= history.length - 1) {
        setHistoryIdx(-1);
        setInput("");
      } else {
        const idx = historyIdx + 1;
        setHistoryIdx(idx);
        setInput(history[idx]);
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-dim)] bg-[var(--bg-panel)] border-b border-[var(--border)] shrink-0">
        Terminal
      </div>
      <div ref={outputRef} className="flex-1 overflow-y-auto px-3.5 py-2 text-[13px] leading-relaxed font-mono">
        {lines.map((line, i) => {
          if (line.type === "cmd") {
            return (
              <div key={i} className="whitespace-pre-wrap break-all text-[var(--text-bright)]">
                <span className="text-[var(--green)] font-bold">incident$ </span>
                <span className="font-medium">{line.text}</span>
              </div>
            );
          }
          if (line.type === "stderr") {
            return (
              <div key={i} className="whitespace-pre-wrap break-all text-[var(--red)]">
                {line.text}
              </div>
            );
          }
          if (line.type === "info") {
            return (
              <div key={i} className="whitespace-pre-wrap break-all text-[var(--text-dim)] italic">
                {line.text}
              </div>
            );
          }
          // stdout — apply log-level highlighting
          return (
            <div key={i} className="whitespace-pre-wrap break-all">
              {line.text.split("\n").map((l, j) => (
                <div key={j} className={highlightLine(l)}>{l}</div>
              ))}
            </div>
          );
        })}
      </div>
      <div className="px-3.5 py-1.5 bg-[var(--bg-panel)] border-t border-[var(--border)] flex gap-1.5 flex-wrap shrink-0">
        {SAMPLE_COMMANDS.map((cmd) => (
          <button
            key={cmd}
            onClick={() => runCmd(cmd)}
            className="font-mono text-[11px] px-2 py-0.5 bg-[var(--bg)] border border-[var(--border)] rounded text-[var(--text-dim)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)] hover:border-[var(--text-dim)] cursor-pointer whitespace-nowrap"
          >
            {cmd}
          </button>
        ))}
      </div>
      <div className="flex items-center px-3.5 py-1.5 bg-[var(--bg-panel)] border-t border-[var(--border)] gap-1.5 shrink-0">
        <span className="text-[var(--green)] font-bold shrink-0">incident$</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={running}
          autoFocus
          spellCheck={false}
          placeholder="type a command..."
          className="flex-1 bg-transparent border-none outline-none text-[var(--text-bright)] font-mono text-[13px] caret-[var(--green)] placeholder:text-[var(--text-dim)]"
        />
        {running && (
          <div className="w-3.5 h-3.5 border-2 border-[var(--border)] border-t-[var(--cyan)] rounded-full animate-spin" />
        )}
      </div>
    </div>
  );
}
